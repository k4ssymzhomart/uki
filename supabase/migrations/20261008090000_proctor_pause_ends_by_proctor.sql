-- A proctor's pause ends only with the proctor's resume ("Session states": a forged or replayed event
-- cannot add time, and a student cannot end a proctor's pause).
--
-- events_broadcast moved any paused session back to writing on session.resumed. A client may send
-- session.resumed through ingest (only 'proctor.%' is refused), so a modified app could end a proctor
-- pause right after proctor.paused, keep writing, and get the pause credited. Now, while the open pause
-- (pause_event_id) is a proctor.paused, session.resumed changes neither the state nor paused_s: only
-- proctor.resumed, which only issue_command writes, ends it. The event is still stored and broadcast,
-- so the wall's timeline shows the attempt. Self pauses (session.paused) end as before, by either
-- session.resumed or proctor.resumed.

-- ---------------------------------------------------------------------------
-- events_broadcast: as in 20261007213000_pause_credit_server_only.sql, plus the proctor pause rule
-- ---------------------------------------------------------------------------
-- exam.started            pre-exam state -> writing, started_at (server time)
-- session.paused,
-- proctor.paused          writing -> paused; remembers the pause event
-- session.resumed,
-- proctor.resumed         paused -> writing; adds the pause to paused_s: from the pause event's `at`
--                         to the resume event's `at`, capped by the gap between their received_at.
--                         Self pauses (session.paused, whatever its reason) give back at most 300 s
--                         per session in total; proctor pauses (proctor.paused) give back all.
--                         A proctor pause ends only with proctor.resumed: session.resumed leaves it.
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
        -- The student's app cannot end a proctor's pause: the session stays paused, nothing is credited.
        if new.type = 'session.resumed' and v_pause.type = 'proctor.paused' then
          return null;
        end if;
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
