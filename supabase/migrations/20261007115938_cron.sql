-- session_tick, every minute through pg_cron:
-- 1. scheduled exams become live at starts_at;
-- 2. sessions become time_up 2 minutes past session_ends_at (a paused session's end also moves by
--    the pause so far, as the resume would give it back), with an exam.time_up event (source server);
-- 3. live exams become to_review once the join window has closed and every session is final.
create extension if not exists pg_cron with schema pg_catalog;

-- Seconds the current pause would give back if it ended now.
create or replace function public.pending_pause_s(s public.sessions)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when e.type = 'proctor.paused' or e.data ->> 'reason' = 'proctor' then secs
      else least(secs, greatest(0, 300 - s.self_paused_s))
    end
    from public.events e
    cross join lateral (
      select greatest(0, floor(extract(epoch from (now() - e.received_at))))::int as secs
    ) x
    where s.state = 'paused' and e.id = s.pause_event_id
  ), 0)
$$;

create or replace function public.session_tick()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_live int := 0;
  v_time_up int := 0;
  v_review int := 0;
  r record;
begin
  update public.exams e
  set status = 'live'
  where e.status = 'scheduled' and e.starts_at <= now();
  get diagnostics v_live = row_count;

  for r in
    select s.id, s.exam_id
    from public.sessions s
    where s.state not in ('submitted', 'time_up', 'ended')
      and now() > public.session_ends_at(s)
        + make_interval(secs => public.pending_pause_s(s))
        + interval '2 minutes'
    for update of s skip locked
  loop
    update public.sessions se set state = 'time_up', pause_event_id = null where se.id = r.id;
    insert into public.events (id, session_id, exam_id, type, source, review, at, data)
    values (gen_random_uuid(), r.id, r.exam_id, 'exam.time_up', 'server', 'none', now(), '{}'::jsonb);
    v_time_up := v_time_up + 1;
  end loop;

  update public.exams e
  set status = 'to_review'
  where e.status = 'live'
    and now() >= e.starts_at + make_interval(mins => e.duration_min)
    and not exists (
      select 1 from public.sessions s
      where s.exam_id = e.id and s.state not in ('submitted', 'time_up', 'ended')
    );
  get diagnostics v_review = row_count;

  return jsonb_build_object('live', v_live, 'time_up', v_time_up, 'to_review', v_review);
end;
$$;

revoke execute on function public.pending_pause_s(public.sessions) from public, anon, authenticated;
revoke execute on function public.session_tick() from public, anon, authenticated;
grant execute on function public.pending_pause_s(public.sessions) to service_role;
grant execute on function public.session_tick() to service_role;

select cron.schedule('session_tick', '* * * * *', 'select public.session_tick()');
