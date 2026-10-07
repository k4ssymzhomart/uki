-- answers: a student writes its own answers "saved before the session's end, accepted until 10 minutes
-- after it" (RLS in docs/phase-0-plan.md). The session's end is the scheduled one (session_ends_at)
-- while it is writing, paused or time_up, but a proctor's end command (ended, ended_at) or the
-- student's own submit (submitted, submitted_at, the receipt) ends it earlier. The policies in
-- 20261007115925_helpers_rls.sql read only session_ends_at, so after either one the student could
-- still insert and change answers with its own token until the scheduled end plus 10 minutes, and
-- saved_at comes from the laptop.
--
-- Both policies now also bound an ended or submitted session by ended_at or submitted_at: saved
-- before it, accepted until 10 minutes after it. Answers the outbox saved before the end still sync.
-- A final session without its timestamp accepts nothing.

drop policy answers_insert_owner on public.answers;
drop policy answers_update_owner on public.answers;

create policy answers_insert_owner on public.answers
  for insert to authenticated
  with check (exists (
    select 1 from public.sessions s
    join public.exam_questions eq on eq.exam_id = s.exam_id and eq.question_id = answers.question_id
    where s.id = answers.session_id
      and s.auth_uid = (select auth.uid())
      and answers.saved_at < public.session_ends_at(s)
      and now() <= public.session_ends_at(s) + interval '10 minutes'
      and (s.state not in ('ended', 'submitted')
        or (answers.saved_at < coalesce(s.ended_at, s.submitted_at)
          and now() <= coalesce(s.ended_at, s.submitted_at) + interval '10 minutes'))
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
      and (s.state not in ('ended', 'submitted')
        or (answers.saved_at < coalesce(s.ended_at, s.submitted_at)
          and now() <= coalesce(s.ended_at, s.submitted_at) + interval '10 minutes'))
  ));
