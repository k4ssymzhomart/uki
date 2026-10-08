-- WP 1.14: 0.1's exam_overview counts an exam's rows once per exam, not once per row.
--
-- exam_overview (20261007200000_command_followups.sql) counts each exam's roster, sessions and flags in
-- correlated subqueries under the caller's row-level security, so is_exam_staff() ran for every
-- exam_students, sessions and events row it counted. With seed v2's Autumn 2026 term (42 more exams,
-- 5,510 roster rows, 5,346 sessions) the exam office's query passed the authenticated role's 8 s
-- statement timeout on CI's stack, and every dashboard page reads it through the layout.
--
-- exam_overview_counts(exam_id) now reads one exam's counts without row-level security, once the caller
-- is staff of that exam (is_exam_staff, checked once), and returns no row otherwise. The view takes the
-- counts from it, and falls back to its old subqueries under the caller's row-level security when it
-- returns none: a student (who sees only their own session), and the secret key (which skips row-level
-- security and so reads every row, as before). Every caller sees the numbers they saw before; the view
-- keeps its name, columns, types, grants and security_invoker. The exams themselves still come under
-- the caller's row-level security.

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
