-- Privacy (docs/phase-1-plan.md, Testing: 13_privacy): data_requests access, the retention selection,
-- retention_nightly and its pg_net call with the key from Vault, the exports bucket, audit_read and the
-- consent record (rules_accepted_at and rules_locale, stamped once by ingest).
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

select t.put('office', t.new_staff('office@privacy.test', 'Dana Akhmetova', 'exam_office'));
select t.put('proctor', t.new_staff('proctor@privacy.test', 'Aigerim Sadykova', 'proctor'));
select t.assign(t.id('history'), t.id('proctor'), true, 1, 140);
insert into public.workspaces (id, name, slug) values ('a0000000-0000-4000-8000-0000000000fb', 'Other U', 'other-priv');
select t.put('ws2', 'a0000000-0000-4000-8000-0000000000fb');
select t.put('office2', t.new_staff('office2@privacy.test', 'Other Office', 'exam_office', t.id('ws2')));
select t.put('yerlan', (select id from public.students where student_number = '20230877'));
select t.put('s7', 'd0000000-0000-4000-8003-000000000007');
select t.put('s7_uid', t.uid_of(t.id('s7')));

-- ---------------------------------------------------------------------------
-- data_requests (A.5)
-- ---------------------------------------------------------------------------
select t.login(t.id('office'));
insert into public.data_requests (workspace_id, student_id, kind) values (t.id('ws'), t.id('yerlan'), 'delete')
returning t.put('req', id);
reset role;
select is((select status::text || '|' || (due_at - received_at)::text from public.data_requests where id = t.id('req')),
  'received|7 days', 'a new request is received and due in 7 days (A.5a, WP 1.12)');
select is((select count(*) from public.audit_log where action = 'data_request.received' and actor_id = t.id('office')
  and object_id = t.id('yerlan')::text and meta ->> 'kind' = 'delete'), 1::bigint, 'a new request writes an audit row');
select t.login(t.id('office'));
select lives_ok($$ update public.data_requests set status = 'done', done_by = t.id('office'), done_at = now()
  where id = t.id('req') $$, 'the office marks it done');
reset role;
select t.login(t.id('office2'));
select is((select count(*) from public.data_requests where id = t.id('req')), 0::bigint,
  'another workspace''s office cannot see it');
select is_empty($$ update public.data_requests set status = 'replied' where id = t.id('req') returning 1 $$,
  'another workspace''s office cannot change it');
reset role;
select t.login(t.id('proctor'));
select is((select count(*) from public.data_requests), 0::bigint, 'a proctor sees no data request');
reset role;
select t.login(t.id('s7_uid'));
select is((select count(*) from public.data_requests), 0::bigint, 'a student sees no data request, not even about itself');
reset role;

-- ---------------------------------------------------------------------------
-- Retention: stills older than the workspace's retention_days
-- ---------------------------------------------------------------------------
select t.put('flag', (select id from public.events where session_id = t.id('s7') and type = 'phone.detected'));
insert into public.frames (id, event_id, session_id, exam_id, storage_path, captured_at) values
  (gen_random_uuid(), t.id('flag'), t.id('s7'), t.id('history'), 'old-91.jpg', now() - interval '91 days'),
  (gen_random_uuid(), t.id('flag'), t.id('s7'), t.id('history'), 'new-89.jpg', now() - interval '89 days');
select is((select array_agg(storage_path) from public.retention_due() where storage_path in ('old-91.jpg', 'new-89.jpg')),
  array['old-91.jpg'], 'the 91-day-old still is due, the 89-day-old one is not');
select is((select workspace_id from public.retention_due() where storage_path = 'old-91.jpg'), t.id('ws'),
  'each due still names its workspace');
update public.workspaces set settings = jsonb_set(settings, '{retention_days}', '30') where id = t.id('ws');
select is((select count(*) from public.retention_due() where storage_path in ('old-91.jpg', 'new-89.jpg')), 2::bigint,
  'a shorter retention_days makes both due');
select is((select count(*) from public.retention_due(1)), 1::bigint, 'the selection takes a limit');
select is((select count(*) from public.audit_log where action = 'settings.update' and object_id = t.id('ws')::text
  and (meta -> 'after' ->> 'retention_days') = '30'), 1::bigint, 'a settings change writes an audit row');
select t.login(t.id('office'));
select throws_ok($$ select * from public.retention_due() $$, '42501', null, 'staff cannot run the retention selection');
reset role;
select t.service();
select lives_ok($$ select * from public.retention_due() $$, 'the retention function can');
reset role;

select is((select schedule || '|' || command from cron.job where jobname = 'retention_nightly'),
  '0 22 * * *|select public.call_edge_function(''retention'')', 'retention_nightly runs at 22:00 UTC');
select is((select count(*) from storage.buckets where id = 'exports' and not public
  and allowed_mime_types = array['application/json']), 1::bigint, 'the exports bucket is private and JSON only');

-- pg_net with the key from Vault: nothing goes out without the secrets.
create table t.queue as select coalesce(max(id), 0) as before from net.http_request_queue;
select is(public.call_edge_function('retention'), null, 'without the Vault secrets nothing is sent');
select is((select count(*) from net.http_request_queue where id > (select before from t.queue)), 0::bigint,
  'and nothing is queued');
select vault.create_secret('http://kong.test:8000', 'uki_project_url');
select vault.create_secret('sb_secret_test_value', 'uki_secret_key');
select isnt(public.call_edge_function('retention'), null, 'with the secrets the call is queued');
select is((select url from net.http_request_queue where id > (select before from t.queue) order by id desc limit 1),
  'http://kong.test:8000/functions/v1/retention', 'to the retention function');
select is((select headers ->> 'apikey' from net.http_request_queue where id > (select before from t.queue) order by id desc limit 1),
  'sb_secret_test_value', 'with the secret key in the apikey header');
select t.login(t.id('office'));
select throws_ok($$ select public.call_edge_function('retention') $$, '42501', null, 'staff cannot call it');
reset role;

-- ---------------------------------------------------------------------------
-- audit_read: reads of student data that no function records
-- ---------------------------------------------------------------------------
select t.login(t.id('office'));
select lives_ok(format('select public.audit_read(%L, %L, %L)', 'student.view', 'student', t.id('yerlan')),
  'the office records opening a student profile');
select is(t.err($$ select public.audit_read('view', 'student') $$), 'bad_request:action', 'the action is dotted');
select is(t.err($$ select public.audit_read('staff.view', 'staff') $$), 'bad_request:object_type',
  'only student data objects');
reset role;
select is((select count(*) from public.audit_log where action = 'student.view' and actor_id = t.id('office')
  and actor_kind = 'staff' and workspace_id = t.id('ws') and object_id = t.id('yerlan')::text), 1::bigint,
  'the row names the staff member and the student');
select t.login(t.id('s7_uid'));
select is(t.err($$ select public.audit_read('student.view', 'student') $$), 'forbidden', 'a student cannot write audit rows');
reset role;

-- ---------------------------------------------------------------------------
-- Consent record: ingest stamps rules_accepted_at and rules_locale once (1.4)
-- ---------------------------------------------------------------------------
select t.schedule(t.id('math2'), interval '15 minutes', 'scheduled');
select t.put('madina_session', t.new_session(t.id('math2'), '20231187', 'rules'));
select t.put('madina', t.uid_of(t.id('madina_session')));
select lives_ok($$ select public.ingest_batch(t.id('madina_session'), '[]', '{"step":"rules"}', t.id('madina')) $$,
  'the rules screen');
select is((select rules_accepted_at from public.sessions where id = t.id('madina_session')), null,
  'the rules step stamps nothing');
select lives_ok($$ select public.ingest_batch(t.id('madina_session'), '[]', '{"step":"ready","rules_locale":"ru"}',
  t.id('madina')) $$, 'the agree box, read in Russian');
select is((select state::text || '|' || rules_locale::text || '|' || (rules_accepted_at is not null)::text
  from public.sessions where id = t.id('madina_session')), 'ready|ru|true', 'ready stamps the time and the language');
create table t.stamp as select rules_accepted_at as at from public.sessions where id = t.id('madina_session');
update public.sessions set last_seen_at = now() - interval '1 minute' where id = t.id('madina_session');
select lives_ok($$ select public.ingest_batch(t.id('madina_session'), '[]', '{"step":"ready","rules_locale":"kk","question":1}',
  t.id('madina')) $$, 'another call at ready');
select is((select rules_locale::text from public.sessions where id = t.id('madina_session')), 'ru',
  'the language is never overwritten');
select is((select rules_accepted_at from public.sessions where id = t.id('madina_session')), (select at from t.stamp),
  'nor the time');
select t.put('dias_session', t.new_session(t.id('math2'), '20231044', 'rules'));
update public.sessions set locale = 'en' where id = t.id('dias_session');
select lives_ok($$ select public.ingest_batch(t.id('dias_session'), '[]', '{"step":"ready"}') $$,
  'an older app sends ready without the language');
select is((select rules_locale::text from public.sessions where id = t.id('dias_session')), 'en',
  'the session''s locale stands in');

select * from finish();
rollback;
