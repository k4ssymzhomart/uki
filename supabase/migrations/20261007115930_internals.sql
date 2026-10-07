-- Internals the Edge Functions call: ingest_batch and confirm_frames (service role only, after the
-- function has checked the session owner), and issue_command (the caller's own JWT, so auth.uid() is
-- the staff member). See docs/phase-0-plan.md, "Endpoints", "Proctor commands" and "Session states".

-- Rank of the states before 2.1, for forward-only status steps.
create or replace function public.pre_exam_rank(p_state text)
returns int
language sql
immutable
set search_path = ''
as $$
  select case p_state
    when 'joined' then 0
    when 'checking' then 1
    when 'identity' then 2
    when 'rules' then 3
    when 'ready' then 4
    else null
  end
$$;

-- ---------------------------------------------------------------------------
-- ingest_batch(p_session_id, p_events, p_status)
-- ---------------------------------------------------------------------------
-- p_events: 0 to 50 envelopes [{id, type, source, review, seq, at, data, frame_count, app_version}],
-- `review` already set by the caller from the contracts REVIEW map. The function stores each with
-- `on conflict (id) do nothing`, flags the third and every later lock.fullscreen_exit of the session,
-- moves sessions.state forward from p_status.step (never out of writing, paused or a final state),
-- writes last_seen_at and status, and returns
-- {accepted: uuid[], duplicates: uuid[],
--  uploads: [{event_id, exam_id, session_id, frame_count, confirmed, missing: int[]}],
--  session: {state, ends_at, extra_min, paused_s}, server_time}
-- where uploads lists every flag event of this batch (new or duplicate) of this session with
-- frame_count > 0 whose stills are not all confirmed; `missing` are the still indexes to upload.
create or replace function public.ingest_batch(p_session_id uuid, p_events jsonb, p_status jsonb default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_s public.sessions;
  v_events jsonb := coalesce(p_events, '[]'::jsonb);
  v_ev jsonb;
  v_id uuid;
  v_type text;
  v_source public.event_source;
  v_review public.event_review;
  v_frames int;
  v_inserted uuid;
  v_fullscreen int;
  v_ids uuid[] := '{}';
  v_accepted uuid[] := '{}';
  v_duplicates uuid[] := '{}';
  v_step text;
  v_new_state public.session_state;
  v_uploads jsonb;
begin
  select se.* into v_s from public.sessions se where se.id = p_session_id for update;
  if not found then
    raise exception using message = 'not_found', errcode = 'P0002';
  end if;
  if jsonb_typeof(v_events) <> 'array' then
    raise exception using message = 'bad_request', detail = 'events must be an array', errcode = '22023';
  end if;
  if jsonb_array_length(v_events) > 50 then
    raise exception using message = 'bad_request', detail = 'at most 50 events', errcode = '22023';
  end if;
  if p_status is not null and jsonb_typeof(p_status) not in ('object', 'null') then
    raise exception using message = 'bad_request', detail = 'status must be an object', errcode = '22023';
  end if;

  for v_ev in select e.value from jsonb_array_elements(v_events) with ordinality as e(value, n) order by e.n loop
    v_id := (v_ev ->> 'id')::uuid;
    v_type := v_ev ->> 'type';
    v_source := coalesce(v_ev ->> 'source', 'app')::public.event_source;
    v_review := (v_ev ->> 'review')::public.event_review;
    v_frames := coalesce((v_ev ->> 'frame_count')::int, 0);

    if v_id is null or v_type is null or v_review is null or (v_ev ->> 'at') is null then
      raise exception using message = 'bad_request', detail = 'id, type, review and at are required', errcode = '22023';
    end if;
    if v_type like 'proctor.%' or v_source not in ('app', 'lock') then
      raise exception using message = 'bad_request', detail = 'clients send only app and lock events', errcode = '22023';
    end if;
    if v_frames < 0 or v_frames > 3 then
      raise exception using message = 'bad_request', detail = 'frame_count is 0 to 3', errcode = '22023';
    end if;

    if v_type = 'lock.fullscreen_exit'
      and not exists (select 1 from public.events e where e.id = v_id) then
      select count(*) + 1 into v_fullscreen
      from public.events e
      where e.session_id = p_session_id and e.type = 'lock.fullscreen_exit';
      if v_fullscreen >= 3 then
        v_review := 'flag';
      end if;
    end if;

    v_inserted := null;
    insert into public.events (id, session_id, exam_id, type, source, review, seq, at, data, frame_count, app_version)
    values (
      v_id, p_session_id, v_s.exam_id, v_type, v_source, v_review,
      (v_ev ->> 'seq')::int,
      (v_ev ->> 'at')::timestamptz,
      case when jsonb_typeof(v_ev -> 'data') = 'object' then v_ev -> 'data' else '{}'::jsonb end,
      v_frames,
      left(v_ev ->> 'app_version', 32)
    )
    on conflict (id) do nothing
    returning id into v_inserted;

    if v_inserted is null then
      v_duplicates := v_duplicates || v_id;
    else
      v_accepted := v_accepted || v_id;
    end if;
    v_ids := v_ids || v_id;
  end loop;

  -- The events trigger may have changed the state; read it again.
  select se.* into v_s from public.sessions se where se.id = p_session_id;

  v_step := p_status ->> 'step';
  if public.pre_exam_rank(v_step) is not null
    and public.pre_exam_rank(v_s.state::text) is not null
    and public.pre_exam_rank(v_step) > public.pre_exam_rank(v_s.state::text) then
    v_new_state := v_step::public.session_state;
  end if;

  update public.sessions se
  set state = coalesce(v_new_state, se.state),
      status = case when jsonb_typeof(p_status) = 'object' then p_status else se.status end,
      last_seen_at = now()
  where se.id = p_session_id
  returning * into v_s;

  select coalesce(jsonb_agg(jsonb_build_object(
    'event_id', e.id,
    'exam_id', e.exam_id,
    'session_id', e.session_id,
    'frame_count', e.frame_count,
    'confirmed', c.n,
    'missing', to_jsonb(m.missing)
  ) order by e.at, e.id), '[]'::jsonb)
  into v_uploads
  from public.events e
  cross join lateral (
    select count(*)::int as n from public.frames f where f.event_id = e.id
  ) c
  cross join lateral (
    select coalesce(array_agg(i order by i), '{}'::int[]) as missing
    from generate_series(0, e.frame_count - 1) as i
    where not exists (
      select 1 from public.frames f
      where f.event_id = e.id
        and f.storage_path = e.exam_id::text || '/' || e.session_id::text || '/' || e.id::text || '-' || i || '.jpg'
    )
  ) m
  where e.id = any (v_ids)
    and e.session_id = p_session_id
    and e.review = 'flag'
    and e.frame_count > 0
    and c.n < e.frame_count;

  return jsonb_build_object(
    'accepted', to_jsonb(v_accepted),
    'duplicates', to_jsonb(v_duplicates),
    'uploads', v_uploads,
    'session', jsonb_build_object(
      'state', v_s.state,
      'ends_at', public.session_ends_at(v_s),
      'extra_min', v_s.extra_min,
      'paused_s', v_s.paused_s
    ),
    'server_time', clock_timestamp()
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- confirm_frames(p_event_id, p_paths): frames rows for uploaded stills; idempotent per path
-- ---------------------------------------------------------------------------
-- Each path must be `<exam_id>/<session_id>/<event_id>-<index>.jpg` of this event with
-- index < frame_count (stillPath in packages/contracts/src/api.ts). captured_at is the event's `at`
-- plus 0, 1 or 2 seconds (THRESHOLDS.stills.offsetsMs). Returns one frame id per path, in order.
-- The Edge Function checks the caller owns the session and that each object exists in Storage.
create or replace function public.confirm_frames(p_event_id uuid, p_paths text[])
returns uuid[]
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_e public.events;
  v_path text;
  v_index int;
  v_id uuid;
  v_ids uuid[] := '{}';
  v_pattern text;
begin
  select e.* into v_e from public.events e where e.id = p_event_id;
  if not found then
    raise exception using message = 'not_found', errcode = 'P0002';
  end if;
  if p_paths is null or cardinality(p_paths) = 0 or cardinality(p_paths) > 3 then
    raise exception using message = 'bad_request', detail = '1 to 3 paths', errcode = '22023';
  end if;

  v_pattern := '^' || v_e.exam_id::text || '/' || v_e.session_id::text || '/' || v_e.id::text || '-([0-2])\.jpg$';
  foreach v_path in array p_paths loop
    v_index := (regexp_match(v_path, v_pattern))[1]::int;
    if v_index is null or v_index >= v_e.frame_count then
      raise exception using message = 'bad_request', detail = 'invalid still path', errcode = '22023';
    end if;

    v_id := null;
    insert into public.frames (id, event_id, session_id, exam_id, storage_path, captured_at)
    values (gen_random_uuid(), v_e.id, v_e.session_id, v_e.exam_id, v_path,
      v_e.at + make_interval(secs => (array[0, 1000, 2000])[v_index + 1] / 1000.0))
    on conflict (event_id, storage_path) do nothing
    returning id into v_id;

    if v_id is null then
      select f.id into v_id from public.frames f where f.event_id = v_e.id and f.storage_path = v_path;
    end if;
    v_ids := v_ids || v_id;
  end loop;
  return v_ids;
end;
$$;

-- ---------------------------------------------------------------------------
-- issue_command(p_session_id, p_exam_id, p_type, p_payload, p_scope)
-- ---------------------------------------------------------------------------
-- Called by the `command` Edge Function with the staff member's own JWT. The caller must be a
-- proctor of the exam or its exam office, and not anonymous. p_scope 'student' targets p_session_id;
-- 'group' targets every session of p_exam_id in rules, ready, writing or paused (message and add_time
-- only). Every parameter has a default so PostgREST callers pass only session_id or exam_id; a missing
-- p_type is bad_request. Payloads follow packages/contracts/src/commands.ts: pause {text?}, resume {}, end {reason},
-- message {preset|text, scope}, add_time {minutes, scope}. For each target it adds minutes to
-- extra_min (add_time), writes the proctor.* event (source proctor) and the session_commands row;
-- then one audit_log row. Returns the command ids. Raises forbidden, not_found, bad_request, conflict.
create or replace function public.issue_command(
  p_session_id uuid default null,
  p_exam_id uuid default null,
  p_type public.command_type default null,
  p_payload jsonb default '{}'::jsonb,
  p_scope text default null
)
returns uuid[]
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_scope text;
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_keys text[];
  v_exam public.exams;
  v_session public.sessions;
  v_targets uuid[];
  v_target uuid;
  v_ids uuid[] := '{}';
  v_command uuid;
  v_event_type text;
  v_review public.event_review;
  v_data jsonb;
  v_text text;
  v_minutes int;
begin
  if v_uid is null or public.is_anonymous()
    or not exists (select 1 from public.staff st where st.id = v_uid) then
    raise exception using message = 'forbidden', errcode = '42501';
  end if;

  v_scope := coalesce(p_scope, case when p_session_id is not null then 'student' else 'group' end);
  if v_scope not in ('student', 'group') then
    raise exception using message = 'bad_request', detail = 'scope is student or group', errcode = '22023';
  end if;
  if p_type is null or p_type = 'start' then
    raise exception using message = 'bad_request', detail = 'start comes only from start_exam', errcode = '22023';
  end if;

  if v_scope = 'student' then
    if p_session_id is null then
      raise exception using message = 'bad_request', detail = 'session_id is required', errcode = '22023';
    end if;
    select se.* into v_session from public.sessions se where se.id = p_session_id for update;
    if not found then
      raise exception using message = 'not_found', errcode = 'P0002';
    end if;
    if p_exam_id is not null and p_exam_id <> v_session.exam_id then
      raise exception using message = 'bad_request', detail = 'session is not in this exam', errcode = '22023';
    end if;
    select e.* into v_exam from public.exams e where e.id = v_session.exam_id;
  else
    if p_exam_id is null or p_session_id is not null then
      raise exception using message = 'bad_request', detail = 'a group command takes exam_id only', errcode = '22023';
    end if;
    select e.* into v_exam from public.exams e where e.id = p_exam_id;
    if not found then
      raise exception using message = 'not_found', errcode = 'P0002';
    end if;
  end if;

  if not (public.is_proctor_of(v_exam.id) or public.is_staff_of(v_exam.workspace_id)) then
    raise exception using message = 'forbidden', errcode = '42501';
  end if;

  -- Payload checks (the Edge Function has already parsed it with Zod; this keeps the database honest).
  if jsonb_typeof(v_payload) <> 'object' then
    raise exception using message = 'bad_request', detail = 'payload must be an object', errcode = '22023';
  end if;
  if p_type in ('message', 'add_time') and not v_payload ? 'scope' then
    v_payload := v_payload || jsonb_build_object('scope', v_scope);
  end if;
  v_keys := array(select k from jsonb_object_keys(v_payload) as k order by k);

  case p_type
    when 'pause' then
      if not v_keys <@ array['text'] then
        raise exception using message = 'bad_request', detail = 'pause takes {text?}', errcode = '22023';
      end if;
      if v_payload ? 'text' then
        v_text := btrim(v_payload ->> 'text');
        if jsonb_typeof(v_payload -> 'text') <> 'string' or char_length(v_text) not between 1 and 280 then
          raise exception using message = 'bad_request', detail = 'text is 1 to 280 characters', errcode = '22023';
        end if;
        v_payload := jsonb_build_object('text', v_text);
      end if;
    when 'resume' then
      if cardinality(v_keys) > 0 then
        raise exception using message = 'bad_request', detail = 'resume takes {}', errcode = '22023';
      end if;
    when 'end' then
      v_text := btrim(v_payload ->> 'reason');
      if v_keys <> array['reason'] or jsonb_typeof(v_payload -> 'reason') <> 'string'
        or char_length(v_text) not between 1 and 200 then
        raise exception using message = 'bad_request', detail = 'end takes {reason}, 1 to 200 characters', errcode = '22023';
      end if;
      v_payload := jsonb_build_object('reason', v_text);
    when 'message' then
      if v_payload ->> 'scope' is distinct from v_scope then
        raise exception using message = 'bad_request', detail = 'payload scope must match the target', errcode = '22023';
      end if;
      if v_keys = array['preset', 'scope'] then
        if v_payload ->> 'preset' not in (
          'message.preset.time_15', 'message.preset.phones_away',
          'message.preset.camera_view', 'message.preset.phone_away'
        ) then
          raise exception using message = 'bad_request', detail = 'unknown preset', errcode = '22023';
        end if;
      elsif v_keys = array['scope', 'text'] then
        v_text := btrim(v_payload ->> 'text');
        if jsonb_typeof(v_payload -> 'text') <> 'string' or char_length(v_text) not between 1 and 280 then
          raise exception using message = 'bad_request', detail = 'text is 1 to 280 characters', errcode = '22023';
        end if;
        v_payload := jsonb_build_object('text', v_text, 'scope', v_scope);
      else
        raise exception using message = 'bad_request', detail = 'message takes {preset, scope} or {text, scope}', errcode = '22023';
      end if;
    when 'add_time' then
      if v_payload ->> 'scope' is distinct from v_scope or v_keys <> array['minutes', 'scope']
        or jsonb_typeof(v_payload -> 'minutes') <> 'number' then
        raise exception using message = 'bad_request', detail = 'add_time takes {minutes 1 to 60, scope}', errcode = '22023';
      end if;
      if (v_payload ->> 'minutes')::numeric <> floor((v_payload ->> 'minutes')::numeric)
        or (v_payload ->> 'minutes')::numeric not between 1 and 60 then
        raise exception using message = 'bad_request', detail = 'add_time takes {minutes 1 to 60, scope}', errcode = '22023';
      end if;
      v_minutes := (v_payload ->> 'minutes')::int;
      v_payload := jsonb_build_object('minutes', v_minutes, 'scope', v_scope);
  end case;

  -- Targets.
  if v_scope = 'student' then
    if public.is_final_state(v_session.state)
      or (p_type = 'pause' and v_session.state <> 'writing')
      or (p_type = 'resume' and v_session.state <> 'paused') then
      raise exception using message = 'conflict', detail = 'the session is ' || v_session.state::text, errcode = 'P0001';
    end if;
    v_targets := array[v_session.id];
  else
    if p_type not in ('message', 'add_time') then
      raise exception using message = 'bad_request', detail = 'only message and add_time go to a group', errcode = '22023';
    end if;
    select coalesce(array_agg(se.id order by se.joined_at, se.id), '{}') into v_targets
    from public.sessions se
    where se.exam_id = v_exam.id and se.state in ('rules', 'ready', 'writing', 'paused');
  end if;

  v_event_type := case p_type
    when 'pause' then 'proctor.paused'
    when 'resume' then 'proctor.resumed'
    when 'end' then 'proctor.ended'
    when 'add_time' then 'proctor.time_added'
    when 'message' then 'proctor.message'
  end;
  -- The REVIEW map in packages/contracts/src/events.ts.
  v_review := case p_type when 'end' then 'flag'::public.event_review else 'log'::public.event_review end;
  v_data := case p_type
    when 'pause' then jsonb_build_object('staff_id', v_uid)
    when 'resume' then jsonb_build_object('staff_id', v_uid)
    when 'end' then jsonb_build_object('staff_id', v_uid, 'reason', v_payload ->> 'reason')
    else v_payload || jsonb_build_object('staff_id', v_uid)
  end;

  foreach v_target in array v_targets loop
    if p_type = 'add_time' then
      update public.sessions se set extra_min = se.extra_min + v_minutes where se.id = v_target;
    end if;

    insert into public.events (id, session_id, exam_id, type, source, review, at, data)
    values (gen_random_uuid(), v_target, v_exam.id, v_event_type, 'proctor', v_review, now(), v_data);

    insert into public.session_commands (session_id, exam_id, type, payload, issued_by)
    values (v_target, v_exam.id, p_type, v_payload, v_uid)
    returning id into v_command;
    v_ids := v_ids || v_command;
  end loop;

  insert into public.audit_log (workspace_id, actor_id, actor_kind, action, object_type, object_id, meta)
  values (
    v_exam.workspace_id, v_uid, 'staff', 'command.' || p_type::text,
    case when v_scope = 'student' then 'session' else 'exam' end,
    case when v_scope = 'student' then v_session.id::text else v_exam.id::text end,
    jsonb_build_object('scope', v_scope, 'payload', v_payload, 'commands', cardinality(v_ids))
  );

  return v_ids;
end;
$$;

revoke execute on function public.pre_exam_rank(text) from public, anon, authenticated;
revoke execute on function public.ingest_batch(uuid, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.confirm_frames(uuid, text[]) from public, anon, authenticated;
revoke execute on function public.issue_command(uuid, uuid, public.command_type, jsonb, text) from public, anon;

grant execute on function public.pre_exam_rank(text) to service_role;
grant execute on function public.ingest_batch(uuid, jsonb, jsonb) to service_role;
grant execute on function public.confirm_frames(uuid, text[]) to service_role;
grant execute on function public.issue_command(uuid, uuid, public.command_type, jsonb, text) to authenticated;
