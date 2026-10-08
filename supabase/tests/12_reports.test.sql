-- Reports and share links (docs/phase-1-plan.md, Testing: 12_reports): one report per session, the
-- verify code and what makes it change, verify_report for anonymous visitors, only the token hash stored,
-- one audit row per view, and expiry.
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

-- Seeded ids (supabase/seed.sql).
select t.put('ws', 'a0000000-0000-4000-8000-000000000001');
select t.put('math2', 'e0000000-0000-4000-8000-000000000001');
select t.put('phys1', 'e0000000-0000-4000-8000-000000000002');
select t.put('history', 'e0000000-0000-4000-8000-000000000003');
select t.put('english', 'e0000000-0000-4000-8000-000000000005');
select t.put('g204', 'a2000000-0000-4000-8000-000000000204');
select t.put('g101', 'a2000000-0000-4000-8000-000000000101');
select t.put('fac_math', 'a1000000-0000-4000-8000-000000000001');

-- Start from the seed alone: staff assignments made by `pnpm seed:staff` are set aside.
delete from public.proctor_assignments;

select t.put('office', t.new_staff('office@reports.test', 'Dana Akhmetova', 'exam_office'));
select t.put('aigerim', t.new_staff('aigerim@reports.test', 'Aigerim Sadykova', 'proctor'));
select t.put('other_proctor', t.new_staff('other@reports.test', 'Other Proctor', 'proctor'));
select t.assign(t.id('history'), t.id('aigerim'), true, 1, 140);
select t.assign(t.id('math2'), t.id('other_proctor'), true, 1, 128);
-- Seat 7 of History: a phone and a look away, two flags.
select t.put('s7', 'd0000000-0000-4000-8003-000000000007');
select t.put('s7_uid', t.uid_of(t.id('s7')));

-- verify_report as a visitor from a fresh address each time, so these lookups stay under its limit of
-- 10 a minute per client (19_verify_revoke tests the limit).
create function t.verify(p_code text) returns jsonb language sql volatile as $$
  select public.verify_report(p_code, encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex'))
$$;
grant execute on function t.verify(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Verify codes: the same cases as packages/contracts/src/review.test.ts
-- ---------------------------------------------------------------------------
select is(public.normalize_verify_code('uki-7k2m-9qxd'), '7K2M9QXD', 'a printed code reads back');
select is(public.normalize_verify_code(' 7K2M 9QXO '), '7K2M9QX0', 'O reads as 0');
select is(public.normalize_verify_code('UKI-RPT-0917-MT'), null, 'a malformed code is null');

-- ---------------------------------------------------------------------------
-- get_report (3.4)
-- ---------------------------------------------------------------------------
select t.login(t.id('aigerim'));
create table t.r1 as select public.get_report(t.id('s7')) as p;
reset role;
grant select on all tables in schema t to anon, authenticated, service_role;
select ok((select p -> 'report' ->> 'verify_code' ~ '^[0-9A-HJKMNP-TV-Z]{8}$' from t.r1), 'the report has an 8-character code');
select is((select jsonb_array_length(p -> 'flags') from t.r1), 2, 'both flags are in the report');
select is((select p -> 'flags' -> 0 ->> 'type' from t.r1), 'phone.detected', 'flags in time order');
select is((select p -> 'data_kept' ->> 'video_bytes' from t.r1), '0', 'no video is kept');
select is((select (p -> 'data_kept' ->> 'retention_days')::int from t.r1), 90, 'the retention rule is in the report');
select is((select p -> 'student' ->> 'student_number' from t.r1),
  (select st.student_number from public.sessions se join public.students st on st.id = se.student_id where se.id = t.id('s7')),
  'the report names the student');
select is((select p ->> 'proctor_name' from t.r1), 'Aigerim Sadykova', 'and the proctor of the seat');
select is((select p -> 'decision' from t.r1), 'null'::jsonb, 'no decision yet');
select is((select count(*) from public.reports where session_id = t.id('s7')), 1::bigint, 'one reports row');
select is((select verify_code from public.reports where session_id = t.id('s7')),
  (select p -> 'report' ->> 'verify_code' from t.r1), 'the row holds the printed code');
select is((select content_hash from public.reports where session_id = t.id('s7')), public.report_content_hash(t.id('s7')),
  'the row holds the content hash');
select is((select count(*) from public.audit_log where action = 'report.view' and object_id = t.id('s7')::text
  and actor_id = t.id('aigerim') and at >= now()), 1::bigint, 'reading the report writes an audit row');

select t.login(t.id('office'));
select is((public.get_report(t.id('s7')) -> 'report' ->> 'verify_code'), (select p -> 'report' ->> 'verify_code' from t.r1),
  'reading it again keeps the code');
reset role;
select is((select count(*) from public.reports where session_id = t.id('s7')), 1::bigint, 'still one report per session');

select t.login(t.id('other_proctor'));
select is(t.err(format('select public.get_report(%L)', t.id('s7'))), 'forbidden', 'another exam''s proctor cannot read it');
reset role;
select t.login(t.id('s7_uid'));
select is(t.err(format('select public.get_report(%L)', t.id('s7'))), 'forbidden', 'the student cannot read it');
reset role;

-- ---------------------------------------------------------------------------
-- verify_report (/verify/[code]), open to anonymous visitors
-- ---------------------------------------------------------------------------
create table t.code1 as select p -> 'report' ->> 'verify_code' as code from t.r1;
grant select on all tables in schema t to anon, authenticated, service_role;
select t.anon();
select is((t.verify('UKI-' || (select code from t.code1)) ->> 'intact'), 'true',
  'a fresh printout verifies');
select is((t.verify(lower((select code from t.code1))) ->> 'exam_title'), 'History of Kazakhstan · Test',
  'the code shows the exam');
select is(length(t.verify((select code from t.code1)) ->> 'initials'), 2, 'and the student''s initials only');
select is(t.verify('000000ZZ'), '{"found":false}'::jsonb, 'an unknown code is not found');
select is(t.verify('not-a-real-code'), '{"found":false}'::jsonb, 'a malformed code is not found');
reset role;

-- The decision changes the content: the old printout no longer verifies.
select t.login(t.id('aigerim'));
select lives_ok(format('select public.decide_session(%L, %L, %L)', t.id('s7'), 'talk', 'Phone face down.'),
  'a decision changes the report');
reset role;
select t.anon();
select is((t.verify((select code from t.code1)) ->> 'intact'), 'false',
  'the older printout is found but no longer intact');
reset role;
select t.login(t.id('aigerim'));
create table t.r2 as select public.get_report(t.id('s7')) as p;
reset role;
grant select on all tables in schema t to anon, authenticated, service_role;
select isnt((select p -> 'report' ->> 'verify_code' from t.r2), (select code from t.code1), 'the new version gets a new code');
select is((select p -> 'decision' ->> 'decision' from t.r2), 'talk', 'the report shows the decision');
select t.anon();
select is((t.verify((select p -> 'report' ->> 'verify_code' from t.r2)) ->> 'intact'), 'true',
  'the new printout verifies');
select is(t.verify((select code from t.code1)), '{"found":false}'::jsonb, 'the older code is gone');
reset role;

-- ---------------------------------------------------------------------------
-- create_share (3.4) and open_shared_report (3.5)
-- ---------------------------------------------------------------------------
select t.login(t.id('aigerim'));
create table t.share as select public.create_share((select (p -> 'report' ->> 'id')::uuid from t.r2)) as s;
reset role;
grant select on all tables in schema t to anon, authenticated, service_role;
select ok((select s ->> 'token' ~ '^[A-Za-z0-9_-]{43}$' from t.share), 'the token is 32 random bytes in base64url');
select is((select s ->> 'path' from t.share), (select '/r/' || (s ->> 'token') from t.share), 'the link path holds the token');
select ok((select abs(extract(epoch from (s ->> 'expires_at')::timestamptz - (now() + interval '30 days'))) < 5 from t.share),
  'the link expires 30 days ahead');
select is((select token_hash from public.report_shares where id = (select (s ->> 'share_id')::uuid from t.share)),
  (select encode(sha256(convert_to(s ->> 'token', 'UTF8')), 'hex') from t.share), 'only the SHA-256 of the token is stored');
select is((select count(*) from public.report_shares sh where to_jsonb(sh)::text like '%' || (select s ->> 'token' from t.share) || '%'),
  0::bigint, 'the token itself is stored nowhere in report_shares');
select is((select count(*) from public.audit_log a where a.meta::text like '%' || (select s ->> 'token' from t.share) || '%'),
  0::bigint, 'nor in the audit log');
select is((select count(*) from public.audit_log where action = 'report.share' and at >= now()
  and object_id = (select p -> 'report' ->> 'id' from t.r2)), 1::bigint, 'sharing writes an audit row');

select t.login(t.id('other_proctor'));
select is(t.err(format('select public.create_share(%L)', (select p -> 'report' ->> 'id' from t.r2))), 'forbidden',
  'another exam''s proctor cannot share it');
reset role;
select t.login(t.id('aigerim'));
select is(t.err(format('select public.open_shared_report(%L)', repeat('0', 64))), 'permission denied for function open_shared_report',
  'staff cannot open a share directly');
reset role;

create table t.hash as select encode(sha256(convert_to(s ->> 'token', 'UTF8')), 'hex') as h from t.share;
grant select on all tables in schema t to anon, authenticated, service_role;
select t.service();
select is((public.open_shared_report((select h from t.hash)) -> 'share' ->> 'shared_by'), 'Aigerim Sadykova',
  'the shared-report function opens the report with who shared it');
select is((public.open_shared_report((select h from t.hash)) -> 'student' ->> 'full_name'),
  (select p -> 'student' ->> 'full_name' from t.r2), 'the committee sees the same report');
reset role;
select is((select count(*) from public.audit_log where action = 'report.share_view' and actor_kind = 'share' and actor_id is null
  and at >= now() and object_id = (select p -> 'report' ->> 'id' from t.r2)), 2::bigint, 'each view of the link writes its own audit row');

update public.report_shares set expires_at = now() - interval '1 second';
select t.service();
select is(t.err(format('select public.open_shared_report(%L)', (select h from t.hash))), 'not_found:expired',
  'an expired link is not found');
reset role;
update public.report_shares set expires_at = now() + interval '1 day', revoked_at = now();
select t.service();
select is(t.err(format('select public.open_shared_report(%L)', (select h from t.hash))), 'not_found:revoked',
  'a revoked link is not found');
select is(t.err(format('select public.open_shared_report(%L)', repeat('a', 64))), 'not_found:unknown',
  'an unknown link is not found');
reset role;
select is((select count(*) from public.audit_log where action = 'report.share_view' and at >= now()
  and object_id = (select p -> 'report' ->> 'id' from t.r2)), 2::bigint, 'refused views write no audit row');

select t.anon();
select throws_ok($$ select public.get_report('d0000000-0000-4000-8003-000000000007') $$, '42501', null,
  'anon cannot call get_report');
select throws_ok($$ select public.create_share(gen_random_uuid()) $$, '42501', null, 'anon cannot call create_share');
reset role;

select * from finish();
rollback;
