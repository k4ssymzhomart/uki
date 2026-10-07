-- The broadcast triggers write realtime.messages rows with the right topic, event and payload; RLS on realtime.messages.
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
select t.put('office', t.new_staff('office@rt.test', 'Office Person', 'exam_office'));
select t.put('proctor', t.new_staff('proctor@rt.test', 'Aigerim Proctor', 'proctor'));
select t.put('other_proctor', t.new_staff('other@rt.test', 'Other Proctor', 'proctor'));
select t.assign(t.id('math2'), t.id('proctor'), true);
select t.assign(t.id('phys1'), t.id('other_proctor'), true);
select t.put('s', t.new_session(t.id('math2'), '20231187', 'writing'));
select t.put('s_other', t.new_session(t.id('math2'), '20230912', 'writing'));

-- ---------------------------------------------------------------------------
-- events_broadcast
-- ---------------------------------------------------------------------------
select t.put('ev', t.event(t.id('s'), 'phone.detected', p_data => '{"score":0.94,"held_ms":1200}', p_review => 'flag', p_frames => 1));
select is(t.messages('exam:' || t.id('math2'), 'event'), 1::bigint, 'an event is broadcast to exam:{exam_id} as event');
select ok((select private from realtime.messages where topic = 'exam:' || t.id('math2') and event = 'event'), 'the message is private');
select is((select payload - 'at' - 'received_at' from realtime.messages where topic = 'exam:' || t.id('math2') and event = 'event'),
  jsonb_build_object('id', t.id('ev'), 'session_id', t.id('s'), 'exam_id', t.id('math2'), 'type', 'phone.detected',
    'source', 'app', 'review', 'flag', 'data', '{"score":0.94,"held_ms":1200}'::jsonb, 'frame_count', 1),
  'the payload is the compact event');
select ok((select payload ? 'at' and payload ? 'received_at' from realtime.messages
  where topic = 'exam:' || t.id('math2') and event = 'event'), 'the payload carries at and received_at');
select is((select extension from realtime.messages where topic = 'exam:' || t.id('math2') and event = 'event'), 'broadcast',
  'the message is a broadcast');

-- ---------------------------------------------------------------------------
-- sessions_broadcast
-- ---------------------------------------------------------------------------
create function t.tiles(p_session uuid) returns bigint language sql stable as $$
  select count(*) from realtime.messages m
  where m.topic = 'exam:' || (select exam_id from public.sessions where id = p_session)
    and m.event = 'session' and m.payload ->> 'id' = p_session::text
$$;
select is(t.tiles(t.id('s')), 1::bigint, 'a new session is broadcast once');
select t.event(t.id('s'), 'session.paused', p_data => '{"reason":"face_missing"}', p_review => 'log');
select is(t.tiles(t.id('s')), 2::bigint, 'a state change is broadcast as session');
select is((select payload - 'last_seen_at' from realtime.messages where topic = 'exam:' || t.id('math2') and event = 'session'
  and payload ->> 'id' = t.id('s')::text and payload ->> 'state' = 'paused'),
  jsonb_build_object('id', t.id('s'), 'exam_id', t.id('math2'), 'student_id',
    (select student_id from public.sessions where id = t.id('s')), 'state', 'paused', 'status', '{}'::jsonb,
    'extra_min', 0, 'paused_s', 0), 'the session payload carries the tile fields');
update public.sessions set identity_score = 0.9 where id = t.id('s');
select is(t.tiles(t.id('s')), 2::bigint, 'an update of other columns sends nothing');
update public.sessions set extra_min = extra_min where id = t.id('s');
select is(t.tiles(t.id('s')), 2::bigint, 'an update that changes no value sends nothing');
update public.sessions set last_seen_at = now(), status = '{"question":3}' where id = t.id('s');
select is(t.tiles(t.id('s')), 3::bigint, 'last_seen_at and status changes are broadcast');
update public.sessions set paused_s = 5 where id = t.id('s');
select is(t.tiles(t.id('s')), 4::bigint, 'a paused_s change is broadcast');

-- ---------------------------------------------------------------------------
-- commands_broadcast
-- ---------------------------------------------------------------------------
insert into public.session_commands (session_id, exam_id, type, payload, issued_by)
values (t.id('s'), t.id('math2'), 'message', '{"preset":"message.preset.phones_away","scope":"student"}', t.id('proctor'));
select is(t.messages('session:' || t.id('s'), 'command'), 1::bigint, 'a command is broadcast to session:{session_id}');
select is((select payload - 'id' - 'issued_at' from realtime.messages where topic = 'session:' || t.id('s') and event = 'command'),
  jsonb_build_object('session_id', t.id('s'), 'exam_id', t.id('math2'), 'type', 'message',
    'payload', '{"preset":"message.preset.phones_away","scope":"student"}'::jsonb, 'by_name', 'Aigerim Proctor'),
  'the command payload carries by_name');
select is(t.messages('exam:' || t.id('math2'), 'command'), 0::bigint, 'commands never go to the exam channel');

-- ---------------------------------------------------------------------------
-- frames_broadcast
-- ---------------------------------------------------------------------------
insert into public.frames (id, event_id, session_id, exam_id, storage_path, captured_at)
values (gen_random_uuid(), t.id('ev'), t.id('s'), t.id('math2'), t.id('math2') || '/' || t.id('s') || '/' || t.id('ev') || '-0.jpg', now());
select is(t.messages('exam:' || t.id('math2'), 'frame'), 1::bigint, 'a frame is broadcast to exam:{exam_id} as frame');
select ok((select payload ? 'frame_id' and payload ->> 'event_id' = t.id('ev')::text and payload ? 'captured_at'
  from realtime.messages where topic = 'exam:' || t.id('math2') and event = 'frame'), 'the frame payload names the still');

-- Another session's insert is announced on the same channel.
select is(t.tiles(t.id('s_other')), 1::bigint, 'every new session is broadcast');

-- ---------------------------------------------------------------------------
-- RLS on realtime.messages: listen only, on your own topics
-- ---------------------------------------------------------------------------
create function t.can_read(p_uid uuid, p_topic text) returns boolean language plpgsql as $$
declare v boolean;
begin
  perform t.login(p_uid);
  perform set_config('realtime.topic', p_topic, true);
  select exists (select 1 from realtime.messages where topic = p_topic) into v;
  reset role;
  return v;
end $$;
select ok(t.can_read(t.id('proctor'), 'exam:' || t.id('math2')), 'the assigned proctor reads exam:{exam_id}');
select ok(t.can_read(t.id('office'), 'exam:' || t.id('math2')), 'the exam office reads exam:{exam_id}');
select ok(not t.can_read(t.id('other_proctor'), 'exam:' || t.id('math2')), 'another proctor does not read exam:{exam_id}');
select ok(t.can_read(t.uid_of(t.id('s')), 'session:' || t.id('s')), 'the owner reads session:{session_id}');
select ok(not t.can_read(t.uid_of(t.id('s_other')), 'session:' || t.id('s')), 'another student does not read session:{session_id}');
select ok(not t.can_read(t.uid_of(t.id('s')), 'exam:' || t.id('math2')), 'a student never reads the exam channel');
select ok(not t.can_read(t.id('proctor'), 'session:' || t.id('s')), 'a proctor does not read a student''s command channel');
select ok(not public.can_read_topic('exam:not-a-uuid'), 'a malformed topic is refused');
select ok(not public.can_read_topic(null), 'no topic is refused');

select t.login(t.id('proctor'));
select set_config('realtime.topic', 'exam:' || t.id('math2'), true);
select throws_ok(format($$ insert into realtime.messages (topic, extension, event, payload, private) values (%L, 'broadcast', 'event', '{}', true) $$,
  'exam:' || t.id('math2')), '42501', null, 'clients cannot send: no insert policy');
reset role;

select * from finish();
rollback;
