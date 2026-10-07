-- ingest_batch: idempotency, duplicates, review, forward-only steps, the third full-screen exit, uploads; confirm_frames.
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

select t.schedule(t.id('math2'), interval '-10 minutes', 'live');
select t.put('s', t.new_session(t.id('math2'), '20231187', 'writing'));
select t.put('s2', t.new_session(t.id('math2'), '20230912', 'writing'));
select t.put('e1', gen_random_uuid());
select t.put('e2', gen_random_uuid());
select t.put('e3', gen_random_uuid());
select t.put('phone', gen_random_uuid());

create table t.batch as select jsonb_build_array(
  t.ev(t.id('s'), 'gaze.on_screen', 'none', 1, 0, t.id('e1')),
  t.ev(t.id('s'), 'phone.detected', 'flag', 2, 2, t.id('phone'), '{"score":0.94,"held_ms":1000}'),
  t.ev(t.id('s'), 'copy.blocked', 'log', 3, 0, t.id('e3'), '{"kind":"copy"}')
) as b;

-- ---------------------------------------------------------------------------
-- Idempotency
-- ---------------------------------------------------------------------------
create table t.r1 as select public.ingest_batch(t.id('s'), (select b from t.batch), '{"question":7}') as r;
select is((select jsonb_array_length(r -> 'accepted') from t.r1), 3, 'the first call accepts every event');
select is((select jsonb_array_length(r -> 'duplicates') from t.r1), 0, 'the first call has no duplicates');
create table t.r2 as select public.ingest_batch(t.id('s'), (select b from t.batch), null) as r;
select is((select jsonb_array_length(r -> 'accepted') from t.r2), 0, 'a resent batch accepts nothing');
select is((select jsonb_array_length(r -> 'duplicates') from t.r2), 3, 'a resent batch reports three duplicates');
select is((select count(*) from public.events where session_id = t.id('s')), 3::bigint, 'each event is stored once');
select is((select review::text from public.events where id = t.id('phone')), 'flag', 'review is stored as the caller set it');
select is((select exam_id from public.events where id = t.id('phone')), t.id('math2'), 'exam_id comes from the session, not the client');
select is((select app_version from public.events where id = t.id('phone')), '0.1.0', 'app_version is stored');
select is((select status ->> 'question' from public.sessions where id = t.id('s')), '7', 'status is written');
select is((select status ->> 'question' from public.sessions where id = t.id('s')), '7', 'a call without status keeps the last status');
select ok((select (r -> 'session' ->> 'ends_at')::timestamptz is not null and r -> 'session' ->> 'state' = 'writing' from t.r1),
  'the reply carries the session timing');
select ok((select (r ->> 'server_time')::timestamptz is not null from t.r1), 'the reply carries server_time');
select is(t.messages('exam:' || t.id('math2'), 'event', jsonb_build_object('session_id', t.id('s'))), 3::bigint,
  'each new event is broadcast once');

-- ---------------------------------------------------------------------------
-- Uploads for flag events with stills, new or duplicate
-- ---------------------------------------------------------------------------
select is((select r -> 'uploads' from t.r1),
  jsonb_build_array(jsonb_build_object('event_id', t.id('phone'), 'exam_id', t.id('math2'), 'session_id', t.id('s'),
    'frame_count', 2, 'confirmed', 0, 'missing', '[0, 1]'::jsonb)),
  'a new flag event with stills gets an upload entry');
select is((select jsonb_array_length(r -> 'uploads') from t.r2), 1, 'a duplicate flag event still gets an upload entry');

select is(public.confirm_frames(t.id('phone'), array[t.id('math2') || '/' || t.id('s') || '/' || t.id('phone') || '-0.jpg']),
  public.confirm_frames(t.id('phone'), array[t.id('math2') || '/' || t.id('s') || '/' || t.id('phone') || '-0.jpg']),
  'confirm_frames is idempotent per path');
select is((select count(*) from public.frames where event_id = t.id('phone')), 1::bigint, 'one frames row per path');
select is((select captured_at from public.frames where event_id = t.id('phone')), (select at from public.events where id = t.id('phone')),
  'still 0 is captured at the event');
select is(t.messages('exam:' || t.id('math2'), 'frame', jsonb_build_object('event_id', t.id('phone'))), 1::bigint,
  'a confirmed still is broadcast once');

create table t.r3 as select public.ingest_batch(t.id('s'), (select b from t.batch), null) as r;
select is((select r -> 'uploads' -> 0 -> 'missing' from t.r3), '[1]'::jsonb, 'only the unconfirmed still is asked for again');
select is((select (r -> 'uploads' -> 0 ->> 'confirmed')::int from t.r3), 1, 'confirmed counts the stills already in');
select is(public.confirm_frames(t.id('phone'), array[t.id('math2') || '/' || t.id('s') || '/' || t.id('phone') || '-1.jpg']) is not null,
  true, 'the second still is confirmed');
select is((select captured_at - (select at from public.events where id = t.id('phone')) from public.frames
  where event_id = t.id('phone') and storage_path like '%-1.jpg'), interval '1 second', 'still 1 is captured 1 s later');
create table t.r4 as select public.ingest_batch(t.id('s'), (select b from t.batch), null) as r;
select is((select r -> 'uploads' from t.r4), '[]'::jsonb, 'no upload once every still is confirmed');

select throws_ok(format('select public.confirm_frames(%L, array[%L])', t.id('phone'),
  t.id('math2') || '/' || t.id('s2') || '/' || t.id('phone') || '-0.jpg'), '22023', 'bad_request', 'a path of another session is refused');
select throws_ok(format('select public.confirm_frames(%L, array[%L])', t.id('phone'),
  t.id('math2') || '/' || t.id('s') || '/' || t.id('phone') || '-2.jpg'), '22023', 'bad_request', 'an index past frame_count is refused');
select throws_ok(format('select public.confirm_frames(%L, array[%L])', t.id('phone'), 'frames/../../x.jpg'), '22023', 'bad_request',
  'a path outside the event is refused');
select throws_ok($$ select public.confirm_frames('e1000000-0000-4000-8000-0000000000ee', array['x']) $$, 'P0002', 'not_found',
  'an unknown event is not_found');

-- Another session resending an id that belongs to this session: a duplicate, and no upload for it.
create table t.r5 as select public.ingest_batch(t.id('s2'),
  jsonb_build_array(t.ev(t.id('s2'), 'phone.detected', 'flag', 1, 3, t.id('phone'))), null) as r;
select is((select jsonb_array_length(r -> 'duplicates') from t.r5), 1, 'a foreign id is a duplicate');
select is((select r -> 'uploads' from t.r5), '[]'::jsonb, 'no upload URL for another session''s event');

-- ---------------------------------------------------------------------------
-- The third full-screen exit is a flag, and so is every later one
-- ---------------------------------------------------------------------------
select public.ingest_batch(t.id('s2'), jsonb_build_array(
  t.ev(t.id('s2'), 'lock.fullscreen_exit', 'log', 10, 0, null, '{"count":1}'),
  t.ev(t.id('s2'), 'lock.fullscreen_exit', 'log', 11, 0, null, '{"count":2}')), null);
select public.ingest_batch(t.id('s2'), jsonb_build_array(
  t.ev(t.id('s2'), 'lock.fullscreen_exit', 'log', 12, 0, null, '{"count":3}'),
  t.ev(t.id('s2'), 'lock.fullscreen_exit', 'log', 13, 0, null, '{"count":4}')), null);
select results_eq($$ select review::text from public.events where session_id = t.id('s2') and type = 'lock.fullscreen_exit' order by seq $$,
  array['log', 'log', 'flag', 'flag'], 'exits 1 and 2 are log, the third and later are flag');

-- ---------------------------------------------------------------------------
-- Forward-only steps
-- ---------------------------------------------------------------------------
select t.put('lobby', t.new_session(t.id('math2'), '20231044', 'joined'));
select public.ingest_batch(t.id('lobby'), '[]', '{"step":"rules"}');
select public.ingest_batch(t.id('lobby'), '[]', '{"step":"checking"}');
select is(t.state(t.id('lobby')), 'rules', 'ingest moves a step forward only');
select is((select status ->> 'step' from public.sessions where id = t.id('lobby')), 'checking', 'status still shows what the app sent');
select public.ingest_batch(t.id('lobby'), '[]', '{"step":"writing"}');
select is(t.state(t.id('lobby')), 'rules', 'status.step cannot set writing');

-- ---------------------------------------------------------------------------
-- last_seen_at: every call writes it, except a quiet one (no events, the same status) under 10 s
-- after the stored value, which the app never makes (its empty calls come 10 s after the last reply)
-- ---------------------------------------------------------------------------
select t.put('seen', t.new_session(t.id('math2'), '20231219', 'writing'));
select t.put('seen_ev', gen_random_uuid());
update public.sessions set status = '{"question":2}', last_seen_at = now() - interval '9.9 seconds' where id = t.id('seen');
select public.ingest_batch(t.id('seen'),
  jsonb_build_array(t.ev(t.id('seen'), 'gaze.on_screen', 'none', 1, 0, t.id('seen_ev'))), '{"question":2}');
select is((select last_seen_at from public.sessions where id = t.id('seen')), now(),
  'a call with events writes last_seen_at, also 9.9 s after the stored one');
update public.sessions set last_seen_at = now() - interval '9.9 seconds' where id = t.id('seen');
select public.ingest_batch(t.id('seen'),
  jsonb_build_array(t.ev(t.id('seen'), 'gaze.on_screen', 'none', 1, 0, t.id('seen_ev'))), '{"question":2}');
select is((select last_seen_at from public.sessions where id = t.id('seen')), now(),
  'a resend whose events are all duplicates writes last_seen_at');
update public.sessions set last_seen_at = now() - interval '9.9 seconds' where id = t.id('seen');
select public.ingest_batch(t.id('seen'), '[]', '{"question":3}');
select is((select last_seen_at from public.sessions where id = t.id('seen')), now(),
  'a call with a new status writes last_seen_at');
update public.sessions set last_seen_at = now() - interval '9.9 seconds' where id = t.id('seen');
select public.ingest_batch(t.id('seen'), '[]', '{"question":3}');
select is((select last_seen_at from public.sessions where id = t.id('seen')), now() - interval '9.9 seconds',
  'a quiet call under 10 s after the stored last_seen_at writes nothing');
update public.sessions set last_seen_at = now() - interval '10 seconds' where id = t.id('seen');
select public.ingest_batch(t.id('seen'), '[]', '{"question":3}');
select is((select last_seen_at from public.sessions where id = t.id('seen')), now(),
  'a quiet call 10 s or more after the stored last_seen_at writes it');

-- ---------------------------------------------------------------------------
-- What ingest refuses
-- ---------------------------------------------------------------------------
select throws_ok(format('select public.ingest_batch(%L, %L, null)', t.id('s'),
  jsonb_build_array(t.ev(t.id('s'), 'proctor.paused', 'log'))), '22023', 'bad_request', 'clients cannot send proctor events');
select throws_ok(format('select public.ingest_batch(%L, %L, null)', t.id('s'),
  jsonb_build_array(t.ev(t.id('s'), 'gaze.on_screen') || '{"source":"proctor"}')), '22023', 'bad_request', 'clients cannot send source proctor');
select throws_ok(format('select public.ingest_batch(%L, %L, null)', t.id('s'),
  (select jsonb_agg(t.ev(t.id('s'), 'gaze.on_screen', 'none', i)) from generate_series(1, 51) as i)), '22023', 'bad_request',
  'more than 50 events are refused');
select throws_ok(format('select public.ingest_batch(%L, %L, null)', t.id('s'),
  jsonb_build_array(t.ev(t.id('s'), 'phone.detected', 'flag', 1, 4))), '22023', 'bad_request', 'frame_count above 3 is refused');
select throws_ok(format('select public.ingest_batch(%L, %L, null)', t.id('s'),
  jsonb_build_array(t.ev(t.id('s'), 'gaze.on_screen') - 'review')), '22023', 'bad_request', 'an event without review is refused');
select throws_ok($$ select public.ingest_batch('d0000000-0000-4000-8000-0000000000ee', '[]', null) $$, 'P0002', 'not_found',
  'an unknown session is not_found');
select is((select (r -> 'accepted') from (select public.ingest_batch(t.id('s'), null, null) as r) x), '[]'::jsonb,
  'an empty heartbeat is accepted');

-- Only the service role runs the internals.
select t.login(t.uid_of(t.id('s')));
select throws_ok(format('select public.ingest_batch(%L, %L, null)', t.id('s'), '[]'), '42501', null,
  'a student cannot call ingest_batch directly');
select throws_ok(format('select public.confirm_frames(%L, array[''x''])', t.id('phone')), '42501', null,
  'a student cannot call confirm_frames directly');
select throws_ok('select public.session_tick()', '42501', null, 'a student cannot run session_tick');
reset role;
set local role service_role;
select lives_ok(format('select public.ingest_batch(%L, %L, null)', t.id('s'), '[]'), 'the service role calls ingest_batch');
reset role;

select * from finish();
rollback;
