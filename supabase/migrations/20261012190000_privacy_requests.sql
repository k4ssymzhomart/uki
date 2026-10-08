-- WP 1.12 Privacy (docs/phase-1-plan.md: Decisions "Data requests" and "Retention"; Edge Functions
-- data-request and retention; Screens /privacy-centre). WP 1.1's 20261009000000_phase1.sql made
-- data_requests, the exports bucket, retention_due and retention_nightly; this adds what the two
-- functions need from the database. Shapes are in packages/contracts/src/privacy.ts.
--
--  1. data_requests.due_at: 7 days after the request arrives, as A.5a and A.5b draw it (asked 7 Oct,
--     due 14 Oct; asked 9 Oct, due 16 Oct). The plan's 30 days was a starting value: the frame wins.
--  2. privacy_delete_plan(request, actor): checks a delete request and lists the student's still
--     folders and paths, which the data-request function removes from Storage first.
--  3. privacy_delete_student(request, actor, stills): then, in one transaction, deletes the student's
--     frames and events, clears the identity score and the device record, marks the request done and
--     writes the audit row. Answers, the receipt (sessions.receipt_id), the session itself, review
--     decisions and integrity reports stay: they are the exam result.
--  4. privacy_export(request, actor): the copy request's package (A.5b) as one JSON document: exam
--     history, flags with their stills (the function adds the images), consent records and devices;
--     privacy_export_done(request, actor, path, bytes, expires_at) once the file is written.
--  5. privacy_reply(request, actor, reply): "Reply with a reason" instead of acting.
--
-- All of them are for the data-request Edge Function only (secret key): it checks that the caller is the
-- exam office of the request's workspace, and passes that staff member as the actor. A direct call by a
-- staff member could delete rows while their stills stayed in Storage, so staff cannot call them. They
-- check the actor again anyway. Errors follow WP 1.1: `raise exception using message = '<code>'`.

-- ---------------------------------------------------------------------------
-- 1. Due date
-- ---------------------------------------------------------------------------

alter table public.data_requests alter column due_at set default now() + interval '7 days';

-- ---------------------------------------------------------------------------
-- 2. The checks every action of the data-request function shares
-- ---------------------------------------------------------------------------

-- The request, locked, when p_actor is the exam office (or an admin) of its workspace and its kind is
-- p_kind; raises not_found, forbidden or bad_request otherwise.
create or replace function public.privacy_request_for(p_request_id uuid, p_actor uuid,
  p_kind public.data_request_kind)
returns public.data_requests
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_request public.data_requests;
begin
  select * into v_request from public.data_requests dr where dr.id = p_request_id for update;
  if not found then
    raise exception using message = 'not_found', detail = 'request', errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.staff st
    where st.id = p_actor and st.workspace_id = v_request.workspace_id and st.role in ('exam_office', 'admin')
  ) then
    raise exception using message = 'forbidden', detail = 'exam office of the workspace only', errcode = '42501';
  end if;
  if v_request.kind is distinct from p_kind then
    raise exception using message = 'bad_request', detail = 'kind', errcode = '22023';
  end if;
  return v_request;
end;
$$;

-- A delete request may run once, while it is received, and not while the student is writing a live
-- exam (their app would keep sending events and stills into what is being deleted).
create or replace function public.privacy_delete_check(p_request_id uuid, p_actor uuid)
returns public.data_requests
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_request public.data_requests := public.privacy_request_for(p_request_id, p_actor, 'delete');
begin
  if v_request.status <> 'received' then
    raise exception using message = 'conflict', detail = 'already ' || v_request.status::text, errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.sessions s
    join public.exams e on e.id = s.exam_id
    where s.student_id = v_request.student_id and e.status = 'live' and not public.is_final_state(s.state)
  ) then
    raise exception using message = 'conflict', detail = 'in_exam', errcode = 'P0001';
  end if;
  return v_request;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Delete (A.5a)
-- ---------------------------------------------------------------------------

-- What the function removes from Storage before the rows: every still folder of the student's sessions
-- (`<exam_id>/<session_id>`, which also holds stills uploaded but never confirmed) and the stored path of
-- every frame. Changes nothing.
create or replace function public.privacy_delete_plan(p_request_id uuid, p_actor uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_request public.data_requests := public.privacy_delete_check(p_request_id, p_actor);
begin
  return jsonb_build_object(
    'request_id', v_request.id,
    'student_id', v_request.student_id,
    'workspace_id', v_request.workspace_id,
    'folders', coalesce((
      select jsonb_agg(lower(s.exam_id::text) || '/' || lower(s.id::text) order by s.joined_at, s.id)
      from public.sessions s where s.student_id = v_request.student_id
    ), '[]'::jsonb),
    'paths', coalesce((
      select jsonb_agg(fr.storage_path order by fr.captured_at, fr.id)
      from public.frames fr
      join public.sessions s on s.id = fr.session_id
      where s.student_id = v_request.student_id
    ), '[]'::jsonb)
  );
end;
$$;

-- The rows, in one transaction, after the stills are gone from Storage (p_stills: how many objects the
-- function removed, for the audit row). Returns the done request and what was deleted.
create or replace function public.privacy_delete_student(p_request_id uuid, p_actor uuid, p_stills int default 0)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_request public.data_requests := public.privacy_delete_check(p_request_id, p_actor);
  v_sessions uuid[];
  v_frames int;
  v_events int;
  v_identity int;
  v_devices int;
begin
  select coalesce(array_agg(s.id), '{}') into v_sessions
  from public.sessions s where s.student_id = v_request.student_id;

  delete from public.frames fr where fr.session_id = any (v_sessions);
  get diagnostics v_frames = row_count;
  -- help_requests go with their event (on delete cascade, WP 1.1).
  delete from public.events ev where ev.session_id = any (v_sessions);
  get diagnostics v_events = row_count;
  update public.sessions s set identity_score = null
  where s.id = any (v_sessions) and s.identity_score is not null;
  get diagnostics v_identity = row_count;
  update public.sessions s set device = '{}'::jsonb
  where s.id = any (v_sessions) and s.device is distinct from '{}'::jsonb;
  get diagnostics v_devices = row_count;

  update public.data_requests dr
  set status = 'done', done_by = p_actor, done_at = now()
  where dr.id = v_request.id
  returning * into v_request;

  insert into public.audit_log (workspace_id, actor_id, actor_kind, action, object_type, object_id, meta)
  values (v_request.workspace_id, p_actor, 'staff', 'data_request.delete', 'student', v_request.student_id::text,
    jsonb_build_object('data_request_id', v_request.id, 'stills', greatest(coalesce(p_stills, 0), 0),
      'frames', v_frames, 'events', v_events, 'identity_scores', v_identity, 'devices', v_devices,
      'sessions', cardinality(v_sessions)));

  return jsonb_build_object(
    'request', to_jsonb(v_request),
    'frames', v_frames,
    'events', v_events,
    'identity_scores', v_identity,
    'devices', v_devices,
    'sessions', cardinality(v_sessions)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Copy (A.5b)
-- ---------------------------------------------------------------------------

-- The copy package without the images: what A.5b lists (exam history with times and decisions, flags and
-- their frames, consent records, devices) plus who the student is. The function fills in each frame's
-- image from Storage, writes the file and signs the link. A copy may be made again (a fresh file and a
-- fresh link) unless the request was answered with a reply instead. Changes nothing.
create or replace function public.privacy_export(p_request_id uuid, p_actor uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_request public.data_requests := public.privacy_request_for(p_request_id, p_actor, 'copy');
  v_student jsonb;
  v_workspace text;
begin
  if v_request.status = 'replied' then
    raise exception using message = 'conflict', detail = 'already replied', errcode = 'P0001';
  end if;

  select w.name into v_workspace from public.workspaces w where w.id = v_request.workspace_id;
  select jsonb_build_object('student_number', st.student_number, 'full_name', st.full_name, 'email', st.email,
      'group', g.code, 'programme', st.programme, 'year', st.year, 'locale', st.locale)
    into v_student
  from public.students st
  left join public.groups g on g.id = st.group_id
  where st.id = v_request.student_id;

  return jsonb_build_object(
    'format', 'uki.data-copy.v1',
    'generated_at', now(),
    'request', jsonb_build_object('id', v_request.id, 'received_at', v_request.received_at),
    'workspace', v_workspace,
    'student', v_student,
    'exams', coalesce((
      select jsonb_agg(jsonb_build_object(
          'session_id', s.id,
          'exam', jsonb_build_object('title', e.title, 'course', e.course, 'kind', e.kind, 'code', e.code,
            'starts_at', e.starts_at, 'duration_min', e.duration_min),
          'state', s.state, 'joined_at', s.joined_at, 'started_at', s.started_at,
          'submitted_at', s.submitted_at, 'ended_at', s.ended_at, 'end_reason', s.end_reason,
          'time_used_s', s.time_used_s, 'extra_min', s.extra_min, 'receipt_id', s.receipt_id,
          'identity_result', s.identity_result, 'identity_score', s.identity_score,
          'decision', (
            select jsonb_build_object('decision', rd.decision, 'note', rd.note, 'decided_at', rd.decided_at)
            from public.review_decisions rd where rd.session_id = s.id
          ))
        order by e.starts_at, s.id)
      from public.sessions s
      join public.exams e on e.id = s.exam_id
      where s.student_id = v_request.student_id
    ), '[]'::jsonb),
    'flags', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', ev.id, 'session_id', ev.session_id, 'exam', e.title, 'type', ev.type, 'source', ev.source,
          'at', ev.at, 'data', ev.data,
          'frames', coalesce((
            select jsonb_agg(jsonb_build_object('id', fr.id, 'captured_at', fr.captured_at,
                'storage_path', fr.storage_path) order by fr.captured_at, fr.id)
            from public.frames fr where fr.event_id = ev.id
          ), '[]'::jsonb))
        order by ev.at, ev.id)
      from public.events ev
      join public.sessions s on s.id = ev.session_id
      join public.exams e on e.id = ev.exam_id
      where s.student_id = v_request.student_id and ev.review = 'flag'
    ), '[]'::jsonb),
    'consent', coalesce((
      select jsonb_agg(jsonb_build_object('session_id', s.id, 'exam', e.title,
          'rules_accepted_at', s.rules_accepted_at, 'rules_locale', s.rules_locale)
        order by s.rules_accepted_at, s.id)
      from public.sessions s
      join public.exams e on e.id = s.exam_id
      where s.student_id = v_request.student_id and s.rules_accepted_at is not null
    ), '[]'::jsonb),
    'devices', coalesce((
      select jsonb_agg(jsonb_build_object('session_id', s.id, 'exam', e.title, 'device', s.device,
          'last_seen_at', s.last_seen_at)
        order by s.joined_at, s.id)
      from public.sessions s
      join public.exams e on e.id = s.exam_id
      where s.student_id = v_request.student_id and s.device is distinct from '{}'::jsonb
    ), '[]'::jsonb)
  );
end;
$$;

-- After the file is in the exports bucket: the request is done, with the file's path, and the audit row
-- records the copy (its size and when the link expires). Returns the request.
create or replace function public.privacy_export_done(p_request_id uuid, p_actor uuid, p_path text,
  p_bytes int, p_expires_at timestamptz)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_request public.data_requests := public.privacy_request_for(p_request_id, p_actor, 'copy');
begin
  if v_request.status = 'replied' then
    raise exception using message = 'conflict', detail = 'already replied', errcode = 'P0001';
  end if;
  if p_path is null or p_path !~ ('^' || lower(v_request.workspace_id::text) || '/' || lower(v_request.id::text) || '\.json$') then
    raise exception using message = 'bad_request', detail = 'path', errcode = '22023';
  end if;
  update public.data_requests dr
  set status = 'done', export_path = p_path, done_by = p_actor, done_at = now()
  where dr.id = v_request.id
  returning * into v_request;
  insert into public.audit_log (workspace_id, actor_id, actor_kind, action, object_type, object_id, meta)
  values (v_request.workspace_id, p_actor, 'staff', 'data_request.copy', 'student', v_request.student_id::text,
    jsonb_build_object('data_request_id', v_request.id, 'bytes', p_bytes, 'link_expires_at', p_expires_at));
  return to_jsonb(v_request);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Reply (A.5a and A.5b: "Reply with a reason")
-- ---------------------------------------------------------------------------

-- Answers a received request with a reason instead of acting on it; the reason is stored on the request
-- and the audit row notes its length, not its text. Returns the request.
create or replace function public.privacy_reply(p_request_id uuid, p_actor uuid, p_reply text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_kind public.data_request_kind;
  v_request public.data_requests;
  v_reply text := btrim(p_reply);
begin
  select dr.kind into v_kind from public.data_requests dr where dr.id = p_request_id;
  if not found then
    raise exception using message = 'not_found', detail = 'request', errcode = 'P0002';
  end if;
  v_request := public.privacy_request_for(p_request_id, p_actor, v_kind);
  if v_request.status <> 'received' then
    raise exception using message = 'conflict', detail = 'already ' || v_request.status::text, errcode = 'P0001';
  end if;
  if v_reply is null or char_length(v_reply) not between 1 and 2000 then
    raise exception using message = 'bad_request', detail = 'reply', errcode = '22023';
  end if;
  update public.data_requests dr
  set status = 'replied', reply = v_reply, done_by = p_actor, done_at = now()
  where dr.id = v_request.id
  returning * into v_request;
  insert into public.audit_log (workspace_id, actor_id, actor_kind, action, object_type, object_id, meta)
  values (v_request.workspace_id, p_actor, 'staff', 'data_request.reply', 'student', v_request.student_id::text,
    jsonb_build_object('data_request_id', v_request.id, 'kind', v_request.kind, 'reply_length', char_length(v_reply)));
  return to_jsonb(v_request);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: the secret key only
-- ---------------------------------------------------------------------------

revoke execute on function public.privacy_request_for(uuid, uuid, public.data_request_kind)
  from public, anon, authenticated;
revoke execute on function public.privacy_delete_check(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.privacy_delete_plan(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.privacy_delete_student(uuid, uuid, int) from public, anon, authenticated;
revoke execute on function public.privacy_export(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.privacy_export_done(uuid, uuid, text, int, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.privacy_reply(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.privacy_delete_plan(uuid, uuid) to service_role;
grant execute on function public.privacy_delete_student(uuid, uuid, int) to service_role;
grant execute on function public.privacy_export(uuid, uuid) to service_role;
grant execute on function public.privacy_export_done(uuid, uuid, text, int, timestamptz) to service_role;
grant execute on function public.privacy_reply(uuid, uuid, text) to service_role;
