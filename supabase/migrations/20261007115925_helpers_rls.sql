-- Helpers, grants and row-level security for every Phase 0 table.
-- See docs/phase-0-plan.md, "Row-level security". Students are anonymous Supabase users: role
-- `authenticated` with the `is_anonymous` claim; no staff check may ever pass for them.

-- ---------------------------------------------------------------------------
-- Additions to 0001_core
-- ---------------------------------------------------------------------------

-- The pause that started the current `paused` state, and the self-pause credit given so far
-- (self pauses give back at most 300 s per session). Written only by the events trigger.
alter table public.sessions
  add column pause_event_id uuid,
  add column self_paused_s int not null default 0;

-- The envelope's app_version stays in the table (packages/contracts/src/events.ts, CompactEvent).
alter table public.events add column app_version text;

-- `confirm_frames` is idempotent per path.
create unique index frames_event_path on public.frames (event_id, storage_path);
create index frames_session on public.frames (session_id);
-- `join_exam` counts tries per user per minute in the audit log.
create index audit_log_actor_action_at on public.audit_log (actor_id, action, at desc);
create index audit_log_workspace_at on public.audit_log (workspace_id, at desc);
create index sessions_auth_uid on public.sessions (auth_uid);
create index sessions_exam_state on public.sessions (exam_id, state);
create index exam_students_student on public.exam_students (student_id);
create index proctor_assignments_staff on public.proctor_assignments (staff_id);
create index session_commands_session on public.session_commands (session_id, issued_at);
create index events_session_type on public.events (session_id, type);

-- ---------------------------------------------------------------------------
-- Helpers: stable, security definer, empty search_path
-- ---------------------------------------------------------------------------

-- True when the caller's JWT says the user signed in anonymously (a student).
create or replace function public.is_anonymous()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
$$;

-- Exam office or admin of the workspace. Never true for an anonymous user.
create or replace function public.is_staff_of(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not public.is_anonymous() and exists (
    select 1 from public.staff s
    where s.id = (select auth.uid())
      and s.workspace_id = p_workspace_id
      and s.role in ('exam_office', 'admin')
  )
$$;

-- Any staff member (any role) of the workspace: reads the workspace's reference data.
create or replace function public.is_member_of(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not public.is_anonymous() and exists (
    select 1 from public.staff s
    where s.id = (select auth.uid()) and s.workspace_id = p_workspace_id
  )
$$;

-- Assigned to the exam through proctor_assignments. Never true for an anonymous user.
create or replace function public.is_proctor_of(p_exam_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not public.is_anonymous() and exists (
    select 1 from public.proctor_assignments pa
    where pa.exam_id = p_exam_id and pa.staff_id = (select auth.uid())
  )
$$;

-- The workspace that owns an exam.
create or replace function public.exam_workspace(p_exam_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.workspace_id from public.exams e where e.id = p_exam_id
$$;

-- Exam office or admin of the exam's workspace.
create or replace function public.is_office_of_exam(p_exam_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_staff_of(public.exam_workspace(p_exam_id))
$$;

-- Staff who may watch the exam: its proctors and the exam office of its workspace.
create or replace function public.is_exam_staff(p_exam_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_proctor_of(p_exam_id) or public.is_office_of_exam(p_exam_id)
$$;

-- The exam of a session.
create or replace function public.session_exam(p_session_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.exam_id from public.sessions s where s.id = p_session_id
$$;

-- The caller owns the session (the anonymous user that joined it).
create or replace function public.owns_session(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.sessions s
    where s.id = p_session_id and s.auth_uid = (select auth.uid())
  )
$$;

-- The caller has a session in the exam.
create or replace function public.has_session_in(p_exam_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.sessions s
    where s.exam_id = p_exam_id and s.auth_uid = (select auth.uid())
  )
$$;

-- The exam has started: live or later, or scheduled with starts_at in the past (before the cron tick).
create or replace function public.exam_started(p_exam_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.exams e
    where e.id = p_exam_id
      and (e.status in ('live', 'to_review', 'reviewed')
        or (e.status = 'scheduled' and e.starts_at <= now()))
  )
$$;

-- When a session's time runs out. Also a PostgREST computed column: select=*,session_ends_at
create or replace function public.session_ends_at(s public.sessions)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select e.starts_at + make_interval(mins => e.duration_min + s.extra_min, secs => s.paused_s)
  from public.exams e
  where e.id = s.exam_id
$$;

-- A session is in a final state.
create or replace function public.is_final_state(p_state public.session_state)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_state in ('submitted', 'time_up', 'ended')
$$;

revoke execute on function public.is_anonymous() from public, anon;
revoke execute on function public.is_staff_of(uuid) from public, anon;
revoke execute on function public.is_member_of(uuid) from public, anon;
revoke execute on function public.is_proctor_of(uuid) from public, anon;
revoke execute on function public.exam_workspace(uuid) from public, anon;
revoke execute on function public.is_office_of_exam(uuid) from public, anon;
revoke execute on function public.is_exam_staff(uuid) from public, anon;
revoke execute on function public.session_exam(uuid) from public, anon;
revoke execute on function public.owns_session(uuid) from public, anon;
revoke execute on function public.has_session_in(uuid) from public, anon;
revoke execute on function public.exam_started(uuid) from public, anon;
revoke execute on function public.session_ends_at(public.sessions) from public, anon;
revoke execute on function public.is_final_state(public.session_state) from public, anon;

grant execute on function public.is_anonymous() to authenticated, service_role;
grant execute on function public.is_staff_of(uuid) to authenticated, service_role;
grant execute on function public.is_member_of(uuid) to authenticated, service_role;
grant execute on function public.is_proctor_of(uuid) to authenticated, service_role;
grant execute on function public.exam_workspace(uuid) to authenticated, service_role;
grant execute on function public.is_office_of_exam(uuid) to authenticated, service_role;
grant execute on function public.is_exam_staff(uuid) to authenticated, service_role;
grant execute on function public.session_exam(uuid) to authenticated, service_role;
grant execute on function public.owns_session(uuid) to authenticated, service_role;
grant execute on function public.has_session_in(uuid) to authenticated, service_role;
grant execute on function public.exam_started(uuid) to authenticated, service_role;
grant execute on function public.session_ends_at(public.sessions) to authenticated, service_role;
grant execute on function public.is_final_state(public.session_state) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Table grants. New tables are not exposed to the Data API by default, so grant explicitly;
-- RLS then decides which rows each role sees.
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

grant select on all tables in schema public to authenticated;
-- Exam office writes: exams, rosters, proctor assignments, staff.
grant insert, update, delete on public.exams, public.exam_groups, public.exam_students,
  public.proctor_assignments, public.staff, public.students, public.groups to authenticated;
-- Students write their own answers (upsert) and acknowledge their own commands.
grant insert (session_id, question_id, choice_id, saved_at) on public.answers to authenticated;
grant update (session_id, question_id, choice_id, saved_at) on public.answers to authenticated;
revoke update on public.session_commands from authenticated;
grant update (acked_at) on public.session_commands to authenticated;

-- ---------------------------------------------------------------------------
-- Row-level security on every table
-- ---------------------------------------------------------------------------

alter table public.workspaces enable row level security;
alter table public.faculties enable row level security;
alter table public.staff enable row level security;
alter table public.groups enable row level security;
alter table public.students enable row level security;
alter table public.exams enable row level security;
alter table public.exam_groups enable row level security;
alter table public.exam_students enable row level security;
alter table public.proctor_assignments enable row level security;
alter table public.questions enable row level security;
alter table public.exam_questions enable row level security;
alter table public.sessions enable row level security;
alter table public.answers enable row level security;
alter table public.events enable row level security;
alter table public.frames enable row level security;
alter table public.session_commands enable row level security;
alter table public.audit_log enable row level security;

-- workspaces: any staff member reads its own workspace.
create policy workspaces_select_member on public.workspaces
  for select to authenticated
  using (public.is_member_of(id));

-- faculties and groups: workspace reference data for any staff member; the exam office writes groups.
create policy faculties_select_member on public.faculties
  for select to authenticated
  using (public.is_member_of(workspace_id));

create policy groups_select_member on public.groups
  for select to authenticated
  using (public.is_member_of(workspace_id));
create policy groups_insert_office on public.groups
  for insert to authenticated
  with check (public.is_staff_of(workspace_id));
create policy groups_update_office on public.groups
  for update to authenticated
  using (public.is_staff_of(workspace_id))
  with check (public.is_staff_of(workspace_id));
create policy groups_delete_office on public.groups
  for delete to authenticated
  using (public.is_staff_of(workspace_id));

-- staff: everyone on staff reads the staff of its workspace (names for the wall and drawer);
-- the exam office writes staff rows.
create policy staff_select_member on public.staff
  for select to authenticated
  using (public.is_member_of(workspace_id));
create policy staff_insert_office on public.staff
  for insert to authenticated
  with check (public.is_staff_of(workspace_id));
create policy staff_update_office on public.staff
  for update to authenticated
  using (public.is_staff_of(workspace_id))
  with check (public.is_staff_of(workspace_id));
create policy staff_delete_office on public.staff
  for delete to authenticated
  using (public.is_staff_of(workspace_id));

-- students: the exam office reads and writes its workspace's roster; a proctor reads the students
-- on the rosters of its exams.
create policy students_select_office on public.students
  for select to authenticated
  using (public.is_staff_of(workspace_id));
create policy students_select_proctor on public.students
  for select to authenticated
  using (exists (
    select 1 from public.exam_students es
    where es.student_id = students.id and public.is_proctor_of(es.exam_id)
  ));
create policy students_insert_office on public.students
  for insert to authenticated
  with check (public.is_staff_of(workspace_id));
create policy students_update_office on public.students
  for update to authenticated
  using (public.is_staff_of(workspace_id))
  with check (public.is_staff_of(workspace_id));
create policy students_delete_office on public.students
  for delete to authenticated
  using (public.is_staff_of(workspace_id));

-- exams: exam office of the workspace, assigned proctors, and a student with a session in it.
create policy exams_select_office on public.exams
  for select to authenticated
  using (public.is_staff_of(workspace_id));
create policy exams_select_proctor on public.exams
  for select to authenticated
  using (public.is_proctor_of(id));
create policy exams_select_student on public.exams
  for select to authenticated
  using (public.has_session_in(id));
create policy exams_insert_office on public.exams
  for insert to authenticated
  with check (public.is_staff_of(workspace_id));
create policy exams_update_office on public.exams
  for update to authenticated
  using (public.is_staff_of(workspace_id))
  with check (public.is_staff_of(workspace_id));
create policy exams_delete_office on public.exams
  for delete to authenticated
  using (public.is_staff_of(workspace_id));

-- exam_groups, exam_students, proctor_assignments: exam staff read; the exam office writes.
create policy exam_groups_select_staff on public.exam_groups
  for select to authenticated
  using (public.is_exam_staff(exam_id));
create policy exam_groups_insert_office on public.exam_groups
  for insert to authenticated
  with check (public.is_office_of_exam(exam_id));
create policy exam_groups_update_office on public.exam_groups
  for update to authenticated
  using (public.is_office_of_exam(exam_id))
  with check (public.is_office_of_exam(exam_id));
create policy exam_groups_delete_office on public.exam_groups
  for delete to authenticated
  using (public.is_office_of_exam(exam_id));

create policy exam_students_select_staff on public.exam_students
  for select to authenticated
  using (public.is_exam_staff(exam_id));
create policy exam_students_insert_office on public.exam_students
  for insert to authenticated
  with check (public.is_office_of_exam(exam_id));
create policy exam_students_update_office on public.exam_students
  for update to authenticated
  using (public.is_office_of_exam(exam_id))
  with check (public.is_office_of_exam(exam_id));
create policy exam_students_delete_office on public.exam_students
  for delete to authenticated
  using (public.is_office_of_exam(exam_id));

create policy proctor_assignments_select_staff on public.proctor_assignments
  for select to authenticated
  using (public.is_exam_staff(exam_id));
create policy proctor_assignments_insert_office on public.proctor_assignments
  for insert to authenticated
  with check (public.is_office_of_exam(exam_id));
create policy proctor_assignments_update_office on public.proctor_assignments
  for update to authenticated
  using (public.is_office_of_exam(exam_id))
  with check (public.is_office_of_exam(exam_id));
create policy proctor_assignments_delete_office on public.proctor_assignments
  for delete to authenticated
  using (public.is_office_of_exam(exam_id));

-- questions and exam_questions: the exam office reads; a student reads its exam's questions
-- once the exam has started. Writes wait for the question bank (Phase 1).
create policy questions_select_office on public.questions
  for select to authenticated
  using (public.is_staff_of(workspace_id));
create policy questions_select_student on public.questions
  for select to authenticated
  using (exists (
    select 1 from public.exam_questions eq
    where eq.question_id = questions.id
      and public.has_session_in(eq.exam_id)
      and public.exam_started(eq.exam_id)
  ));

create policy exam_questions_select_office on public.exam_questions
  for select to authenticated
  using (public.is_office_of_exam(exam_id));
create policy exam_questions_select_student on public.exam_questions
  for select to authenticated
  using (public.has_session_in(exam_id) and public.exam_started(exam_id));

-- sessions: exam staff read; the student reads its own. Only database functions write.
create policy sessions_select_staff on public.sessions
  for select to authenticated
  using (public.is_exam_staff(exam_id));
create policy sessions_select_owner on public.sessions
  for select to authenticated
  using (auth_uid = (select auth.uid()));

-- answers: exam staff read; the student reads its own and upserts its own, saved before the
-- session's end and accepted until 10 minutes after it, for a question of its exam.
create policy answers_select_staff on public.answers
  for select to authenticated
  using (public.is_exam_staff(public.session_exam(session_id)));
create policy answers_select_owner on public.answers
  for select to authenticated
  using (public.owns_session(session_id));
create policy answers_insert_owner on public.answers
  for insert to authenticated
  with check (exists (
    select 1 from public.sessions s
    join public.exam_questions eq on eq.exam_id = s.exam_id and eq.question_id = answers.question_id
    where s.id = answers.session_id
      and s.auth_uid = (select auth.uid())
      and answers.saved_at < public.session_ends_at(s)
      and now() <= public.session_ends_at(s) + interval '10 minutes'
  ));
create policy answers_update_owner on public.answers
  for update to authenticated
  using (public.owns_session(session_id))
  with check (exists (
    select 1 from public.sessions s
    join public.exam_questions eq on eq.exam_id = s.exam_id and eq.question_id = answers.question_id
    where s.id = answers.session_id
      and s.auth_uid = (select auth.uid())
      and answers.saved_at < public.session_ends_at(s)
      and now() <= public.session_ends_at(s) + interval '10 minutes'
  ));

-- events and frames: exam staff read. Students write events only through ingest (service role).
create policy events_select_staff on public.events
  for select to authenticated
  using (public.is_exam_staff(exam_id));

create policy frames_select_staff on public.frames
  for select to authenticated
  using (public.is_exam_staff(exam_id));

-- session_commands: exam staff read; the student reads its own and sets acked_at on its own
-- (the column grant above allows only acked_at). Commands are written by issue_command.
create policy session_commands_select_staff on public.session_commands
  for select to authenticated
  using (public.is_exam_staff(exam_id));
create policy session_commands_select_owner on public.session_commands
  for select to authenticated
  using (public.owns_session(session_id));
create policy session_commands_ack_owner on public.session_commands
  for update to authenticated
  using (public.owns_session(session_id))
  with check (public.owns_session(session_id));

-- audit_log: the exam office reads its workspace's log. Written by database functions and Edge Functions.
create policy audit_log_select_office on public.audit_log
  for select to authenticated
  using (public.is_staff_of(workspace_id));
