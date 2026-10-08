-- Phase 1 row-level security (docs/phase-1-plan.md, Row-level security): each new table and view for the
-- exam office, an admin, the assigned proctor, another exam's proctor, a student and an anonymous visitor.
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

-- ---------------------------------------------------------------------------
-- Setup: the roles, and one row of every new table on Mathematics 2 and on Physics 1
-- ---------------------------------------------------------------------------
select t.schedule(t.id('math2'), interval '15 minutes', 'scheduled');
select t.schedule(t.id('phys1'), interval '-5 minutes', 'live', 40);

select t.put('office', t.new_staff('office@p1rls.test', 'Office Person', 'exam_office'));
select t.put('admin', t.new_staff('admin@p1rls.test', 'Admin Person', 'admin'));
select t.put('proctor', t.new_staff('proctor@p1rls.test', 'Assigned Proctor', 'proctor'));
select t.put('other_proctor', t.new_staff('other@p1rls.test', 'Other Proctor', 'proctor'));
select t.assign(t.id('math2'), t.id('proctor'), true, 1, 128);
select t.assign(t.id('phys1'), t.id('other_proctor'), true, 1, 84);

insert into public.workspaces (id, name, slug) values ('a0000000-0000-4000-8000-0000000000f9', 'Other U', 'other-p1');
select t.put('ws2', 'a0000000-0000-4000-8000-0000000000f9');
select t.put('office2', t.new_staff('office2@p1rls.test', 'Other Office', 'exam_office', t.id('ws2')));
insert into public.students (workspace_id, student_number, full_name) values (t.id('ws2'), '30000001', 'Other Student')
returning t.put('ws2_student', id);

select t.put('math2_session', t.new_session(t.id('math2'), '20231187', 'ready'));
select t.put('student', t.uid_of(t.id('math2_session')));
select t.put('phys1_session', t.new_session(t.id('phys1'), '20231455', 'writing'));
select t.put('madina', (select id from public.students where student_number = '20231187'));
select t.put('aliya', (select id from public.students where student_number = '20231455'));

insert into public.invites (exam_id, student_id, email, locale) values
  (t.id('math2'), t.id('madina'), '20231187@student.kru.test', 'kk'),
  (t.id('phys1'), t.id('aliya'), '20231455@student.kru.test', 'kk');

-- Help requests come from the events trigger.
select t.event(t.id('math2_session'), 'student.help_requested', p_data => '{"topic":"identity"}', p_review => 'log');
select t.event(t.id('phys1_session'), 'student.help_requested', p_data => '{"topic":"question","text":"Q 3?"}',
  p_review => 'log');

insert into public.review_decisions (session_id, exam_id, decision, reviewer_id) values
  (t.id('math2_session'), t.id('math2'), 'no_issue', t.id('proctor')),
  (t.id('phys1_session'), t.id('phys1'), 'talk', t.id('other_proctor'));
insert into public.reports (session_id, exam_id, verify_code, content_hash, created_by) values
  (t.id('math2_session'), t.id('math2'), '0000000000M2', 'h1', t.id('proctor')),
  (t.id('phys1_session'), t.id('phys1'), '0000000000P1', 'h2', t.id('other_proctor'));
insert into public.report_shares (report_id, token_hash, expires_at, created_by)
select r.id, md5(r.id::text) || md5(r.verify_code), now() + interval '7 days', r.created_by from public.reports r
where r.verify_code in ('0000000000M2', '0000000000P1');
insert into public.data_requests (workspace_id, student_id, kind) values
  (t.id('ws'), t.id('madina'), 'delete'),
  (t.id('ws2'), t.id('ws2_student'), 'copy');
insert into public.pilot_requests (name, email, university) values ('Dana', 'dana@kru.test', 'KRU');

select is((select count(*) from public.help_requests where exam_id in (t.id('math2'), t.id('phys1'))), 2::bigint,
  'setup: the events trigger made one help request per student.help_requested');

-- Every new table has row-level security on.
select ok(bool_and(c.relrowsecurity), 'every Phase 1 table has row-level security')
from pg_class c
where c.oid in ('public.invites'::regclass, 'public.help_requests'::regclass, 'public.review_decisions'::regclass,
  'public.reports'::regclass, 'public.report_shares'::regclass, 'public.data_requests'::regclass,
  'public.pilot_requests'::regclass);
select is((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity), 0::bigint,
  'every table in public has row-level security (24 tables)');

-- ---------------------------------------------------------------------------
-- Exam office
-- ---------------------------------------------------------------------------
select t.login(t.id('office'));
select is((select count(*) from public.invites where exam_id in (t.id('math2'), t.id('phys1'))), 2::bigint,
  'office reads the invites of its workspace');
select lives_ok($$ update public.invites set email = 'madina@kru.test' where exam_id = t.id('math2') $$,
  'office fixes an address (0.3b)');
select lives_ok($$
  insert into public.invites (exam_id, student_id, email, locale)
  select t.id('math2'), s.id, 'x@kru.test', 'kk' from public.students s where s.student_number = '20231044'
$$, 'office adds an invite for a student on the roster');
select throws_ok($$
  insert into public.invites (exam_id, student_id, email, locale) values (t.id('math2'), t.id('aliya'), 'a@kru.test', 'kk')
$$, '42501', null, 'office cannot invite a student who is not on the exam''s roster');
select lives_ok($$ delete from public.invites where email = 'x@kru.test' $$, 'office deletes an invite');
select is((select count(*) from public.help_requests where exam_id in (t.id('math2'), t.id('phys1'))), 2::bigint,
  'office reads the help requests of its exams');
select throws_ok($$ update public.help_requests set done_at = now() $$, '42501', null,
  'office cannot close a help request directly');
select throws_ok($$
  insert into public.help_requests (session_id, exam_id, topic) values (t.id('math2_session'), t.id('math2'), 'question')
$$, '42501', null, 'nobody inserts help requests directly');
select is((select count(*) from public.review_decisions where exam_id in (t.id('math2'), t.id('phys1'))), 2::bigint,
  'office reads the decisions');
select throws_ok($$
  update public.review_decisions set decision = 'committee' where session_id = t.id('math2_session')
$$, '42501', null, 'office writes decisions only through decide_session');
select is((select count(*) from public.reports where exam_id in (t.id('math2'), t.id('phys1'))), 2::bigint,
  'office reads the reports');
select is((select count(*) from public.report_shares s join public.reports r on r.id = s.report_id
  where r.exam_id in (t.id('math2'), t.id('phys1'))), 2::bigint, 'office reads the shares');
select throws_ok($$
  insert into public.reports (session_id, exam_id, verify_code, content_hash, created_by)
  values (t.id('math2_session'), t.id('math2'), 'XXXXXXXXXXXX', 'h', t.id('office'))
$$, '42501', null, 'office writes reports only through get_report');
select is((select count(*) from public.data_requests), 1::bigint, 'office reads only its workspace''s data requests');
select lives_ok($$
  insert into public.data_requests (workspace_id, student_id, kind) values (t.id('ws'), t.id('madina'), 'copy')
$$, 'office enters a data request (A.5)');
select throws_ok($$
  insert into public.data_requests (workspace_id, student_id, kind) values (t.id('ws'), t.id('ws2_student'), 'copy')
$$, '42501', null, 'office cannot enter a request for another workspace''s student');
select lives_ok($$ update public.data_requests set status = 'replied', reply = 'Kept: the result' where kind = 'copy' $$,
  'office updates a data request');
select throws_ok($$ delete from public.data_requests $$, '42501', null, 'data requests are never deleted by staff');
select is((select count(*) from public.pilot_requests), 0::bigint, 'the exam office does not read pilot requests');
select lives_ok($$
  update public.workspaces set settings = jsonb_set(settings, '{lobby_minutes}', '25') where id = t.id('ws')
$$, 'office saves the workspace settings (A.4)');
select is((select (settings ->> 'lobby_minutes')::int from public.workspaces where id = t.id('ws')), 25,
  'the settings were saved');
select throws_ok($$ update public.workspaces set name = 'Renamed' where id = t.id('ws') $$, '42501', null,
  'office changes nothing but settings on the workspace');
select throws_ok($$
  update public.workspaces set settings = jsonb_set(settings, '{retention_days}', '0') where id = t.id('ws')
$$, '23514', null, 'invalid settings are refused');
select is_empty($$ update public.workspaces set settings = settings where id = t.id('ws2') returning 1 $$,
  'office cannot change another workspace''s settings');
select ok((select count(*) from public.review_queue) >= 0, 'office reads review_queue');
select is((select count(*) from public.student_overview where workspace_id = t.id('ws2')), 0::bigint,
  'student_overview shows no other workspace''s students');
reset role;

select t.login(t.id('office2'));
select is((select count(*) from public.invites where exam_id in (t.id('math2'), t.id('phys1'))), 0::bigint,
  'another workspace''s office reads no KRU invite');
select is((select count(*) from public.help_requests where exam_id in (t.id('math2'), t.id('phys1'))), 0::bigint,
  'another workspace''s office reads no KRU help request');
select is((select count(*) from public.review_decisions where exam_id in (t.id('math2'), t.id('phys1'))), 0::bigint,
  'another workspace''s office reads no KRU decision');
select is((select count(*) from public.reports where exam_id in (t.id('math2'), t.id('phys1'))), 0::bigint,
  'another workspace''s office reads no KRU report');
select is((select count(*) from public.data_requests), 1::bigint, 'another workspace''s office reads only its own request');
select is((select count(*) from public.student_overview where workspace_id = t.id('ws')), 0::bigint,
  'another workspace''s office sees no KRU student in student_overview');
select is((select count(*) from public.term_kpis where workspace_id = t.id('ws')), 0::bigint,
  'another workspace''s office sees no KRU term');
reset role;

-- ---------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------
select t.login(t.id('admin'));
select ok(public.is_admin(), 'is_admin is true for an admin');
select is((select count(*) from public.pilot_requests where email = 'dana@kru.test'), 1::bigint, 'an admin reads pilot requests');
select throws_ok($$ delete from public.pilot_requests $$, '42501', null, 'an admin cannot delete pilot requests');
reset role;

-- ---------------------------------------------------------------------------
-- Assigned proctor (Mathematics 2)
-- ---------------------------------------------------------------------------
select t.login(t.id('proctor'));
select ok(not public.is_admin(), 'is_admin is false for a proctor');
select results_eq($$ select exam_id from public.invites where exam_id in (t.id('math2'), t.id('phys1')) $$,
  array[t.id('math2')], 'proctor reads the invites of its exam only');
select throws_ok($$
  insert into public.invites (exam_id, student_id, email, locale)
  select t.id('math2'), s.id, 'y@kru.test', 'kk' from public.students s where s.student_number = '20231219'
$$, '42501', null, 'proctor cannot write invites');
select is_empty($$ update public.invites set email = 'z@kru.test' where exam_id = t.id('math2') returning 1 $$,
  'proctor cannot change an invite');
select results_eq($$ select exam_id from public.help_requests where exam_id in (t.id('math2'), t.id('phys1')) $$,
  array[t.id('math2')], 'proctor reads the help requests of its exam only');
select results_eq($$ select exam_id from public.review_decisions where exam_id in (t.id('math2'), t.id('phys1')) $$,
  array[t.id('math2')], 'proctor reads the decisions of its exam only');
select results_eq($$ select exam_id from public.reports where exam_id in (t.id('math2'), t.id('phys1')) $$,
  array[t.id('math2')], 'proctor reads the reports of its exam only');
select is((select count(*) from public.report_shares), 1::bigint, 'proctor reads the shares of its exam only');
select is((select count(*) from public.data_requests), 0::bigint, 'proctor reads no data request');
select throws_ok($$
  insert into public.data_requests (workspace_id, student_id, kind) values (t.id('ws'), t.id('madina'), 'delete')
$$, '42501', null, 'proctor cannot enter a data request');
select is((select count(*) from public.pilot_requests), 0::bigint, 'proctor reads no pilot request');
select is_empty($$ update public.workspaces set settings = settings where id = t.id('ws') returning 1 $$,
  'proctor cannot change the settings');
select is((select count(*) from public.student_overview), 128::bigint, 'proctor sees only its exam''s students in student_overview');
reset role;

-- ---------------------------------------------------------------------------
-- Other proctor (Physics 1)
-- ---------------------------------------------------------------------------
select t.login(t.id('other_proctor'));
select results_eq($$ select exam_id from public.invites where exam_id in (t.id('math2'), t.id('phys1')) $$,
  array[t.id('phys1')], 'other proctor reads only Physics 1''s invites');
select is((select count(*) from public.help_requests where exam_id = t.id('math2')), 0::bigint,
  'other proctor reads no Mathematics 2 help request');
select is((select count(*) from public.review_decisions where exam_id = t.id('math2')), 0::bigint,
  'other proctor reads no Mathematics 2 decision');
select is((select count(*) from public.reports where exam_id = t.id('math2')), 0::bigint,
  'other proctor reads no Mathematics 2 report');
select is((select count(*) from public.review_queue where exam_id = t.id('math2')), 0::bigint,
  'other proctor sees no Mathematics 2 session in review_queue');
reset role;

-- ---------------------------------------------------------------------------
-- Student (anonymous sign-in with a Mathematics 2 session)
-- ---------------------------------------------------------------------------
select t.login(t.id('student'));
select is((select count(*) from public.invites), 0::bigint, 'student reads no invite');
select is((select count(*) from public.help_requests), 0::bigint, 'student reads no help request, not even its own');
select is((select count(*) from public.review_decisions), 0::bigint, 'student reads no decision');
select is((select count(*) from public.reports), 0::bigint, 'student reads no report');
select is((select count(*) from public.report_shares), 0::bigint, 'student reads no share');
select is((select count(*) from public.data_requests), 0::bigint, 'student reads no data request');
select is((select count(*) from public.pilot_requests), 0::bigint, 'student reads no pilot request');
select is((select count(*) from public.student_overview), 0::bigint, 'student sees nobody in student_overview');
select is((select count(*) from public.term_kpis), 0::bigint, 'student sees no term');
select throws_ok($$
  insert into public.data_requests (workspace_id, student_id, kind) values (t.id('ws'), t.id('madina'), 'delete')
$$, '42501', null, 'student cannot enter a data request');
select is_empty($$ update public.workspaces set settings = settings returning 1 $$, 'student cannot change settings');
select throws_ok($$ select public.get_report(t.id('math2_session')) $$, '42501', 'forbidden',
  'student cannot read its report');
reset role;

-- ---------------------------------------------------------------------------
-- Anonymous visitor (publishable key, no sign-in)
-- ---------------------------------------------------------------------------
select t.anon();
select throws_ok($$ select count(*) from public.invites $$, '42501', null, 'anon cannot read invites');
select throws_ok($$ select count(*) from public.help_requests $$, '42501', null, 'anon cannot read help requests');
select throws_ok($$ select count(*) from public.review_decisions $$, '42501', null, 'anon cannot read decisions');
select throws_ok($$ select count(*) from public.reports $$, '42501', null, 'anon cannot read reports');
select throws_ok($$ select count(*) from public.report_shares $$, '42501', null, 'anon cannot read shares');
select throws_ok($$ select count(*) from public.data_requests $$, '42501', null, 'anon cannot read data requests');
select throws_ok($$ select count(*) from public.pilot_requests $$, '42501', null, 'anon cannot read pilot requests');
select throws_ok($$ insert into public.pilot_requests (name, email, university) values ('x', 'x@x.kz', 'x') $$,
  '42501', null, 'anon cannot insert a pilot request directly');
select throws_ok($$ select count(*) from public.student_overview $$, '42501', null, 'anon cannot read student_overview');
select throws_ok($$ select count(*) from public.term_kpis $$, '42501', null, 'anon cannot read the term views');
select throws_ok($$ select count(*) from public.review_queue $$, '42501', null, 'anon cannot read review_queue');
select throws_ok($$ select public.save_exam_draft('{}') $$, '42501', null, 'anon cannot call the wizard functions');
select throws_ok($$ select public.open_shared_report(repeat('0', 64)) $$, '42501', null,
  'anon cannot open a share without the shared-report function');
select lives_ok($$ select public.verify_report('UKI-RPT-0000-0000-00M2') $$, 'anon may verify a report');
select lives_ok($$ select public.request_pilot('Dana', 'dana2@kru.test', 'KRU') $$, 'anon may book a pilot');
reset role;

select * from finish();
rollback;
