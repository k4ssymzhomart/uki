-- WP 1.10: A.1's term views check access once per exam, not once per session and event.
--
-- term_sessions and term_flag_types (20261009000000_phase1.sql, section 8) read sessions, events and
-- review_decisions under the caller's row-level security, so is_exam_staff() ran for every session and
-- every event row: on a term of 42 exams and 5,142 sessions (A.1's frame) term_kpis took 8.6 s for the
-- exam office on a loaded local stack, past the authenticated role's 8 s statement timeout, and
-- term_decisions 9.2 s. Each view now reads an exam's sessions and flags through a function that checks
-- is_exam_staff() once for that exam and reads the rows without row-level security; the exam itself still
-- comes from term_exams under the caller's row-level security. Everyone sees exactly the rows they saw
-- before: for staff, sessions_select_staff, events_select_staff and the review_decisions policies all
-- come down to is_exam_staff() of the row's exam; students and other workspaces see no term_exams row
-- (it joins workspaces, which only the workspace's staff read), so they saw nothing and still do; and a
-- caller that skips row-level security (the secret key, psql) still reads every row
-- (supabase/tests/18_term_views.test.sql passes on both versions). The views keep their names, columns,
-- types and grants, and stay security_invoker; term_kpis, term_weekly_flags, term_decisions and
-- term_review_time read term_sessions and are unchanged.

-- Whether the role these functions were called by skips row-level security (the secret key's
-- service_role, or postgres in psql), as it did when the views read the tables directly. Inside a
-- security definer function current_user is the owner, but the `role` setting is still the caller's.
create function public.invoker_bypasses_rls()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select r.rolbypassrls or r.rolsuper
    from pg_catalog.pg_roles r
    where r.rolname = case when current_setting('role') = 'none' then session_user
      else current_setting('role') end
  ), false)
$$;

-- One exam's sessions with their flag count and decision, for its proctors and its exam office.
create function public.term_exam_sessions(p_exam_id uuid)
returns table (session_id uuid, flags int, decision public.review_decision, decided_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select
    se.id,
    (select count(*) from public.events ev where ev.session_id = se.id and ev.review = 'flag')::int,
    d.decision,
    d.decided_at
  from public.sessions se
  left join public.review_decisions d on d.session_id = se.id
  where se.exam_id = p_exam_id
    and (public.is_exam_staff(p_exam_id) or public.invoker_bypasses_rls())
$$;

-- One exam's flags per event type, for its proctors and its exam office.
create function public.term_exam_flag_types(p_exam_id uuid)
returns table (type text, flags int)
language sql
stable
security definer
set search_path = ''
as $$
  select ev.type, count(*)::int
  from public.events ev
  where ev.exam_id = p_exam_id
    and ev.review = 'flag'
    and (public.is_exam_staff(p_exam_id) or public.invoker_bypasses_rls())
  group by ev.type
$$;

revoke execute on function public.invoker_bypasses_rls() from public, anon, authenticated;
revoke execute on function public.term_exam_sessions(uuid) from public, anon, authenticated;
revoke execute on function public.term_exam_flag_types(uuid) from public, anon, authenticated;
-- The views run as their caller, so the caller runs these.
grant execute on function public.term_exam_sessions(uuid) to authenticated, service_role;
grant execute on function public.term_exam_flag_types(uuid) to authenticated, service_role;

-- Sessions of the exams that ran, with their flag count and decision (same columns as before).
create or replace view public.term_sessions
with (security_invoker = on)
as
select
  te.*,
  s.session_id,
  s.flags,
  s.decision,
  s.decided_at
from public.term_exams te
left join lateral public.term_exam_sessions(te.exam_id) s on true;

-- Flags per type (same columns as before).
create or replace view public.term_flag_types
with (security_invoker = on)
as
select
  te.workspace_id, te.term, te.term_start, te.faculty_id, grouping(te.faculty_id) = 1 as all_faculties,
  f.type,
  sum(f.flags)::int as flags
from public.term_exams te
cross join lateral public.term_exam_flag_types(te.exam_id) f
group by grouping sets ((te.workspace_id, te.term, te.term_start, f.type, te.faculty_id),
  (te.workspace_id, te.term, te.term_start, f.type));
