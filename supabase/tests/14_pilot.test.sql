-- Pilot requests (docs/phase-1-plan.md, Testing: 14_pilot): anonymous inserts only through request_pilot,
-- the daily limit per address and the hourly cap, and the pg_net call to pilot-notify.
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

select t.put('admin', t.new_staff('admin@pilot.test', 'Admin Person', 'admin'));
select t.put('office', t.new_staff('office@pilot.test', 'Dana Akhmetova', 'exam_office'));
create table t.queue as select coalesce(max(id), 0) as before from net.http_request_queue;
grant select on t.queue to anon, authenticated;

-- ---------------------------------------------------------------------------
-- request_pilot, as an anonymous visitor
-- ---------------------------------------------------------------------------
select t.anon();
select is(public.request_pilot('Dana Akhmetova', ' Dana@Pilot-KRU.test ', 'KRU · Kostanay', 'Exam office',
  'Midterms for the Faculty of Mathematics.', '100–300', 'November 2026', true), '{"status":"ok"}'::jsonb,
  'a visitor books a pilot');
select is(public.request_pilot('Dana', 'dana@pilot-kru.test', 'KRU'), '{"status":"ok"}'::jsonb, 'a second request');
select is(public.request_pilot('Dana', 'DANA@pilot-kru.test', 'KRU'), '{"status":"ok"}'::jsonb, 'a third request');
select is(public.request_pilot('Dana', 'dana@pilot-kru.test', 'KRU'), '{"status":"rate_limited"}'::jsonb,
  'a fourth request from one address in a day is refused');
select is(public.request_pilot('Arman', 'arman@pilot-kru.test', 'KRU'), '{"status":"ok"}'::jsonb,
  'another address is still welcome');
select is(t.err($$ select public.request_pilot('Dana', 'dana', 'KRU') $$), 'bad_request:email', 'a bad address is refused');
select is(t.err($$ select public.request_pilot(' ', 'a@pilot-kru.test', 'KRU') $$), 'bad_request:name', 'a name is required');
select is(t.err($$ select public.request_pilot('A', 'a@pilot-kru.test', '') $$), 'bad_request:university',
  'a university is required');
select is(t.err(format('select public.request_pilot(%L, %L, %L, null, %L)', 'A', 'a@pilot-kru.test', 'KRU', repeat('x', 501))),
  'bad_request:message', 'a message over 500 characters is refused');
select throws_ok($$ insert into public.pilot_requests (name, email, university) values ('x', 'x@x.kz', 'x') $$,
  '42501', null, 'a visitor cannot insert directly');
select throws_ok($$ select count(*) from public.pilot_requests $$, '42501', null, 'a visitor cannot read requests');
reset role;

select is((select count(*) from public.pilot_requests where lower(email) = 'dana@pilot-kru.test'), 3::bigint,
  'three requests from Dana are stored');
select is((select email || '|' || exam_size || '|' || pilot_month || '|' || demo_invite::text from public.pilot_requests
  where role = 'Exam office' and lower(email) = 'dana@pilot-kru.test'),
  'dana@pilot-kru.test|100–300|November 2026|true', 'the address is stored in lower case with the form''s extra fields');
select is((select count(*) from net.http_request_queue where id > (select before from t.queue)), 0::bigint,
  'without the Vault secrets no email request is queued');

-- A request from yesterday no longer counts.
update public.pilot_requests set created_at = now() - interval '25 hours' where lower(email) = 'dana@pilot-kru.test'
  and role = 'Exam office';
select t.anon();
select is(public.request_pilot('Dana', 'dana@pilot-kru.test', 'KRU'), '{"status":"ok"}'::jsonb,
  'the limit counts the last 24 hours');
reset role;

-- The row's trigger asks pilot-notify to email it, through pg_net.
select vault.create_secret('http://kong.test:8000', 'uki_project_url');
select vault.create_secret('sb_secret_test_value', 'uki_secret_key');
select t.anon();
select is(public.request_pilot('Saule', 'saule@pilot-kru.test', 'KRU'), '{"status":"ok"}'::jsonb, 'one more request');
reset role;
select is((select url from net.http_request_queue where id > (select before from t.queue) order by id desc limit 1),
  'http://kong.test:8000/functions/v1/pilot-notify', 'the trigger calls pilot-notify');
select is((select convert_from(body, 'UTF8')::jsonb from net.http_request_queue where id > (select before from t.queue)
  order by id desc limit 1), jsonb_build_object('id', (select id from public.pilot_requests where email = 'saule@pilot-kru.test')),
  'with the request id only');

-- At most 30 requests an hour from anyone.
insert into public.pilot_requests (name, email, university)
select 'Bot', 'bot' || n || '@pilot-kru.test', 'Bot U' from generate_series(1, 30) as n;
select t.anon();
select is(public.request_pilot('Late', 'late@pilot-kru.test', 'KRU'), '{"status":"rate_limited"}'::jsonb,
  'the 31st request in an hour is refused');
reset role;
delete from public.pilot_requests where email like 'bot%@pilot-kru.test';

-- ---------------------------------------------------------------------------
-- Who reads pilot requests
-- ---------------------------------------------------------------------------
select t.login(t.id('admin'));
select ok((select count(*) from public.pilot_requests where email like '%@pilot-kru.test') >= 6, 'an admin reads them');
select throws_ok($$ update public.pilot_requests set name = 'x' $$, '42501', null, 'an admin cannot change them');
reset role;
select t.login(t.id('office'));
select is((select count(*) from public.pilot_requests), 0::bigint, 'the exam office does not read them');
select is(public.request_pilot('Dana', 'dana.office@pilot-kru.test', 'KRU'), '{"status":"ok"}'::jsonb,
  'a signed-in user may also book a pilot');
reset role;

select * from finish();
rollback;
