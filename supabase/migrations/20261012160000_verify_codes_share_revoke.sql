-- WP 1.9 follow-up: the user's decisions of 8 Oct 2026 on verify codes and share links
-- (docs/decisions.md, "1.9 Report and sharing: decided by the user, 8 Oct").
--
--  1. Verify codes. A report's code is 8 random Crockford base32 characters (no I, L, O or U), printed
--     UKI-XXXX-XXXX. A new report gets an unused code, drawn again on a clash; a new version of its
--     content gets a new one, as before, so the content-hash check stays: a printout of a changed report
--     reads "found, not intact" until the next view issues the new code, then "not found". Every
--     existing row gets a code in the new form (convert_verify_codes); its issued_at stays.
--     make_verify_code (the 12-character code cut from the content hash) is gone.
--  2. verify_report(code, client_hash): the Next.js server passes the SHA-256 of the visitor's IP, and
--     a client gets at most 10 lookups a minute (verify_lookups, which keeps only the last minute). The
--     11th is refused with rate_limited and SQLSTATE PT429, which PostgREST answers with HTTP 429. The
--     one-argument verify_report is dropped, so the limit cannot be stepped around through it.
--  3. Share links: revoke_share(share_id) for staff of the exam sets revoked_at and writes an audit row
--     (report.share_revoke); create_share's links last 30 days instead of 7. Both refuse a staff role
--     that is not the exam office, an admin or a proctor (staff_may_share), so a read-only role cannot
--     change sharing.

-- ---------------------------------------------------------------------------
-- 1. Verify codes
-- ---------------------------------------------------------------------------

-- 8 characters of Crockford base32 from 40 random bits (VERIFY_CODE_ALPHABET in review.ts).
create or replace function public.new_verify_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select string_agg(substr('0123456789ABCDEFGHJKMNPQRSTVWXYZ', substring(b.bits from i * 5 + 1 for 5)::int + 1, 1), ''
    order by i)
  from (select ('x' || encode(extensions.gen_random_bytes(5), 'hex'))::bit(40) as bits) b
  cross join generate_series(0, 7) as i
$$;

-- A new code that no report holds: drawn again on a clash (one in about 10^12 per report).
create or replace function public.unused_verify_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  for i in 1..20 loop
    v_code := public.new_verify_code();
    if not exists (select 1 from public.reports r where r.verify_code = v_code) then
      return v_code;
    end if;
  end loop;
  raise exception using message = 'conflict', detail = 'verify_code', errcode = 'P0001';
end;
$$;

-- Gives every report whose code is not in the new form an unused one, a row at a time so each draw
-- sees the last; the content hash and issued_at stay. Returns how many rows it changed. Run once here
-- for the rows that exist (the cloud's); 19_verify_revoke tests it on rows in the old form.
create or replace function public.convert_verify_codes()
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r record;
  v_count int := 0;
begin
  for r in
    select rp.id from public.reports rp
    where rp.verify_code !~ '^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$'
    order by rp.created_at, rp.id
  loop
    update public.reports rp set verify_code = public.unused_verify_code() where rp.id = r.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

select public.convert_verify_codes();

alter table public.reports
  add constraint reports_verify_code_format check (verify_code ~ '^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$');
-- A row written by hand (a seed, a test) gets an unused code when it names none.
alter table public.reports alter column verify_code set default public.unused_verify_code();

-- The code a person typed or scanned: case, spaces and hyphens do not matter, the printed "UKI-" prefix
-- is optional, O reads as 0 and I or L as 1 (normalizeVerifyCode in review.ts).
create or replace function public.normalize_verify_code(p text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := regexp_replace(upper(left(coalesce(p, ''), 64)), '[^A-Z0-9]', '', 'g');
begin
  if char_length(v) = 11 and left(v, 3) = 'UKI' then
    v := substr(v, 4);
  end if;
  v := translate(v, 'OIL', '011');
  if v !~ '^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$' then
    return null;
  end if;
  return v;
end;
$$;

-- The session's reports row with a code for its current content: made on first use with an unused
-- code; a new content hash draws a new code and issued_at, so a printout of an older version no longer
-- verifies. A code taken by another report at the same moment is drawn again.
create or replace function public.report_sync(p_session_id uuid, p_actor uuid)
returns public.reports
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_r public.reports;
  v_hash text := public.report_content_hash(p_session_id);
  v_tries int := 0;
begin
  select r.* into v_r from public.reports r where r.session_id = p_session_id for update;
  if not found then
    loop
      begin
        insert into public.reports (session_id, exam_id, verify_code, content_hash, created_by)
        select se.id, se.exam_id, public.unused_verify_code(), v_hash, p_actor
        from public.sessions se where se.id = p_session_id
        on conflict (session_id) do nothing;
        exit;
      exception when unique_violation then
        v_tries := v_tries + 1;
        if v_tries >= 5 then
          raise;
        end if;
      end;
    end loop;
    select r.* into v_r from public.reports r where r.session_id = p_session_id for update;
  end if;
  if v_r.content_hash is distinct from v_hash then
    loop
      begin
        update public.reports r
        set content_hash = v_hash, verify_code = public.unused_verify_code(), issued_at = now()
        where r.id = v_r.id
        returning * into v_r;
        exit;
      exception when unique_violation then
        v_tries := v_tries + 1;
        if v_tries >= 5 then
          raise;
        end if;
      end;
    end loop;
  end if;
  return v_r;
end;
$$;

drop function public.make_verify_code(uuid, text);

-- ---------------------------------------------------------------------------
-- 2. verify_report with a lookup limit per client
-- ---------------------------------------------------------------------------

-- One row per answered lookup of /verify/[code] in the last minute: the SHA-256 (hex) of the client's
-- IP, as the Next.js server saw it, and when. Only verify_report reads and writes it.
create table public.verify_lookups (
  id bigint generated always as identity primary key,
  client_hash text not null check (client_hash ~ '^[0-9a-f]{64}$'),
  at timestamptz not null default now()
);
create index verify_lookups_client on public.verify_lookups (client_hash, at);
create index verify_lookups_at on public.verify_lookups (at);

revoke all on public.verify_lookups from anon, authenticated;
grant select, delete on public.verify_lookups to service_role;
alter table public.verify_lookups enable row level security;
-- No policy: the API roles neither read nor write it; verify_report (security definer) does.

drop function public.verify_report(text);

-- verify_report(code, client_hash): /verify/[code], open to anonymous visitors. client_hash is the
-- SHA-256 (hex) of the visitor's IP; anything else is bad_request. Ten lookups a minute per client:
-- the 11th within the minute raises rate_limited (detail: the seconds until a lookup is free again)
-- with SQLSTATE PT429, so PostgREST answers HTTP 429, and is not counted. Otherwise {found: false},
-- or {found: true, code, exam_title, exam_starts_at, timezone, initials, issued_at, intact}, where
-- intact says the report's content still has the hash the code was made for.
create function public.verify_report(code text, client_hash text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_client text := lower(coalesce(verify_report.client_hash, ''));
  v_code text;
  v_r public.reports;
  v_words text[];
  v_initials text;
  v_out jsonb;
  v_count int;
  v_oldest timestamptz;
begin
  if v_client !~ '^[0-9a-f]{64}$' then
    raise exception using message = 'bad_request', detail = 'client_hash', errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('verify_report:' || v_client, 0));
  delete from public.verify_lookups l where l.at <= now() - interval '1 minute';
  select count(*), min(l.at) into v_count, v_oldest from public.verify_lookups l where l.client_hash = v_client;
  if v_count >= 10 then
    raise exception using message = 'rate_limited', errcode = 'PT429',
      detail = greatest(1, ceil(extract(epoch from v_oldest + interval '1 minute' - now())))::int::text;
  end if;
  insert into public.verify_lookups (client_hash) values (v_client);

  v_code := public.normalize_verify_code(verify_report.code);
  if v_code is null then
    return jsonb_build_object('found', false);
  end if;
  select r.* into v_r from public.reports r where r.verify_code = v_code;
  if not found then
    return jsonb_build_object('found', false);
  end if;
  select regexp_split_to_array(btrim(st.full_name), '\s+') into v_words
  from public.sessions se join public.students st on st.id = se.student_id
  where se.id = v_r.session_id;
  v_initials := upper(left(v_words[1], 1)) || case
    when cardinality(v_words) > 1 then upper(left(v_words[cardinality(v_words)], 1)) else '' end;
  select jsonb_build_object('found', true, 'code', v_r.verify_code, 'exam_title', e.title,
    'exam_starts_at', e.starts_at, 'timezone', w.timezone, 'initials', v_initials, 'issued_at', v_r.issued_at,
    'intact', public.report_content_hash(v_r.session_id) = v_r.content_hash)
  into v_out
  from public.exams e join public.workspaces w on w.id = e.workspace_id
  where e.id = v_r.exam_id;
  return v_out;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Share links: 30 days, and revoke_share
-- ---------------------------------------------------------------------------

-- Whether the signed-in staff member has a role that may make or withdraw share links: the exam office,
-- an admin or a proctor. A read-only staff role (judge mode's observer) is refused even when it is
-- assigned to the exam, so is_exam_staff alone is not enough. The role is compared as text, so this
-- holds before and after such a role joins the staff_role enum.
create or replace function public.staff_may_share()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not public.is_anonymous() and exists (
    select 1 from public.staff s
    where s.id = (select auth.uid()) and s.role::text in ('exam_office', 'admin', 'proctor')
  )
$$;

-- create_share(report_id): Share link on 3.4, for staff of the exam. A random 32-byte token,
-- base64url (43 characters), returned only here; report_shares keeps its SHA-256 (hex) and an
-- expiry 30 days ahead. Audit row without the token. Returns {share_id, token, path, expires_at}.
create or replace function public.create_share(report_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_r public.reports;
  v_token text;
  v_share public.report_shares;
begin
  if v_uid is null or public.is_anonymous() then
    raise exception using message = 'forbidden', errcode = '42501';
  end if;
  select r.* into v_r from public.reports r where r.id = create_share.report_id;
  if not found then
    raise exception using message = 'not_found', errcode = 'P0002';
  end if;
  if not public.is_exam_staff(v_r.exam_id) or not public.staff_may_share() then
    raise exception using message = 'forbidden', errcode = '42501';
  end if;
  v_token := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  insert into public.report_shares (report_id, token_hash, expires_at, created_by)
  values (v_r.id, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), now() + interval '30 days', v_uid)
  returning * into v_share;
  perform public.write_audit(public.exam_workspace(v_r.exam_id), 'staff', 'report.share', 'report', v_r.id::text,
    jsonb_build_object('share_id', v_share.id, 'expires_at', v_share.expires_at));
  return jsonb_build_object('share_id', v_share.id, 'token', v_token, 'path', '/r/' || v_token,
    'expires_at', v_share.expires_at);
end;
$$;

-- revoke_share(share_id): Revoke on 3.4, for staff of the exam (its proctors and the exam office).
-- Sets revoked_at, so the shared-report function refuses the link from then on, and writes an audit
-- row (report.share_revoke). Revoking a revoked share changes nothing and writes no second row.
-- Returns {share_id, report_id, revoked_at}.
create function public.revoke_share(share_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_share public.report_shares;
  v_exam uuid;
begin
  if v_uid is null or public.is_anonymous() then
    raise exception using message = 'forbidden', errcode = '42501';
  end if;
  select sh.* into v_share from public.report_shares sh where sh.id = revoke_share.share_id for update;
  if not found then
    raise exception using message = 'not_found', errcode = 'P0002';
  end if;
  select r.exam_id into v_exam from public.reports r where r.id = v_share.report_id;
  if not public.is_exam_staff(v_exam) or not public.staff_may_share() then
    raise exception using message = 'forbidden', errcode = '42501';
  end if;
  if v_share.revoked_at is null then
    update public.report_shares sh set revoked_at = now() where sh.id = v_share.id
    returning * into v_share;
    perform public.write_audit(public.exam_workspace(v_exam), 'staff', 'report.share_revoke', 'report',
      v_share.report_id::text, jsonb_build_object('share_id', v_share.id));
  end if;
  return jsonb_build_object('share_id', v_share.id, 'report_id', v_share.report_id,
    'revoked_at', v_share.revoked_at);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function public.new_verify_code() from public, anon, authenticated;
revoke execute on function public.unused_verify_code() from public, anon, authenticated;
revoke execute on function public.convert_verify_codes() from public, anon, authenticated;
revoke execute on function public.verify_report(text, text) from public, anon, authenticated;
revoke execute on function public.revoke_share(uuid) from public, anon, authenticated;
revoke execute on function public.staff_may_share() from public, anon, authenticated;

grant execute on function public.new_verify_code() to service_role;
grant execute on function public.unused_verify_code() to service_role;
grant execute on function public.convert_verify_codes() to service_role;
-- Public page.
grant execute on function public.verify_report(text, text) to anon, authenticated, service_role;
-- Staff RPC (checks the caller).
grant execute on function public.revoke_share(uuid) to authenticated;
grant execute on function public.staff_may_share() to authenticated, service_role;
