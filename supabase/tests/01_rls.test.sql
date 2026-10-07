-- RLS for each role: exam office, assigned proctor, other proctor, session owner, other student.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Test helpers, rolled back with the transaction. Users are inserted into auth.users; t.login()
-- then switches to the `authenticated` role with request.jwt.claims {sub, role, is_anonymous}, as
-- PostgREST does. `reset role` returns to postgres for the next setup step.
create schema t;
grant usage, create on schema t to authenticated, service_role;
create table t.ids (k text primary key, v uuid not null);
grant select on t.ids to authenticated, service_role;

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

-- Exam timing relative to now(): starts in p_starts_in (negative for the past), lobby 20 minutes before.
create function t.schedule(p_exam uuid, p_starts_in interval, p_status public.exam_status,
  p_duration int default 90) returns void language sql as $$
  update public.exams
  set starts_at = now() + p_starts_in, lobby_opens_at = now() + p_starts_in - interval '20 minutes',
      status = p_status, duration_min = p_duration
  where id = p_exam
$$;

-- An event with explicit times, inserted the way ingest and issue_command do (the triggers run).
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

-- An ingest envelope as the Edge Function passes it (review already set from the REVIEW map).
create function t.ev(p_session uuid, p_type text, p_review text default 'none', p_seq int default 0,
  p_frames int default 0, p_id uuid default null, p_data jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('id', coalesce(p_id, gen_random_uuid()), 'session_id', p_session, 'type', p_type,
    'source', 'app', 'review', p_review, 'seq', p_seq, 'at', now(), 'data', p_data, 'frame_count', p_frames,
    'app_version', '0.1.0')
$$;

create function t.messages(p_topic text, p_event text) returns bigint language sql stable as $$
  select count(*) from realtime.messages m where m.topic = p_topic and m.event = p_event and m.private
$$;

create function t.state(p_session uuid) returns text language sql stable as $$
  select state::text from public.sessions where id = p_session
$$;

-- Seeded ids (supabase/seed.sql).
select t.put('ws', 'a0000000-0000-4000-8000-000000000001');
select t.put('math2', 'e0000000-0000-4000-8000-000000000001');
select t.put('phys1', 'e0000000-0000-4000-8000-000000000002');
select t.put('history', 'e0000000-0000-4000-8000-000000000003');

-- Start every file from the seed alone: staff assignments made by `pnpm seed:staff` are set aside
-- (the transaction rolls back).
delete from public.proctor_assignments;

-- ---------------------------------------------------------------------------
-- Setup
-- ---------------------------------------------------------------------------
select t.schedule(t.id('math2'), interval '15 minutes', 'scheduled');
select t.schedule(t.id('phys1'), interval '-5 minutes', 'live', 40);

select t.put('office', t.new_staff('office@rls.test', 'Office Person', 'exam_office'));
select t.put('proctor', t.new_staff('proctor@rls.test', 'Assigned Proctor', 'proctor'));
select t.put('other_proctor', t.new_staff('other@rls.test', 'Other Proctor', 'proctor'));
select t.assign(t.id('math2'), t.id('proctor'), true, 1, 64);
select t.assign(t.id('phys1'), t.id('other_proctor'), true);

-- A second workspace with its own exam office.
insert into public.workspaces (id, name, slug) values ('a0000000-0000-4000-8000-0000000000f2', 'Other U', 'other-u');
select t.put('office2', t.new_staff('office2@rls.test', 'Other Office', 'exam_office',
  'a0000000-0000-4000-8000-0000000000f2'));

-- Students: the owner writes Mathematics 2, another student writes Physics 1.
select t.put('owner_session', t.new_session(t.id('math2'), '20231187', 'ready'));
select t.put('owner', t.uid_of(t.id('owner_session')));
select t.put('other_session', t.new_session(t.id('phys1'), '20231455', 'writing'));
select t.put('other_student', t.uid_of(t.id('other_session')));
select t.put('math2_session2', t.new_session(t.id('math2'), '20230912', 'ready'));

-- An anonymous user that somehow has a staff row: staff checks must still fail for it.
select t.put('anon_staff', t.new_user(null, true));
insert into public.staff (id, workspace_id, full_name, role) values (t.id('anon_staff'), t.id('ws'), 'Anon', 'exam_office');

-- Rows the roles should or should not see.
select t.put('owner_event', t.event(t.id('owner_session'), 'gaze.off_screen', p_review => 'flag'));
select t.put('other_event', t.event(t.id('other_session'), 'tab.blocked', p_review => 'flag'));
insert into public.session_commands (session_id, exam_id, type, payload, issued_by)
values (t.id('owner_session'), t.id('math2'), 'message', '{"text":"Hello","scope":"student"}', t.id('proctor')),
       (t.id('other_session'), t.id('phys1'), 'message', '{"text":"Hi","scope":"student"}', t.id('other_proctor'));
-- A question in the bank but not in Mathematics 2.
insert into public.questions (id, workspace_id, body, choices)
values ('c0000000-0000-4000-8000-0000000000ff', t.id('ws'), '{"kk":"?","ru":"?","en":"?"}', '[]');
insert into public.audit_log (workspace_id, actor_id, actor_kind, action, object_type)
values (t.id('ws'), t.id('office'), 'staff', 'test', 'exam');

create table t.expect as
select
  (select count(*) from public.exams where workspace_id = t.id('ws')) as exams,
  (select count(*) from public.students where workspace_id = t.id('ws')) as students,
  (select count(*) from public.sessions) as sessions,
  (select count(*) from public.events) as events,
  (select count(*) from public.staff where workspace_id = t.id('ws')) as staff;
grant select on t.expect to authenticated;

-- ---------------------------------------------------------------------------
-- Exam office
-- ---------------------------------------------------------------------------
select t.login(t.id('office'));
select is((select count(*) from public.exams), (select exams from t.expect), 'office reads every exam of its workspace');
select is((select count(*) from public.students), (select students from t.expect), 'office reads every student');
select is((select count(*) from public.sessions), (select sessions from t.expect), 'office reads every session');
select is((select count(*) from public.events), (select events from t.expect), 'office reads every event');
select ok((select count(*) from public.audit_log) >= 1, 'office reads the audit log');
select is((select count(*) from public.workspaces), 1::bigint, 'office reads only its own workspace');
select is((select count(*) from public.staff where workspace_id <> t.id('ws')), 0::bigint, 'office does not read other workspaces'' staff');
select is((select count(*) from public.questions), 21::bigint, 'office reads the question bank');
select is((select count(*) from public.exam_overview), (select exams from t.expect), 'office sees every exam in exam_overview');
select is((select roster_size from public.exam_overview where id = t.id('math2')), 128, 'exam_overview counts the roster');
select lives_ok($$
  insert into public.exams (workspace_id, title, course, kind, mode, starts_at, duration_min, lobby_opens_at, status)
  values (t.id('ws'), 'New', 'New', 'Test', 'app', now() + interval '1 day', 60, now() + interval '23 hours', 'draft')
$$, 'office creates an exam in its workspace');
select throws_ok($$
  insert into public.exams (workspace_id, title, course, kind, mode, starts_at, duration_min, lobby_opens_at)
  values ('a0000000-0000-4000-8000-0000000000f2', 'X', 'X', 'X', 'app', now(), 60, now())
$$, '42501', null, 'office cannot create an exam in another workspace');
select lives_ok($$
  insert into public.proctor_assignments (exam_id, staff_id, languages) values (t.id('math2'), t.id('other_proctor'), '{ru}')
$$, 'office assigns a proctor');
select lives_ok($$
  update public.exam_students set invite_status = 'opened' where exam_id = t.id('math2') and seat = 1
$$, 'office edits the roster');
select throws_ok($$
  insert into public.events (id, session_id, exam_id, type, source, review, at)
  values (gen_random_uuid(), t.id('owner_session'), t.id('math2'), 'x', 'app', 'none', now())
$$, '42501', null, 'office cannot write events directly');
select throws_ok($$ update public.sessions set state = 'ended' where id = t.id('owner_session') $$,
  '42501', null, 'office cannot write sessions directly');
reset role;
delete from public.proctor_assignments where exam_id = t.id('math2') and staff_id = t.id('other_proctor');

select t.login(t.id('office2'));
select is((select count(*) from public.exams where workspace_id = t.id('ws')), 0::bigint, 'another workspace''s office sees no KRU exam');
select is((select count(*) from public.sessions), 0::bigint, 'another workspace''s office sees no KRU session');
reset role;

-- ---------------------------------------------------------------------------
-- Assigned proctor (Mathematics 2)
-- ---------------------------------------------------------------------------
select t.login(t.id('proctor'));
select results_eq('select id from public.exams', array[t.id('math2')], 'proctor reads only its assigned exam');
select is((select count(*) from public.exam_students), 128::bigint, 'proctor reads its exam''s roster');
select is((select count(*) from public.students), 128::bigint, 'proctor reads only the students on its exam');
select is((select count(*) from public.sessions), 2::bigint, 'proctor reads only its exam''s sessions');
select results_eq('select id from public.events', array[t.id('owner_event')], 'proctor reads only its exam''s events');
select is((select count(*) from public.session_commands), 1::bigint, 'proctor reads its exam''s commands');
select is((select count(*) from public.audit_log), 0::bigint, 'proctor does not read the audit log');
select is((select count(*) from public.questions), 0::bigint, 'proctor does not read the question bank');
select is((select count(*) from public.exam_overview), 1::bigint, 'proctor sees only its exam in exam_overview');
select is((select count(*) from public.staff), (select staff from t.expect), 'proctor reads its workspace''s staff');
select ok(public.is_proctor_of(t.id('math2')), 'is_proctor_of is true for the assigned exam');
select ok(not public.is_proctor_of(t.id('phys1')), 'is_proctor_of is false for another exam');
select ok(not public.is_staff_of(t.id('ws')), 'a proctor is not exam office');
select throws_ok($$
  insert into public.exams (workspace_id, title, course, kind, mode, starts_at, duration_min, lobby_opens_at)
  values (t.id('ws'), 'X', 'X', 'X', 'app', now(), 60, now())
$$, '42501', null, 'proctor cannot create exams');
select is_empty($$ update public.exam_students set seat = 99 where exam_id = t.id('math2') and seat = 1 returning 1 $$,
  'proctor cannot edit the roster');
reset role;

-- ---------------------------------------------------------------------------
-- Other proctor (Physics 1 only)
-- ---------------------------------------------------------------------------
select t.login(t.id('other_proctor'));
select results_eq('select id from public.exams', array[t.id('phys1')], 'other proctor reads only Physics 1');
select is((select count(*) from public.sessions where exam_id = t.id('math2')), 0::bigint, 'other proctor reads no Mathematics 2 session');
select is((select count(*) from public.events where exam_id = t.id('math2')), 0::bigint, 'other proctor reads no Mathematics 2 event');
select is((select count(*) from public.students where group_id = 'a2000000-0000-4000-8000-000000000204'), 0::bigint,
  'other proctor reads no Mathematics 2 student');
select is((select count(*) from public.answers), 0::bigint, 'other proctor reads no answers of another exam');
reset role;

-- ---------------------------------------------------------------------------
-- Session owner (anonymous student)
-- ---------------------------------------------------------------------------
select t.login(t.id('owner'));
select ok(public.is_anonymous(), 'the student is anonymous');
select results_eq('select id from public.sessions', array[t.id('owner_session')], 'student reads only its own session');
select results_eq('select id from public.exams', array[t.id('math2')], 'student reads only its exam');
select is((select count(*) from public.questions), 0::bigint, 'student reads no question before the start');
select is((select count(*) from public.exam_questions), 0::bigint, 'student reads no exam_questions before the start');
select is((select count(*) from public.students), 0::bigint, 'student reads no roster');
select is((select count(*) from public.staff), 0::bigint, 'student reads no staff');
select is((select count(*) from public.events), 0::bigint, 'student reads no events');
select is((select count(*) from public.audit_log), 0::bigint, 'student reads no audit log');
select is((select count(*) from public.session_commands), 1::bigint, 'student reads its own commands');
select lives_ok($$ update public.session_commands set acked_at = now() where session_id = t.id('owner_session') $$,
  'student acknowledges its own command');
select throws_ok($$ update public.session_commands set payload = '{}' where session_id = t.id('owner_session') $$,
  '42501', null, 'student cannot change anything but acked_at');
select throws_ok($$
  insert into public.events (id, session_id, exam_id, type, source, review, at)
  values (gen_random_uuid(), t.id('owner_session'), t.id('math2'), 'phone.detected', 'app', 'none', now())
$$, '42501', null, 'student cannot insert events directly');
select throws_ok($$
  insert into public.answers (session_id, question_id, choice_id, saved_at)
  values (t.id('owner_session'), 'c0000000-0000-4000-8000-000000000007', 'a', now())
$$, '42501', null, 'student cannot answer before the exam starts');
reset role;

-- The exam starts.
select t.schedule(t.id('math2'), interval '-1 minute', 'live');
update public.sessions set state = 'writing', started_at = now() where id = t.id('owner_session');

select t.login(t.id('owner'));
select is((select count(*) from public.questions), 20::bigint, 'student reads the exam''s questions once started');
select is((select count(*) from public.exam_questions), 20::bigint, 'student reads exam_questions once started');
select lives_ok($$
  insert into public.answers (session_id, question_id, choice_id, saved_at)
  values (t.id('owner_session'), 'c0000000-0000-4000-8000-000000000007', 'a', now())
$$, 'student saves an answer');
select lives_ok($$
  insert into public.answers (session_id, question_id, choice_id, saved_at)
  values (t.id('owner_session'), 'c0000000-0000-4000-8000-000000000007', 'b', now() + interval '1 second')
  on conflict (session_id, question_id) do update set choice_id = excluded.choice_id, saved_at = excluded.saved_at
$$, 'student upserts a later answer');
select is((select choice_id from public.answers where question_id = 'c0000000-0000-4000-8000-000000000007'), 'b',
  'the later saved_at wins');
select lives_ok($$
  insert into public.answers (session_id, question_id, choice_id, saved_at)
  values (t.id('owner_session'), 'c0000000-0000-4000-8000-000000000007', 'c', now() - interval '1 minute')
  on conflict (session_id, question_id) do update set choice_id = excluded.choice_id, saved_at = excluded.saved_at
$$, 'an older answer upsert is accepted without error');
select is((select choice_id from public.answers where question_id = 'c0000000-0000-4000-8000-000000000007'), 'b',
  'answers_keep_latest keeps the row with the later saved_at');
select throws_ok($$
  insert into public.answers (session_id, question_id, choice_id, saved_at)
  values (t.id('owner_session'), 'c0000000-0000-4000-8000-000000000008', 'a', now() + interval '3 hours')
$$, '42501', null, 'an answer saved after the session''s end is refused');
select throws_ok($$
  insert into public.answers (session_id, question_id, choice_id, saved_at)
  values (t.id('math2_session2'), 'c0000000-0000-4000-8000-000000000008', 'a', now())
$$, '42501', null, 'student cannot answer for another session');
select throws_ok($$
  insert into public.answers (session_id, question_id, choice_id, saved_at)
  values (t.id('owner_session'), 'c0000000-0000-4000-8000-0000000000ff', 'a', now())
$$, '42501', null, 'student cannot answer a question outside its exam');
reset role;

-- After the end: saved before the end is accepted for 10 minutes, then refused.
select t.schedule(t.id('math2'), interval '-95 minutes', 'live');
select t.login(t.id('owner'));
select lives_ok($$
  insert into public.answers (session_id, question_id, choice_id, saved_at)
  values (t.id('owner_session'), 'c0000000-0000-4000-8000-000000000009', 'a', now() - interval '6 minutes')
$$, 'an answer saved before the end syncs within 10 minutes after it');
reset role;
select t.schedule(t.id('math2'), interval '-101 minutes', 'live');
select t.login(t.id('owner'));
select throws_ok($$
  insert into public.answers (session_id, question_id, choice_id, saved_at)
  values (t.id('owner_session'), 'c0000000-0000-4000-8000-000000000010', 'a', now() - interval '20 minutes')
$$, '42501', null, 'an answer arriving more than 10 minutes after the end is refused');
reset role;

-- A proctor's end closes the answers at ended_at, an hour before the scheduled end: saved before it,
-- accepted for 10 minutes after it.
select t.schedule(t.id('math2'), interval '-30 minutes', 'live');
select t.event(t.id('owner_session'), 'proctor.ended', now() - interval '2 minutes', now() - interval '2 minutes',
  jsonb_build_object('staff_id', t.id('proctor'), 'reason', 'Second person in the room'), 'proctor', 'flag');
select is(t.state(t.id('owner_session')), 'ended', 'the proctor ended the owner''s session');
select t.login(t.id('owner'));
select lives_ok($$
  insert into public.answers (session_id, question_id, choice_id, saved_at)
  values (t.id('owner_session'), 'c0000000-0000-4000-8000-000000000011', 'a', now() - interval '3 minutes')
$$, 'an answer saved before a proctor''s end syncs within 10 minutes after it');
select throws_ok($$
  insert into public.answers (session_id, question_id, choice_id, saved_at)
  values (t.id('owner_session'), 'c0000000-0000-4000-8000-000000000012', 'a', now() - interval '1 minute')
$$, '42501', null, 'an answer saved after a proctor''s end is refused');
select throws_ok($$
  update public.answers set choice_id = 'b', saved_at = now() - interval '1 minute'
  where session_id = t.id('owner_session') and question_id = 'c0000000-0000-4000-8000-000000000011'
$$, '42501', null, 'an answer cannot be changed after a proctor''s end');
select throws_ok($$
  insert into public.answers (session_id, question_id, choice_id, saved_at)
  values (t.id('owner_session'), 'c0000000-0000-4000-8000-000000000011', 'b', now() + interval '20 minutes')
  on conflict (session_id, question_id) do update set choice_id = excluded.choice_id, saved_at = excluded.saved_at
$$, '42501', null, 'an upsert after a proctor''s end is refused');
reset role;
update public.sessions set ended_at = now() - interval '11 minutes' where id = t.id('owner_session');
select t.login(t.id('owner'));
select throws_ok($$
  insert into public.answers (session_id, question_id, choice_id, saved_at)
  values (t.id('owner_session'), 'c0000000-0000-4000-8000-000000000013', 'a', now() - interval '12 minutes')
$$, '42501', null, 'an answer arriving more than 10 minutes after a proctor''s end is refused');
select is((select choice_id from public.answers where session_id = t.id('owner_session')
  and question_id = 'c0000000-0000-4000-8000-000000000011'), 'a', 'the answer saved before the end is kept as saved');
reset role;

-- The student's own submit closes the answers at submitted_at in the same way.
update public.sessions set state = 'writing', started_at = now() - interval '30 minutes' where id = t.id('math2_session2');
select t.login(t.uid_of(t.id('math2_session2')));
select is((select public.submit_session(t.id('math2_session2')) ->> 'state'), 'submitted', 'the second student submits');
select lives_ok($$
  insert into public.answers (session_id, question_id, choice_id, saved_at)
  values (t.id('math2_session2'), 'c0000000-0000-4000-8000-000000000011', 'a', now() - interval '1 second')
$$, 'an answer saved before the submit syncs within 10 minutes after it');
select throws_ok($$
  insert into public.answers (session_id, question_id, choice_id, saved_at)
  values (t.id('math2_session2'), 'c0000000-0000-4000-8000-000000000012', 'a', now() + interval '1 second')
$$, '42501', null, 'an answer saved after the receipt is refused');
select throws_ok($$
  update public.answers set choice_id = 'b', saved_at = now() + interval '1 second'
  where session_id = t.id('math2_session2') and question_id = 'c0000000-0000-4000-8000-000000000011'
$$, '42501', null, 'an answer cannot be changed after the receipt');
reset role;
update public.sessions set submitted_at = now() - interval '11 minutes' where id = t.id('math2_session2');
select t.login(t.uid_of(t.id('math2_session2')));
select throws_ok($$
  insert into public.answers (session_id, question_id, choice_id, saved_at)
  values (t.id('math2_session2'), 'c0000000-0000-4000-8000-000000000013', 'a', now() - interval '12 minutes')
$$, '42501', null, 'an answer arriving more than 10 minutes after the submit is refused');
reset role;

-- time_up keeps the 10 minutes after the scheduled end, also when the student submitted after it.
select t.schedule(t.id('math2'), interval '-95 minutes', 'live');
select t.put('late_session', t.new_session(t.id('math2'), '20231044', 'time_up'));
update public.sessions set submitted_at = now() - interval '4 minutes' where id = t.id('late_session');
select t.login(t.uid_of(t.id('late_session')));
select lives_ok($$
  insert into public.answers (session_id, question_id, choice_id, saved_at)
  values (t.id('late_session'), 'c0000000-0000-4000-8000-000000000011', 'a', now() - interval '6 minutes')
$$, 'a time_up session takes answers saved before the scheduled end for 10 minutes after it');
reset role;

-- ---------------------------------------------------------------------------
-- Other student
-- ---------------------------------------------------------------------------
select t.login(t.id('other_student'));
select results_eq('select id from public.sessions', array[t.id('other_session')], 'another student reads only its own session');
select is((select count(*) from public.answers), 0::bigint, 'another student reads no one else''s answers');
select is((select count(*) from public.session_commands where session_id = t.id('owner_session')), 0::bigint,
  'another student reads no one else''s commands');
select is_empty($$ update public.session_commands set acked_at = now() where session_id = t.id('owner_session') returning 1 $$,
  'another student cannot ack someone else''s command');
select is((select count(*) from public.exams where id = t.id('math2')), 0::bigint, 'another student cannot read an exam it is not in');
reset role;

-- ---------------------------------------------------------------------------
-- Anonymous users never pass staff checks
-- ---------------------------------------------------------------------------
select t.login(t.id('anon_staff'));
select ok(not public.is_staff_of(t.id('ws')), 'is_staff_of is false for an anonymous user even with a staff row');
select ok(not public.is_member_of(t.id('ws')), 'is_member_of is false for an anonymous user');
select is((select count(*) from public.students), 0::bigint, 'an anonymous user with a staff row reads no students');
select is((select count(*) from public.exams), 0::bigint, 'an anonymous user with a staff row reads no exams');
reset role;

select * from finish();
rollback;
