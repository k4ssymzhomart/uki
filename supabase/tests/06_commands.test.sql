-- issue_command: rights, payload rules, group scope, add_time, the proctor events and the command broadcast.
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
select t.put('office', t.new_staff('office@cmd.test', 'Dana Office', 'exam_office'));
select t.put('proctor', t.new_staff('proctor@cmd.test', 'Aigerim Proctor', 'proctor'));
select t.put('other_proctor', t.new_staff('other@cmd.test', 'Other Proctor', 'proctor'));
select t.assign(t.id('math2'), t.id('proctor'), true, 1, 128);
select t.assign(t.id('phys1'), t.id('other_proctor'), true);

select t.put('w1', t.new_session(t.id('math2'), '20231187', 'writing'));
select t.put('w2', t.new_session(t.id('math2'), '20230912', 'writing'));
select t.put('ready', t.new_session(t.id('math2'), '20231044', 'ready'));
select t.put('rules', t.new_session(t.id('math2'), '20231219', 'rules'));
select t.put('paused', t.new_session(t.id('math2'), '20231302', 'writing'));
select t.event(t.id('paused'), 'session.paused', p_data => '{"reason":"face_missing"}', p_review => 'log');
select t.put('joined', t.new_session(t.id('math2'), '20230877', 'joined'));
select t.put('done', t.new_session(t.id('math2'), '20235001', 'submitted'));

-- ---------------------------------------------------------------------------
-- Rights
-- ---------------------------------------------------------------------------
select t.login(t.id('other_proctor'));
select throws_ok(format($$ select public.issue_command(%L, null, 'pause', '{}', 'student') $$, t.id('w1')),
  '42501', 'forbidden', 'a proctor of another exam is refused');
reset role;
select t.login(t.uid_of(t.id('w1')));
select throws_ok(format($$ select public.issue_command(%L, null, 'pause', '{}', 'student') $$, t.id('w1')),
  '42501', 'forbidden', 'an anonymous user is refused');
reset role;
-- An anonymous user with a staff row is still refused.
select t.put('anon_staff', t.new_user(null, true));
insert into public.staff (id, workspace_id, full_name, role) values (t.id('anon_staff'), t.id('ws'), 'Anon', 'exam_office');
select t.login(t.id('anon_staff'));
select throws_ok(format($$ select public.issue_command(%L, null, 'message', '{"text":"x","scope":"student"}', 'student') $$, t.id('w1')),
  '42501', 'forbidden', 'an anonymous user with a staff row is refused');
reset role;
set local role anon;
select throws_ok($$ select public.issue_command('d0000000-0000-4000-8003-000000000001', null, 'pause', '{}', 'student') $$,
  '42501', null, 'the anon role cannot call issue_command');
reset role;

-- ---------------------------------------------------------------------------
-- Pause and resume one student
-- ---------------------------------------------------------------------------
select t.login(t.id('proctor'));
create table t.pause as select public.issue_command(t.id('w1'), null, 'pause', '{"text":"Please wait"}', 'student') as ids;
reset role;
select is((select cardinality(ids) from t.pause), 1, 'one command for one student');
select is(t.state(t.id('w1')), 'paused', 'pause moves the session to paused through proctor.paused');
select ok((select type = 'pause' and payload = '{"text":"Please wait"}' and issued_by = t.id('proctor')
  from public.session_commands where id = (select ids[1] from t.pause)), 'the command row keeps type, payload and issuer');
select ok((select source = 'proctor' and review = 'log' and data = jsonb_build_object('staff_id', t.id('proctor'))
  from public.events where session_id = t.id('w1') and type = 'proctor.paused'), 'proctor.paused: source proctor, review log, staff_id');
select is((select count(*) from public.audit_log where action = 'command.pause' and actor_id = t.id('proctor')), 1::bigint,
  'one audit row per command call');
select is(t.messages('session:' || t.id('w1'), 'command'), 1::bigint, 'the command is broadcast to session:{id}');
select is((select payload ->> 'by_name' from realtime.messages where topic = 'session:' || t.id('w1') and event = 'command'),
  'Aigerim Proctor', 'the broadcast carries by_name');
select is((select payload ->> 'type' from realtime.messages where topic = 'session:' || t.id('w1') and event = 'command'),
  'pause', 'the broadcast carries the type');

select t.login(t.id('proctor'));
select throws_ok(format($$ select public.issue_command(%L, null, 'pause', '{}', 'student') $$, t.id('w1')),
  'P0001', 'conflict', 'a paused session cannot be paused again');
select lives_ok(format($$ select public.issue_command(%L, null, 'resume', '{}', 'student') $$, t.id('w1')), 'the proctor resumes');
reset role;
select is(t.state(t.id('w1')), 'writing', 'resume moves the session back to writing');
select ok((select review = 'log' from public.events where session_id = t.id('w1') and type = 'proctor.resumed'), 'proctor.resumed is a log');

-- ---------------------------------------------------------------------------
-- Messages
-- ---------------------------------------------------------------------------
select t.login(t.id('proctor'));
select throws_ok(format($$ select public.issue_command(%L, null, 'message', %L, 'student') $$, t.id('w1'),
  jsonb_build_object('text', repeat('x', 281), 'scope', 'student')), '22023', 'bad_request', 'a message over 280 characters is refused');
select throws_ok(format($$ select public.issue_command(%L, null, 'message', '{"preset":"message.preset.nope","scope":"student"}', 'student') $$,
  t.id('w1')), '22023', 'bad_request', 'an unknown preset is refused');
select throws_ok(format($$ select public.issue_command(%L, null, 'message', '{"preset":"message.preset.phones_away","text":"x","scope":"student"}', 'student') $$,
  t.id('w1')), '22023', 'bad_request', 'a message takes a preset or a text, not both');
select throws_ok(format($$ select public.issue_command(%L, null, 'message', '{"text":"x","scope":"group"}', 'student') $$,
  t.id('w1')), '22023', 'bad_request', 'the payload scope must match the target');
select lives_ok(format($$ select public.issue_command(%L, null, 'message', %L, 'student') $$, t.id('w1'),
  jsonb_build_object('text', repeat('x', 280), 'scope', 'student')), 'a 280-character message is accepted');
select lives_ok(format($$ select public.issue_command(%L, null, 'message', '{"preset":"message.preset.phones_away","scope":"student"}', 'student') $$,
  t.id('w1')), 'a preset message is accepted');
reset role;
select is((select data - 'staff_id' from public.events where session_id = t.id('w1') and type = 'proctor.message'
  and data ? 'preset'), '{"preset":"message.preset.phones_away","scope":"student"}'::jsonb, 'proctor.message carries preset and scope');
select ok((select data ->> 'staff_id' = t.id('proctor')::text from public.events where session_id = t.id('w1')
  and type = 'proctor.message' limit 1), 'proctor.message carries staff_id');

-- The exam office may command too.
select t.login(t.id('office'));
select lives_ok(format($$ select public.issue_command(%L, null, 'message', '{"text":"From the office","scope":"student"}', 'student') $$,
  t.id('w2')), 'the exam office sends a message');
reset role;

-- ---------------------------------------------------------------------------
-- add_time
-- ---------------------------------------------------------------------------
select t.login(t.id('proctor'));
select throws_ok(format($$ select public.issue_command(%L, null, 'add_time', '{"minutes":0,"scope":"student"}', 'student') $$,
  t.id('w2')), '22023', 'bad_request', 'add_time below 1 minute is refused');
select throws_ok(format($$ select public.issue_command(%L, null, 'add_time', '{"minutes":61,"scope":"student"}', 'student') $$,
  t.id('w2')), '22023', 'bad_request', 'add_time above 60 minutes is refused');
select throws_ok(format($$ select public.issue_command(%L, null, 'add_time', '{"minutes":2.5,"scope":"student"}', 'student') $$,
  t.id('w2')), '22023', 'bad_request', 'add_time takes whole minutes');
select lives_ok(format($$ select public.issue_command(%L, null, 'add_time', '{"minutes":10,"scope":"student"}', 'student') $$,
  t.id('w2')), 'add_time 10 for one student');
reset role;
select is((select extra_min from public.sessions where id = t.id('w2')), 10, 'add_time raises extra_min');
select is((select data - 'staff_id' from public.events where session_id = t.id('w2') and type = 'proctor.time_added'),
  '{"minutes":10,"scope":"student"}'::jsonb, 'proctor.time_added carries minutes and scope');
select is(t.messages('exam:' || t.id('math2'), 'session') >= 1, true, 'the new extra_min is broadcast as a session tile');

-- ---------------------------------------------------------------------------
-- Group scope
-- ---------------------------------------------------------------------------
select t.login(t.id('proctor'));
create table t.group_msg as select public.issue_command(null, t.id('math2'), 'message',
  '{"preset":"message.preset.time_15","scope":"group"}', 'group') as ids;
create table t.group_time as select public.issue_command(null, t.id('math2'), 'add_time', '{"minutes":5,"scope":"group"}', 'group') as ids;
select throws_ok(format($$ select public.issue_command(null, %L, 'pause', '{}', 'group') $$, t.id('math2')),
  '22023', 'bad_request', 'pause cannot go to a group');
select throws_ok(format($$ select public.issue_command(%L, %L, 'message', '{"text":"x","scope":"group"}', 'group') $$,
  t.id('w1'), t.id('math2')), '22023', 'bad_request', 'a group command takes exam_id only');
reset role;
select is((select cardinality(ids) from t.group_msg), 5, 'a group command reaches every session in rules, ready, writing or paused');
select is((select count(*) from public.session_commands where id in (select unnest(ids) from t.group_msg)
  and session_id in (t.id('joined'), t.id('done'))), 0::bigint, 'joined and final sessions get no group command');
select is((select extra_min from public.sessions where id = t.id('w2')), 15, 'group add_time adds to every session');
select is((select extra_min from public.sessions where id = t.id('joined')), 0, 'group add_time skips sessions not yet in the lobby');
select is((select count(*) from public.events where type = 'proctor.message' and data ->> 'scope' = 'group'), 5::bigint,
  'one proctor.message event per session of the group');
select is((select count(*) from public.audit_log where action = 'command.message' and object_type = 'exam'), 1::bigint,
  'one audit row for the group command');

-- ---------------------------------------------------------------------------
-- End
-- ---------------------------------------------------------------------------
select t.login(t.id('proctor'));
select throws_ok(format($$ select public.issue_command(%L, null, 'end', '{}', 'student') $$, t.id('w2')),
  '22023', 'bad_request', 'end needs a reason');
select throws_ok(format($$ select public.issue_command(%L, null, 'end', %L, 'student') $$, t.id('w2'),
  jsonb_build_object('reason', repeat('x', 201))), '22023', 'bad_request', 'an end reason over 200 characters is refused');
select lives_ok(format($$ select public.issue_command(%L, null, 'end', '{"reason":"Phone in hand"}', 'student') $$, t.id('w2')),
  'the proctor ends a session with a reason');
select throws_ok(format($$ select public.issue_command(%L, null, 'message', '{"text":"x","scope":"student"}', 'student') $$, t.id('w2')),
  'P0001', 'conflict', 'no command for a session in a final state');
select throws_ok(format($$ select public.issue_command(%L, null, 'start', '{}', 'student') $$, t.id('w1')),
  '22023', 'bad_request', 'start comes only from start_exam');
reset role;
select is(t.state(t.id('w2')), 'ended', 'end moves the session to ended');
select ok((select review = 'flag' and data ->> 'reason' = 'Phone in hand' from public.events
  where session_id = t.id('w2') and type = 'proctor.ended'), 'proctor.ended is a flag with the reason');
select is((select end_reason from public.sessions where id = t.id('w2')), 'Phone in hand', 'the session keeps the end reason');

select * from finish();
rollback;
