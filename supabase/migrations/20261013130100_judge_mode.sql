-- Judge mode (docs/runbooks/judge-mode.md; docs/decisions.md, "Judge mode"): judges open Üki from a link
-- and watch one exam, "Demo · Live" (code DEMO-LIVE), that never ends, with simulated students driven by
-- the judge simulator (apps/judge-sim) on a small Windows VPS. This migration adds:
--
--  1. The read-only staff role `observer` (enum value from 20261013130000_observer_role.sql). An observer
--     assigned to an exam through proctor_assignments reads exactly what an assigned proctor reads: every
--     read policy and RPC that admits a proctor (is_proctor_of, is_exam_staff) admits it. Every write it
--     could reach is refused by one statement-level trigger, observer_read_only, on every table in
--     public except the bookkeeping that reads themselves write (observer_unguarded_tables). So
--     issue_command (and the command function), start_exam, close_help_request, decide_session,
--     add_session_note, create_share, revoke_share, confirm_seats and the wizard RPCs all fail with
--     `forbidden` (detail `read_only`, SQLSTATE 42501) for an observer, and any RPC added later is
--     covered too. Reads still write their audit rows (audit_log is unguarded), get_report still makes
--     its reports row, and stills still sign their 5-minute URLs.
--  2. session_heartbeat(session_id): the session owner's "I am here", one PostgREST call that writes
--     last_seen_at with ingest's 10-second throttle, so a simulated student stays online on the wall
--     without an Edge Function call.
--  3. Demo · Live: demo_live_tick every minute through pg_cron keeps DEMO-LIVE live forever. With less
--     than 30 minutes left (or not live) it rolls the exam over: deletes the exam's sessions and what
--     hangs off them (events, frames rows, help requests, commands, answers, decisions, reports), sets
--     starts_at to now(), status live, 720 minutes and the lobby open, and asks the demo-live-purge Edge
--     Function to delete the stills from Storage through the Storage API (deleting storage.objects rows
--     in SQL would orphan the files). demo_live_orphans lists those stills: objects under the exam's
--     prefix whose session no longer exists, so a still of a current session is never touched.
--  4. demo_live_seen(exam_id), called by the DEMO-LIVE wall while it is open, and demo_live_status(),
--     which the simulator polls: how many staff watch the wall now (demo_live_views), so the simulator
--     plays at full cadence only while someone looks (the Realtime budget in the runbook).

-- ---------------------------------------------------------------------------
-- 1. The observer role
-- ---------------------------------------------------------------------------

-- True when the caller is a staff member with the observer role. The role is compared as text, which
-- keeps the function valid however the migrations are batched.
create or replace function public.is_observer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.staff s
    where s.id = (select auth.uid()) and s.role::text = 'observer'
  )
$$;

-- Tables an observer's reads write to, so they carry no guard: the audit log (every read of student
-- data writes a row), reports (get_report makes the report's row on first view), demo_live_views (the
-- open wall's marker), and the public forms' bookkeeping a signed-in judge may also use: pilot_requests
-- (Book a pilot) and verify_lookups (/verify's rate limit). Authenticated users have no direct write
-- grant on any of them; only security definer functions write them.
create or replace function public.observer_unguarded_tables()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['audit_log', 'demo_live_views', 'pilot_requests', 'reports', 'verify_lookups']::text[]
$$;

-- The guard: any insert, update or delete statement by an observer fails, before a row is touched, also
-- when it runs inside a security definer RPC (auth.uid() is still the caller there).
create or replace function public.refuse_observer_writes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_observer() then
    raise exception using message = 'forbidden', detail = 'read_only',
      hint = 'the observer role reads only', errcode = '42501';
  end if;
  return null;
end;
$$;

-- Puts the guard on one table. Migrations that add a table call it:
--   select public.guard_observer_writes('public.<table>');
-- (supabase/tests/24_judge_mode.test.sql fails while a table in public has neither the guard nor a place
-- in observer_unguarded_tables).
create or replace function public.guard_observer_writes(p_table regclass)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  execute format(
    'create or replace trigger observer_read_only before insert or update or delete on %s '
      'for each statement execute function public.refuse_observer_writes()',
    p_table
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. The open DEMO-LIVE wall
-- ---------------------------------------------------------------------------

-- One row per staff member who has the DEMO-LIVE wall open, refreshed by demo_live_seen every 30 s.
-- Only security definer functions read or write it.
create table if not exists public.demo_live_views (
  exam_id uuid not null references public.exams on delete cascade,
  staff_id uuid not null references public.staff on delete cascade,
  seen_at timestamptz not null default now(),
  constraint demo_live_views_pkey primary key (exam_id, staff_id)
);
alter table public.demo_live_views enable row level security;
revoke all on public.demo_live_views from public, anon, authenticated;
grant select, insert, update, delete on public.demo_live_views to service_role;

-- Every table in public except the unguarded ones gets the guard (demo_live_views included in the list).
do $$
declare
  r record;
begin
  for r in
    select c.oid::regclass as rel
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not c.relispartition
      and c.relname <> all (public.observer_unguarded_tables())
    order by c.relname
  loop
    perform public.guard_observer_writes(r.rel);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. session_heartbeat(session_id)
-- ---------------------------------------------------------------------------
-- The session owner only (the user join_exam bound it to): unauthorized without a user, not_found for an
-- unknown session (also one a rollover deleted, which tells the simulator to join again), forbidden for
-- anyone else, staff included. Writes last_seen_at when the stored one is 10 s old or more (as a quiet
-- ingest call would; sessions_broadcast sends the tile), and returns the session's state, last_seen_at,
-- ends_at and the server time.
create or replace function public.session_heartbeat(session_id uuid)
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
begin
  if v_uid is null then
    raise exception using message = 'unauthorized', errcode = '42501';
  end if;
  select se.* into v_s from public.sessions se where se.id = session_heartbeat.session_id;
  if not found then
    raise exception using message = 'not_found', errcode = 'P0002';
  end if;
  if v_s.auth_uid is distinct from v_uid then
    raise exception using message = 'forbidden', detail = 'only the session owner may call this', errcode = '42501';
  end if;
  if v_s.last_seen_at is null or now() - v_s.last_seen_at >= interval '10 seconds' then
    update public.sessions se
    set last_seen_at = now()
    where se.id = v_s.id
    returning * into v_s;
  end if;
  return jsonb_build_object(
    'state', v_s.state,
    'last_seen_at', v_s.last_seen_at,
    'ends_at', public.session_ends_at(v_s),
    'server_time', clock_timestamp()
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Demo · Live
-- ---------------------------------------------------------------------------

-- demo_live_seen(exam_id): the DEMO-LIVE wall says it is open (on load and every 30 s while visible).
-- Staff of that exam only (its proctors, its observer, its exam office); not_found for any other exam.
-- Writes at most one row update per staff member every 15 s. Returns the exam's timing, so an open wall
-- notices a rollover and reloads.
create or replace function public.demo_live_seen(exam_id uuid)
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
begin
  if v_uid is null or public.is_anonymous() then
    raise exception using message = 'forbidden', errcode = '42501';
  end if;
  select e.* into v_exam from public.exams e where e.id = demo_live_seen.exam_id;
  if not found or v_exam.code is distinct from 'DEMO-LIVE' then
    raise exception using message = 'not_found', errcode = 'P0002';
  end if;
  if not public.is_exam_staff(v_exam.id) then
    raise exception using message = 'forbidden', errcode = '42501';
  end if;
  -- The constraint by name: the parameter `exam_id` would shadow the column in a column list here.
  insert into public.demo_live_views as v (exam_id, staff_id, seen_at)
  values (v_exam.id, v_uid, now())
  on conflict on constraint demo_live_views_pkey do update
  set seen_at = excluded.seen_at
  where v.seen_at < excluded.seen_at - interval '15 seconds';
  return jsonb_build_object(
    'starts_at', v_exam.starts_at,
    'duration_min', v_exam.duration_min,
    'status', v_exam.status
  );
end;
$$;

-- demo_live_status(): what the simulator polls with a simulated student's token. DEMO-LIVE's id, status
-- and timing (null when there is no such exam) and how many staff had its wall open in the last 90 s.
-- Any signed-in user; it says nothing about students.
create or replace function public.demo_live_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'exam', (
      select jsonb_build_object(
        'id', e.id,
        'status', e.status,
        'starts_at', e.starts_at,
        'ends_at', e.starts_at + make_interval(mins => e.duration_min)
      )
      from public.exams e
      where e.code = 'DEMO-LIVE'
    ),
    'viewers', (
      select count(*)::int
      from public.demo_live_views v
      join public.exams e on e.id = v.exam_id
      where e.code = 'DEMO-LIVE' and v.seen_at > now() - interval '90 seconds'
    ),
    'server_time', now()
  )
$$;

-- Stills in the frames bucket under DEMO-LIVE's prefix (<exam_id>/<session_id>/<event_id>-<n>.jpg)
-- whose session no longer exists: what demo-live-purge deletes through the Storage API. A still of a
-- session that still exists is never listed, also one uploaded a moment ago and not yet confirmed.
-- Secret key only.
create or replace function public.demo_live_orphans(p_limit int default 1000)
returns table (storage_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name
  from storage.objects o
  join public.exams e on e.code = 'DEMO-LIVE'
  where o.bucket_id = 'frames'
    and o.name like e.id::text || '/%'
    and not exists (
      select 1 from public.sessions s
      where s.exam_id = e.id and s.id::text = split_part(o.name, '/', 2)
    )
  order by o.name
  limit greatest(1, least(coalesce(p_limit, 1000), 1000))
$$;

-- demo_live_tick(), every minute: nothing without DEMO-LIVE, nothing for a draft or a cancelled one
-- (cancelling it is the off switch), nothing while it is live with 30 minutes or more left. Otherwise
-- the rollover above, one audit row (demo_live.rollover, with the counts), and a purge request. Once an
-- hour it also asks for a purge when stills are left over (an upload that landed after a rollover), and
-- trims its own pg_cron history to a day.
create or replace function public.demo_live_tick()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_exam public.exams;
  v_left interval;
  v_counts jsonb;
  v_sessions int;
  v_events int;
  v_frames int;
  v_help int;
  v_commands int;
  v_answers int;
  v_decisions int;
  v_reports int;
  v_hourly boolean := extract(minute from now())::int = 17;
begin
  if v_hourly then
    begin
      delete from cron.job_run_details d
      where d.jobid in (select j.jobid from cron.job j where j.jobname = 'demo_live_tick')
        and d.end_time < now() - interval '1 day';
    exception when insufficient_privilege or undefined_table then
      null;
    end;
  end if;

  select e.id into v_id from public.exams e where e.code = 'DEMO-LIVE';
  if v_id is null then
    return jsonb_build_object('exam', null, 'rolled', false);
  end if;
  select e.* into v_exam from public.exams e where e.id = v_id for update skip locked;
  if not found then
    return jsonb_build_object('exam', v_id, 'rolled', false, 'reason', 'locked');
  end if;
  if v_exam.status in ('draft', 'cancelled') then
    return jsonb_build_object('exam', v_id, 'rolled', false, 'reason', v_exam.status);
  end if;

  v_left := v_exam.starts_at + make_interval(mins => v_exam.duration_min) - now();
  if v_exam.status = 'live' and v_exam.starts_at <= now() and v_left >= interval '30 minutes' then
    if v_hourly and exists (select 1 from public.demo_live_orphans(1)) then
      perform public.call_edge_function('demo-live-purge');
    end if;
    return jsonb_build_object('exam', v_id, 'rolled', false, 'left_s', floor(extract(epoch from v_left))::int);
  end if;

  -- The rollover. Children first; every one of them would also go with its session (on delete cascade),
  -- but each delete is counted for the audit row.
  delete from public.reports r where r.exam_id = v_id;
  get diagnostics v_reports = row_count;
  delete from public.review_decisions d where d.exam_id = v_id;
  get diagnostics v_decisions = row_count;
  delete from public.help_requests h where h.exam_id = v_id;
  get diagnostics v_help = row_count;
  delete from public.session_commands c where c.exam_id = v_id;
  get diagnostics v_commands = row_count;
  delete from public.frames f where f.exam_id = v_id;
  get diagnostics v_frames = row_count;
  delete from public.events ev where ev.exam_id = v_id;
  get diagnostics v_events = row_count;
  delete from public.answers a using public.sessions s where a.session_id = s.id and s.exam_id = v_id;
  get diagnostics v_answers = row_count;
  delete from public.sessions s where s.exam_id = v_id;
  get diagnostics v_sessions = row_count;

  update public.exams e
  set starts_at = now(), status = 'live', duration_min = 720, lobby_opens_at = now()
  where e.id = v_id;

  v_counts := jsonb_build_object('sessions', v_sessions, 'events', v_events, 'frames', v_frames,
    'help_requests', v_help, 'commands', v_commands, 'answers', v_answers, 'decisions', v_decisions,
    'reports', v_reports, 'previous_starts_at', v_exam.starts_at, 'previous_status', v_exam.status);
  insert into public.audit_log (workspace_id, actor_id, actor_kind, action, object_type, object_id, meta)
  values (v_exam.workspace_id, null, 'service', 'demo_live.rollover', 'exam', v_id::text, v_counts);

  -- Harmless without the Vault secrets (local stacks, CI): call_edge_function then sends nothing.
  perform public.call_edge_function('demo-live-purge');

  return jsonb_build_object('exam', v_id, 'rolled', true, 'counts', v_counts);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke execute on function public.is_observer() from public, anon;
revoke execute on function public.observer_unguarded_tables() from public, anon;
revoke execute on function public.refuse_observer_writes() from public, anon, authenticated;
revoke execute on function public.guard_observer_writes(regclass) from public, anon, authenticated, service_role;
revoke execute on function public.session_heartbeat(uuid) from public, anon;
revoke execute on function public.demo_live_seen(uuid) from public, anon;
revoke execute on function public.demo_live_status() from public, anon;
revoke execute on function public.demo_live_orphans(int) from public, anon, authenticated;
revoke execute on function public.demo_live_tick() from public, anon, authenticated;

grant execute on function public.is_observer() to authenticated, service_role;
grant execute on function public.observer_unguarded_tables() to authenticated, service_role;
grant execute on function public.session_heartbeat(uuid) to authenticated;
grant execute on function public.demo_live_seen(uuid) to authenticated;
grant execute on function public.demo_live_status() to authenticated;
grant execute on function public.demo_live_orphans(int) to service_role;
grant execute on function public.demo_live_tick() to service_role;

-- Every minute. cron.schedule replaces a job of the same name, so a second run changes nothing.
select cron.schedule('demo_live_tick', '* * * * *', 'select public.demo_live_tick()');
