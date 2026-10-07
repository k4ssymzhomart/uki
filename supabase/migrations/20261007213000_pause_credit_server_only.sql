-- Only the server's proctor.paused is a proctor pause ("Session states": a forged or replayed event
-- cannot add time; self pauses give back at most 300 s per session, proctor pauses all their time).
--
-- events_broadcast and pending_pause_s used to treat a session.paused whose data.reason was "proctor"
-- as a proctor pause. A client can send that event through ingest, so a student's own pause escaped
-- the 300 s cap: it moved session_ends_at by its whole length, and session_tick never sent the session
-- to time_up while it lasted. Both now decide from the pause event's type alone, which ingest_batch
-- never accepts from a client ('proctor.%' is refused). Reading the type alone also means a pause with
-- empty data counts as a self pause instead of skipping the cap.

-- ---------------------------------------------------------------------------
-- events_broadcast: as in 20261007115933_realtime_triggers.sql, but v_self looks at the type only
-- ---------------------------------------------------------------------------
-- exam.started            pre-exam state -> writing, started_at (server time)
-- session.paused,
-- proctor.paused          writing -> paused; remembers the pause event
-- session.resumed,
-- proctor.resumed         paused -> writing; adds the pause to paused_s: from the pause event's `at`
--                         to the resume event's `at`, capped by the gap between their received_at.
--                         Self pauses (session.paused, whatever its reason) give back at most 300 s
--                         per session in total; proctor pauses (proctor.paused) give back all.
-- proctor.ended           any non-final state -> ended, ended_at, end_reason
create or replace function public.events_broadcast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s public.sessions;
  v_pause public.events;
  v_credit int := 0;
  v_self boolean := false;
begin
  perform realtime.send(
    jsonb_build_object(
      'id', new.id,
      'session_id', new.session_id,
      'exam_id', new.exam_id,
      'type', new.type,
      'source', new.source,
      'review', new.review,
      'at', new.at,
      'received_at', new.received_at,
      'data', new.data,
      'frame_count', new.frame_count
    ),
    'event',
    'exam:' || new.exam_id::text,
    true
  );

  if new.type not in ('exam.started', 'session.paused', 'proctor.paused',
    'session.resumed', 'proctor.resumed', 'proctor.ended') then
    return null;
  end if;

  select se.* into v_s from public.sessions se where se.id = new.session_id for update;
  if not found or public.is_final_state(v_s.state) then
    return null;
  end if;

  if new.type = 'exam.started' then
    if public.pre_exam_rank(v_s.state::text) is not null then
      update public.sessions se
      set state = 'writing', started_at = coalesce(se.started_at, new.received_at)
      where se.id = v_s.id;
    end if;
  elsif new.type in ('session.paused', 'proctor.paused') then
    if v_s.state = 'writing' then
      update public.sessions se set state = 'paused', pause_event_id = new.id where se.id = v_s.id;
    end if;
  elsif new.type in ('session.resumed', 'proctor.resumed') then
    if v_s.state = 'paused' then
      select e.* into v_pause from public.events e where e.id = v_s.pause_event_id;
      if found then
        v_credit := greatest(0, floor(least(
          extract(epoch from (new.at - v_pause.at)),
          extract(epoch from (new.received_at - v_pause.received_at))
        )))::int;
        -- The type, never the client's data: only issue_command writes proctor.paused.
        v_self := v_pause.type <> 'proctor.paused';
        if v_self then
          v_credit := least(v_credit, greatest(0, 300 - v_s.self_paused_s));
        end if;
      end if;
      update public.sessions se
      set state = 'writing',
          pause_event_id = null,
          paused_s = se.paused_s + v_credit,
          self_paused_s = se.self_paused_s + case when v_self then v_credit else 0 end
      where se.id = v_s.id;
    end if;
  elsif new.type = 'proctor.ended' then
    update public.sessions se
    set state = 'ended',
        ended_at = new.received_at,
        end_reason = left(new.data ->> 'reason', 200),
        pause_event_id = null
    where se.id = v_s.id;
  end if;

  return null;
end;
$$;

revoke execute on function public.events_broadcast() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- pending_pause_s: seconds the current pause would give back if it ended now (session_tick moves
-- the end by it). A session.paused is a self pause whatever its reason, so it stays under the cap.
-- ---------------------------------------------------------------------------
create or replace function public.pending_pause_s(s public.sessions)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when e.type = 'proctor.paused' then secs
      else least(secs, greatest(0, 300 - s.self_paused_s))
    end
    from public.events e
    cross join lateral (
      select greatest(0, floor(extract(epoch from (now() - e.received_at))))::int as secs
    ) x
    where s.state = 'paused' and e.id = s.pause_event_id
  ), 0)
$$;

revoke execute on function public.pending_pause_s(public.sessions) from public, anon, authenticated;
grant execute on function public.pending_pause_s(public.sessions) to service_role;
