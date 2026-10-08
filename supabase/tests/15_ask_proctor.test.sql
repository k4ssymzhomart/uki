-- Ask proctor (WP 1.6, docs/phase-1-plan.md, Testing): the E.5a topics that 20261010060000_help_topics.sql
-- adds to help_from_event (break and other), a request from Üki Lock through the app, Mark done without a
-- reply, and two proctors of one exam: either may close a request, and both read the closing.
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

select t.schedule(t.id('phys1'), interval '-5 minutes', 'live', 40);
select t.put('gulnara', t.new_staff('gulnara@ask.test', 'Gulnara Proctor', 'proctor'));
select t.put('aigerim', t.new_staff('aigerim@ask.test', 'Aigerim Sadykova', 'proctor'));
select t.assign(t.id('phys1'), t.id('gulnara'), true, 1, 84);
select t.assign(t.id('phys1'), t.id('aigerim'), false, 85, 140);

select t.put('aliya_session', t.new_session(t.id('phys1'), '20231455', 'writing'));
select t.put('aliya', t.uid_of(t.id('aliya_session')));

-- ---------------------------------------------------------------------------
-- E.5a's four reasons are four topics; an unknown one is still technical
-- ---------------------------------------------------------------------------
select t.put('break_event', gen_random_uuid());
select lives_ok($$
  select public.ingest_batch(t.id('aliya_session'), jsonb_build_array(t.ev(t.id('aliya_session'),
    'student.help_requested', 'log', 1, 0, t.id('break_event'), '{"topic":"break"}'::jsonb)), null, t.id('aliya'))
$$, 'I need a break goes through ingest');
select is((select topic || '|' || coalesce(text, '-') from public.help_requests where event_id = t.id('break_event')),
  'break|-', 'it is stored as break, with no text');
select is(t.messages('exam:' || t.id('phys1'), 'help', jsonb_build_object('topic', 'break', 'done_at', null)), 1::bigint,
  'and broadcast as break');

select t.put('other_event', t.event(t.id('aliya_session'), 'student.help_requested', p_source => 'lock',
  p_data => '{"topic":"other","text":"The calculator tab doesn''t open."}', p_review => 'log'));
select is((select topic || '|' || text from public.help_requests where event_id = t.id('other_event')),
  'other|The calculator tab doesn''t open.', 'Something else from Üki Lock (source lock) is stored as other');

select t.put('question_event', t.event(t.id('aliya_session'), 'student.help_requested',
  p_data => '{"topic":"question","text":"Q 8: is the angle in radians or degrees?"}', p_review => 'log'));
select t.put('technical_event', t.event(t.id('aliya_session'), 'student.help_requested',
  p_data => '{"topic":"technical"}', p_review => 'log'));
select t.put('identity_event', t.event(t.id('aliya_session'), 'student.help_requested',
  p_data => '{"topic":"identity"}', p_review => 'log'));
select is((select string_agg(topic, ',' order by topic) from public.help_requests
  where event_id in (t.id('question_event'), t.id('technical_event'), t.id('identity_event'))),
  'identity,question,technical', 'the plan''s three topics are unchanged');
select t.put('odd_event', t.event(t.id('aliya_session'), 'student.help_requested', p_data => '{"topic":"Break"}',
  p_review => 'log'));
select is((select topic from public.help_requests where event_id = t.id('odd_event')), 'technical',
  'an unknown topic is still stored as technical');

-- ---------------------------------------------------------------------------
-- Two proctors of one exam (2.4d on every proctor's wall)
-- ---------------------------------------------------------------------------
select t.login(t.id('aigerim'));
select is((select count(*) from public.help_requests where session_id = t.id('aliya_session') and done_at is null), 6::bigint,
  'the second proctor of the exam reads every open request');
reset role;

select t.put('break_help', (select id from public.help_requests where event_id = t.id('break_event')));
select t.login(t.id('aigerim'));
select is((public.close_help_request(t.id('break_help')) ->> 'message_sent'), 'false',
  'Mark done by the second proctor sends no message');
reset role;
select is((select (reply is null)::text || '|' || (done_by = t.id('aigerim'))::text || '|' || (done_at is not null)::text
  from public.help_requests where id = t.id('break_help')), 'true|true|true', 'Mark done closes it without a reply');
select is((select count(*) from public.session_commands where session_id = t.id('aliya_session') and type = 'message'),
  0::bigint, 'and no message command is made');
select is((select count(*) from realtime.messages m where m.topic = 'exam:' || t.id('phys1') and m.event = 'help'
  and m.private and m.payload ->> 'id' = t.id('break_help')::text and m.payload ->> 'done_at' is not null), 1::bigint,
  'the closing is broadcast with done_at, so every proctor''s badge clears');

select t.login(t.id('gulnara'));
select is((select count(*) from public.help_requests where session_id = t.id('aliya_session') and done_at is null), 5::bigint,
  'the first proctor reads the request as done');
select is((public.close_help_request(t.id('break_help'), 'Too late') ->> 'message_sent'), 'false',
  'closing it again changes nothing and sends nothing');
reset role;
select is((select coalesce(reply, '-') || '|' || (done_by = t.id('aigerim'))::text from public.help_requests
  where id = t.id('break_help')), '-|true', 'the first closing stands');

select * from finish();
rollback;
