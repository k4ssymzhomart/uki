-- WP 1.14: exam_overview takes its counts from exam_overview_counts (20261013120000_exam_overview_counts.sql).
-- For every role the view shows the numbers it showed before: the exam office and an exam's proctors
-- every row of their exams, a student only their own session, the secret key everything, and nobody
-- an exam they cannot see. With seed v2's term the exam office's read stays fast.
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
reset role;

-- ---------------------------------------------------------------------------
-- The secret key and anonymous visitors
-- ---------------------------------------------------------------------------
select t.service();
select is(t.differ(), 0::bigint, 'the secret key reads every count, as before');
select is((select count(*) from public.exam_overview where workspace_id = t.id('ws')), (select count(*) from t.expect),
  'and every exam');
reset role;

select t.anon();
select throws_ok($$ select * from public.exam_overview_counts('e0000000-0000-4000-8000-000000000001') $$, '42501',
  null, 'anonymous visitors cannot call exam_overview_counts');
reset role;

select * from finish();
rollback;
