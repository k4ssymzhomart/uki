-- Every row of the Session states table, the pause credit rules and session_tick.
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

select t.schedule(t.id('math2'), interval '-10 minutes', 'live');
select t.put('lead', t.new_staff('lead@states.test', 'Lead Proctor', 'proctor'));
select t.assign(t.id('math2'), t.id('lead'), true, 1, 128);

-- ---------------------------------------------------------------------------
-- join_exam -> joined (with joined_at, locale, device)
-- ---------------------------------------------------------------------------
select t.put('u', t.new_user(null, true));
select t.login(t.id('u'));
create table t.j as select public.join_exam('MATH2-204-FRI', '20231187', 'ru', '{"os":"windows","app_version":"0.1.0"}') as r;
reset role;
select t.put('s', (select (r -> 'session' ->> 'id')::uuid from t.j));
select is(t.state(t.id('s')), 'joined', 'join_exam: joined');
select ok((select joined_at is not null and locale = 'ru' and device ->> 'os' = 'windows' from public.sessions where id = t.id('s')),
  'join_exam sets joined_at, locale and device');

-- ---------------------------------------------------------------------------
-- ingest status.step: forward only, never out of writing, paused or a final state
-- ---------------------------------------------------------------------------
select public.ingest_batch(t.id('s'), '[]', '{"step":"checking"}');
select is(t.state(t.id('s')), 'checking', 'status.step checking: checking');
select public.ingest_batch(t.id('s'), '[]', '{"step":"identity","detail":"card"}');
select is(t.state(t.id('s')), 'identity', 'status.step identity: identity');
select public.ingest_batch(t.id('s'), '[]', '{"step":"checking"}');
select is(t.state(t.id('s')), 'identity', 'a step never moves back');
select public.ingest_batch(t.id('s'), '[]', '{"step":"rules"}');
select is(t.state(t.id('s')), 'rules', 'status.step rules: rules');
select public.ingest_batch(t.id('s'), '[]', '{"step":"ready"}');
select is(t.state(t.id('s')), 'ready', 'status.step ready: ready');
select is((select status ->> 'step' from public.sessions where id = t.id('s')), 'ready', 'ingest writes status');
select ok((select last_seen_at = now() from public.sessions where id = t.id('s')), 'ingest writes last_seen_at');

-- ---------------------------------------------------------------------------
-- exam.started -> writing, started_at
-- ---------------------------------------------------------------------------
select public.ingest_batch(t.id('s'), jsonb_build_array(t.ev(t.id('s'), 'exam.started', 'none', 1)), '{"question":1}');
select is(t.state(t.id('s')), 'writing', 'exam.started: writing');
select ok((select started_at = now() from public.sessions where id = t.id('s')), 'exam.started sets started_at (server time)');
select public.ingest_batch(t.id('s'), '[]', '{"step":"ready"}');
select is(t.state(t.id('s')), 'writing', 'a step never moves a writing session');

-- ---------------------------------------------------------------------------
-- Pauses and resumes, with the credit rules
-- ---------------------------------------------------------------------------
-- Self pause: 60 s by the laptop clock, but only 30 s between the two arrivals: 30 s credit.
select t.event(t.id('s'), 'session.paused', now() - interval '60 seconds', now() - interval '30 seconds',
  '{"reason":"face_missing"}', p_review => 'log');
select is(t.state(t.id('s')), 'paused', 'session.paused: paused');
select public.ingest_batch(t.id('s'), '[]', '{"step":"rules"}');
select is(t.state(t.id('s')), 'paused', 'a step never moves a paused session');
select t.event(t.id('s'), 'session.resumed', now(), now(), '{"paused_ms":60000,"by":"student"}');
select is(t.state(t.id('s')), 'writing', 'session.resumed: writing');
select is((select paused_s from public.sessions where id = t.id('s')), 30, 'the credit is capped by the gap between received_at');

-- Self pause: 20 s by the clock, 200 s between arrivals: 20 s credit.
select t.event(t.id('s'), 'session.paused', now() - interval '20 seconds', now() - interval '200 seconds',
  '{"reason":"camera_lost"}', p_review => 'log');
select t.event(t.id('s'), 'session.resumed', now(), now(), '{"paused_ms":20000,"by":"student"}');
select is((select paused_s from public.sessions where id = t.id('s')), 50, 'the credit is the pause by the laptop clock when shorter');

-- Self pauses give back at most 300 s in total: 400 s more gives 250.
select t.event(t.id('s'), 'session.paused', now() - interval '400 seconds', now() - interval '400 seconds',
  '{"reason":"face_missing"}', p_review => 'log');
select t.event(t.id('s'), 'session.resumed', now(), now(), '{"paused_ms":400000,"by":"student"}');
select is((select paused_s from public.sessions where id = t.id('s')), 300, 'self pauses give back at most 300 s');
select is((select self_paused_s from public.sessions where id = t.id('s')), 300, 'self_paused_s tracks the self credit');
select t.event(t.id('s'), 'session.paused', now() - interval '100 seconds', now() - interval '100 seconds',
  '{"reason":"face_missing"}', p_review => 'log');
select t.event(t.id('s'), 'session.resumed', now(), now(), '{"paused_ms":100000,"by":"student"}');
select is((select paused_s from public.sessions where id = t.id('s')), 300, 'past the cap a self pause gives nothing back');

-- Proctor pauses give back all their time, even past the self cap.
select t.event(t.id('s'), 'proctor.paused', now() - interval '400 seconds', now() - interval '400 seconds',
  jsonb_build_object('staff_id', t.id('lead')), 'proctor', 'log');
select is(t.state(t.id('s')), 'paused', 'proctor.paused: paused');
select t.event(t.id('s'), 'proctor.resumed', now(), now(), jsonb_build_object('staff_id', t.id('lead')), 'proctor', 'log');
select is(t.state(t.id('s')), 'writing', 'proctor.resumed: writing');
select is((select paused_s from public.sessions where id = t.id('s')), 700, 'a proctor pause gives back all of its time');
-- A pause the app reports with reason proctor counts as a proctor pause.
select t.event(t.id('s'), 'session.paused', now() - interval '50 seconds', now() - interval '50 seconds',
  '{"reason":"proctor"}', p_review => 'log');
select t.event(t.id('s'), 'proctor.resumed', now(), now(), jsonb_build_object('staff_id', t.id('lead')), 'proctor', 'log');
select is((select paused_s from public.sessions where id = t.id('s')), 750, 'a session.paused with reason proctor is a proctor pause');
-- A resume without a pause changes nothing.
select t.event(t.id('s'), 'session.resumed', now(), now(), '{"paused_ms":1000,"by":"student"}');
select is((select paused_s from public.sessions where id = t.id('s')), 750, 'a resume without a pause adds nothing');
-- The session's end moves with the credit.
select is((select public.session_ends_at(se) from public.sessions se where se.id = t.id('s')),
  (select starts_at + interval '90 minutes' + interval '750 seconds' from public.exams where id = t.id('math2')),
  'session_ends_at = starts_at + duration + extra + paused');

-- ---------------------------------------------------------------------------
-- proctor.ended -> ended, ended_at, end_reason; nothing leaves a final state
-- ---------------------------------------------------------------------------
select t.event(t.id('s'), 'proctor.ended', now(), now(),
  jsonb_build_object('staff_id', t.id('lead'), 'reason', 'Second person in the room'), 'proctor', 'flag');
select is(t.state(t.id('s')), 'ended', 'proctor.ended: ended');
select ok((select ended_at = now() and end_reason = 'Second person in the room' from public.sessions where id = t.id('s')),
  'proctor.ended sets ended_at and end_reason');
select t.event(t.id('s'), 'proctor.paused', now(), now(), jsonb_build_object('staff_id', t.id('lead')), 'proctor', 'log');
select t.event(t.id('s'), 'exam.started', now(), now());
select is(t.state(t.id('s')), 'ended', 'no event moves a session out of a final state');
select public.ingest_batch(t.id('s'), '[]', '{"step":"checking"}');
select is(t.state(t.id('s')), 'ended', 'no step moves a session out of a final state');

-- ---------------------------------------------------------------------------
-- submit_session before and after the end
-- ---------------------------------------------------------------------------
select t.put('before', t.new_session(t.id('math2'), '20230912', 'writing'));
select t.login(t.uid_of(t.id('before')));
select public.submit_session(t.id('before'));
reset role;
select is(t.state(t.id('before')), 'submitted', 'submit_session before the end: submitted');
select ok((select submitted_at is not null and receipt_id is not null from public.sessions where id = t.id('before')),
  'submitted sets submitted_at and receipt_id');

select t.schedule(t.id('phys1'), interval '-41 minutes', 'live', 40);
select t.put('after', t.new_session(t.id('phys1'), '20231455', 'writing'));
select t.login(t.uid_of(t.id('after')));
select public.submit_session(t.id('after'));
reset role;
select is(t.state(t.id('after')), 'time_up', 'submit_session after the end: time_up');
select ok((select submitted_at is not null from public.sessions where id = t.id('after')), 'time_up sets submitted_at when submitted');

-- ---------------------------------------------------------------------------
-- session_tick
-- ---------------------------------------------------------------------------
-- Ends 5 minutes ago: time_up. Ends 1 minute ago: still inside the 2-minute grace.
select t.schedule(t.id('math2'), interval '-95 minutes', 'live');
select t.put('overdue', t.new_session(t.id('math2'), '20231044', 'writing'));
select t.put('grace', t.new_session(t.id('math2'), '20231219', 'writing'));
update public.sessions set extra_min = 4 where id = t.id('grace');
-- A proctor pause running for 10 minutes moves the end with it.
select t.put('paused', t.new_session(t.id('math2'), '20231302', 'writing'));
select t.event(t.id('paused'), 'proctor.paused', now() - interval '10 minutes', now() - interval '10 minutes',
  jsonb_build_object('staff_id', t.id('lead')), 'proctor', 'log');
-- A live exam whose window has closed and whose sessions are all final.
select t.schedule(t.id('history'), interval '-2 hours', 'live', 60);
-- A scheduled exam whose start has passed.
select t.schedule(t.id('phys1'), interval '-1 minute', 'scheduled', 40);

create table t.tick as select public.session_tick() as r;
select is(t.state(t.id('overdue')), 'time_up', 'session_tick: time_up 2 minutes past the end');
select is(t.state(t.id('grace')), 'writing', 'session_tick waits 2 minutes past the end');
select is(t.state(t.id('paused')), 'paused', 'session_tick counts a running proctor pause');
select is((select count(*) from public.events where session_id = t.id('overdue') and type = 'exam.time_up' and source = 'server'),
  1::bigint, 'session_tick writes exam.time_up');
select is((select status::text from public.exams where id = t.id('phys1')), 'live', 'session_tick: scheduled exams go live at starts_at');
select is((select status::text from public.exams where id = t.id('history')), 'to_review',
  'session_tick: to_review once the window closed and every session is final');
select is((select status::text from public.exams where id = t.id('math2')), 'live', 'an exam with a session still writing stays live');
select is((select (r ->> 'time_up')::int from t.tick), 1, 'session_tick reports what it changed');

-- The job is scheduled every minute.
select is((select schedule from cron.job where jobname = 'session_tick'), '* * * * *', 'pg_cron runs session_tick every minute');

select * from finish();
rollback;
