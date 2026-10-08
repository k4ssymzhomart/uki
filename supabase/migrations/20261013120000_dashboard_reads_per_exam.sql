-- WP 1.14: 0.1's and A.2's counting views check access once per exam, not once per row.
--
-- With seed v2's Autumn 2026 term (42 more exams, 5,510 roster rows, 5,346 sessions, 1,284 students)
-- the exam office's exam_overview read passed the authenticated role's 8 s statement timeout on CI's
-- stack (nine dashboard e2e tests failed through the layout every page loads), and student_overview
-- (A.2) was on the same path. Both count rows under the caller's row-level security, so they ran
-- is_exam_staff() (three nested security definer calls) for every row they counted; student_overview
-- also scanned every session for each student, since sessions.student_id had no index. WP 1.10's
-- 20261012180000_term_views_per_exam.sql did the same fix for the term views.
--
-- Each now reads an exam's rows through a security definer function that checks is_exam_staff() once
-- per exam (1.10's invoker_bypasses_rls() lets the secret key and psql read everything, as before), and
-- every caller sees exactly the rows and numbers it saw before:
--   - the exam office sees every exam of its workspace, a proctor or observer the exams assigned to
--     them, through is_exam_staff, the rule every policy on these tables comes down to for staff;
--   - a student keeps exam_overview's old subqueries under row-level security (only their own
--     session), and sees no students row, so student_overview stays empty for them;
--   - the secret key reads every row.
-- The views keep their names, columns, types, grants and security_invoker; the exams and students
-- themselves still come under the caller's row-level security. supabase/tests/25_dashboard_reads.test.sql
-- compares each view with its old definition for each role.

-- A.2 and A.3 read a student's sessions; without this index each read scanned every session.
create index if not exists sessions_student on public.sessions (student_id);

-- ---------------------------------------------------------------------------
-- exam_overview (0.1, and the sidebar's counts on every page)
-- ---------------------------------------------------------------------------

-- One exam's counts for its proctors and its exam office, read without row-level security; no row for
-- anyone else.
create or replace function public.exam_overview_counts(p_exam_id uuid)
returns table (
  groups text[],
  proctor_count int,
  roster_size int,
  joined int,
  writing int,
  paused int,
  flagged_events int,
  sessions_final int
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((
      select array_agg(g.code order by g.code)
      from public.exam_groups eg
      join public.groups g on g.id = eg.group_id
      where eg.exam_id = p_exam_id
    ), '{}'::text[]),
    (select count(*) from public.proctor_assignments pa where pa.exam_id = p_exam_id)::int,
    (select count(*) from public.exam_students es where es.exam_id = p_exam_id)::int,
    s.joined,
    s.writing,
    s.paused,
    (select count(*) from public.events ev where ev.exam_id = p_exam_id and ev.review = 'flag')::int,
    s.sessions_final
  from (
    select
      count(*)::int as joined,
      (count(*) filter (where se.state in ('writing', 'paused')))::int as writing,
      (count(*) filter (where se.state = 'paused'))::int as paused,
      (count(*) filter (where se.state in ('submitted', 'time_up', 'ended')))::int as sessions_final
    from public.sessions se
    where se.exam_id = p_exam_id
  ) s
  where public.is_exam_staff(p_exam_id)
$$;

revoke execute on function public.exam_overview_counts(uuid) from public, anon;
grant execute on function public.exam_overview_counts(uuid) to authenticated, service_role;

-- The counts come from exam_overview_counts for staff of the exam; for anyone else (a student, the
-- secret key) the old subqueries run under the caller's row-level security, as before.
create or replace view public.exam_overview
with (security_invoker = on)
as
select
  e.id,
  e.workspace_id,
  e.faculty_id,
  f.name as faculty_name,
  e.title,
  e.course,
  e.kind,
  e.code,
  e.mode,
  e.status,
  e.starts_at,
  e.duration_min,
  e.starts_at + make_interval(mins => e.duration_min) as ends_at,
  e.lobby_opens_at,
  e.checks,
  e.lms_url,
  e.created_at,
  coalesce(c.groups, coalesce((
    select array_agg(g.code order by g.code)
    from public.exam_groups eg
    join public.groups g on g.id = eg.group_id
    where eg.exam_id = e.id
  ), '{}'::text[])) as groups,
  coalesce(c.proctor_count,
    (select count(*) from public.proctor_assignments pa where pa.exam_id = e.id)::int) as proctor_count,
  coalesce(c.roster_size,
    (select count(*) from public.exam_students es where es.exam_id = e.id)::int) as roster_size,
  coalesce(c.joined, (select count(*) from public.sessions s where s.exam_id = e.id)::int) as joined,
  coalesce(c.writing, (select count(*) from public.sessions s
    where s.exam_id = e.id and s.state in ('writing', 'paused'))::int) as writing,
  coalesce(c.paused, (select count(*) from public.sessions s
    where s.exam_id = e.id and s.state = 'paused')::int) as paused,
  coalesce(c.flagged_events, (select count(*) from public.events ev
    where ev.exam_id = e.id and ev.review = 'flag')::int) as flagged_events,
  coalesce(c.sessions_final, (select count(*) from public.sessions s
    where s.exam_id = e.id and s.state in ('submitted', 'time_up', 'ended'))::int) as sessions_final,
  public.exam_question_count(e.id) as question_count
from public.exams e
left join public.faculties f on f.id = e.faculty_id
left join lateral public.exam_overview_counts(e.id) c on true;

grant select on public.exam_overview to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- student_overview (A.2)
-- ---------------------------------------------------------------------------

-- Per student, over the sessions of the exams the caller is staff of (every exam for a caller that
-- skips row-level security): sessions taken, flags, sessions with a flag newer than their decision,
-- the last exam and the latest decision. is_exam_staff runs once per exam.
create or replace function public.student_session_stats()
returns table (
  student_id uuid,
  exams_taken int,
  flags int,
  sessions_in_review int,
  last_exam_id uuid,
  last_exam_title text,
  last_exam_at timestamptz,
  latest_decision public.review_decision,
  latest_decision_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with visible as (
    select e.id, e.title, e.starts_at
    from public.exams e
    where public.invoker_bypasses_rls() or public.is_exam_staff(e.id)
  ),
  ses as (
    select se.id, se.student_id, v.id as exam_id, v.title, v.starts_at
    from public.sessions se
    join visible v on v.id = se.exam_id
  ),
  flagged as (
    select
      s.id as session_id,
      count(*)::int as flags,
      (count(*) filter (where d.decided_at is null or ev.received_at > d.decided_at))::int as open
    from ses s
    join public.events ev on ev.session_id = s.id and ev.review = 'flag'
    left join public.review_decisions d on d.session_id = s.id
    group by s.id
  ),
  totals as (
    select
      s.student_id,
      count(*)::int as exams_taken,
      coalesce(sum(f.flags), 0)::int as flags,
      (count(*) filter (where f.open > 0))::int as sessions_in_review
    from ses s
    left join flagged f on f.session_id = s.id
    group by s.student_id
  ),
  last_exam as (
    select distinct on (s.student_id) s.student_id, s.exam_id, s.title, s.starts_at
    from ses s
    order by s.student_id, s.starts_at desc
  ),
  latest as (
    select distinct on (s.student_id) s.student_id, d.decision, d.decided_at
    from ses s
    join public.review_decisions d on d.session_id = s.id
    order by s.student_id, d.decided_at desc
  )
  select
    t.student_id, t.exams_taken, t.flags, t.sessions_in_review,
    l.exam_id, l.title, l.starts_at,
    x.decision, x.decided_at
  from totals t
  left join last_exam l on l.student_id = t.student_id
  left join latest x on x.student_id = t.student_id
$$;

revoke execute on function public.student_session_stats() from public, anon;
grant execute on function public.student_session_stats() to authenticated, service_role;

create or replace view public.student_overview
with (security_invoker = on)
as
select
  st.id,
  st.workspace_id,
  st.student_number,
  st.full_name,
  st.email,
  st.locale,
  st.group_id,
  g.code as group_code,
  g.faculty_id,
  f.name as faculty_name,
  st.programme,
  st.year,
  coalesce(s.exams_taken, 0) as exams_taken,
  coalesce(s.flags, 0) as flags,
  coalesce(s.sessions_in_review, 0) as sessions_in_review,
  s.last_exam_id,
  s.last_exam_title,
  s.last_exam_at,
  s.latest_decision,
  s.latest_decision_at
from public.students st
left join public.groups g on g.id = st.group_id
left join public.faculties f on f.id = g.faculty_id
left join public.student_session_stats() s on s.student_id = st.id;

grant select on public.exam_overview, public.student_overview to authenticated, service_role;
