-- A.1's term views (WP 1.10, 20261012180000_term_views_per_exam.sql): term_sessions and term_flag_types
-- read an exam's sessions and flags through term_exam_sessions and term_exam_flag_types, which check
-- is_exam_staff() once per exam. The numbers are the same for every role as under the old per-row
-- policies: the exam office sees its workspace, a proctor only their exams, another workspace and a
-- student nothing (as before: a student never reads term_exams), anonymous visitors are refused. Two
-- reviewed exams in autumn 2025, a term the seed does not use, keep the counts exact.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

create schema t;
grant usage on schema t to anon, authenticated, service_role;
create table t.ids (k text primary key, v uuid not null);
grant select on t.ids to anon, authenticated, service_role;

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

-- A reviewed exam on an Almaty date at 09:00 for 90 minutes.
create function t.past_exam(p_key text, p_faculty uuid, p_day date) returns uuid language sql as $$
  insert into public.exams (workspace_id, faculty_id, title, course, kind, mode, starts_at, duration_min,
    lobby_opens_at, status)
  values ('a0000000-0000-4000-8000-000000000001', p_faculty, 'Term view ' || p_key, 'Term view', 'Exam', 'app',
    (p_day + time '09:00') at time zone 'Asia/Almaty', 90,
    (p_day + time '08:40') at time zone 'Asia/Almaty', 'reviewed')
  returning t.put(p_key, id)
$$;

-- A submitted session of a seeded student, with its own anonymous user.
create function t.session(p_key text, p_exam uuid, p_number text) returns uuid language sql as $$
  insert into public.sessions (exam_id, student_id, auth_uid, state, locale, started_at, submitted_at)
  select p_exam, s.id, t.new_user(null, true), 'submitted', 'kk', e.starts_at, e.starts_at + interval '85 minutes'
  from public.students s, public.exams e
  where s.student_number = p_number and e.id = p_exam
  returning t.put(p_key, id)
$$;

create function t.flag(p_session uuid, p_type text, p_review public.event_review default 'flag') returns void
language sql as $$
  insert into public.events (id, session_id, exam_id, type, source, review, at, received_at)
  select gen_random_uuid(), s.id, s.exam_id, p_type, 'app', p_review, s.started_at + interval '10 minutes',
    s.started_at + interval '10 minutes'
  from public.sessions s where s.id = p_session
$$;

-- A decision `p_after` after the exam's scheduled end.
create function t.decide(p_session uuid, p_decision public.review_decision, p_after interval) returns void
language sql as $$
  insert into public.review_decisions (session_id, exam_id, decision, reviewer_id, decided_at)
  select s.id, s.exam_id, p_decision, t.id('office'), e.starts_at + make_interval(mins => e.duration_min) + p_after
  from public.sessions s join public.exams e on e.id = s.exam_id where s.id = p_session
$$;

grant execute on all functions in schema t to anon, authenticated, service_role;

select t.put('fac_math', 'a1000000-0000-4000-8000-000000000001');
select t.put('fac_phys', 'a1000000-0000-4000-8000-000000000002');
select t.put('office', t.new_staff('office@termviews.test', 'Term Office', 'exam_office'));
select t.put('proctor', t.new_staff('proctor@termviews.test', 'Term Proctor', 'proctor'));
insert into public.workspaces (id, name, slug) values ('a0000000-0000-4000-8000-0000000000f8', 'Other U', 'other-terms');
select t.put('office2', t.new_staff('office2@termviews.test', 'Other Office', 'exam_office',
  'a0000000-0000-4000-8000-0000000000f8'));

-- Mathematics on Wednesday 10 September 2025 (week of 8 September), physics on 20 September (week of 15).
select t.past_exam('ex_math', t.id('fac_math'), date '2025-09-10');
select t.past_exam('ex_phys', t.id('fac_phys'), date '2025-09-20');
insert into public.proctor_assignments (exam_id, staff_id, languages, is_lead)
values (t.id('ex_math'), t.id('proctor'), '{ru}', true);

select t.session('s1', t.id('ex_math'), '20231187');
select t.session('s2', t.id('ex_math'), '20235002');
select t.session('s3', t.id('ex_math'), '20230912');
select t.session('s4', t.id('ex_phys'), '20231187');
-- s1: two flags, talked to; s2: one flag, not decided; s3: no flag, one event that is not a flag;
-- s4: one flag, sent to the committee.
select t.flag(t.id('s1'), 'gaze.off_screen');
select t.flag(t.id('s1'), 'phone.detected');
select t.flag(t.id('s2'), 'phone.detected');
select t.flag(t.id('s3'), 'status.ready', 'none');
select t.flag(t.id('s4'), 'phone.detected');
select t.decide(t.id('s1'), 'talk', interval '2 hours');
select t.decide(t.id('s4'), 'committee', interval '30 minutes');

-- ---------------------------------------------------------------------------
-- The views keep their shape
-- ---------------------------------------------------------------------------
select ok((select 'security_invoker=on' = any(reloptions) from pg_class where oid = 'public.term_sessions'::regclass),
  'term_sessions runs as its caller');
select ok((select 'security_invoker=on' = any(reloptions) from pg_class where oid = 'public.term_flag_types'::regclass),
  'term_flag_types runs as its caller');
select ok(not has_function_privilege('anon', 'public.term_exam_sessions(uuid)', 'execute'),
  'anon cannot run term_exam_sessions');
select ok(not has_function_privilege('anon', 'public.term_exam_flag_types(uuid)', 'execute'),
  'anon cannot run term_exam_flag_types');

-- ---------------------------------------------------------------------------
-- Exam office: the whole workspace
-- ---------------------------------------------------------------------------
select t.login(t.id('office'));
select results_eq($$
  select exams_run, sessions, flags, flagged_sessions, decisions, committee, first_day, last_day
  from public.term_kpis where term = '2025-autumn' and all_faculties
$$, $$ values (2, 4, 4, 3, 2, 1, date '2025-09-10', date '2025-09-20') $$, 'office: the term in numbers');
select results_eq($$
  select exams_run, sessions, flags, flagged_sessions
  from public.term_kpis where term = '2025-autumn' and faculty_id = t.id('fac_math')
$$, $$ values (1, 3, 3, 2) $$, 'office: one faculty');
select results_eq($$
  select week_start, sessions, flags, flags_per_100
  from public.term_weekly_flags where term = '2025-autumn' and all_faculties order by week_start
$$, $$ values (date '2025-09-08', 3, 3, 100.0), (date '2025-09-15', 1, 1, 100.0) $$, 'office: flags per week');
select results_eq($$
  select type, flags from public.term_flag_types where term = '2025-autumn' and all_faculties order by type
$$, $$ values ('gaze.off_screen', 1), ('phone.detected', 3) $$, 'office: flags per type, a non-flag event left out');
select results_eq($$
  select type, flags from public.term_flag_types where term = '2025-autumn' and faculty_id = t.id('fac_phys')
$$, $$ values ('phone.detected', 1) $$, 'office: flags per type in one faculty');
select results_eq($$
  select decision::text as name, sessions from public.term_decisions
  where term = '2025-autumn' and all_faculties order by decision
$$, $$ values ('talk', 1), ('committee', 1) $$, 'office: decisions on flagged sessions');
select results_eq($$
  select week_start, decisions, median_review_s from public.term_review_time
  where term = '2025-autumn' and all_faculties order by week_start
$$, $$ values (date '2025-09-08', 1, 7200), (date '2025-09-15', 1, 1800) $$, 'office: median review time per week');
select is((select count(*) from public.term_exam_sessions(t.id('ex_math'))), 3::bigint,
  'office: term_exam_sessions reads the exam''s sessions');
reset role;

-- ---------------------------------------------------------------------------
-- Proctor: only the assigned exam
-- ---------------------------------------------------------------------------
select t.login(t.id('proctor'));
select results_eq($$
  select exams_run, sessions, flags, flagged_sessions, decisions, committee
  from public.term_kpis where term = '2025-autumn' and all_faculties
$$, $$ values (1, 3, 3, 2, 1, 0) $$, 'proctor: only their exam counts');
select results_eq($$
  select type, flags from public.term_flag_types where term = '2025-autumn' and all_faculties order by type
$$, $$ values ('gaze.off_screen', 1), ('phone.detected', 2) $$, 'proctor: only their exam''s flags');
select is((select count(*) from public.term_exam_sessions(t.id('ex_phys'))), 0::bigint,
  'proctor: no sessions of an exam they do not proctor');
select is((select count(*) from public.term_exam_flag_types(t.id('ex_phys'))), 0::bigint,
  'proctor: no flags of an exam they do not proctor');
reset role;

-- ---------------------------------------------------------------------------
-- Another workspace's office, a student, anonymous visitors
-- ---------------------------------------------------------------------------
select t.login(t.id('office2'));
select is((select count(*) from public.term_sessions where term = '2025-autumn'), 0::bigint,
  'another workspace''s office sees no KRU session');
select is((select count(*) from public.term_flag_types where term = '2025-autumn'), 0::bigint,
  'another workspace''s office sees no KRU flag');
select is((select count(*) from public.term_exam_sessions(t.id('ex_math'))), 0::bigint,
  'another workspace''s office reads nothing through term_exam_sessions');
reset role;

select t.login((select auth_uid from public.sessions where id = t.id('s1')));
select is((select count(session_id) from public.term_sessions), 0::bigint, 'a student sees no session, not even their own');
select is((select count(*) from public.term_flag_types), 0::bigint, 'a student sees no flag type');
select is((select count(*) from public.term_exam_sessions(t.id('ex_math'))), 0::bigint,
  'a student reads nothing through term_exam_sessions');
reset role;

select t.anon();
select throws_ok($$ select count(*) from public.term_sessions $$, '42501', null, 'anon cannot read term_sessions');
select throws_ok($$ select * from public.term_exam_sessions('00000000-0000-0000-0000-000000000000') $$, '42501', null,
  'anon cannot run term_exam_sessions');
reset role;

select * from finish();
rollback;
