-- The command follow-ups (migration *_command_followups.sql): by_name stored on session_commands and
-- readable by the student, exam_question_count and exam_overview.question_count for exam staff only,
-- one group_id per group command, issue_command's request id, and ingest_batch's pending_commands.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Test helpers, rolled back with the transaction (as in 06_commands.test.sql).
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

create function t.assign(p_exam uuid, p_staff uuid, p_lead boolean default false) returns void language sql as $$
  insert into public.proctor_assignments (exam_id, staff_id, languages, is_lead) values (p_exam, p_staff, '{ru}', p_lead)
$$;

create function t.new_session(p_exam uuid, p_number text, p_state public.session_state default 'writing')
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into public.sessions (exam_id, student_id, auth_uid, state, locale, started_at)
  select p_exam, s.id, t.new_user(null, true), p_state, 'kk', case when p_state in ('writing', 'paused') then now() end
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

create function t.schedule(p_exam uuid, p_starts_in interval, p_status public.exam_status) returns void language sql as $$
  update public.exams
  set starts_at = now() + p_starts_in, lobby_opens_at = now() + p_starts_in - interval '20 minutes',
      status = p_status, duration_min = 90
  where id = p_exam
$$;

create function t.state(p_session uuid) returns text language sql stable as $$
  select state::text from public.sessions where id = p_session
$$;

-- Seeded ids (supabase/seed.sql).
select t.put('ws', 'a0000000-0000-4000-8000-000000000001');
select t.put('math2', 'e0000000-0000-4000-8000-000000000001');
select t.put('phys1', 'e0000000-0000-4000-8000-000000000002');

-- Start from the seed alone: assignments from `pnpm seed:staff` and sessions from the demo are set aside
-- (the transaction rolls back).
delete from public.proctor_assignments;
delete from public.frames where exam_id = t.id('math2');
delete from public.events where exam_id = t.id('math2');
delete from public.session_commands where exam_id = t.id('math2');
delete from public.answers where session_id in (select id from public.sessions where exam_id = t.id('math2'));
delete from public.sessions where exam_id = t.id('math2');

select t.schedule(t.id('math2'), interval '-10 minutes', 'live');
select t.put('office', t.new_staff('office@followups.test', 'Dana Office', 'exam_office'));
select t.put('proctor', t.new_staff('proctor@followups.test', 'Aigerim Proctor', 'proctor'));
select t.put('other_proctor', t.new_staff('other@followups.test', 'Other Proctor', 'proctor'));
select t.assign(t.id('math2'), t.id('proctor'), true);
select t.assign(t.id('phys1'), t.id('other_proctor'), true);

select t.put('w1', t.new_session(t.id('math2'), '20231187', 'writing'));
select t.put('w2', t.new_session(t.id('math2'), '20230912', 'writing'));
select t.put('ready', t.new_session(t.id('math2'), '20231044', 'ready'));
select t.put('joined', t.new_session(t.id('math2'), '20230877', 'joined'));

-- ---------------------------------------------------------------------------
-- 1. by_name on session_commands
-- ---------------------------------------------------------------------------
select has_column('public', 'session_commands', 'by_name', 'session_commands has by_name');
select col_not_null('public', 'session_commands', 'by_name', 'by_name is never null');

select t.login(t.id('proctor'));
create table t.pause as select public.issue_command(t.id('w1'), null, 'pause', '{"text":"Please wait"}', 'student') as ids;
reset role;
select is((select by_name from public.session_commands where id = (select ids[1] from t.pause)), 'Aigerim Proctor',
  'issue_command stores the issuer''s name');
select is((select payload ->> 'by_name' from realtime.messages
  where topic = 'session:' || t.id('w1') and event = 'command' and payload ->> 'id' = (select ids[1] from t.pause)::text),
  'Aigerim Proctor', 'the broadcast carries the stored name');

select t.login(t.id('office'));
create table t.office_msg as select public.issue_command(t.id('w1'), null, 'message',
  '{"text":"From the office","scope":"student"}', 'student') as ids;
reset role;
select is((select by_name from public.session_commands where id = (select ids[1] from t.office_msg)), 'Dana Office',
  'each command keeps the name of whoever issued it');

-- The session owner reads by_name on a catch-up read, though it cannot read staff rows.
select t.login(t.uid_of(t.id('w1')));
select is((select array_agg(by_name order by by_name) from public.session_commands where session_id = t.id('w1')),
  array['Aigerim Proctor', 'Dana Office'], 'the student reads by_name on its own commands');
select is((select count(*) from public.staff), 0::bigint, 'the student still reads no staff row');
select throws_ok(format($$ update public.session_commands set by_name = 'Someone' where session_id = %L $$, t.id('w1')),
  '42501', null, 'the student cannot change by_name');
select lives_ok(format($$ update public.session_commands set acked_at = now() where id = %L $$, (select ids[1] from t.office_msg)),
  'the student still acks its own command');
reset role;

-- Another student and a proctor of another exam see none of these rows.
select t.login(t.uid_of(t.id('w2')));
select is((select count(*) from public.session_commands where session_id = t.id('w1')), 0::bigint,
  'another student reads none of them');
reset role;
select t.login(t.id('other_proctor'));
select is((select count(*) from public.session_commands where session_id = t.id('w1')), 0::bigint,
  'a proctor of another exam reads none of them');
reset role;
select t.login(t.id('proctor'));
select is((select count(*) from public.session_commands where session_id = t.id('w1') and by_name <> ''), 2::bigint,
  'the exam''s proctor reads them with by_name');
reset role;

-- Rows inserted without a name (start_exam's start commands) get the issuer's name from the trigger.
insert into public.session_commands (session_id, exam_id, type, payload, issued_by)
values (t.id('ready'), t.id('math2'), 'start', '{}', t.id('proctor'));
select is((select by_name from public.session_commands where session_id = t.id('ready') and type = 'start'), 'Aigerim Proctor',
  'an insert without by_name gets the issuer''s name');

-- ---------------------------------------------------------------------------
-- 2. exam_question_count and exam_overview.question_count
-- ---------------------------------------------------------------------------
select t.login(t.id('office'));
select is(public.exam_question_count(t.id('math2')), 20, 'the exam office gets the question count');
select is((select question_count from public.exam_overview where id = t.id('math2')), 20,
  'exam_overview carries question_count for the exam office');
reset role;
select t.login(t.id('proctor'));
select is((select count(*) from public.exam_questions where exam_id = t.id('math2')), 0::bigint,
  'the proctor still cannot read exam_questions');
select is(public.exam_question_count(t.id('math2')), 20, 'the exam''s proctor gets the question count');
select is((select question_count from public.exam_overview where id = t.id('math2')), 20,
  'exam_overview carries question_count for the exam''s proctor');
reset role;
select t.login(t.id('other_proctor'));
select is(public.exam_question_count(t.id('math2')), null::int, 'a proctor of another exam gets null');
select is((select count(*) from public.exam_overview where id = t.id('math2')), 0::bigint,
  'and does not see the exam in exam_overview');
reset role;
select t.login(t.uid_of(t.id('w1')));
select is(public.exam_question_count(t.id('math2')), null::int, 'a student gets null');
reset role;
set local role anon;
select throws_ok($$ select public.exam_question_count('e0000000-0000-4000-8000-000000000001') $$, '42501', null,
  'the anon role cannot call exam_question_count');
reset role;

-- ---------------------------------------------------------------------------
-- 3. One group_id per group command
-- ---------------------------------------------------------------------------
select t.login(t.id('proctor'));
create table t.group_msg as select public.issue_command(null, t.id('math2'), 'message',
  '{"preset":"message.preset.time_15","scope":"group"}', 'group') as ids;
create table t.group_time as select public.issue_command(null, t.id('math2'), 'add_time',
  '{"minutes":5,"scope":"group"}', 'group') as ids;
reset role;

select is((select cardinality(ids) from t.group_msg), 3, 'the group message reaches w1, w2 and ready');
select is((select count(distinct group_id) from public.session_commands where id in (select unnest(ids) from t.group_msg)),
  1::bigint, 'every command of one group call shares one group_id');
select ok((select bool_and(group_id is not null) from public.session_commands where id in (select unnest(ids) from t.group_msg)),
  'a group command has a group_id');
create table t.msg_group as
  select distinct group_id as g from public.session_commands where id in (select unnest(ids) from t.group_msg);
select is((select count(*) from public.events where exam_id = t.id('math2') and type = 'proctor.message'
  and data ->> 'group_id' = (select g from t.msg_group)::text), 3::bigint, 'each proctor.message of the call carries data.group_id');
select is((select data - 'staff_id' - 'group_id' from public.events where exam_id = t.id('math2') and type = 'proctor.message'
  and data ->> 'group_id' = (select g from t.msg_group)::text limit 1),
  '{"preset":"message.preset.time_15","scope":"group"}'::jsonb, 'the event data keeps preset and scope');
select is((select meta ->> 'group_id' from public.audit_log where action = 'command.message' and object_id = t.id('math2')::text
  and meta ->> 'group_id' = (select g from t.msg_group)::text), (select g from t.msg_group)::text, 'the audit row names the group_id');
select isnt((select distinct group_id from public.session_commands where id in (select unnest(ids) from t.group_time)),
  (select g from t.msg_group), 'another group call gets another group_id');
select is((select count(distinct data ->> 'group_id') from public.events where exam_id = t.id('math2')
  and type = 'proctor.time_added'), 1::bigint, 'proctor.time_added events of one call share data.group_id');
select ok((select group_id is null from public.session_commands where id = (select ids[1] from t.pause)),
  'a student command has no group_id');
select ok((select not data ? 'group_id' from public.events where session_id = t.id('w1') and type = 'proctor.paused'),
  'a student command''s event has no data.group_id');

-- ---------------------------------------------------------------------------
-- 4. issue_command request ids
-- ---------------------------------------------------------------------------
select t.put('r_msg', gen_random_uuid());
select t.put('r_group', gen_random_uuid());
select t.put('r_pause', gen_random_uuid());

select t.login(t.id('proctor'));
create table t.first as select public.issue_command(t.id('w2'), null, 'message', '{"text":"Once only","scope":"student"}',
  'student', t.id('r_msg')) as ids;
create table t.again as select public.issue_command(t.id('w2'), null, 'message', '{"text":"Once only","scope":"student"}',
  'student', t.id('r_msg')) as ids;
reset role;
select is((select ids from t.again), (select ids from t.first), 'a retried call returns the first call''s ids');
select is((select count(*) from public.session_commands where request_id = t.id('r_msg')), 1::bigint, 'one command is stored');
select is((select count(*) from public.events where session_id = t.id('w2') and type = 'proctor.message'
  and data ->> 'text' = 'Once only'), 1::bigint, 'one proctor event is stored');
select is((select count(*) from public.audit_log where meta ->> 'request_id' = t.id('r_msg')::text), 1::bigint,
  'one audit row is written');
select is((select count(*) from realtime.messages where topic = 'session:' || t.id('w2') and event = 'command'
  and payload ->> 'id' = (select ids[1] from t.first)::text), 1::bigint, 'the command is broadcast once');

select t.login(t.id('proctor'));
create table t.g1 as select public.issue_command(null, t.id('math2'), 'add_time', '{"minutes":7,"scope":"group"}', 'group',
  t.id('r_group')) as ids;
create table t.extra as select id, extra_min from public.sessions where exam_id = t.id('math2');
create table t.g2 as select public.issue_command(null, t.id('math2'), 'add_time', '{"minutes":7,"scope":"group"}', 'group',
  t.id('r_group')) as ids;
reset role;
select is((select ids from t.g2), (select ids from t.g1), 'a retried group call returns the same ids in the same order');
select is((select count(*) from public.session_commands where request_id = t.id('r_group')), 3::bigint,
  'one command per session is stored');
select is((select count(*) from public.sessions s join t.extra x on x.id = s.id where s.extra_min <> x.extra_min), 0::bigint,
  'the retry adds no time');

select t.login(t.id('proctor'));
create table t.p1 as select public.issue_command(t.id('w2'), null, 'pause', '{}', 'student', t.id('r_pause')) as ids;
create table t.p2 as select public.issue_command(t.id('w2'), null, 'pause', '{}', 'student', t.id('r_pause')) as ids;
select throws_ok(format($$ select public.issue_command(%L, null, 'pause', '{}', 'student', %L) $$, t.id('w2'), gen_random_uuid()),
  'P0001', 'conflict', 'a new pause for a paused session is still a conflict');
select throws_ok(format($$ select public.issue_command(%L, null, 'resume', '{}', 'student', %L) $$, t.id('w2'), t.id('r_pause')),
  'P0001', 'conflict', 'a request id used for another type is a conflict');
reset role;
select is((select ids from t.p2), (select ids from t.p1), 'a retried pause of a now paused session returns the first ids');
select is(t.state(t.id('w2')), 'paused', 'the session is paused once');

select t.login(t.id('office'));
select throws_ok(format($$ select public.issue_command(%L, null, 'message', '{"text":"Once only","scope":"student"}', 'student', %L) $$,
  t.id('w2'), t.id('r_msg')), 'P0001', 'conflict', 'another staff member cannot reuse a request id');
reset role;

-- ---------------------------------------------------------------------------
-- 5. ingest_batch returns the session's unacked commands
-- ---------------------------------------------------------------------------
create table t.r1 as select public.ingest_batch(t.id('w1'), '[]', null) as r;
select is((select jsonb_array_length(r -> 'pending_commands') from t.r1),
  (select count(*)::int from public.session_commands where session_id = t.id('w1') and acked_at is null),
  'pending_commands lists every unacked command of the session');
select ok((select bool_and(c ->> 'session_id' = t.id('w1')::text) from t.r1, jsonb_array_elements(r -> 'pending_commands') c),
  'only this session''s commands');
select ok((select not bool_or(c ->> 'id' = (select ids[1] from t.office_msg)::text) from t.r1, jsonb_array_elements(r -> 'pending_commands') c),
  'an acked command is left out');
select is((select array_agg(k order by k) from t.r1, jsonb_object_keys(r -> 'pending_commands' -> 0) k),
  array['by_name', 'exam_id', 'id', 'issued_at', 'payload', 'session_id', 'type'], 'each entry has the broadcast''s shape');
select is((select c ->> 'by_name' from t.r1, jsonb_array_elements(r -> 'pending_commands') c
  where c ->> 'id' = (select ids[1] from t.pause)::text), 'Aigerim Proctor', 'each entry carries by_name');

-- Oldest first, at most 20.
insert into public.session_commands (session_id, exam_id, type, payload, issued_by, issued_at)
select t.id('ready'), t.id('math2'), 'message', jsonb_build_object('text', 'n' || i, 'scope', 'student'), t.id('proctor'),
  now() - make_interval(secs => 100 - i)
from generate_series(1, 25) i;
update public.session_commands set acked_at = now() where session_id = t.id('ready') and type = 'start';
create table t.r2 as select public.ingest_batch(t.id('ready'), '[]', null) as r;
select is((select jsonb_array_length(r -> 'pending_commands') from t.r2), 20, 'at most 20 pending commands');
select is((select r -> 'pending_commands' -> 0 -> 'payload' ->> 'text' from t.r2), 'n1', 'the oldest comes first');
select is((select r -> 'pending_commands' -> 19 -> 'payload' ->> 'text' from t.r2), 'n20', 'the 20 oldest are sent');
update public.session_commands set acked_at = now() where session_id = t.id('ready');
create table t.r3 as select public.ingest_batch(t.id('ready'), '[]', null) as r;
select is((select r -> 'pending_commands' from t.r3), '[]'::jsonb, 'nothing is pending once every command is acked');

-- ingest_batch stays service-role only.
select t.login(t.uid_of(t.id('w1')));
select throws_ok(format($$ select public.ingest_batch(%L, '[]', null) $$, t.id('w1')), '42501', null,
  'a student cannot call ingest_batch directly');
reset role;

select * from finish();
rollback;
