-- Follow-ups found while building the apps (docs/phase-0-plan.md, "Proctor commands", "Live wall" and
-- "Endpoints"; shapes in packages/contracts/src/{commands,api,events}.ts):
-- 1. session_commands.by_name: the issuing staff member's name, stored when the command is issued, so
--    the student reads it on a catch-up read (students cannot read staff rows).
-- 2. exam_question_count(exam_id) and exam_overview.question_count: exam staff see how many questions
--    an exam has (proctors cannot read exam_questions), for "Q 9 of 20" in the 2.5 drawer.
-- 3. session_commands.group_id and data.group_id on each proctor.* event of a group command, so the
--    wall's Live events feed shows each group command once.
-- 4. issue_command(..., p_request_id): a retried call with the same request id returns the first
--    call's command ids and writes nothing, so the `command` function can retry after a gateway 502.
-- 5. ingest_batch also returns the session's unacked commands (pending_commands, at most 20, oldest
--    first), so the app's ingest heartbeat delivers a command whose broadcast was lost.

-- ---------------------------------------------------------------------------
-- session_commands: by_name, group_id, request_id
-- ---------------------------------------------------------------------------
alter table public.session_commands
  add column by_name text,
  add column group_id uuid,
  add column request_id uuid;

update public.session_commands sc
set by_name = coalesce((select st.full_name from public.staff st where st.id = sc.issued_by), '')
where sc.by_name is null;

-- Every insert gets the issuer's name: issue_command passes it, start_exam leaves it to this trigger.
create or replace function public.session_commands_by_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.by_name is null or new.by_name = '' then
    select st.full_name into new.by_name from public.staff st where st.id = new.issued_by;
  end if;
  new.by_name := coalesce(new.by_name, '');
  return new;
end;
$$;

create trigger session_commands_by_name
  before insert on public.session_commands
  for each row execute function public.session_commands_by_name();

alter table public.session_commands alter column by_name set not null;
alter table public.session_commands alter column by_name set default '';

-- One command per session and request; issue_command looks retries up by request_id.
create unique index session_commands_request on public.session_commands (request_id, session_id)
  where request_id is not null;

revoke execute on function public.session_commands_by_name() from public, anon, authenticated;

-- The broadcast reads the stored name (the same value a catch-up read returns).
create or replace function public.commands_broadcast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'id', new.id,
      'session_id', new.session_id,
      'exam_id', new.exam_id,
      'type', new.type,
      'payload', new.payload,
      'issued_at', new.issued_at,
      'by_name', new.by_name
    ),
    'command',
    'session:' || new.session_id::text,
    true
  );
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- exam_question_count(exam_id): exam staff only, null for anyone else
-- ---------------------------------------------------------------------------
create or replace function public.exam_question_count(exam_id uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.is_exam_staff(exam_question_count.exam_id) then (
    select count(*)::int from public.exam_questions eq where eq.exam_id = exam_question_count.exam_id
  ) end
$$;

revoke execute on function public.exam_question_count(uuid) from public, anon;
grant execute on function public.exam_question_count(uuid) to authenticated, service_role;

-- exam_overview gains question_count (appended, so the existing columns keep their places).
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
  coalesce((
    select array_agg(g.code order by g.code)
    from public.exam_groups eg
    join public.groups g on g.id = eg.group_id
    where eg.exam_id = e.id
  ), '{}'::text[]) as groups,
  (select count(*) from public.proctor_assignments pa where pa.exam_id = e.id)::int as proctor_count,
  (select count(*) from public.exam_students es where es.exam_id = e.id)::int as roster_size,
  (select count(*) from public.sessions s where s.exam_id = e.id)::int as joined,
  (select count(*) from public.sessions s
    where s.exam_id = e.id and s.state in ('writing', 'paused'))::int as writing,
  (select count(*) from public.sessions s
    where s.exam_id = e.id and s.state = 'paused')::int as paused,
  (select count(*) from public.events ev
    where ev.exam_id = e.id and ev.review = 'flag')::int as flagged_events,
  (select count(*) from public.sessions s
    where s.exam_id = e.id and s.state in ('submitted', 'time_up', 'ended'))::int as sessions_final,
  public.exam_question_count(e.id) as question_count
from public.exams e
left join public.faculties f on f.id = e.faculty_id;

grant select on public.exam_overview to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- issue_command(p_session_id, p_exam_id, p_type, p_payload, p_scope, p_request_id)
-- ---------------------------------------------------------------------------
-- As in the internals migration, plus:
-- - p_request_id (optional): the caller's id for this call. A call whose request id already has
--   commands returns their ids, in the first call's order, and writes nothing; the same request id
--   from another staff member or for another type is a conflict. Calls with one request id run one at
--   a time (an advisory lock), so a retry that races the first call waits for it.
-- - by_name: the caller's full_name on every session_commands row.
-- - group scope: one group_id for the call, on every session_commands row and in the data of every
--   proctor.* event (data.group_id), and in the audit row.
drop function public.issue_command(uuid, uuid, public.command_type, jsonb, text);

create function public.issue_command(
  p_session_id uuid default null,
  p_exam_id uuid default null,
  p_type public.command_type default null,
  p_payload jsonb default '{}'::jsonb,
  p_scope text default null,
  p_request_id uuid default null
)
returns uuid[]
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
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
  v_group uuid;
  v_same boolean;
begin
  select st.full_name into v_name from public.staff st where st.id = v_uid;
  if v_uid is null or public.is_anonymous() or not found then
    raise exception using message = 'forbidden', errcode = '42501';
  end if;

  if p_request_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('issue_command:' || p_request_id::text, 0));
    select coalesce(array_agg(sc.id order by se.joined_at, se.id), '{}'),
           coalesce(bool_and(sc.issued_by = v_uid and sc.type is not distinct from p_type), true)
    into v_ids, v_same
    from public.session_commands sc
    join public.sessions se on se.id = sc.session_id
    where sc.request_id = p_request_id;
    if cardinality(v_ids) > 0 then
      if not v_same then
        raise exception using message = 'conflict', detail = 'request_id belongs to another command', errcode = 'P0001';
      end if;
      return v_ids;
    end if;
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
    v_group := gen_random_uuid();
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
  if v_group is not null then
    v_data := v_data || jsonb_build_object('group_id', v_group);
  end if;

  foreach v_target in array v_targets loop
    if p_type = 'add_time' then
      update public.sessions se set extra_min = se.extra_min + v_minutes where se.id = v_target;
    end if;

    insert into public.events (id, session_id, exam_id, type, source, review, at, data)
    values (gen_random_uuid(), v_target, v_exam.id, v_event_type, 'proctor', v_review, now(), v_data);

    insert into public.session_commands (session_id, exam_id, type, payload, issued_by, by_name, group_id, request_id)
    values (v_target, v_exam.id, p_type, v_payload, v_uid, v_name, v_group, p_request_id)
    returning id into v_command;
    v_ids := v_ids || v_command;
  end loop;

  insert into public.audit_log (workspace_id, actor_id, actor_kind, action, object_type, object_id, meta)
  values (
    v_exam.workspace_id, v_uid, 'staff', 'command.' || p_type::text,
    case when v_scope = 'student' then 'session' else 'exam' end,
    case when v_scope = 'student' then v_session.id::text else v_exam.id::text end,
    jsonb_strip_nulls(jsonb_build_object('scope', v_scope, 'payload', v_payload, 'commands', cardinality(v_ids),
      'group_id', v_group, 'request_id', p_request_id))
  );

  return v_ids;
end;
$$;

revoke execute on function public.issue_command(uuid, uuid, public.command_type, jsonb, text, uuid) from public, anon;
grant execute on function public.issue_command(uuid, uuid, public.command_type, jsonb, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- ingest_batch(p_session_id, p_events, p_status): also the session's unacked commands
-- ---------------------------------------------------------------------------
-- As in the internals migration; the result also carries
-- pending_commands: [{id, session_id, exam_id, type, payload, issued_at, by_name}], the session's
-- commands with no acked_at, oldest first, at most 20 (CommandBroadcast in commands.ts, the same shape
-- as the `command` broadcast). The app applies each once by id and acks it as for a broadcast.
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
  v_pending jsonb;
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

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'session_id', c.session_id,
    'exam_id', c.exam_id,
    'type', c.type,
    'payload', c.payload,
    'issued_at', c.issued_at,
    'by_name', c.by_name
  ) order by c.issued_at, c.id), '[]'::jsonb)
  into v_pending
  from (
    select sc.* from public.session_commands sc
    where sc.session_id = p_session_id and sc.acked_at is null
    order by sc.issued_at, sc.id
    limit 20
  ) c;

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
    'pending_commands', v_pending,
    'server_time', clock_timestamp()
  );
end;
$$;

revoke execute on function public.ingest_batch(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_batch(uuid, jsonb, jsonb) to service_role;
