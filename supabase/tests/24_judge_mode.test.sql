-- Judge mode (20261013100000_observer_role.sql, 20261013100100_judge_mode.sql; docs/runbooks/judge-mode.md):
--   the observer reads exactly what an assigned proctor reads, table by table and view by view, and every
--   write it could reach is refused (each write RPC, and a direct statement on every table);
--   session_heartbeat for the session owner only, with the 10-second throttle;
--   demo_live_seen and demo_live_status (who may call them, the viewer count);
--   demo_live_orphans (stills of sessions that no longer exist, DEMO-LIVE only);
--   demo_live_tick: nothing without DEMO-LIVE, nothing with 30 minutes or more left, the rollover, the off
--   switch, and a student joining again afterwards.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Test helpers, rolled back with the transaction (as in 15_ask_proctor.test.sql).
create schema t;
grant usage, create on schema t to anon, authenticated, service_role;
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

create function t.assign(p_exam uuid, p_staff uuid, p_lead boolean default false) returns void language sql as $$
  insert into public.proctor_assignments (exam_id, staff_id, seat_from, seat_to, languages, is_lead)
  values (p_exam, p_staff, null, null, '{ru}', p_lead)
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

create function t.anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end $$;

create function t.event(p_session uuid, p_type text, p_data jsonb default '{}', p_review public.event_review default 'none',
  p_frames int default 0) returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into public.events (id, session_id, exam_id, type, source, review, at, received_at, data, frame_count)
  select v_id, s.id, s.exam_id, p_type, 'app', p_review, now(), now(), p_data, p_frames
  from public.sessions s where s.id = p_session;
  return v_id;
end $$;

create function t.messages(p_topic text, p_event text, p_payload jsonb default '{}') returns bigint
language sql stable as $$
  select count(*) from realtime.messages m
  where m.topic = p_topic and m.event = p_event and m.private and m.payload @> p_payload
$$;

-- The error a statement raises, as '<message>' or '<message>:<detail>', or null when it succeeds.
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

-- Row counts of every table and view in public as the current role (-1 where the role may not read it).
create table t.counts (who text not null, rel text not null, n bigint not null, primary key (who, rel));
grant insert, select on t.counts to authenticated;
create function t.count_rels(p_who text) returns void language plpgsql as $$
declare
  r record;
  v_n bigint;
begin
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm') order by c.relname
  loop
    begin
      execute format('select count(*) from public.%I', r.relname) into v_n;
    exception when others then
      v_n := -1;
    end;
    insert into t.counts (who, rel, n) values (p_who, r.relname, v_n);
  end loop;
end $$;

-- Seeded ids (supabase/seed.sql).
select t.put('ws', 'a0000000-0000-4000-8000-000000000001');
select t.put('math2', 'e0000000-0000-4000-8000-000000000001');
select t.put('history', 'e0000000-0000-4000-8000-000000000003');
select t.put('fac_math', 'a1000000-0000-4000-8000-000000000001');

-- Start from the seed alone: staff assignments made by `pnpm seed:staff` are set aside.
delete from public.proctor_assignments;

-- ---------------------------------------------------------------------------
-- The enum, the cron job, and the tick without DEMO-LIVE
-- ---------------------------------------------------------------------------
select ok('observer' = any (enum_range(null::public.staff_role)::text[]), 'staff_role has the observer value');
select is((select schedule from cron.job where jobname = 'demo_live_tick'), '* * * * *',
  'demo_live_tick runs every minute through pg_cron');
select is(public.demo_live_tick(), '{"exam": null, "rolled": false}'::jsonb, 'without DEMO-LIVE the tick does nothing');

-- ---------------------------------------------------------------------------
-- The world: DEMO-LIVE with group DEMO, five students (four writing), two questions of Mathematics 2, a proctor (the
-- mirror), the observer, a proctor of another exam and the exam office
-- ---------------------------------------------------------------------------
select t.put('demo_group', gen_random_uuid());
insert into public.groups (id, workspace_id, faculty_id, code) values (t.id('demo_group'), t.id('ws'), t.id('fac_math'), 'DEMO');
insert into public.students (workspace_id, student_number, full_name, group_id, locale)
select t.id('ws'), '2024900' || n, 'Demo Student ' || n, t.id('demo_group'), 'kk' from generate_series(1, 5) as n;

select t.put('demo', gen_random_uuid());
insert into public.exams (id, workspace_id, faculty_id, title, course, kind, code, mode, starts_at, duration_min,
  lobby_opens_at, status)
values (t.id('demo'), t.id('ws'), t.id('fac_math'), 'Demo · Live', 'Demo', 'Live demo', 'DEMO-LIVE', 'app',
  now() - interval '10 minutes', 720, now() - interval '30 minutes', 'live');
insert into public.exam_groups (exam_id, group_id) values (t.id('demo'), t.id('demo_group'));
insert into public.exam_students (exam_id, student_id, seat)
select t.id('demo'), s.id, right(s.student_number, 1)::int from public.students s where s.student_number like '2024900_';
insert into public.exam_questions (exam_id, question_id, position)
select t.id('demo'), eq.question_id, eq.position from public.exam_questions eq
where eq.exam_id = t.id('math2') and eq.position <= 2;

select t.put('mirror', t.new_staff('mirror@judge.test', 'Mirror Proctor', 'proctor'));
select t.put('judge', t.new_staff('judge@judge.test', 'Judge', 'observer'));
select t.put('outsider', t.new_staff('outsider@judge.test', 'Outside Proctor', 'proctor'));
select t.put('office', t.new_staff('office@judge.test', 'Office', 'exam_office'));
select t.assign(t.id('demo'), t.id('mirror'));
select t.assign(t.id('demo'), t.id('judge'));
select t.assign(t.id('math2'), t.id('outsider'), true);

select t.put('s1', t.new_session(t.id('demo'), '20249001'));
select t.put('s2', t.new_session(t.id('demo'), '20249002'));
select t.put('s3', t.new_session(t.id('demo'), '20249003'));
select t.put('s4', t.new_session(t.id('demo'), '20249004'));
select t.put('s1_uid', t.uid_of(t.id('s1')));

-- A flagged phone with a still on s1 and s2, two help requests on s3, and an answer on s1.
select t.put('flag1', t.event(t.id('s1'), 'phone.detected', '{"score":0.96,"held_ms":3000}', 'flag', 1));
select t.put('flag2', t.event(t.id('s2'), 'face.second', '{"duration_ms":3000,"faces":2}', 'flag', 1));
insert into public.frames (id, event_id, session_id, exam_id, storage_path, captured_at)
values
  (gen_random_uuid(), t.id('flag1'), t.id('s1'), t.id('demo'), t.id('demo') || '/' || t.id('s1') || '/' || t.id('flag1') || '-0.jpg', now()),
  (gen_random_uuid(), t.id('flag2'), t.id('s2'), t.id('demo'), t.id('demo') || '/' || t.id('s2') || '/' || t.id('flag2') || '-0.jpg', now());
select t.event(t.id('s3'), 'student.help_requested', '{"topic":"question","text":"Q 2?"}', 'log');
select t.event(t.id('s3'), 'student.help_requested', '{"topic":"break"}', 'log');
select t.put('h1', (select id from public.help_requests where session_id = t.id('s3') and topic = 'question'));
select t.put('h2', (select id from public.help_requests where session_id = t.id('s3') and topic = 'break'));
insert into public.answers (session_id, question_id, choice_id, saved_at)
select t.id('s1'), eq.question_id, 'a', now() from public.exam_questions eq where eq.exam_id = t.id('demo') and eq.position = 1;

select ok(not public.is_observer(), 'nobody is an observer without a session');
select t.login(t.id('judge'));
select ok(public.is_observer(), 'is_observer() is true for the observer');
reset role;
select t.login(t.id('mirror'));
select ok(not public.is_observer(), 'and false for a proctor');
reset role;

-- ---------------------------------------------------------------------------
-- The mirror proctor's writes go through (so the observer's refusals below are about the role)
-- ---------------------------------------------------------------------------
select t.login(t.id('mirror'));
select is(t.err($$select public.issue_command(t.id('s1'), null, 'message', '{"text":"Eyes on the screen, please.","scope":"student"}', 'student', gen_random_uuid())$$),
  null, 'the proctor sends a message (issue_command)');
select is(t.err($$select public.add_session_note(t.id('s1'), 'Phone on the desk.')$$), null, 'the proctor adds a note');
select is(t.err($$select public.decide_session(t.id('s1'), 'talk', 'Talk after the exam.')$$), null, 'the proctor decides s1');
select is(t.err($$select public.close_help_request(t.id('h1'), 'Yes, question 2.')$$), null, 'the proctor answers a help request');
select is(t.err($$select public.get_report(t.id('s1'))$$), null, 'the proctor opens s1''s report');
reset role;
select t.put('report1', (select id from public.reports where session_id = t.id('s1')));
select t.login(t.id('mirror'));
select is(t.err($$select public.create_share(t.id('report1'))$$), null, 'the proctor shares the report');
select is(t.err($$select public.confirm_seats(t.id('demo'), null)$$), null, 'the proctor confirms the seats');
reset role;

-- ---------------------------------------------------------------------------
-- The observer: every write RPC is refused, and nothing is written
-- ---------------------------------------------------------------------------
select t.login(t.id('judge'));
select is(t.err($$select public.issue_command(t.id('s2'), null, 'message', '{"text":"Hello","scope":"student"}', 'student', gen_random_uuid())$$),
  'forbidden:read_only', 'issue_command refuses the observer (a message)');
select is(t.err($$select public.issue_command(t.id('s2'), null, 'pause', '{"text":"Please wait"}', 'student', gen_random_uuid())$$),
  'forbidden:read_only', 'issue_command refuses the observer (a pause)');
select is(t.err($$select public.issue_command(null, t.id('demo'), 'message', '{"text":"Ten minutes left","scope":"group"}', 'group', gen_random_uuid())$$),
  'forbidden:read_only', 'issue_command refuses the observer (a group message)');
select alike(t.err($$select public.start_exam(t.id('demo'))$$), 'forbidden%', 'start_exam refuses the observer');
select is(t.err($$select public.close_help_request(t.id('h2'))$$), 'forbidden:read_only',
  'close_help_request refuses the observer (Mark done)');
select is(t.err($$select public.close_help_request(t.id('h2'), 'On my way')$$), 'forbidden:read_only',
  'close_help_request refuses the observer (Reply)');
select is(t.err($$select public.decide_session(t.id('s2'), 'no_issue', null)$$), 'forbidden:read_only',
  'decide_session refuses the observer');
select is(t.err($$select public.add_session_note(t.id('s2'), 'A note')$$), 'forbidden:read_only',
  'add_session_note refuses the observer');
select alike(t.err($$select public.create_share(t.id('report1'))$$), 'forbidden%', 'create_share refuses the observer');
select alike(t.err($$select public.confirm_seats(t.id('demo'), null)$$), 'forbidden%', 'confirm_seats refuses the observer');
select alike(t.err($$select public.confirm_seats(t.id('demo'), 'Seats 1 to 3 please')$$), 'forbidden%',
  'confirm_seats refuses the observer''s change request');
select alike(t.err($$select public.save_exam_draft('{"title":"Judge exam"}'::jsonb)$$), 'forbidden%',
  'save_exam_draft refuses the observer');
select alike(t.err($$select public.import_roster(t.id('demo'), '[]'::jsonb)$$), 'forbidden%', 'import_roster refuses the observer');
select alike(t.err($$select public.assign_proctors(t.id('demo'), '[]'::jsonb)$$), 'forbidden%',
  'assign_proctors refuses the observer');
select alike(t.err($$select public.schedule_exam(t.id('demo'))$$), 'forbidden%', 'schedule_exam refuses the observer');
select alike(t.err($$select public.session_heartbeat(t.id('s1'))$$), 'forbidden%',
  'session_heartbeat refuses the observer (not the session owner)');
select alike(t.err($$select public.submit_session(t.id('s1'))$$), 'forbidden%', 'submit_session refuses the observer');
-- revoke_share arrives with WP 1.9's follow-up; checked when it is there.
select case
  when to_regprocedure('public.revoke_share(uuid)') is null then skip('revoke_share is not on this branch', 1)
  else alike(t.err(format('select public.revoke_share(%L)',
    (select rs.id from public.report_shares rs where rs.report_id = t.id('report1') limit 1))), 'forbidden%',
    'revoke_share refuses the observer')
end;
reset role;

select is((select count(*) from public.session_commands where session_id = t.id('s2')), 0::bigint,
  'no command reached s2');
select is((select count(*) from public.events where session_id = t.id('s2') and type like 'proctor.%'), 0::bigint,
  'no proctor event was written for s2');
select is((select count(*) from public.review_decisions where session_id = t.id('s2')), 0::bigint, 's2 has no decision');
select is((select done_at from public.help_requests where id = t.id('h2')), null, 'the second help request is still open');
select is((select count(*) from public.report_shares where report_id = t.id('report1')), 1::bigint,
  'only the proctor''s share exists');
select is((select confirmed_at from public.proctor_assignments where exam_id = t.id('demo') and staff_id = t.id('judge')),
  null, 'the observer''s assignment is unconfirmed');
select is((select status::text from public.exams where id = t.id('demo')), 'live', 'DEMO-LIVE is still live');

-- ---------------------------------------------------------------------------
-- The observer's reads work and are audited
-- ---------------------------------------------------------------------------
select t.login(t.id('judge'));
select is(t.err($$select public.get_report(t.id('s1'))$$), null, 'the observer opens a report (get_report)');
select is(t.err($$select public.get_report(t.id('s2'))$$), null, 'also one with no report yet, which get_report makes');
select is(t.err($$select public.audit_read('session.view', 'session', t.id('s2')::text)$$), null,
  'audit_read takes the observer''s reads');
select is((select count(*) from public.sessions where exam_id = t.id('demo')), 4::bigint, 'the observer sees the exam''s 4 sessions');
select is((select count(*) from public.events where exam_id = t.id('demo') and review = 'flag'), 2::bigint,
  'and its flags');
select is((select count(*) from public.frames where exam_id = t.id('demo')), 2::bigint, 'and its stills');
select is((select count(*) from public.exams), 1::bigint, 'and only the exam it is assigned to');
select is((select count(*) from public.students), 5::bigint, 'and only that exam''s roster');
reset role;
select is((select count(*) from public.audit_log where actor_id = t.id('judge') and action = 'report.view'), 2::bigint,
  'each report the observer opens writes a report.view audit row');
select is((select count(*) from public.audit_log where actor_id = t.id('judge') and action = 'session.view'), 1::bigint,
  'and audit_read writes its row');
select is((select count(*) from public.reports where session_id = t.id('s2')), 1::bigint,
  'the report the observer opened first has its row');

-- ---------------------------------------------------------------------------
-- Table by table and view by view, the observer reads what the mirror proctor reads
-- ---------------------------------------------------------------------------
select t.login(t.id('mirror'));
select t.count_rels('mirror');
reset role;
select t.login(t.id('judge'));
select t.count_rels('observer');
reset role;
select is((
  select string_agg(m.rel || ' ' || m.n || '/' || o.n, ', ' order by m.rel)
  from t.counts m join t.counts o on o.rel = m.rel and o.who = 'observer'
  where m.who = 'mirror' and m.n is distinct from o.n
), null, 'every table and view in public shows the observer the same rows as the assigned proctor');
select cmp_ok((select count(*) from t.counts where who = 'observer' and n > 0), '>=', 10::bigint,
  'and the comparison is not empty: the observer reads at least 10 relations with rows');

-- ---------------------------------------------------------------------------
-- Direct statements: the guard on every table
-- ---------------------------------------------------------------------------
select is((
  select string_agg(c.relname, ', ' order by c.relname)
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relispartition
    and c.relname <> all (public.observer_unguarded_tables())
    and not exists (select 1 from pg_trigger tg where tg.tgrelid = c.oid and tg.tgname = 'observer_read_only')
), null, 'every table in public has the observer guard, except the bookkeeping reads write '
  || '(a new table: select public.guard_observer_writes(''public.<table>''), or add it to observer_unguarded_tables)');

create table t.direct (rel text primary key, err text);
grant insert, select on t.direct to authenticated;
select t.login(t.id('judge'));
insert into t.direct (rel, err)
select c.relname, t.err(format('delete from public.%I where false', c.relname))
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relispartition;
reset role;
select is((select string_agg(rel, ', ' order by rel) from t.direct where err is null), null,
  'a delete statement by the observer fails on every table in public');

select t.login(t.id('mirror'));
select is(t.err($$update public.session_commands set acked_at = acked_at where false$$), null,
  'a proctor''s statement on session_commands runs (row-level security filters it)');
reset role;
select t.login(t.id('judge'));
select is(t.err($$update public.session_commands set acked_at = acked_at where false$$), 'forbidden:read_only',
  'the same statement by the observer fails on the guard');
select is(t.err($$update public.exams set title = title where false$$), 'forbidden:read_only',
  'as does an update of exams');
reset role;

-- ---------------------------------------------------------------------------
-- session_heartbeat
-- ---------------------------------------------------------------------------
update public.sessions set last_seen_at = now() - interval '11 seconds' where id = t.id('s4');
create table t.tiles (n bigint);
insert into t.tiles select t.messages('exam:' || t.id('demo'), 'session', jsonb_build_object('id', t.id('s4')));
select t.put('s4_uid', t.uid_of(t.id('s4')));
select t.login(t.id('s4_uid'));
select is(public.session_heartbeat(t.id('s4')) ->> 'state', 'writing', 'the owner''s heartbeat answers the state');
reset role;
select is((select last_seen_at from public.sessions where id = t.id('s4')), now(),
  'and writes last_seen_at when the stored one is 10 s old or more');
select is(t.messages('exam:' || t.id('demo'), 'session', jsonb_build_object('id', t.id('s4'))) - (select n from t.tiles),
  1::bigint, 'the tile is broadcast once');
update public.sessions set last_seen_at = now() - interval '5 seconds' where id = t.id('s4');
update t.tiles set n = t.messages('exam:' || t.id('demo'), 'session', jsonb_build_object('id', t.id('s4')));
select t.login(t.id('s4_uid'));
select ok((public.session_heartbeat(t.id('s4')) -> 'server_time') is not null, 'a heartbeat within 10 s answers too');
reset role;
select is((select last_seen_at from public.sessions where id = t.id('s4')), now() - interval '5 seconds',
  'but writes nothing (the throttle)');
select is(t.messages('exam:' || t.id('demo'), 'session', jsonb_build_object('id', t.id('s4'))) - (select n from t.tiles),
  0::bigint, 'and broadcasts nothing');

select t.login(t.uid_of(t.id('s1')));
select alike(t.err($$select public.session_heartbeat(t.id('s4'))$$), 'forbidden%', 'another student is refused');
select alike(t.err(format('select public.session_heartbeat(%L)', gen_random_uuid())), 'not_found%',
  'an unknown session is not_found');
reset role;
select t.login(t.id('mirror'));
select alike(t.err($$select public.session_heartbeat(t.id('s4'))$$), 'forbidden%', 'a proctor is refused');
reset role;
select t.anon();
select alike(t.err($$select public.session_heartbeat(t.id('s4'))$$), 'permission denied%',
  'a visitor with only the publishable key cannot call it');
reset role;

-- ---------------------------------------------------------------------------
-- demo_live_seen and demo_live_status
-- ---------------------------------------------------------------------------
select t.login(t.id('s4_uid'));
select is((public.demo_live_status() -> 'exam' ->> 'id')::uuid, t.id('demo'), 'a simulated student reads DEMO-LIVE''s status');
select is((public.demo_live_status() ->> 'viewers')::int, 0, 'nobody watches yet');
select alike(t.err($$select public.demo_live_seen(t.id('demo'))$$), 'forbidden%', 'a student cannot mark the wall as watched');
reset role;
select t.login(t.id('judge'));
select is((public.demo_live_seen(t.id('demo')) ->> 'duration_min')::int, 720, 'the observer''s open wall marks itself');
reset role;
select t.login(t.id('mirror'));
select is(t.err($$select public.demo_live_seen(t.id('demo'))$$), null, 'so does a proctor''s');
reset role;
select t.login(t.id('outsider'));
select alike(t.err($$select public.demo_live_seen(t.id('demo'))$$), 'forbidden%', 'a proctor of another exam is refused');
reset role;
select t.login(t.id('office'));
select alike(t.err($$select public.demo_live_seen(t.id('math2'))$$), 'not_found%', 'any other exam is not_found');
reset role;
select t.login(t.id('s4_uid'));
select is((public.demo_live_status() ->> 'viewers')::int, 2, 'the status counts the two open walls');
reset role;
update public.demo_live_views set seen_at = now() - interval '2 minutes' where staff_id = t.id('mirror');
select t.login(t.id('s4_uid'));
select is((public.demo_live_status() ->> 'viewers')::int, 1, 'a wall not seen for 90 s no longer counts');
reset role;
select t.anon();
select alike(t.err($$select public.demo_live_status()$$), 'permission denied%', 'a visitor cannot read the status');
reset role;
select t.login(t.id('judge'));
select alike(t.err($$select count(*) from public.demo_live_views$$), 'permission denied%',
  'nobody reads demo_live_views directly');
reset role;

-- ---------------------------------------------------------------------------
-- demo_live_orphans
-- ---------------------------------------------------------------------------
select t.put('gone', gen_random_uuid());
select is(t.err(format($f$insert into storage.objects (bucket_id, name) values
  ('frames', %L), ('frames', %L), ('frames', %L)$f$,
  t.id('demo') || '/' || t.id('s1') || '/' || t.id('flag1') || '-0.jpg',
  t.id('demo') || '/' || t.id('gone') || '/' || gen_random_uuid() || '-0.jpg',
  t.id('history') || '/' || t.id('gone') || '/' || gen_random_uuid() || '-0.jpg')), null,
  'test stills are placed in the frames bucket');
select is((select array_agg(storage_path) from public.demo_live_orphans()),
  array[(select name from storage.objects where bucket_id = 'frames' and name like t.id('demo') || '/' || t.id('gone') || '/%')],
  'orphans: only the DEMO-LIVE still whose session is gone, never one of a live session or of another exam');
select t.login(t.id('judge'));
select alike(t.err($$select * from public.demo_live_orphans()$$), 'permission denied%', 'staff cannot list them');
reset role;

-- ---------------------------------------------------------------------------
-- demo_live_tick: 30 minutes or more left
-- ---------------------------------------------------------------------------
select is(public.demo_live_tick() ->> 'rolled', 'false', 'with 710 minutes left the tick changes nothing');
select is((select count(*) from public.sessions where exam_id = t.id('demo')), 4::bigint, 'the sessions stay');

update public.exams set starts_at = now() - interval '689 minutes' where id = t.id('demo');
select is(public.demo_live_tick() ->> 'rolled', 'false', 'nor with 31 minutes left');
update public.exams set starts_at = now() - interval '700 minutes' where id = t.id('demo');

-- ---------------------------------------------------------------------------
-- The rollover
-- ---------------------------------------------------------------------------
create table t.before as
select
  (select count(*) from public.sessions where exam_id <> t.id('demo')) as sessions,
  (select count(*) from public.events where exam_id <> t.id('demo')) as events,
  (select count(*) from public.frames where exam_id <> t.id('demo')) as frames;

create table t.rolled as select public.demo_live_tick() as r;
select is((select r ->> 'rolled' from t.rolled), 'true', 'with 20 minutes left the tick rolls DEMO-LIVE over');
select is((select (r -> 'counts' ->> 'sessions')::int from t.rolled), 4, 'it counts the 4 sessions it deletes');
select is((select count(*) from public.sessions where exam_id = t.id('demo')), 0::bigint, 'the sessions are gone');
select is((select count(*) from public.events where exam_id = t.id('demo')), 0::bigint, 'and their events');
select is((select count(*) from public.frames where exam_id = t.id('demo')), 0::bigint, 'and their frames rows');
select is((select count(*) from public.help_requests where exam_id = t.id('demo')), 0::bigint, 'and the help requests');
select is((select count(*) from public.session_commands where exam_id = t.id('demo')), 0::bigint, 'and the commands');
select is((select count(*) from public.review_decisions where exam_id = t.id('demo')), 0::bigint, 'and the decisions');
select is((select count(*) from public.reports where exam_id = t.id('demo')), 0::bigint, 'and the reports');
select is((select count(*) from public.report_shares where report_id = t.id('report1')), 0::bigint, 'and their shares');
select is((select count(*) from public.answers a where a.session_id in (t.id('s1'), t.id('s2'))), 0::bigint, 'and the answers');
select is((select starts_at from public.exams where id = t.id('demo')), now(), 'it starts again now');
select is((select status::text || '|' || duration_min || '|' || (lobby_opens_at <= now())::text
  from public.exams where id = t.id('demo')), 'live|720|true', 'live, for 720 minutes, with the lobby open');
select is((select count(*) from public.exam_students where exam_id = t.id('demo')), 5::bigint, 'the roster stays');
select is((select count(*) from public.exam_questions where exam_id = t.id('demo')), 2::bigint, 'and the questions');
select is((select count(*) from public.proctor_assignments where exam_id = t.id('demo')), 2::bigint, 'and the staff');
select is((select row(b.sessions, b.events, b.frames)::text from t.before b),
  (select row(
    (select count(*) from public.sessions where exam_id <> t.id('demo')),
    (select count(*) from public.events where exam_id <> t.id('demo')),
    (select count(*) from public.frames where exam_id <> t.id('demo')))::text),
  'no other exam loses a session, an event or a frames row');
select is((select (meta ->> 'sessions')::int from public.audit_log
  where action = 'demo_live.rollover' and object_id = t.id('demo')::text), 4, 'one demo_live.rollover audit row, with the counts');
select is((select count(*) from public.demo_live_orphans()), 2::bigint,
  'both DEMO-LIVE stills are orphans now, for demo-live-purge to delete through the Storage API');
select is(public.demo_live_tick() ->> 'rolled', 'false', 'the next tick leaves the new run alone');

-- The same anonymous user joins again after the rollover.
select t.login(t.id('s1_uid'));
select is(public.join_exam('DEMO-LIVE', '20249001', 'kk', '{"os":"windows","app_version":"0.1.0-judge-sim"}') -> 'session' ->> 'state',
  'joined', 'the same anonymous user joins DEMO-LIVE again after the rollover');
select is(jsonb_array_length(public.join_exam('DEMO-LIVE', '20249001', 'kk', '{"os":"windows","app_version":"0.1.0-judge-sim"}') -> 'questions'),
  2, 'and gets the questions at once: the exam is live');
reset role;
select is((select count(*) from public.sessions where exam_id = t.id('demo')), 1::bigint, 'one new session');

-- ---------------------------------------------------------------------------
-- The off switch, and an exam that went to review
-- ---------------------------------------------------------------------------
update public.exams set status = 'cancelled', starts_at = now() - interval '700 minutes' where id = t.id('demo');
select is(public.demo_live_tick() ->> 'reason', 'cancelled', 'a cancelled DEMO-LIVE is left alone (the off switch)');
select is((select count(*) from public.sessions where exam_id = t.id('demo')), 1::bigint, 'and keeps its session');
update public.exams set status = 'to_review' where id = t.id('demo');
select is(public.demo_live_tick() ->> 'rolled', 'true', 'a DEMO-LIVE that went to review is rolled over and live again');
select is((select status::text from public.exams where id = t.id('demo')), 'live', 'live');

select t.login(t.id('judge'));
select is(t.err($$select public.demo_live_tick()$$) like 'permission denied%', true, 'staff cannot run the tick');
reset role;

select * from finish();
rollback;
