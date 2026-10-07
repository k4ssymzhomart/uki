-- start_exam rights and timing; submit_session: submitted vs time_up, ended kept, idempotent receipt.
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

-- Messages on p_topic of kind p_event whose payload contains p_payload. Demo and simulator runs leave
-- messages on the seeded exams' topics, so a count on exam:{id} names this file's own ids in p_payload.
create function t.messages(p_topic text, p_event text, p_payload jsonb default '{}') returns bigint
language sql stable as $$
  select count(*) from realtime.messages m
  where m.topic = p_topic and m.event = p_event and m.private and m.payload @> p_payload
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

select t.schedule(t.id('math2'), interval '15 minutes', 'scheduled');
select t.put('office', t.new_staff('office@start.test', 'Office Person', 'exam_office'));
select t.put('lead', t.new_staff('lead@start.test', 'Lead Proctor', 'proctor'));
select t.put('helper', t.new_staff('helper@start.test', 'Helper Proctor', 'proctor'));
select t.put('stranger', t.new_staff('stranger@start.test', 'Stranger Proctor', 'proctor'));
select t.assign(t.id('math2'), t.id('lead'), true, 1, 64);
select t.assign(t.id('math2'), t.id('helper'), false, 65, 128);
select t.assign(t.id('phys1'), t.id('stranger'), true);

select t.put('s_ready', t.new_session(t.id('math2'), '20231187', 'ready'));
select t.put('s_rules', t.new_session(t.id('math2'), '20230912', 'rules'));
select t.put('s_checking', t.new_session(t.id('math2'), '20231044', 'checking'));

-- ---------------------------------------------------------------------------
-- start_exam rights
-- ---------------------------------------------------------------------------
select t.login(t.id('helper'));
select throws_ok(format('select public.start_exam(%L)', t.id('math2')), '42501', 'forbidden', 'a proctor who is not lead cannot start');
reset role;
select t.login(t.id('stranger'));
select throws_ok(format('select public.start_exam(%L)', t.id('math2')), '42501', 'forbidden', 'a proctor of another exam cannot start');
reset role;
select t.login(t.uid_of(t.id('s_ready')));
select throws_ok(format('select public.start_exam(%L)', t.id('math2')), '42501', 'forbidden', 'a student cannot start');
reset role;
select t.login(t.id('lead'));
select throws_ok($$ select public.start_exam('e0000000-0000-4000-8000-0000000000ee') $$, 'P0002', 'not_found', 'an unknown exam is not_found');
select throws_ok($$ select public.start_exam('e0000000-0000-4000-8000-000000000004') $$, '42501', 'forbidden',
  'the lead cannot start an exam it is not assigned to');
create table t.started as select public.start_exam(t.id('math2')) as r;
reset role;

select ok((select (r ->> 'starts_at')::timestamptz = now() from t.started), 'start_exam returns the new starts_at');
select is((select status::text from public.exams where id = t.id('math2')), 'live', 'the exam is live');
select is((select starts_at from public.exams where id = t.id('math2')), now(), 'starts_at is now');
select is((select count(*) from public.session_commands where exam_id = t.id('math2') and type = 'start'
  and session_id in (t.id('s_ready'), t.id('s_rules'), t.id('s_checking'))), 2::bigint,
  'a start command for every session in rules or ready');
select is((select count(*) from public.session_commands where session_id = t.id('s_checking')), 0::bigint,
  'no start command for a session still checking');
select is((select payload from public.session_commands where session_id = t.id('s_ready')), '{}'::jsonb, 'the start payload is {}');
select is((select count(*) from public.audit_log where action = 'start_exam' and actor_id = t.id('lead')
  and object_id = t.id('math2')::text), 1::bigint, 'start_exam writes an audit row');
select is(t.messages('session:' || t.id('s_ready'), 'command'), 1::bigint, 'the start command is broadcast to the session');

select t.login(t.id('lead'));
select throws_ok(format('select public.start_exam(%L)', t.id('math2')), 'P0001', 'already_started', 'a second start is already_started');
reset role;

-- The exam office starts an exam, but not after its scheduled start.
select t.schedule(t.id('math2'), interval '10 minutes', 'scheduled');
select t.login(t.id('office'));
select lives_ok(format('select public.start_exam(%L)', t.id('math2')), 'the exam office starts an exam');
reset role;
select t.schedule(t.id('math2'), interval '-1 minute', 'scheduled');
select t.login(t.id('office'));
select throws_ok(format('select public.start_exam(%L)', t.id('math2')), 'P0001', 'already_started',
  'nobody starts an exam after its scheduled start');
select throws_ok($$ select public.start_exam('e0000000-0000-4000-8000-000000000004') $$, 'P0002', 'not_found',
  'a draft exam cannot be started');
reset role;

-- ---------------------------------------------------------------------------
-- submit_session
-- ---------------------------------------------------------------------------
select t.schedule(t.id('math2'), interval '-30 minutes', 'live');
update public.sessions set state = 'writing', started_at = now() - interval '30 minutes' where id = t.id('s_ready');

select t.login(t.uid_of(t.id('s_rules')));
select throws_ok(format('select public.submit_session(%L)', t.id('s_ready')), '42501', 'forbidden', 'only the owner submits');
select throws_ok($$ select public.submit_session('d0000000-0000-4000-8000-0000000000ee') $$, 'P0002', 'not_found',
  'an unknown session is not_found');
reset role;

select t.login(t.uid_of(t.id('s_ready')));
create table t.submit1 as select public.submit_session(t.id('s_ready')) as r;
create table t.submit2 as select public.submit_session(t.id('s_ready')) as r;
reset role;
select is((select r ->> 'state' from t.submit1), 'submitted', 'before the end the session is submitted');
select matches((select r ->> 'receipt_id' from t.submit1), '^UKI-204-[0-9]{4}-MT$', 'the receipt id follows the contracts format');
select is((select (r ->> 'time_used_s')::int from t.submit1), 1800, 'time_used_s counts from the start');
select is((select r from t.submit2), (select r from t.submit1), 'submit_session is idempotent');
select ok((select submitted_at = now() from public.sessions where id = t.id('s_ready')), 'submitted_at is set');
select is((select count(*) from public.events where session_id = t.id('s_ready') and type = 'exam.submitted' and source = 'server'),
  1::bigint, 'one exam.submitted event from the server');

-- Past the end: time_up.
select t.schedule(t.id('math2'), interval '-100 minutes', 'live');
update public.sessions set state = 'writing', started_at = now() - interval '100 minutes' where id = t.id('s_rules');
select t.login(t.uid_of(t.id('s_rules')));
create table t.late as select public.submit_session(t.id('s_rules')) as r;
reset role;
select is((select r ->> 'state' from t.late), 'time_up', 'past the end the session is time_up');
select is((select (r ->> 'time_used_s')::int from t.late), 5400, 'time_used_s stops at the end');
select is((select count(*) from public.events where session_id = t.id('s_rules') and type = 'exam.time_up'), 1::bigint,
  'one exam.time_up event');

-- Ended by a proctor: stays ended, still gets a receipt.
update public.sessions set state = 'writing', started_at = now() - interval '100 minutes' where id = t.id('s_checking');
select t.schedule(t.id('math2'), interval '-30 minutes', 'live');
select t.event(t.id('s_checking'), 'proctor.ended', p_source => 'proctor', p_review => 'flag',
  p_data => jsonb_build_object('staff_id', t.id('lead'), 'reason', 'Phone in hand'));
select t.login(t.uid_of(t.id('s_checking')));
create table t.ended as select public.submit_session(t.id('s_checking')) as r;
reset role;
select is((select r ->> 'state' from t.ended), 'ended', 'an ended session stays ended');
select matches((select r ->> 'receipt_id' from t.ended), '^UKI-204-[0-9]{4}-DK$', 'an ended session gets a receipt');
select is((select end_reason from public.sessions where id = t.id('s_checking')), 'Phone in hand', 'the end reason is kept');

-- Receipt helper matches packages/contracts/src/receipt.ts.
select is(public.receipt_initial('madina'), 'M', 'initials are upper-cased');
select is(public.receipt_initial('Әлия'), 'X', 'a letter outside A-Z becomes X');
select is(public.receipt_initial(null), 'X', 'no word gives X');

select * from finish();
rollback;
