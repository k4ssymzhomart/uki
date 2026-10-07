-- Database functions the apps call through PostgREST: join_exam (student app), start_exam (dashboard),
-- submit_session (student app). See docs/phase-0-plan.md, "Database functions and triggers" and
-- "Session states", and packages/contracts/src/api.ts for the shapes.

-- ---------------------------------------------------------------------------
-- Receipt ids: UKI-<group>-<4 random digits>-<initials>, as packages/contracts/src/receipt.ts
-- ---------------------------------------------------------------------------

create or replace function public.receipt_initial(p_word text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when upper(left(coalesce(p_word, ''), 1)) ~ '^[A-Z]$' then upper(left(p_word, 1))
    else 'X'
  end
$$;

create or replace function public.make_receipt_id(p_student_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_group text;
  v_name text;
  v_words text[];
  v_initials text;
  v_id text;
  v_try int := 0;
begin
  select g.code, s.full_name into v_group, v_name
  from public.students s
  left join public.groups g on g.id = s.group_id
  where s.id = p_student_id;

  v_group := coalesce(nullif(left(regexp_replace(upper(coalesce(v_group, '')), '[^A-Z0-9]', '', 'g'), 12), ''), 'X');
  v_words := regexp_split_to_array(regexp_replace(coalesce(v_name, ''), '^\s+|\s+$', '', 'g'), '\s+');
  v_initials := public.receipt_initial(v_words[1])
    || public.receipt_initial(v_words[coalesce(array_length(v_words, 1), 1)]);

  loop
    v_try := v_try + 1;
    v_id := 'UKI-' || v_group || '-' || lpad(floor(random() * 10000)::int::text, 4, '0') || '-' || v_initials;
    exit when not exists (select 1 from public.sessions se where se.receipt_id = v_id);
    if v_try >= 100 then
      raise exception using message = 'receipt_exhausted', errcode = 'P0001';
    end if;
  end loop;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- JSON shapes shared by the functions
-- ---------------------------------------------------------------------------

-- JoinSession in packages/contracts/src/api.ts, plus ends_at.
create or replace function public.session_json(s public.sessions)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', s.id,
    'state', s.state,
    'locale', s.locale,
    'joined_at', s.joined_at,
    'started_at', s.started_at,
    'submitted_at', s.submitted_at,
    'ended_at', s.ended_at,
    'end_reason', s.end_reason,
    'extra_min', s.extra_min,
    'paused_s', s.paused_s,
    'time_used_s', s.time_used_s,
    'receipt_id', s.receipt_id,
    'ends_at', public.session_ends_at(s)
  )
$$;

-- ---------------------------------------------------------------------------
-- join_exam(code, student_number, locale, device)
-- ---------------------------------------------------------------------------
-- Open from lobby_opens_at until starts_at + duration_min (for the same user's own session, until
-- the later of that and session_ends_at). Ten tries a minute per auth.uid(), counted in audit_log.
--
-- The four errors (invalid_code, already_joined, lobby_closed, rate_limited) are not raised: a raise
-- would roll back the audit row that counts the try. The function sets PostgREST's response.status
-- (400, 409, 400, 429) and returns a PostgREST error body {code, message, details, hint} with
-- message = the error code; PostgREST commits the transaction and answers with that status, so
-- supabase-js reports `error.message === '<code>'` exactly as for a raise (matchErrorCode in
-- packages/contracts/src/api.ts works unchanged). SQL callers get that body as the return value.
create or replace function public.join_exam(code text, student_number text, locale public.locale, device jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  v_uid uuid := auth.uid();
  v_code text := upper(btrim(coalesce(join_exam.code, '')));
  v_number text := btrim(coalesce(join_exam.student_number, ''));
  v_locale public.locale := coalesce(join_exam.locale, 'kk');
  v_device jsonb := case when jsonb_typeof(join_exam.device) = 'object' then join_exam.device else '{}'::jsonb end;
  v_workspace uuid := '00000000-0000-0000-0000-000000000000';
  v_exam public.exams;
  v_student public.students;
  v_session public.sessions;
  v_seat int;
  v_tries int;
  v_error text;
  v_window_end timestamptz;
  v_proctor text;
  v_questions jsonb;
begin
  if v_uid is null then
    raise exception using message = 'unauthorized', errcode = '42501';
  end if;

  select count(*) into v_tries
  from public.audit_log a
  where a.actor_id = v_uid and a.action = 'join_exam' and a.at > now() - interval '1 minute';
  if v_tries >= 10 then
    v_error := 'rate_limited';
  end if;

  if v_error is null then
    select e.* into v_exam
    from public.exams e
    where upper(e.code) = v_code and e.status not in ('draft', 'cancelled');
    if not found then
      v_error := 'invalid_code';
    else
      v_workspace := v_exam.workspace_id;
    end if;
  end if;

  if v_error is null then
    select st.* into v_student
    from public.students st
    join public.exam_students es on es.student_id = st.id and es.exam_id = v_exam.id
    where st.workspace_id = v_exam.workspace_id and st.student_number = v_number;
    if not found then
      v_error := 'invalid_code';
    else
      select es.seat into v_seat
      from public.exam_students es
      where es.exam_id = v_exam.id and es.student_id = v_student.id;
    end if;
  end if;

  if v_error is null then
    select se.* into v_session
    from public.sessions se
    where se.exam_id = v_exam.id and se.student_id = v_student.id
    for update;

    v_window_end := v_exam.starts_at + make_interval(mins => v_exam.duration_min);
    if v_session.id is not null and v_session.auth_uid = v_uid then
      v_window_end := greatest(v_window_end, public.session_ends_at(v_session));
    end if;

    if now() < v_exam.lobby_opens_at or now() > v_window_end
      or v_exam.status in ('to_review', 'reviewed') then
      v_error := 'lobby_closed';
    elsif v_session.id is not null and v_session.auth_uid <> v_uid then
      v_error := 'already_joined';
    elsif v_session.id is null and exists (
      select 1 from public.sessions se where se.exam_id = v_exam.id and se.auth_uid = v_uid
    ) then
      -- One anonymous user writes one student's exam.
      v_error := 'already_joined';
    end if;
  end if;

  if v_error is null then
    if v_session.id is null then
      insert into public.sessions (exam_id, student_id, auth_uid, state, locale, device)
      values (v_exam.id, v_student.id, v_uid, 'joined', v_locale, v_device)
      on conflict (exam_id, student_id) do nothing
      returning * into v_session;
      if v_session.id is null then
        -- Another user joined this student at the same moment.
        v_error := 'already_joined';
      end if;
    else
      update public.sessions se
      set locale = v_locale, device = v_device
      where se.id = v_session.id
      returning * into v_session;
    end if;
  end if;

  insert into public.audit_log (workspace_id, actor_id, actor_kind, action, object_type, object_id, meta)
  values (v_workspace, v_uid, 'student', 'join_exam', 'exam', v_exam.id::text,
    jsonb_build_object('result', coalesce(v_error, 'ok'), 'code', left(v_code, 32)));

  if v_error is not null then
    perform set_config('response.status',
      case v_error when 'rate_limited' then '429' when 'already_joined' then '409' else '400' end, true);
    return jsonb_build_object('code', 'P0001', 'message', v_error, 'details', null, 'hint', null);
  end if;

  select st.full_name into v_proctor
  from public.proctor_assignments pa
  join public.staff st on st.id = pa.staff_id
  where pa.exam_id = v_exam.id
  order by
    (v_seat is not null and v_seat between coalesce(pa.seat_from, v_seat) and coalesce(pa.seat_to, v_seat)) desc,
    pa.is_lead desc,
    st.full_name
  limit 1;

  if public.exam_started(v_exam.id) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', q.id, 'position', eq.position, 'body', q.body, 'choices', q.choices
    ) order by eq.position), '[]'::jsonb)
    into v_questions
    from public.exam_questions eq
    join public.questions q on q.id = eq.question_id
    where eq.exam_id = v_exam.id;
  end if;

  return jsonb_build_object(
    'session', public.session_json(v_session),
    'exam', jsonb_build_object(
      'id', v_exam.id,
      'title', v_exam.title,
      'course', v_exam.course,
      'kind', v_exam.kind,
      'mode', v_exam.mode,
      'starts_at', v_exam.starts_at,
      'duration_min', v_exam.duration_min,
      'lobby_opens_at', v_exam.lobby_opens_at,
      'status', v_exam.status,
      'checks', v_exam.checks,
      'lms_url', v_exam.lms_url,
      'lms_done_path', v_exam.lms_done_path,
      'allowed_sites', to_jsonb(v_exam.allowed_sites)
    ),
    'student', jsonb_build_object(
      'id', v_student.id,
      'full_name', v_student.full_name,
      'student_number', v_student.student_number
    ),
    'proctor_name', v_proctor,
    'questions', v_questions,
    'server_time', clock_timestamp()
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- start_exam(exam_id): lead proctor or exam office, only before the scheduled start
-- ---------------------------------------------------------------------------
-- Raises not_found (also for a draft or cancelled exam), forbidden, already_started.
create or replace function public.start_exam(exam_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  v_uid uuid := auth.uid();
  v_exam public.exams;
  v_now timestamptz := now();
  v_commands int;
begin
  if v_uid is null or public.is_anonymous() then
    raise exception using message = 'forbidden', errcode = '42501';
  end if;

  select e.* into v_exam from public.exams e where e.id = start_exam.exam_id for update;
  if not found then
    raise exception using message = 'not_found', errcode = 'P0002';
  end if;

  if not (
    public.is_staff_of(v_exam.workspace_id)
    or exists (
      select 1 from public.proctor_assignments pa
      where pa.exam_id = v_exam.id and pa.staff_id = v_uid and pa.is_lead
    )
  ) then
    raise exception using message = 'forbidden', errcode = '42501';
  end if;

  if v_exam.status in ('draft', 'cancelled') then
    raise exception using message = 'not_found', errcode = 'P0002';
  end if;
  if v_exam.status <> 'scheduled' or v_now >= v_exam.starts_at then
    raise exception using message = 'already_started', errcode = 'P0001';
  end if;

  update public.exams e
  set starts_at = v_now, status = 'live', lobby_opens_at = least(e.lobby_opens_at, v_now)
  where e.id = v_exam.id;

  insert into public.session_commands (session_id, exam_id, type, payload, issued_by)
  select s.id, s.exam_id, 'start', '{}'::jsonb, v_uid
  from public.sessions s
  where s.exam_id = v_exam.id and s.state in ('rules', 'ready')
  order by s.joined_at;
  get diagnostics v_commands = row_count;

  insert into public.audit_log (workspace_id, actor_id, actor_kind, action, object_type, object_id, meta)
  values (v_exam.workspace_id, v_uid, 'staff', 'start_exam', 'exam', v_exam.id::text,
    jsonb_build_object('scheduled_starts_at', v_exam.starts_at, 'commands', v_commands));

  return jsonb_build_object('starts_at', v_now);
end;
$$;

-- ---------------------------------------------------------------------------
-- submit_session(session_id): the session owner hands in; idempotent
-- ---------------------------------------------------------------------------
-- time_up at or past session_ends_at, otherwise submitted; an ended or timed-up session keeps its
-- state. Sets submitted_at, time_used_s and receipt_id once, and writes exam.submitted or
-- exam.time_up (source server). Raises not_found or forbidden.
create or replace function public.submit_session(session_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  v_uid uuid := auth.uid();
  v_s public.sessions;
  v_exam public.exams;
  v_now timestamptz := now();
  v_end timestamptz;
  v_state public.session_state;
  v_start timestamptz;
  v_stop timestamptz;
  v_used int;
  v_receipt text;
begin
  select se.* into v_s from public.sessions se where se.id = submit_session.session_id for update;
  if not found then
    raise exception using message = 'not_found', errcode = 'P0002';
  end if;
  if v_uid is null or v_s.auth_uid <> v_uid then
    raise exception using message = 'forbidden', errcode = '42501';
  end if;

  if v_s.receipt_id is not null then
    return jsonb_build_object('receipt_id', v_s.receipt_id, 'time_used_s', v_s.time_used_s, 'state', v_s.state);
  end if;

  select e.* into v_exam from public.exams e where e.id = v_s.exam_id;
  v_end := public.session_ends_at(v_s);

  v_state := case
    when v_s.state in ('ended', 'time_up') then v_s.state
    when v_now >= v_end then 'time_up'::public.session_state
    else 'submitted'::public.session_state
  end;

  v_start := greatest(v_exam.starts_at, coalesce(v_s.started_at, v_exam.starts_at));
  v_stop := least(coalesce(v_s.ended_at, v_now), v_end);
  v_used := greatest(0, least(
    floor(extract(epoch from (v_stop - v_start)))::int - v_s.paused_s,
    (v_exam.duration_min + v_s.extra_min) * 60
  ));
  v_receipt := public.make_receipt_id(v_s.student_id);

  update public.sessions se
  set state = v_state,
      submitted_at = coalesce(se.submitted_at, v_now),
      time_used_s = v_used,
      receipt_id = v_receipt,
      pause_event_id = null
  where se.id = v_s.id;

  if v_state = 'submitted' then
    insert into public.events (id, session_id, exam_id, type, source, review, at, data)
    values (gen_random_uuid(), v_s.id, v_s.exam_id, 'exam.submitted', 'server', 'none', v_now,
      jsonb_build_object('time_used_s', v_used));
  elsif v_state = 'time_up' and v_s.state <> 'time_up' then
    insert into public.events (id, session_id, exam_id, type, source, review, at, data)
    values (gen_random_uuid(), v_s.id, v_s.exam_id, 'exam.time_up', 'server', 'none', v_now, '{}'::jsonb);
  end if;

  return jsonb_build_object('receipt_id', v_receipt, 'time_used_s', v_used, 'state', v_state);
end;
$$;

revoke execute on function public.receipt_initial(text) from public, anon, authenticated;
revoke execute on function public.make_receipt_id(uuid) from public, anon, authenticated;
revoke execute on function public.session_json(public.sessions) from public, anon, authenticated;
revoke execute on function public.join_exam(text, text, public.locale, jsonb) from public, anon;
revoke execute on function public.start_exam(uuid) from public, anon;
revoke execute on function public.submit_session(uuid) from public, anon;

grant execute on function public.receipt_initial(text) to service_role;
grant execute on function public.make_receipt_id(uuid) to service_role;
grant execute on function public.session_json(public.sessions) to service_role;
grant execute on function public.join_exam(text, text, public.locale, jsonb) to authenticated;
grant execute on function public.start_exam(uuid) to authenticated;
grant execute on function public.submit_session(uuid) to authenticated;
