-- ingest writes last_seen_at on every call ("Session states" in docs/phase-0-plan.md); the wall shows
-- No signal after 30 s without a call, from last_seen_at, and its status line shows the time since the
-- last call.
--
-- 20261007210000_ingest_performance.sql wrote last_seen_at only when the stored value was 10 s old or
-- more, also for calls that carry events, so a laptop that dropped off right after such a call showed
-- No signal 20 to 30 s after its last call and the status line over-reported the silence by up to
-- 10 s. Now every call that stores events, moves a step or changes the status writes last_seen_at:
-- those calls already take the session row lock and write, so this adds one row update and one
-- `session` broadcast to them, not a transaction.
--
-- Only a quiet call (no events, the same status, no step forward) whose stored last_seen_at is under
-- 10 s old still writes nothing (the WAL saving of 20261007210000). The desktop app never makes one:
-- it calls with an empty batch only when 10 s have passed since its last reply (the heartbeat), and
-- then the stored value is 10 s old or more, so it is written. Only callers that heartbeat faster
-- (demo:simulate and the load script, 8 to 12 s apart) skip some writes, which keeps their stored
-- last_seen_at under 10 s behind the last call.
-- Otherwise as in 20261007210000_ingest_performance.sql.

create or replace function public.ingest_batch(
  p_session_id uuid,
  p_events jsonb,
  p_status jsonb default null,
  p_owner uuid default null
)
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
  v_status jsonb;
  v_quiet boolean;
  v_uploads jsonb;
  v_pending jsonb;
begin
  select se.* into v_s from public.sessions se where se.id = p_session_id;
  if not found then
    raise exception using message = 'not_found', errcode = 'P0002';
  end if;
  if p_owner is not null and v_s.auth_uid is distinct from p_owner then
    raise exception using message = 'forbidden', detail = 'only the session owner may call this', errcode = '42501';
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

  -- Quiet: no events, nothing to store, and the stored last_seen_at is under 10 s old.
  v_step := p_status ->> 'step';
  v_quiet := jsonb_array_length(v_events) = 0
    and (jsonb_typeof(p_status) is distinct from 'object' or p_status = v_s.status)
    and not coalesce(public.pre_exam_rank(v_step) > public.pre_exam_rank(v_s.state::text), false)
    and v_s.last_seen_at is not null
    and now() - v_s.last_seen_at < interval '10 seconds';

  if not v_quiet then
    -- Read again under the lock: the calls of one session store one at a time.
    select se.* into v_s from public.sessions se where se.id = p_session_id for no key update;

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
    if cardinality(v_accepted) > 0 then
      select se.* into v_s from public.sessions se where se.id = p_session_id;
    end if;

    if public.pre_exam_rank(v_step) is not null
      and public.pre_exam_rank(v_s.state::text) is not null
      and public.pre_exam_rank(v_step) > public.pre_exam_rank(v_s.state::text) then
      v_new_state := v_step::public.session_state;
    end if;
    v_status := case when jsonb_typeof(p_status) = 'object' then p_status else v_s.status end;

    -- Every call that is not quiet writes last_seen_at (broadcast by sessions_broadcast when it changed).
    update public.sessions se
    set state = coalesce(v_new_state, se.state),
        status = v_status,
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
  end if;

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
    'uploads', coalesce(v_uploads, '[]'::jsonb),
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

revoke execute on function public.ingest_batch(uuid, jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.ingest_batch(uuid, jsonb, jsonb, uuid) to service_role;
