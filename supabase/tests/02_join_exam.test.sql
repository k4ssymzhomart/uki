-- join_exam: session, invalid_code, already_joined, lobby_closed, rate_limited, same user same session.
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

-- Lobby open: Mathematics 2 starts in 15 minutes, the lobby opened 5 minutes ago.
select t.schedule(t.id('math2'), interval '15 minutes', 'scheduled');
select t.put('lead', t.new_staff('lead@join.test', 'Lead Proctor', 'proctor'));
select t.put('second', t.new_staff('second@join.test', 'Second Proctor', 'proctor'));
select t.assign(t.id('math2'), t.id('lead'), true, 1, 64);
select t.assign(t.id('math2'), t.id('second'), false, 65, 128);

select t.put('madina', t.new_user(null, true));
select t.put('intruder', t.new_user(null, true));
select t.put('spammer', t.new_user(null, true));
select t.put('late', t.new_user(null, true));
create table t.r (k text primary key, v jsonb);
grant select, insert, update on t.r to authenticated;

-- ---------------------------------------------------------------------------
-- A student joins
-- ---------------------------------------------------------------------------
select t.login(t.id('madina'));
insert into t.r values ('first', public.join_exam('MATH2-204-FRI', '20231187', 'kk', '{"os":"macos","app_version":"0.1.0"}'));
select ok((select v -> 'session' ->> 'id' from t.r where k = 'first') is not null, 'join_exam returns a session');
select is((select v -> 'session' ->> 'state' from t.r where k = 'first'), 'joined', 'the new session is joined');
select is((select v -> 'exam' ->> 'id' from t.r where k = 'first'), t.id('math2')::text, 'join_exam returns the exam');
select is((select v -> 'student' ->> 'full_name' from t.r where k = 'first'), 'Madina Tulegenova', 'join_exam returns the student');
select is((select v ->> 'proctor_name' from t.r where k = 'first'), 'Lead Proctor', 'proctor_name is the proctor of the student''s seat');
select ok((select v -> 'questions' = 'null'::jsonb from t.r where k = 'first'), 'no questions before the exam starts');
select ok((select (v ->> 'server_time')::timestamptz is not null from t.r where k = 'first'), 'join_exam returns server_time');
select ok((select v -> 'exam' -> 'checks' ? 'gaze_s' from t.r where k = 'first'), 'join_exam returns the exam checks');
reset role;

select is((select auth_uid from public.sessions where id = (select (v -> 'session' ->> 'id')::uuid from t.r where k = 'first')),
  t.id('madina'), 'the session is bound to auth.uid()');
select is((select device ->> 'os' from public.sessions where auth_uid = t.id('madina')), 'macos', 'join_exam stores the device');
select is((select locale::text from public.sessions where auth_uid = t.id('madina')), 'kk', 'join_exam stores the locale');
select ok((select joined_at is not null from public.sessions where auth_uid = t.id('madina')), 'join_exam sets joined_at');
select is(t.messages('exam:' || t.id('math2'), 'session'), 1::bigint, 'a join broadcasts the new session to the exam channel');

-- The same user joins again, with another case and spaces: the same session.
select t.login(t.id('madina'));
insert into t.r values ('again', public.join_exam(' math2-204-fri ', '20231187', 'ru', '{"os":"macos","app_version":"0.1.1"}'));
select is((select v -> 'session' ->> 'id' from t.r where k = 'again'), (select v -> 'session' ->> 'id' from t.r where k = 'first'),
  'the same user gets the same session');
select is((select v -> 'session' ->> 'locale' from t.r where k = 'again'), 'ru', 'a rejoin updates the locale');

-- invalid_code: an unknown code, and a student not on the roster.
insert into t.r values ('bad_code', public.join_exam('NOPE-000', '20231187', 'kk', '{}'));
select is((select v ->> 'message' from t.r where k = 'bad_code'), 'invalid_code', 'an unknown code gives invalid_code');
select is(current_setting('response.status', true), '400', 'join errors set the PostgREST status to 400');
insert into t.r values ('not_on_roster', public.join_exam('MATH2-204-FRI', '20251001', 'kk', '{}'));
select is((select v ->> 'message' from t.r where k = 'not_on_roster'), 'invalid_code', 'a student not on the roster gives invalid_code');
insert into t.r values ('unknown_number', public.join_exam('MATH2-204-FRI', '99999999', 'kk', '{}'));
select is((select v ->> 'message' from t.r where k = 'unknown_number'), 'invalid_code', 'an unknown student number gives invalid_code');
-- One user writes one student's exam.
insert into t.r values ('second_student', public.join_exam('MATH2-204-FRI', '20230912', 'kk', '{}'));
select is((select v ->> 'message' from t.r where k = 'second_student'), 'already_joined', 'a user with a session cannot join as another student');
reset role;

-- already_joined: another user tries Madina's number.
select t.login(t.id('intruder'));
insert into t.r values ('intruder', public.join_exam('MATH2-204-FRI', '20231187', 'kk', '{}'));
select is((select v ->> 'message' from t.r where k = 'intruder'), 'already_joined', 'another user gets already_joined');
select is(current_setting('response.status', true), '409', 'already_joined answers 409');
reset role;
select is((select count(*) from public.sessions where exam_id = t.id('math2') and student_id =
  (select id from public.students where student_number = '20231187')), 1::bigint, 'no second session is created');

-- The tries are counted in audit_log, errors included.
select is((select count(*) from public.audit_log where action = 'join_exam' and actor_id = t.id('madina')), 6::bigint,
  'every try is in the audit log');
select is((select meta ->> 'result' from public.audit_log where action = 'join_exam' and actor_id = t.id('intruder')),
  'already_joined', 'the audit row records the result');

-- ---------------------------------------------------------------------------
-- lobby_closed
-- ---------------------------------------------------------------------------
select t.schedule(t.id('math2'), interval '30 minutes', 'scheduled');
select t.login(t.id('late'));
insert into t.r values ('early', public.join_exam('MATH2-204-FRI', '20231044', 'kk', '{}'));
select is((select v ->> 'message' from t.r where k = 'early'), 'lobby_closed', 'before lobby_opens_at gives lobby_closed');
reset role;
select t.schedule(t.id('math2'), interval '-91 minutes', 'live');
select t.login(t.id('late'));
insert into t.r values ('after', public.join_exam('MATH2-204-FRI', '20231044', 'kk', '{}'));
select is((select v ->> 'message' from t.r where k = 'after'), 'lobby_closed', 'after starts_at + duration gives lobby_closed');
reset role;
-- The owner of a session with extra time can still come back until its own end.
update public.sessions set extra_min = 10 where auth_uid = t.id('madina');
select t.login(t.id('madina'));
insert into t.r values ('extra', public.join_exam('MATH2-204-FRI', '20231187', 'kk', '{}'));
select is((select v -> 'session' ->> 'extra_min' from t.r where k = 'extra'), '10', 'the owner rejoins within its extra time');
reset role;
select t.schedule(t.id('history'), interval '-10 minutes', 'to_review', 60);
update public.exams set code = 'HIST-110' where id = t.id('history');
select t.login(t.id('late'));
insert into t.r values ('reviewed', public.join_exam('HIST-110', '20241001', 'kk', '{}'));
select is((select v ->> 'message' from t.r where k = 'reviewed'), 'lobby_closed', 'an exam in review is closed');
reset role;

-- ---------------------------------------------------------------------------
-- Questions once started
-- ---------------------------------------------------------------------------
select t.schedule(t.id('math2'), interval '-1 minute', 'live');
select t.login(t.id('madina'));
insert into t.r values ('started', public.join_exam('MATH2-204-FRI', '20231187', 'kk', '{}'));
select is((select jsonb_array_length(v -> 'questions') from t.r where k = 'started'), 20, 'join_exam returns the 20 questions once started');
select is((select v -> 'questions' -> 6 -> 'body' ->> 'en' from t.r where k = 'started'),
  'Find the derivative of f(x) = x³ − 4x + 1.', 'question 7 is the one in frame 2.1');
select is((select v -> 'questions' -> 6 -> 'choices' -> 0 -> 'body' ->> 'kk' from t.r where k = 'started'), '3x² − 4',
  'question 7 choice A is 3x² − 4');
select is((select (v -> 'questions' -> 0 ->> 'position')::int from t.r where k = 'started'), 1, 'questions come in position order');
reset role;

-- A student in seat 100 gets the proctor of seats 65 to 128.
select t.put('seat100', t.new_user(null, true));
create table t.seat100 as select s.student_number from public.students s
  join public.exam_students es on es.student_id = s.id where es.exam_id = t.id('math2') and es.seat = 100;
grant select on t.seat100 to authenticated;
select t.login(t.id('seat100'));
insert into t.r values ('seat100', public.join_exam('MATH2-204-FRI', (select student_number from t.seat100), 'ru', '{}'));
reset role;
select is((select v ->> 'proctor_name' from t.r where k = 'seat100'), 'Second Proctor', 'seat 100 gets the proctor of seats 65 to 128');

-- ---------------------------------------------------------------------------
-- rate_limited: 10 tries a minute per user
-- ---------------------------------------------------------------------------
select t.login(t.id('spammer'));
select public.join_exam('WRONG-' || i, '20231187', 'kk', '{}') from generate_series(1, 10) as i;
insert into t.r values ('limited', public.join_exam('MATH2-204-FRI', '20231219', 'kk', '{}'));
select is((select v ->> 'message' from t.r where k = 'limited'), 'rate_limited', 'the 11th try in a minute gives rate_limited');
select is(current_setting('response.status', true), '429', 'rate_limited answers 429');
reset role;
select is((select count(*) from public.sessions where auth_uid = t.id('spammer')), 0::bigint, 'a rate-limited try creates no session');
update public.audit_log set at = now() - interval '2 minutes' where actor_id = t.id('spammer');
select t.login(t.id('spammer'));
insert into t.r values ('after_limit', public.join_exam('MATH2-204-FRI', '20231219', 'kk', '{}'));
select ok((select v ? 'session' from t.r where k = 'after_limit'), 'a minute later the user can join again');
reset role;

-- Without a user there is no join.
select set_config('request.jwt.claims', '', true);
select throws_ok($$ select public.join_exam('MATH2-204-FRI', '20231187', 'kk', '{}') $$, '42501', null,
  'postgres without a JWT cannot join');
set local role anon;
select throws_ok($$ select public.join_exam('MATH2-204-FRI', '20231187', 'kk', '{}') $$, '42501', null,
  'the anon role cannot call join_exam');
reset role;

select * from finish();
rollback;
