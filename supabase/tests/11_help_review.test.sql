-- Help requests and review (docs/phase-1-plan.md, Testing: 11_help_review): help_from_event and its
-- broadcast, close_help_request with the message command, decide_session turning the exam reviewed, the
-- queue rule, Mark reviewed and add_session_note.
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
select t.put('office', t.new_staff('office@help.test', 'Dana Akhmetova', 'exam_office'));
select t.put('gulnara', t.new_staff('gulnara@help.test', 'Gulnara Proctor', 'proctor'));
select t.put('aigerim', t.new_staff('aigerim@help.test', 'Aigerim Sadykova', 'proctor'));
select t.put('other_proctor', t.new_staff('other@help.test', 'Other Proctor', 'proctor'));
select t.assign(t.id('phys1'), t.id('gulnara'), true, 1, 84);
select t.assign(t.id('history'), t.id('aigerim'), true, 1, 140);
select t.assign(t.id('math2'), t.id('other_proctor'), true, 1, 128);

select t.put('aliya_session', t.new_session(t.id('phys1'), '20231455', 'writing'));
select t.put('aliya', t.uid_of(t.id('aliya_session')));

-- ---------------------------------------------------------------------------
-- help_from_event: a student.help_requested through ingest makes a request and a `help` broadcast
-- ---------------------------------------------------------------------------
select t.put('help_event', gen_random_uuid());
select lives_ok($$
  select public.ingest_batch(t.id('aliya_session'), jsonb_build_array(t.ev(t.id('aliya_session'),
    'student.help_requested', 'log', 1, 0, t.id('help_event'),
    '{"topic":"question","text":"  Is the angle in radians or degrees?  "}'::jsonb)), null, t.id('aliya'))
$$, 'Ask proctor goes through ingest like any event');
select t.put('help', (select id from public.help_requests where event_id = t.id('help_event')));
select isnt(t.id('help'), null, 'the events trigger made a help request');
select is((select topic || '|' || text from public.help_requests where id = t.id('help')),
  'question|Is the angle in radians or degrees?', 'topic and trimmed text are kept');
select is((select created_at from public.help_requests where id = t.id('help')),
  (select received_at from public.events where id = t.id('help_event')), 'created_at is the server''s receipt time');
select is(t.messages('exam:' || t.id('phys1'), 'help', jsonb_build_object('id', t.id('help'), 'student_name', 'Aliya Seitkali',
  'topic', 'question', 'done_at', null)), 1::bigint, 'the request is broadcast as `help` to exam:{exam_id}');
select lives_ok($$
  select public.ingest_batch(t.id('aliya_session'), jsonb_build_array(t.ev(t.id('aliya_session'),
    'student.help_requested', 'log', 1, 0, t.id('help_event'), '{"topic":"question"}'::jsonb)), null, t.id('aliya'))
$$, 'the outbox sends the same event again');
select is((select count(*) from public.help_requests where session_id = t.id('aliya_session')), 1::bigint,
  'a resent event makes no second request');
select t.put('odd_event', t.event(t.id('aliya_session'), 'student.help_requested', p_data => '{"topic":"lunch","text":5}',
  p_review => 'log'));
select is((select topic || '|' || coalesce(text, '-') from public.help_requests where event_id = t.id('odd_event')),
  'technical|-', 'an unknown topic is stored as technical and never fails the insert');

-- ---------------------------------------------------------------------------
-- close_help_request: Reply and Mark done (2.4d)
-- ---------------------------------------------------------------------------
select t.login(t.id('other_proctor'));
select is(t.err(format('select public.close_help_request(%L)', t.id('help'))), 'forbidden',
  'another exam''s proctor cannot close it');
reset role;
select t.login(t.id('office'));
select is(t.err(format('select public.close_help_request(%L)', t.id('help'))), 'forbidden',
  'the exam office reads but does not close requests');
select is((select count(*) from public.help_requests where id = t.id('help')), 1::bigint, '... and reads it');
reset role;
select t.login(t.id('aliya'));
select is(t.err(format('select public.close_help_request(%L)', t.id('help'))), 'forbidden', 'a student cannot close it');
reset role;

select t.login(t.id('gulnara'));
select is(t.err(format('select public.close_help_request(%L, %L)', t.id('help'), repeat('x', 281))),
  'bad_request:reply is 1 to 280 characters', 'a reply of 281 characters is refused');
select is((public.close_help_request(t.id('help'), ' Radians. ') ->> 'message_sent'), 'true', 'Reply sends a message');
reset role;
select is((select reply || '|' || (done_by = t.id('gulnara'))::text || '|' || (done_at is not null)::text
  from public.help_requests where id = t.id('help')), 'Radians.|true|true', 'the reply closes the request');
select is((select count(*) from public.session_commands where session_id = t.id('aliya_session') and type = 'message'
  and payload = '{"text":"Radians.","scope":"student"}'::jsonb), 1::bigint, 'the reply is a message command (2.1e)');
select is((select count(*) from public.events where session_id = t.id('aliya_session') and type = 'proctor.message'
  and data ->> 'text' = 'Radians.'), 1::bigint, 'with its proctor.message event');
select is(t.messages('exam:' || t.id('phys1'), 'help', jsonb_build_object('id', t.id('help'), 'reply', 'Radians.')),
  1::bigint, 'the closing is broadcast so every proctor''s badge clears');
select is((select count(*) from public.audit_log where action = 'help.close' and object_id = t.id('aliya_session')::text),
  1::bigint, 'closing writes an audit row');
select t.login(t.id('gulnara'));
select is((public.close_help_request(t.id('help'), 'Again') ->> 'message_sent'), 'false',
  'a closed request is returned unchanged');
reset role;
select is((select reply from public.help_requests where id = t.id('help')), 'Radians.', '... and keeps its reply');
select is((select count(*) from public.session_commands where session_id = t.id('aliya_session') and type = 'message'),
  1::bigint, '... and sends nothing more');
select t.login(t.id('gulnara'));
select is((public.close_help_request((select id from public.help_requests where event_id = t.id('odd_event')))
  ->> 'message_sent'), 'false', 'Mark done without a reply sends no message');
reset role;
-- A reply after the student submitted closes the request without a command.
select t.event(t.id('aliya_session'), 'student.help_requested', p_data => '{"topic":"technical"}', p_review => 'log');
update public.sessions set state = 'submitted', submitted_at = now() where id = t.id('aliya_session');
select t.login(t.id('gulnara'));
select is((public.close_help_request((select id from public.help_requests where session_id = t.id('aliya_session')
  and done_at is null), 'Too late') ->> 'message_sent'), 'false', 'no message goes to a finished session');
reset role;

-- ---------------------------------------------------------------------------
-- decide_session and the queue: History of Kazakhstan's 7 flags in 5 sessions
-- ---------------------------------------------------------------------------
create table t.hist as
select se.id as session_id, row_number() over (order by se.id) as n
from public.sessions se
where se.exam_id = t.id('history') and exists (
  select 1 from public.events ev where ev.session_id = se.id and ev.review = 'flag');
grant select on t.hist to authenticated;
select is((select count(*) from t.hist), 5::bigint, 'History has 5 flagged sessions');
select is((select sum(flags)::int from public.review_queue where exam_id = t.id('history')), 7, 'and 7 flags in review_queue');
select is((select status::text from public.exams where id = t.id('history')), 'to_review', 'History waits for review');

select t.login(t.id('other_proctor'));
select is(t.err(format('select public.decide_session(%L, %L)', (select session_id from t.hist where n = 1), 'talk')),
  'forbidden', 'another exam''s proctor cannot decide');
reset role;
select t.login(t.uid_of((select session_id from t.hist where n = 1)));
select is(t.err(format('select public.decide_session(%L, %L)', (select session_id from t.hist where n = 1), 'no_issue')),
  'forbidden', 'a student cannot decide');
reset role;

select t.login(t.id('aigerim'));
select is((public.decide_session((select session_id from t.hist where n = 1), 'talk', ' Phone face down after the warning. ')
  ->> 'note'), 'Phone face down after the warning.', 'a proctor decides with a note (3.3)');
select is(t.err(format('select public.decide_session(%L, %L, %L)', (select session_id from t.hist where n = 2),
  'talk', repeat('x', 1001))), 'bad_request:note is at most 1000 characters', 'a note over 1000 characters is refused');
select is((public.decide_session((select session_id from t.hist where n = 2), 'no_issue') ->> 'exam_status'), 'to_review',
  'the exam waits while flags are open');
select is((public.decide_session((select session_id from t.hist where n = 2), 'committee') ->> 'decision'), 'committee',
  'a second decision replaces the first');
reset role;
select is((select count(*) from public.review_decisions where session_id = (select session_id from t.hist where n = 2)),
  1::bigint, 'one decision per session');
select is((select count(*) from public.review_queue where exam_id = t.id('history')), 3::bigint,
  'decided sessions leave the queue');
-- Only this run's rows (written in this transaction, at now()): the review e2e leaves its own on the stack.
select is((select count(*) from public.audit_log where action = 'review.decide' and at >= now()
  and object_id in (select session_id::text from t.hist)), 3::bigint, 'every decision writes an audit row');

select t.login(t.id('office'));
select is((public.decide_session((select session_id from t.hist where n = 3), 'no_issue') ->> 'reviewer_id'),
  t.id('office')::text, 'the exam office decides too');
reset role;
select t.login(t.id('aigerim'));
select is((public.decide_session((select session_id from t.hist where n = 4), 'no_issue') ->> 'exam_status'), 'to_review',
  'still one flagged session left');
select is((public.decide_session((select session_id from t.hist where n = 5), 'no_issue') ->> 'exam_status'), 'reviewed',
  'the last decision turns the exam reviewed');
reset role;
select is((select status::text from public.exams where id = t.id('history')), 'reviewed', 'History is reviewed');
select is((select count(*) from public.review_queue where exam_id = t.id('history')), 0::bigint, 'the queue is empty');
select ok(not public.exam_has_open_flags(t.id('history')), 'no flag is open');

-- A flag that arrives after the decision puts the session back in the queue.
select t.event((select session_id from t.hist where n = 1), 'gaze.down', now() - interval '1 hour',
  now() + interval '1 second', '{"duration_ms":2100}', 'app', 'flag');
select is((select open_flags from public.review_queue where session_id = (select session_id from t.hist where n = 1)), 1,
  'a later flag puts the session back in the queue');
select ok(public.exam_has_open_flags(t.id('history')), 'the exam has an open flag again');

-- Mark reviewed on a live tile (2.4a): a decision with no flag; the live exam stays live.
select t.put('mark_session', t.new_session(t.id('phys1'), '20251001', 'writing'));
select t.login(t.id('gulnara'));
select is((public.decide_session(t.id('mark_session'), 'no_issue') ->> 'exam_status'), 'live',
  'Mark reviewed on a live exam keeps it live');
reset role;

-- ---------------------------------------------------------------------------
-- add_session_note (2.5, 3.3)
-- ---------------------------------------------------------------------------
select t.login(t.id('gulnara'));
select t.put('note', public.add_session_note(t.id('mark_session'), ' Talked to her at the door. '));
select is(t.err(format('select public.add_session_note(%L, %L)', t.id('mark_session'), '  ')),
  'bad_request:text is 1 to 500 characters', 'an empty note is refused');
reset role;
select is((select type || '|' || source::text || '|' || review::text || '|' || (data ->> 'text') || '|' || (data ->> 'staff_id')
  from public.events where id = t.id('note')),
  'proctor.note|proctor|none|Talked to her at the door.|' || t.id('gulnara'), 'a note is a proctor.note event, review none');
select is(t.messages('exam:' || t.id('phys1'), 'event', jsonb_build_object('id', t.id('note'), 'type', 'proctor.note')),
  1::bigint, 'the note reaches the wall');
select t.login(t.id('other_proctor'));
select is(t.err(format('select public.add_session_note(%L, %L)', t.id('mark_session'), 'x')), 'forbidden',
  'another exam''s proctor cannot add a note');
reset role;
select t.login(t.id('aliya'));
select is(t.err(format('select public.add_session_note(%L, %L)', t.id('aliya_session'), 'x')), 'forbidden',
  'a student cannot add a note');
reset role;
select is(t.err(format('select public.ingest_batch(%L, jsonb_build_array(t.ev(%L, %L)))', t.id('mark_session'),
  t.id('mark_session'), 'proctor.note')), 'bad_request:clients send only app and lock events',
  'ingest refuses a proctor.note from a client');

select * from finish();
rollback;
