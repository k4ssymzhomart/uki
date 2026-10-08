-- WP 1.14 (20261013120000_dashboard_reads_per_exam.sql): exam_overview, term_sessions and student_overview
-- check access once per exam. For every role each view shows what its old definition showed: the exam
-- office every row of its workspace's exams, a proctor those of the exams assigned to them, a student
-- only their own session (and no term or student rows), the secret key everything, nobody an exam they
-- cannot see. With seed v2's term the exam office's reads stay well inside the 8 s statement timeout.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Test helpers, rolled back with the transaction (as in 01_rls.test.sql and 13_privacy.test.sql).
create schema t;
grant usage, create on schema t to authenticated, service_role, anon;
create table t.ids (k text primary key, v uuid not null);
grant select on t.ids to authenticated, service_role, anon;

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

create function t.service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);
end $$;

-- Seeded ids (supabase/seed.sql): Phase 0's exams and seed v2's first term exam.
select t.put('ws', 'a0000000-0000-4000-8000-000000000001');
select t.put('math2', 'e0000000-0000-4000-8000-000000000001');
select t.put('history', 'e0000000-0000-4000-8000-000000000003');
select t.put('term1', 'e0000000-0000-4000-8100-000000000001');

-- Start from the seed alone: staff assignments made by `pnpm seed:staff` are set aside.
delete from public.proctor_assignments;

select t.put('office', t.new_staff('office@overview.test', 'Office Person', 'exam_office'));
select t.put('proctor', t.new_staff('proctor@overview.test', 'Assigned Proctor', 'proctor'));
select t.put('other_proctor', t.new_staff('other@overview.test', 'Other Proctor', 'proctor'));
insert into public.proctor_assignments (exam_id, staff_id, languages, is_lead)
values (t.id('math2'), t.id('proctor'), '{ru}', true);
select t.put('writing', t.new_session(t.id('math2'), '20231187', 'writing'));
select t.put('paused', t.new_session(t.id('math2'), '20231044', 'paused'));
select t.put('done', t.new_session(t.id('math2'), '20230912', 'submitted'));
insert into public.events (id, session_id, exam_id, type, source, review, at, received_at, data)
values (gen_random_uuid(), t.id('paused'), t.id('math2'), 'phone.detected', 'app', 'flag', now() - interval '2 minutes',
  now() - interval '2 minutes', '{"score":0.9,"held_ms":800}');
insert into public.review_decisions (session_id, exam_id, decision, note, reviewer_id, decided_at)
values (t.id('done'), t.id('math2'), 'no_issue', null, t.id('proctor'), now() - interval '1 minute');

-- Every exam's numbers read without row-level security, as postgres.
create table t.expect as
select
  e.id,
  coalesce((select array_agg(g.code order by g.code) from public.exam_groups eg
    join public.groups g on g.id = eg.group_id where eg.exam_id = e.id), '{}'::text[]) as groups,
  (select count(*) from public.proctor_assignments pa where pa.exam_id = e.id)::int as proctor_count,
  (select count(*) from public.exam_students es where es.exam_id = e.id)::int as roster_size,
  (select count(*) from public.sessions s where s.exam_id = e.id)::int as joined,
  (select count(*) from public.sessions s where s.exam_id = e.id and s.state in ('writing', 'paused'))::int as writing,
  (select count(*) from public.sessions s where s.exam_id = e.id and s.state = 'paused')::int as paused,
  (select count(*) from public.events ev where ev.exam_id = e.id and ev.review = 'flag')::int as flagged_events,
  (select count(*) from public.sessions s
    where s.exam_id = e.id and s.state in ('submitted', 'time_up', 'ended'))::int as sessions_final
from public.exams e
where e.workspace_id = t.id('ws');
grant select on t.expect to authenticated, service_role, anon;

-- How long one statement takes as the current role.
create function t.timed(p_sql text) returns interval language plpgsql as $$
declare v_start timestamptz := clock_timestamp();
begin
  execute p_sql;
  return clock_timestamp() - v_start;
end $$;

-- Rows of exam_overview whose numbers differ from t.expect, as the current role sees them.
create function t.differ() returns bigint language sql stable as $$
  select count(*) from public.exam_overview o join t.expect x on x.id = o.id
  where (o.groups, o.proctor_count, o.roster_size, o.joined, o.writing, o.paused, o.flagged_events, o.sessions_final)
    is distinct from (x.groups, x.proctor_count, x.roster_size, x.joined, x.writing, x.paused, x.flagged_events,
      x.sessions_final)
$$;

-- student_overview's old definition, as postgres, over the sessions of p_exams only.
create function t.students_expect(p_exams uuid[]) returns table (id uuid, exams_taken int, flags int,
  sessions_in_review int, last_exam_at timestamptz, latest_decision_at timestamptz)
language sql stable security definer set search_path = public as $$
  select st.id, coalesce(agg.exams_taken, 0), coalesce(agg.flags, 0), coalesce(agg.sessions_in_review, 0),
    last_exam.starts_at, latest.decided_at
  from public.students st
  left join lateral (
    select count(*)::int as exams_taken, coalesce(sum(fl.flags), 0)::int as flags,
      (count(*) filter (where fl.open > 0))::int as sessions_in_review
    from public.sessions se
    cross join lateral (
      select count(*) as flags,
        count(*) filter (where d.decided_at is null or ev.received_at > d.decided_at) as open
      from public.events ev
      left join public.review_decisions d on d.session_id = se.id
      where ev.session_id = se.id and ev.review = 'flag'
    ) fl
    where se.student_id = st.id and se.exam_id = any (p_exams)
  ) agg on true
  left join lateral (
    select e.starts_at from public.sessions se join public.exams e on e.id = se.exam_id
    where se.student_id = st.id and se.exam_id = any (p_exams) order by e.starts_at desc limit 1
  ) last_exam on true
  left join lateral (
    select d.decided_at from public.review_decisions d join public.sessions se on se.id = d.session_id
    where se.student_id = st.id and se.exam_id = any (p_exams) order by d.decided_at desc limit 1
  ) latest on true
  where st.workspace_id = 'a0000000-0000-4000-8000-000000000001'
$$;

-- student_overview rows, as the current role sees them, that differ from the old definition over p_exams.
create function t.students_differ(p_exams uuid[]) returns bigint language sql stable as $$
  select count(*) from public.student_overview o join t.students_expect(p_exams) x on x.id = o.id
  where (o.exams_taken, o.flags, o.sessions_in_review, o.last_exam_at, o.latest_decision_at)
    is distinct from (x.exams_taken, x.flags, x.sessions_in_review, x.last_exam_at, x.latest_decision_at)
$$;

-- term_sessions per exam with the old definition, as postgres: sessions, flags and decisions.
create table t.term_expect as
select te.exam_id, count(se.id)::int as sessions,
  coalesce(sum((select count(*) from public.events ev where ev.session_id = se.id and ev.review = 'flag')), 0)::int
    as flags,
  count(d.decision)::int as decisions
from public.term_exams te
left join public.sessions se on se.exam_id = te.exam_id
left join public.review_decisions d on d.session_id = se.id
where te.workspace_id = t.id('ws')
group by te.exam_id;
grant select on t.term_expect to authenticated, service_role, anon;

-- term_sessions exams, as the current role sees them, whose totals differ from t.term_expect.
create function t.term_differ() returns bigint language sql stable as $$
  select count(*) from (
    select ts.exam_id, count(ts.session_id)::int as sessions, coalesce(sum(ts.flags), 0)::int as flags,
      count(ts.decision)::int as decisions
    from public.term_sessions ts group by ts.exam_id
  ) o join t.term_expect x on x.exam_id = o.exam_id
  where (o.sessions, o.flags, o.decisions) is distinct from (x.sessions, x.flags, x.decisions)
$$;

create table t.kru_exams as select array_agg(id) as ids from public.exams where workspace_id = t.id('ws');
grant select on t.kru_exams to authenticated, service_role, anon;

select ok((select count(*) from t.expect) >= 47, 'the seed has Phase 0''s exams and seed v2''s term');
select ok((select roster_size from t.expect where id = t.id('term1')) > 0, 'a term exam has a roster');

-- ---------------------------------------------------------------------------
-- The exam office
-- ---------------------------------------------------------------------------
select t.login(t.id('office'));
select ok(t.timed('select * from public.exam_overview') < interval '4 seconds',
  'the exam office reads every exam of the term in well under the 8 s statement timeout');
select is((select count(*) from public.exam_overview), (select count(*) from t.expect), 'the exam office sees every exam');
select is(t.differ(), 0::bigint, 'with every count of every exam, as read without row-level security');
select is((select roster_size from public.exam_overview where id = t.id('history')), 140,
  'History of Kazakhstan: 140 on the roster');
select is((select flagged_events from public.exam_overview where id = t.id('history')), 7, 'and 7 flags');
select is((select writing || '|' || paused || '|' || sessions_final from public.exam_overview where id = t.id('math2')),
  '2|1|1', 'Mathematics 2: two writing (one paused) and one done');
select is((select roster_size from public.exam_overview_counts(t.id('term1'))),
  (select roster_size from t.expect where id = t.id('term1')), 'exam_overview_counts answers the exam office');
select ok(t.timed('select * from public.term_kpis') < interval '4 seconds',
  'the exam office reads term_kpis over the whole term in well under the timeout');
select is((select count(distinct exam_id) from public.term_sessions), (select count(*) from t.term_expect),
  'term_sessions: every exam that ran');
select is(t.term_differ(), 0::bigint, 'with the sessions, flags and decisions of its old definition');
select ok(t.timed('select * from public.student_overview') < interval '4 seconds',
  'the exam office reads student_overview for 1,284 students in well under the timeout');
select is((select count(*) from public.student_overview),
  (select count(*) from public.students where workspace_id = t.id('ws')), 'student_overview: every student');
select is(t.students_differ((select ids from t.kru_exams)), 0::bigint,
  'with the exams, flags, reviews, last exam and latest decision of its old definition');
reset role;

-- ---------------------------------------------------------------------------
-- An assigned proctor, another proctor
-- ---------------------------------------------------------------------------
select t.login(t.id('proctor'));
select is((select count(*) from public.exam_overview), 1::bigint, 'the proctor sees only their exam');
select is(t.differ(), 0::bigint, 'with every count of it');
select is((select proctor_count from public.exam_overview where id = t.id('math2')), 1, 'one proctor assigned');
select is((select count(*) from public.exam_overview_counts(t.id('history'))), 0::bigint,
  'exam_overview_counts gives nothing for an exam they are not assigned');
select is((select count(*) from public.student_overview), 128::bigint, 'student_overview: the 128 on their roster');
select is(t.students_differ(array[t.id('math2')]), 0::bigint,
  'counting only the sessions of their exam, as the old definition did');
select is((select exams_taken || '|' || flags || '|' || sessions_in_review from public.student_overview
  where student_number = '20231044'), '1|1|1', 'Dias: one exam, its undecided phone flag, in review');
select is((select exams_taken || '|' || flags || '|' || coalesce(latest_decision::text, '-') from public.student_overview
  where student_number = '20230912'), '1|0|no_issue', 'Arman: one exam, no flag, the latest decision');
select is((select count(*) from public.term_sessions), 0::bigint, 'no term row: Mathematics 2 has not run');
reset role;

select t.login(t.id('other_proctor'));
select is((select count(*) from public.exam_overview), 0::bigint, 'an unassigned proctor sees no exam');
select is((select count(*) from public.exam_overview_counts(t.id('math2'))), 0::bigint,
  'nor any count of one');
reset role;

-- ---------------------------------------------------------------------------
-- A student: only their own session counts, as under row-level security before
-- ---------------------------------------------------------------------------
select t.login((select auth_uid from public.sessions where id = t.id('writing')));
select is((select count(*) from public.exam_overview), 1::bigint, 'a student sees the exam they write');
select is((select joined || '|' || writing || '|' || roster_size || '|' || flagged_events || '|' || proctor_count
    || '|' || cardinality(groups) from public.exam_overview where id = t.id('math2')), '1|1|0|0|0|0',
  'and counts only their own session: no roster, flags, proctors or groups');
select is((select count(*) from public.exam_overview_counts(t.id('math2'))), 0::bigint,
  'exam_overview_counts gives a student nothing');
select is((select count(*) from public.term_sessions), 0::bigint, 'a student sees no term_sessions row');
select is((select count(*) from public.student_overview), 0::bigint, 'nor any student_overview row');
select is((select count(*) from public.student_session_stats()), 0::bigint, 'and student_session_stats gives nothing');
reset role;

-- ---------------------------------------------------------------------------
-- The secret key and anonymous visitors
-- ---------------------------------------------------------------------------
select t.service();
select is(t.differ(), 0::bigint, 'the secret key reads every count, as before');
select is((select count(*) from public.exam_overview where workspace_id = t.id('ws')), (select count(*) from t.expect),
  'and every exam');
select is(t.term_differ(), 0::bigint, 'term_sessions for the secret key, as before');
select is(t.students_differ((select ids from t.kru_exams)), 0::bigint, 'student_overview for the secret key, as before');
reset role;

select t.anon();
select throws_ok($$ select * from public.exam_overview_counts('e0000000-0000-4000-8000-000000000001') $$, '42501',
  null, 'anonymous visitors cannot call exam_overview_counts');
select throws_ok($$ select * from public.term_session_rows('e0000000-0000-4000-8000-000000000001') $$, '42501',
  null, 'nor term_session_rows');
select throws_ok($$ select * from public.student_session_stats() $$, '42501', null, 'nor student_session_stats');
reset role;

select * from finish();
rollback;
