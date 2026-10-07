-- Triggers, Realtime Broadcast and the overview view.
-- Every realtime.send goes to a private channel: exam:{exam_id} (events, session tiles, frames) or
-- session:{session_id} (commands). Payloads follow packages/contracts/src/realtime.ts.

-- ---------------------------------------------------------------------------
-- events_broadcast: send the compact event, then apply the Session states table
-- ---------------------------------------------------------------------------
-- exam.started            pre-exam state -> writing, started_at (server time)
-- session.paused,
-- proctor.paused          writing -> paused; remembers the pause event
-- session.resumed,
-- proctor.resumed         paused -> writing; adds the pause to paused_s: from the pause event's `at`
--                         to the resume event's `at`, capped by the gap between their received_at.
--                         Self pauses give back at most 300 s per session in total; proctor pauses
--                         (proctor.paused, or session.paused with reason proctor) give back all.
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
        v_self := not (v_pause.type = 'proctor.paused' or v_pause.data ->> 'reason' = 'proctor');
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

create trigger events_broadcast
  after insert on public.events
  for each row execute function public.events_broadcast();

-- ---------------------------------------------------------------------------
-- commands_broadcast: the command, with by_name, to session:{session_id}
-- ---------------------------------------------------------------------------
create or replace function public.commands_broadcast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  select st.full_name into v_name from public.staff st where st.id = new.issued_by;
  perform realtime.send(
    jsonb_build_object(
      'id', new.id,
      'session_id', new.session_id,
      'exam_id', new.exam_id,
      'type', new.type,
      'payload', new.payload,
      'issued_at', new.issued_at,
      'by_name', coalesce(v_name, '')
    ),
    'command',
    'session:' || new.session_id::text,
    true
  );
  return null;
end;
$$;

create trigger commands_broadcast
  after insert on public.session_commands
  for each row execute function public.commands_broadcast();

-- ---------------------------------------------------------------------------
-- sessions_broadcast: the tile fields to exam:{exam_id}
-- ---------------------------------------------------------------------------
-- SessionTileMessage {id, exam_id, state, status, last_seen_at, extra_min, paused_s}, plus
-- student_id so the lobby can place a new session on its roster row. Sent after an update that
-- changed one of the five fields, and after an insert (a student joined).
create or replace function public.sessions_broadcast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'id', new.id,
      'exam_id', new.exam_id,
      'student_id', new.student_id,
      'state', new.state,
      'status', new.status,
      'last_seen_at', new.last_seen_at,
      'extra_min', new.extra_min,
      'paused_s', new.paused_s
    ),
    'session',
    'exam:' || new.exam_id::text,
    true
  );
  return null;
end;
$$;

create trigger sessions_broadcast
  after update of state, status, last_seen_at, extra_min, paused_s on public.sessions
  for each row
  when (old.state is distinct from new.state
    or old.status is distinct from new.status
    or old.last_seen_at is distinct from new.last_seen_at
    or old.extra_min is distinct from new.extra_min
    or old.paused_s is distinct from new.paused_s)
  execute function public.sessions_broadcast();

create trigger sessions_broadcast_insert
  after insert on public.sessions
  for each row execute function public.sessions_broadcast();

-- ---------------------------------------------------------------------------
-- frames_broadcast: a confirmed still to exam:{exam_id}
-- ---------------------------------------------------------------------------
create or replace function public.frames_broadcast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'event_id', new.event_id,
      'session_id', new.session_id,
      'frame_id', new.id,
      'captured_at', new.captured_at
    ),
    'frame',
    'exam:' || new.exam_id::text,
    true
  );
  return null;
end;
$$;

create trigger frames_broadcast
  after insert on public.frames
  for each row execute function public.frames_broadcast();

-- ---------------------------------------------------------------------------
-- answers_keep_latest: the row with the later saved_at wins; synced_at is the server's
-- ---------------------------------------------------------------------------
create or replace function public.answers_keep_latest()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.saved_at < old.saved_at then
    return null;
  end if;
  new.synced_at := now();
  return new;
end;
$$;

create trigger answers_keep_latest
  before update on public.answers
  for each row execute function public.answers_keep_latest();

revoke execute on function public.events_broadcast() from public, anon, authenticated;
revoke execute on function public.commands_broadcast() from public, anon, authenticated;
revoke execute on function public.sessions_broadcast() from public, anon, authenticated;
revoke execute on function public.frames_broadcast() from public, anon, authenticated;
revoke execute on function public.answers_keep_latest() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Realtime authorization: clients only listen
-- ---------------------------------------------------------------------------
-- exam:<id>     a proctor of the exam or the exam office of its workspace
-- session:<id>  the user that owns the session
create or replace function public.can_read_topic(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uuid constant text := '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
begin
  if p_topic is null then
    return false;
  elsif p_topic ~ ('^exam:' || v_uuid || '$') then
    return public.is_exam_staff(substr(p_topic, 6)::uuid);
  elsif p_topic ~ ('^session:' || v_uuid || '$') then
    return public.owns_session(substr(p_topic, 9)::uuid);
  end if;
  return false;
end;
$$;

revoke execute on function public.can_read_topic(text) from public, anon;
grant execute on function public.can_read_topic(text) to authenticated, service_role;

create policy uki_read_own_topics on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and public.can_read_topic((select realtime.topic()))
  );

-- ---------------------------------------------------------------------------
-- exam_overview: counts per exam for the overview (0.1), under the caller's RLS
-- ---------------------------------------------------------------------------
create view public.exam_overview
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
    where s.exam_id = e.id and s.state in ('submitted', 'time_up', 'ended'))::int as sessions_final
from public.exams e
left join public.faculties f on f.id = e.faculty_id;

grant select on public.exam_overview to authenticated, service_role;
