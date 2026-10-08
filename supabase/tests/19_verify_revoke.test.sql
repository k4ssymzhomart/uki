-- The user's decisions of 8 Oct on reports and share links (20261012160000_verify_codes_share_revoke.sql):
-- verify codes of 8 random Crockford base32 characters (format, uniqueness with a redraw on a clash, the
-- conversion of rows in the old form), verify_report's limit of 10 lookups a minute per client and its
-- table for each role, revoke_share for each role, and links that last 30 days.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Test helpers, rolled back with the transaction (as in 01_rls.test.sql), plus t.err and t.anon.
create schema t;
grant usage, create on schema t to anon, authenticated, service_role;
-- Scratch tables made later in a file are readable by every role the file switches to.
alter default privileges in schema t grant select on tables to anon, authenticated, service_role;
create table t.ids (k text primary key, v uuid not null);
grant select, insert, update on t.ids to anon, authenticated, service_role;

create function t.id(p_k text) returns uuid language sql stable as $$ select v from t.ids where k = p_k $$;

create function t.put(p_k text, p_v uuid) returns uuid language sql as $$
  insert into t.ids (k, v) values (p_k, p_v) on conflict (k) do update set v = excluded.v returning v
$$;

create function t.new_user(p_email text, p_anon boolean default false) returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, is_anonymous, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at)
  values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    case when p_anon then null else p_email end, p_anon, '{}'::jsonb, '{}'::jsonb, now(), now());
  return v_id;
end $$;

create function t.new_staff(p_email text, p_name text, p_role public.staff_role,
  p_workspace uuid default 'a0000000-0000-4000-8000-000000000001') returns uuid language plpgsql as $$
declare v_id uuid := t.new_user(p_email);
begin
  insert into public.staff (id, workspace_id, full_name, role, languages) values (v_id, p_workspace, p_name, p_role, '{ru}');
  return v_id;
end $$;

create function t.assign(p_exam uuid, p_staff uuid, p_lead boolean default false, p_from int default null,
  p_to int default null) returns void language sql as $$
  insert into public.proctor_assignments (exam_id, staff_id, seat_from, seat_to, languages, is_lead)
  values (p_exam, p_staff, p_from, p_to, '{ru}', p_lead)
$$;

create function t.new_session(p_exam uuid, p_number text, p_state public.session_state default 'writing',
  p_uid uuid default null) returns uuid language plpgsql as $$
declare
  v_id uuid;
  v_uid uuid := coalesce(p_uid, t.new_user(null, true));
begin
  insert into public.sessions (exam_id, student_id, auth_uid, state, locale, started_at)
  select p_exam, s.id, v_uid, p_state, 'kk', case when p_state in ('writing', 'paused') then now() end
  from public.students s where s.student_number = p_number
  returning id into v_id;
  return v_id;
end $$;

create function t.uid_of(p_session uuid) returns uuid language sql stable as $$
  select auth_uid from public.sessions where id = p_session
$$;

create function t.login(p_uid uuid) returns void language plpgsql as $$
declare v_anon boolean;
begin
  select u.is_anonymous into v_anon from auth.users u where u.id = p_uid;
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated',
    'aud', 'authenticated', 'is_anonymous', coalesce(v_anon, false))::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- A visitor with only the publishable key: role anon, no user.
create function t.anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end $$;

-- An Edge Function with the secret key: role service_role, no user.
create function t.service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);
end $$;

create function t.schedule(p_exam uuid, p_starts_in interval, p_status public.exam_status,
  p_duration int default 90) returns void language sql as $$
  update public.exams
  set starts_at = now() + p_starts_in, lobby_opens_at = now() + p_starts_in - interval '20 minutes',
      status = p_status, duration_min = p_duration
  where id = p_exam
$$;

create function t.event(p_session uuid, p_type text, p_at timestamptz default now(),
  p_received timestamptz default now(), p_data jsonb default '{}', p_source public.event_source default 'app',
  p_review public.event_review default 'none', p_frames int default 0) returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into public.events (id, session_id, exam_id, type, source, review, at, received_at, data, frame_count)
  select v_id, s.id, s.exam_id, p_type, p_source, p_review, p_at, p_received, p_data, p_frames
  from public.sessions s where s.id = p_session;
  return v_id;
end $$;

create function t.ev(p_session uuid, p_type text, p_review text default 'none', p_seq int default 0,
  p_frames int default 0, p_id uuid default null, p_data jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('id', coalesce(p_id, gen_random_uuid()), 'session_id', p_session, 'type', p_type,
    'source', 'app', 'review', p_review, 'seq', p_seq, 'at', now(), 'data', p_data, 'frame_count', p_frames,
    'app_version', '0.1.0')
$$;

create function t.messages(p_topic text, p_event text, p_payload jsonb default '{}') returns bigint
language sql stable as $$
  select count(*) from realtime.messages m
  where m.topic = p_topic and m.event = p_event and m.private and m.payload @> p_payload
$$;

-- The error a statement raises, as '<message>' or '<message>:<detail>', or null when it succeeds.
-- Runs as the current role; the failed statement's changes roll back with its subtransaction.
create function t.err(p_sql text) returns text language plpgsql as $$
declare
  v_msg text;
  v_detail text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics v_msg = message_text, v_detail = pg_exception_detail;
  return v_msg || coalesce(':' || nullif(v_detail, ''), '');
end $$;

-- verify_report as one client: the SHA-256 of a made-up address.
create function t.client(p_ip text) returns text language sql immutable as $$
  select encode(sha256(convert_to(p_ip, 'UTF8')), 'hex')
$$;

-- Seeded ids (supabase/seed.sql): History of Kazakhstan's seats 7, 8 and 9, which have no report yet.
select t.put('ws', 'a0000000-0000-4000-8000-000000000001');
select t.put('history', 'e0000000-0000-4000-8000-000000000003');
select t.put('math2', 'e0000000-0000-4000-8000-000000000001');
select t.put('s7', 'd0000000-0000-4000-8003-000000000007');
select t.put('s8', 'd0000000-0000-4000-8003-000000000008');
select t.put('s9', 'd0000000-0000-4000-8003-000000000009');
select t.put('s7_uid', t.uid_of(t.id('s7')));

-- Start from the seed alone: staff assignments made by `pnpm seed:staff` are set aside.
delete from public.proctor_assignments;

select t.put('office', t.new_staff('office@verify.test', 'Dana Akhmetova', 'exam_office'));
select t.put('aigerim', t.new_staff('aigerim@verify.test', 'Aigerim Sadykova', 'proctor'));
select t.put('other_proctor', t.new_staff('other@verify.test', 'Other Proctor', 'proctor'));
select t.assign(t.id('history'), t.id('aigerim'), true, 1, 140);
select t.assign(t.id('math2'), t.id('other_proctor'), true, 1, 128);
insert into public.workspaces (id, name, slug) values ('a0000000-0000-4000-8000-0000000000f8', 'Other U', 'other-verify');
select t.put('office2', t.new_staff('office2@verify.test', 'Other Office', 'exam_office',
  'a0000000-0000-4000-8000-0000000000f8'));

-- ---------------------------------------------------------------------------
-- Format: 8 characters of Crockford base32
-- ---------------------------------------------------------------------------
create table t.draws as select public.new_verify_code() as code from generate_series(1, 2000);
select is((select count(*) from t.draws where code ~ '^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$'), 2000::bigint,
  'every drawn code is 8 characters of Crockford base32');
select is((select count(*) from t.draws where code ~ '[ILOU]'), 0::bigint, 'no code holds I, L, O or U');
select is((select count(distinct c) from t.draws, regexp_split_to_table(code, '') as c), 32::bigint,
  'the draws use all 32 characters of the alphabet');
select is((select count(distinct code) from t.draws), 2000::bigint, '2000 draws give 2000 different codes');

select is(public.normalize_verify_code('UKI-7K2M-9QXD'), '7K2M9QXD', 'a printed code reads back');
select is(public.normalize_verify_code('uki-7k2m-9qxd'), '7K2M9QXD', 'in lower case too');
select is(public.normalize_verify_code(' 7k2m 9qxd '), '7K2M9QXD', 'and without the prefix');
select is(public.normalize_verify_code('UKI-O1IL-9QXD'), '01119QXD', 'O reads as 0, I and L as 1');
select is(public.normalize_verify_code('UKI-7K2M-9QXU'), null, 'U is not read as anything');
select is(public.normalize_verify_code('UKI-RPT-7K2M-9QXD-4HPA'), null, 'the old 12-character form is refused');
select is(public.normalize_verify_code('7K2M9QXD4HPA'), null, 'so is any other length');
select is(public.normalize_verify_code(null), null, 'and nothing at all');

-- ---------------------------------------------------------------------------
-- New reports: an unused code, drawn again on a clash
-- ---------------------------------------------------------------------------
select t.login(t.id('aigerim'));
create table t.r7 as select public.get_report(t.id('s7')) as p;
reset role;
grant select on all tables in schema t to anon, authenticated, service_role;
select ok((select p -> 'report' ->> 'verify_code' ~ '^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$' from t.r7),
  'get_report makes a report with an 8-character code');
select is((select verify_code from public.reports where session_id = t.id('s7')),
  (select p -> 'report' ->> 'verify_code' from t.r7), 'the row holds the code');

-- A report written by hand without a code gets one from the column default.
insert into public.reports (session_id, exam_id, content_hash, created_by)
values (t.id('s9'), t.id('history'), 'hand', t.id('office'));
select ok((select verify_code ~ '^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$' from public.reports where session_id = t.id('s9')),
  'a row inserted without a code gets an unused one');
select throws_ok(format($$ update public.reports set verify_code = 'UKI7K2M9QXD' where session_id = %L $$, t.id('s9')),
  '23514', null, 'a code in any other form is refused by the table');
select throws_ok(format($$ update public.reports set verify_code = %L where session_id = %L $$,
  (select p -> 'report' ->> 'verify_code' from t.r7), t.id('s9')), '23505', null, 'two reports never share a code');

-- A clash: the generator first gives s7's code, then a fresh one.
alter function public.new_verify_code() rename to new_verify_code_real;
create sequence t.draw;
grant usage on sequence t.draw to anon, authenticated, service_role;
create function public.new_verify_code() returns text language sql volatile as $$
  select case when nextval('t.draw') = 1 then (select verify_code from public.reports where session_id = 'd0000000-0000-4000-8003-000000000007')
    else 'ZZZZ2222' end
$$;
grant execute on function public.new_verify_code() to anon, authenticated, service_role;
select t.login(t.id('aigerim'));
create table t.r8 as select public.get_report(t.id('s8')) as p;
reset role;
grant select on all tables in schema t to anon, authenticated, service_role;
select is((select p -> 'report' ->> 'verify_code' from t.r8), 'ZZZZ2222', 'a code already taken is drawn again');
select is((select last_value from t.draw), 2::bigint, 'after one clash, one more draw');

-- A generator that only ever clashes gives up after 20 draws instead of looping.
create or replace function public.new_verify_code() returns text language sql volatile as $$
  select 'ZZZZ2222'::text
$$;
select is(t.err('select public.unused_verify_code()'), 'conflict:verify_code', 'twenty clashes in a row are an error');
drop function public.new_verify_code();
alter function public.new_verify_code_real() rename to new_verify_code;

-- ---------------------------------------------------------------------------
-- Conversion: rows in the old 12-character form get a new code; nothing else changes
-- ---------------------------------------------------------------------------
alter table public.reports drop constraint reports_verify_code_format;
update public.reports set verify_code = '0000000000M2', issued_at = '2026-10-09 06:52:00+00' where session_id = t.id('s8');
update public.reports set verify_code = '0000000000P1' where session_id = t.id('s9');
create table t.before as select id, verify_code, content_hash, issued_at from public.reports;
select is(public.convert_verify_codes(), 2, 'two rows in the old form are converted');
select is((select count(*) from public.reports where verify_code !~ '^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$'), 0::bigint,
  'every report now has an 8-character code');
select is((select count(distinct verify_code) from public.reports), (select count(*) from public.reports),
  'and every code is different');
select is((select r.verify_code from public.reports r where r.session_id = t.id('s7')),
  (select p -> 'report' ->> 'verify_code' from t.r7), 'a code already in the new form stays');
select is((select issued_at from public.reports where session_id = t.id('s8')), '2026-10-09 06:52:00+00'::timestamptz,
  'a converted report keeps its issue time');
select is((select count(*) from public.reports r join t.before b on b.id = r.id where r.content_hash <> b.content_hash),
  0::bigint, 'and its content hash');
select is(public.convert_verify_codes(), 0, 'converting again changes nothing');
alter table public.reports
  add constraint reports_verify_code_format check (verify_code ~ '^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$');
select pass('the format constraint holds for the converted rows');

-- ---------------------------------------------------------------------------
-- verify_report: a changed report verifies as not intact; 10 lookups a minute per client
-- ---------------------------------------------------------------------------
create table t.code7 as select verify_code as code from public.reports where session_id = t.id('s7');
grant select on all tables in schema t to anon, authenticated, service_role;
select t.anon();
select is((public.verify_report('uki-' || lower(left((select code from t.code7), 4)) || '-' ||
  lower(right((select code from t.code7), 4)), t.client('10.0.0.1')) ->> 'intact'), 'true',
  'a printed code typed in lower case verifies');
select is((public.verify_report((select code from t.code7), t.client('10.0.0.1')) ->> 'found'), 'true',
  'and without the prefix');
reset role;
select t.login(t.id('aigerim'));
select lives_ok(format('select public.add_session_note(%L, %L)', t.id('s7'), 'Phone face down.'), 'a note changes the report');
reset role;
select t.anon();
select is((public.verify_report((select code from t.code7), t.client('10.0.0.1')) ->> 'intact'), 'false',
  'the printout of the older version is found but not intact');
reset role;
select t.login(t.id('aigerim'));
create table t.r7b as select public.get_report(t.id('s7')) as p;
reset role;
grant select on all tables in schema t to anon, authenticated, service_role;
select isnt((select p -> 'report' ->> 'verify_code' from t.r7b), (select code from t.code7), 'the new version has a new code');
select t.anon();
select is(public.verify_report((select code from t.code7), t.client('10.0.0.1')), '{"found":false}'::jsonb,
  'and the older code is no longer found');
-- Lookups 1 to 4 were above; 5 to 10 still answer, malformed or not.
select is(public.verify_report('not-a-real-code', t.client('10.0.0.1')), '{"found":false}'::jsonb, 'a malformed code counts too');
select is((select count(*) from generate_series(6, 10) as n
  where public.verify_report('UKI-0000-0000', t.client('10.0.0.1')) = '{"found":false}'::jsonb), 5::bigint,
  'lookups 6 to 10 within the minute are answered');
select throws_ok(format('select public.verify_report(%L, %L)', (select p -> 'report' ->> 'verify_code' from t.r7b),
  t.client('10.0.0.1')), 'PT429', 'rate_limited', 'the 11th lookup within the minute is refused with 429');
select ok(t.err(format('select public.verify_report(%L, %L)', 'UKI-0000-0000', t.client('10.0.0.1')))
  ~ '^rate_limited:([1-9]|[1-5][0-9]|60)$', 'the refusal says how many seconds to wait');
select is((public.verify_report((select p -> 'report' ->> 'verify_code' from t.r7b), t.client('10.0.0.2')) ->> 'intact'),
  'true', 'another client still gets its answer');
select is(t.err(format('select public.verify_report(%L, %L)', 'UKI-0000-0000', '10.0.0.1')), 'bad_request:client_hash',
  'a client that is not a SHA-256 is refused');
select is(t.err(format('select public.verify_report(%L, null)', 'UKI-0000-0000')), 'bad_request:client_hash',
  'so is no client');
reset role;
select is((select count(*) from public.verify_lookups where client_hash = t.client('10.0.0.1')), 10::bigint,
  'refused lookups are not counted');
select is((select count(*) from public.verify_lookups where client_hash = t.client('10.0.0.2')), 1::bigint,
  'each client has its own count');

-- A minute later the client may look up again, and the table forgets the old lookups.
update public.verify_lookups set at = now() - interval '61 seconds' where client_hash = t.client('10.0.0.1');
select t.anon();
select is(public.verify_report('UKI-0000-0000', t.client('10.0.0.1')), '{"found":false}'::jsonb,
  'a minute later the client is answered again');
reset role;
select is((select count(*) from public.verify_lookups where client_hash = t.client('10.0.0.1')), 1::bigint,
  'lookups older than a minute are deleted');
select hasnt_function('public', 'verify_report', array['text'], 'the one-argument verify_report is gone');

-- verify_lookups for each role.
select ok((select c.relrowsecurity from pg_class c where c.oid = 'public.verify_lookups'::regclass),
  'verify_lookups has row-level security');
select t.anon();
select throws_ok($$ select count(*) from public.verify_lookups $$, '42501', null, 'anon cannot read verify_lookups');
select throws_ok(format($$ insert into public.verify_lookups (client_hash) values (%L) $$, t.client('x')), '42501', null,
  'anon cannot write verify_lookups');
reset role;
select t.login(t.id('s7_uid'));
select throws_ok($$ select count(*) from public.verify_lookups $$, '42501', null, 'a student cannot read verify_lookups');
reset role;
select t.login(t.id('aigerim'));
select throws_ok($$ select count(*) from public.verify_lookups $$, '42501', null, 'a proctor cannot read verify_lookups');
select throws_ok($$ delete from public.verify_lookups where true $$, '42501', null, 'nor clear it');
reset role;
select t.login(t.id('office'));
select throws_ok($$ select count(*) from public.verify_lookups $$, '42501', null,
  'the exam office cannot read verify_lookups');
select throws_ok(format($$ insert into public.verify_lookups (client_hash) values (%L) $$, t.client('x')), '42501', null,
  'nor write it');
reset role;
select t.service();
select ok((select count(*) from public.verify_lookups) >= 2, 'the secret key reads verify_lookups');
reset role;

-- ---------------------------------------------------------------------------
-- create_share: 30 days
-- ---------------------------------------------------------------------------
select t.login(t.id('aigerim'));
create table t.share as select public.create_share((select (p -> 'report' ->> 'id')::uuid from t.r7b)) as s;
reset role;
grant select on all tables in schema t to anon, authenticated, service_role;
select ok((select abs(extract(epoch from (s ->> 'expires_at')::timestamptz - (now() + interval '30 days'))) < 5 from t.share),
  'a link expires 30 days after it is made');
select is((select expires_at from public.report_shares where id = (select (s ->> 'share_id')::uuid from t.share)),
  now() + interval '30 days', 'and the share row says so');

-- ---------------------------------------------------------------------------
-- revoke_share for each role
-- ---------------------------------------------------------------------------
create table t.sid as select (s ->> 'share_id')::uuid as id, encode(sha256(convert_to(s ->> 'token', 'UTF8')), 'hex') as h
from t.share;
grant select on all tables in schema t to anon, authenticated, service_role;

select t.anon();
select throws_ok(format('select public.revoke_share(%L)', (select id from t.sid)), '42501', null,
  'anon cannot call revoke_share');
reset role;
select t.login(t.id('s7_uid'));
select is(t.err(format('select public.revoke_share(%L)', (select id from t.sid))), 'forbidden',
  'the student cannot revoke the link');
reset role;
select t.login(t.id('other_proctor'));
select is(t.err(format('select public.revoke_share(%L)', (select id from t.sid))), 'forbidden',
  'another exam''s proctor cannot revoke it');
reset role;
select t.login(t.id('office2'));
select is(t.err(format('select public.revoke_share(%L)', (select id from t.sid))), 'forbidden',
  'another workspace''s exam office cannot revoke it');
select is(t.err(format('select public.revoke_share(%L)', gen_random_uuid())), 'not_found', 'an unknown share is not found');
reset role;
select is((select revoked_at from public.report_shares where id = (select id from t.sid)), null,
  'the refused calls changed nothing');
select t.login(t.id('aigerim'));
select throws_ok(format($$ update public.report_shares set revoked_at = now() where id = %L $$, (select id from t.sid)),
  '42501', null, 'staff cannot set revoked_at directly');
reset role;
select t.service();
select is((public.open_shared_report((select h from t.sid)) -> 'share' ->> 'id'), (select id::text from t.sid),
  'the link opens before it is revoked');
reset role;

select t.login(t.id('office'));
create table t.rev as select public.revoke_share((select id from t.sid)) as r;
reset role;
grant select on all tables in schema t to anon, authenticated, service_role;
select is((select (r ->> 'share_id')::uuid from t.rev), (select id from t.sid), 'the exam office revokes the link');
select is((select (r ->> 'report_id') from t.rev), (select p -> 'report' ->> 'id' from t.r7b), 'of this report');
select is((select revoked_at from public.report_shares where id = (select id from t.sid)), now(), 'revoked_at is set');
select is((select count(*) from public.audit_log where action = 'report.share_revoke' and actor_id = t.id('office')
  and actor_kind = 'staff' and object_type = 'report' and object_id = (select p -> 'report' ->> 'id' from t.r7b)
  and meta ->> 'share_id' = (select id::text from t.sid) and at >= now()), 1::bigint, 'revoking writes an audit row');
select t.service();
select is(t.err(format('select public.open_shared_report(%L)', (select h from t.sid))), 'not_found:revoked',
  'a revoked link is not found');
reset role;

select t.login(t.id('aigerim'));
select is((public.revoke_share((select id from t.sid)) ->> 'revoked_at')::timestamptz, now(),
  'the exam''s proctor may revoke too; revoking again keeps the first time');
reset role;
select is((select count(*) from public.audit_log where action = 'report.share_revoke' and at >= now()
  and meta ->> 'share_id' = (select id::text from t.sid)), 1::bigint, 'and writes no second audit row');

-- The exam's proctor revokes a link the exam office made.
select t.login(t.id('office'));
create table t.share2 as select public.create_share((select (p -> 'report' ->> 'id')::uuid from t.r7b)) as s;
reset role;
grant select on all tables in schema t to anon, authenticated, service_role;
select t.login(t.id('aigerim'));
select ok((public.revoke_share((select (s ->> 'share_id')::uuid from t.share2)) ->> 'revoked_at') is not null,
  'the exam''s proctor revokes the exam office''s link');
reset role;

select * from finish();
rollback;
