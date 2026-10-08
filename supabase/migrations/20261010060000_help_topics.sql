-- WP 1.6 Ask proctor: the help topics of E.5a.
--
-- The plan's student.help_requested topics are identity, question and technical. E.5a's sheet (Figma
-- 152:11597, catalog lock.ask.reason.*) offers four reasons: Question is unclear, Technical problem,
-- I need a break and Something else. The app's Ask proctor on 2.1 to 2.3 shows the same sheet. The
-- topics gain `break` and `other` (HelpTopic in packages/contracts/src/events.ts), so 2.4d can show the
-- reason the student picked instead of filing two of them under technical (docs/decisions.md, 1.6).
--
-- help_from_event is replaced with the same body and the longer topic list. An unknown topic is still
-- stored as `technical`, so a bad payload never fails an ingest call; the text is still cut to 280.

create or replace function public.help_from_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_topic text := new.data ->> 'topic';
begin
  if v_topic is null or v_topic not in ('identity', 'question', 'technical', 'break', 'other') then
    v_topic := 'technical';
  end if;
  insert into public.help_requests (session_id, exam_id, event_id, topic, text, created_at)
  values (new.session_id, new.exam_id, new.id, v_topic,
    nullif(left(btrim(case when jsonb_typeof(new.data -> 'text') = 'string' then new.data ->> 'text' end), 280), ''),
    new.received_at)
  on conflict (event_id) do nothing
  returning id into v_id;
  if v_id is not null then
    perform public.help_broadcast(v_id);
  end if;
  return null;
end;
$$;

revoke execute on function public.help_from_event() from public, anon, authenticated;
