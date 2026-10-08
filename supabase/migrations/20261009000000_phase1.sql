-- Phase 1 schema (docs/phase-1-plan.md: Data model, Database functions and triggers, Row-level
-- security, API and realtime, Additions to the data model). Shapes are in packages/contracts:
-- wizard.ts, review.ts, privacy.ts, exam-code.ts, browser-rules.ts, events.ts (proctor.note),
-- realtime.ts (`help`) and lock.ts.
--
--  1. Enums and the column additions on workspaces, exams, proctor_assignments, students, sessions
--  2. Validation helpers used by constraints and the RPCs
--  3. The seven new tables, their grants and row-level security; settings writes on workspaces
--  4. Exam wizard: save_exam_draft, import_roster, assign_proctors, schedule_exam (exam code rule),
--     confirm_seats
--  5. Help requests: help_from_event (trigger, `help` broadcast), close_help_request
--  6. Review: decide_session, add_session_note, review_queue
--  7. Reports: get_report (verify code, content hash), create_share, verify_report, open_shared_report
--  8. Views: term_kpis, term_weekly_flags, term_flag_types, term_decisions, term_review_time,
--     student_overview
--  9. Privacy: the private `exports` bucket, the retention selection, audit triggers, audit_read
-- 10. Pilot requests: request_pilot and its pg_net call to pilot-notify
-- 11. retention_nightly (pg_cron, 22:00 UTC) through pg_net with the key from Vault
-- 12. join_exam returns the browser rules; ingest_batch stamps rules_accepted_at and rules_locale
--
-- Errors follow Phase 0: `raise exception using message = '<code>'` with errcode 42501 (forbidden),
-- P0002 (not_found), 22023 (bad_request) or P0001 (conflicts and the named wizard errors), so
-- supabase-js reports `error.message === '<code>'` (matchErrorCode in packages/contracts/src/api.ts).

create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. Enums and columns
-- ---------------------------------------------------------------------------

create type public.review_decision as enum ('no_issue', 'talk', 'committee');
create type public.data_request_kind as enum ('delete', 'copy');
create type public.data_request_status as enum ('received', 'done', 'replied');
create type public.invite_state as enum ('pending', 'sent', 'failed', 'bounced');

alter table public.workspaces add column settings jsonb not null default
  '{"retention_days":90,"lobby_minutes":20,"default_duration_min":90,
    "default_checks":{"gaze_s":2,"phone_score":0.85,"face_missing_s":10,"identity":true,"lock":true}}';
alter table public.exams
  add column room text,
  add column rules_locale public.locale,
  add column scheduled_at timestamptz,
  add column browser_rules jsonb not null default
    '{"copy_paste":true,"print":true,"full_screen":true,"calculator":true,
      "other_extensions":"phase2","devtools":"managed_only","screen_share":"detected"}';
alter table public.proctor_assignments add column change_request text;
alter table public.students add column programme text, add column year int;
alter table public.sessions add column rules_accepted_at timestamptz, add column rules_locale public.locale;

alter table public.proctor_assignments
  add constraint proctor_assignments_change_request_length check (char_length(change_request) <= 500);
alter table public.students
  add constraint students_year_range check (year between 1 and 10),
  add constraint students_programme_length check (char_length(programme) <= 120);
alter table public.exams
  add constraint exams_room_length check (char_length(room) <= 60);

-- ---------------------------------------------------------------------------
-- 2. Validation helpers
-- ---------------------------------------------------------------------------

-- A uuid from text, or null when the text is not one.
create or replace function public.try_uuid(p text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p::uuid
  end
$$;

-- A JSON number within [p_min, p_max]; p_int also asks for a whole number.
create or replace function public.json_number_between(p jsonb, p_min numeric, p_max numeric, p_int boolean default false)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(p) is distinct from 'number' then false
    else (p #>> '{}')::numeric between p_min and p_max
      and (not p_int or (p #>> '{}')::numeric = floor((p #>> '{}')::numeric))
  end
$$;

-- `exams.checks` (ExamChecks in packages/contracts/src/checks.ts): known keys only, each in range.
create or replace function public.valid_checks(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(p) is distinct from 'object' then false
    else not exists (
        select 1 from jsonb_object_keys(p) as k
        where k not in ('gaze_s', 'phone_score', 'face_missing_s', 'identity', 'lock')
      )
      and (not p ? 'gaze_s' or (public.json_number_between(p -> 'gaze_s', 0, 60) and (p ->> 'gaze_s')::numeric > 0))
      and (not p ? 'phone_score' or public.json_number_between(p -> 'phone_score', 0, 1))
      and (not p ? 'face_missing_s'
        or (public.json_number_between(p -> 'face_missing_s', 0, 600) and (p ->> 'face_missing_s')::numeric > 0))
      and (not p ? 'identity' or jsonb_typeof(p -> 'identity') = 'boolean')
      and (not p ? 'lock' or jsonb_typeof(p -> 'lock') = 'boolean')
  end
$$;

-- `exams.browser_rules` (BrowserRules in packages/contracts/src/browser-rules.ts): the seven keys,
-- four switches and the three rows E.1 fixes ("phase2", "managed_only", "detected").
create or replace function public.valid_browser_rules(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(p) is distinct from 'object' then false
    else (select count(*) from jsonb_object_keys(p)) = 7
      and jsonb_typeof(p -> 'copy_paste') = 'boolean'
      and jsonb_typeof(p -> 'print') = 'boolean'
      and jsonb_typeof(p -> 'full_screen') = 'boolean'
      and jsonb_typeof(p -> 'calculator') = 'boolean'
      and p -> 'other_extensions' = '"phase2"'::jsonb
      and p -> 'devtools' = '"managed_only"'::jsonb
      and p -> 'screen_share' = '"detected"'::jsonb
  end
$$;

-- `workspaces.settings` (WorkspaceSettings in packages/contracts/src/wizard.ts).
create or replace function public.valid_settings(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(p) is distinct from 'object' then false
    else (select count(*) from jsonb_object_keys(p)) = 4
      and public.json_number_between(p -> 'retention_days', 1, 3650, true)
      and public.json_number_between(p -> 'lobby_minutes', 0, 240, true)
      and public.json_number_between(p -> 'default_duration_min', 5, 600, true)
      and public.valid_checks(p -> 'default_checks')
  end
$$;

alter table public.workspaces add constraint workspaces_settings_valid check (public.valid_settings(settings));
alter table public.exams add constraint exams_browser_rules_valid check (public.valid_browser_rules(browser_rules));

-- Exam office or admin of any workspace, never anonymous: reads pilot requests.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not public.is_anonymous() and exists (
    select 1 from public.staff s where s.id = (select auth.uid()) and s.role = 'admin'
  )
$$;

-- One audit row; actor is the caller (null for the secret key and for share links).
create or replace function public.write_audit(p_workspace uuid, p_actor_kind text, p_action text,
  p_object_type text, p_object_id text, p_meta jsonb default '{}'::jsonb)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.audit_log (workspace_id, actor_id, actor_kind, action, object_type, object_id, meta)
  values (p_workspace, case when p_actor_kind = 'share' then null else auth.uid() end, p_actor_kind, p_action,
    p_object_type, p_object_id, coalesce(p_meta, '{}'::jsonb))
$$;

-- ---------------------------------------------------------------------------
-- 3. Tables, grants and row-level security
-- ---------------------------------------------------------------------------
-- As in the plan's DDL, plus: help_requests, review_decisions and reports go with their session
-- (and help_requests with its event), so demo:reset, demo:simulate --cleanup and the data-request
-- delete never trip over them; reports.issued_at is when the current verify code was made; and
-- pilot_requests keeps the three extra fields Book a pilot (194:4014) asks for.

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams on delete cascade,
  student_id uuid not null references public.students,
  email text not null,
  locale public.locale not null,
  state public.invite_state not null default 'pending',
  provider_id text,
  error text,
  sent_at timestamptz,
  unique (exam_id, student_id)
);
create index invites_student on public.invites (student_id);

create table public.help_requests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions on delete cascade,
  exam_id uuid not null references public.exams,
  event_id uuid unique references public.events on delete cascade,
  topic text not null,
  text text,
  created_at timestamptz not null default now(),
  reply text,
  done_at timestamptz,
  done_by uuid references public.staff
);
create index help_requests_open on public.help_requests (exam_id, created_at) where done_at is null;
create index help_requests_session on public.help_requests (session_id);

create table public.review_decisions (
  session_id uuid primary key references public.sessions on delete cascade,
  exam_id uuid not null references public.exams,
  decision public.review_decision not null,
  note text,
  reviewer_id uuid not null references public.staff,
  decided_at timestamptz not null default now()
);
create index review_decisions_exam on public.review_decisions (exam_id);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  session_id uuid unique not null references public.sessions on delete cascade,
  exam_id uuid not null references public.exams,
  verify_code text unique not null,
  content_hash text not null,
  created_by uuid not null references public.staff,
  created_at timestamptz not null default now(),
  issued_at timestamptz not null default now()
);
create index reports_exam on public.reports (exam_id);

create table public.report_shares (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports on delete cascade,
  token_hash text unique not null,
  expires_at timestamptz not null,
  created_by uuid not null references public.staff,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index report_shares_report on public.report_shares (report_id);

create table public.data_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces,
  student_id uuid not null references public.students,
  kind public.data_request_kind not null,
  status public.data_request_status not null default 'received',
  received_at timestamptz not null default now(),
  due_at timestamptz not null default now() + interval '30 days',
  reply text,
  export_path text,
  done_by uuid references public.staff,
  done_at timestamptz
);
create index data_requests_workspace on public.data_requests (workspace_id, received_at desc);
create index data_requests_student on public.data_requests (student_id);

create table public.pilot_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  university text not null,
  role text,
  message text,
  exam_size text,
  pilot_month text,
  demo_invite boolean not null default false,
  created_at timestamptz not null default now()
);
create index pilot_requests_email on public.pilot_requests (lower(email), created_at desc);

-- New tables get no default privileges for the API roles on this project; grant what each needs.
revoke all on public.invites, public.help_requests, public.review_decisions, public.reports,
  public.report_shares, public.data_requests, public.pilot_requests from anon, authenticated;
grant select, insert, update, delete on public.invites, public.help_requests, public.review_decisions,
  public.reports, public.report_shares, public.data_requests, public.pilot_requests to service_role;
grant select on public.invites, public.help_requests, public.review_decisions, public.reports,
  public.report_shares, public.data_requests, public.pilot_requests to authenticated;
-- The exam office edits invites (0.3b fixes an address) and enters data requests (A.5). Every other
-- write goes through the security-definer functions below, which also write the audit rows.
grant insert, update, delete on public.invites to authenticated;
grant insert, update on public.data_requests to authenticated;
-- A.4 saves settings through PostgREST.
grant update (settings) on public.workspaces to authenticated;

alter table public.invites enable row level security;
alter table public.help_requests enable row level security;
alter table public.review_decisions enable row level security;
alter table public.reports enable row level security;
alter table public.report_shares enable row level security;
alter table public.data_requests enable row level security;
alter table public.pilot_requests enable row level security;

-- workspaces.settings: the exam office of the workspace (the column grant allows only settings).
create policy workspaces_update_office on public.workspaces
  for update to authenticated
  using (public.is_staff_of(id))
  with check (public.is_staff_of(id));

-- invites: the exam office reads and writes; the exam's proctors read.
create policy invites_select_office on public.invites
  for select to authenticated using (public.is_office_of_exam(exam_id));
create policy invites_select_proctor on public.invites
  for select to authenticated using (public.is_proctor_of(exam_id));
create policy invites_insert_office on public.invites
  for insert to authenticated
  with check (public.is_office_of_exam(exam_id) and exists (
    select 1 from public.exam_students es where es.exam_id = invites.exam_id and es.student_id = invites.student_id
  ));
create policy invites_update_office on public.invites
  for update to authenticated
  using (public.is_office_of_exam(exam_id))
  with check (public.is_office_of_exam(exam_id));
create policy invites_delete_office on public.invites
  for delete to authenticated using (public.is_office_of_exam(exam_id));

-- help_requests: rows come only from help_from_event; proctors close them with close_help_request.
create policy help_requests_select_office on public.help_requests
  for select to authenticated using (public.is_office_of_exam(exam_id));
create policy help_requests_select_proctor on public.help_requests
  for select to authenticated using (public.is_proctor_of(exam_id));

-- review_decisions, reports, report_shares: exam staff read; writes through decide_session,
-- get_report and create_share. A share link reads through the shared-report function only.
create policy review_decisions_select_office on public.review_decisions
  for select to authenticated using (public.is_office_of_exam(exam_id));
create policy review_decisions_select_proctor on public.review_decisions
  for select to authenticated using (public.is_proctor_of(exam_id));
create policy reports_select_office on public.reports
  for select to authenticated using (public.is_office_of_exam(exam_id));
create policy reports_select_proctor on public.reports
  for select to authenticated using (public.is_proctor_of(exam_id));
create policy report_shares_select_staff on public.report_shares
  for select to authenticated
  using (exists (
    select 1 from public.reports r where r.id = report_shares.report_id and public.is_exam_staff(r.exam_id)
  ));

-- data_requests: the exam office of the workspace, for a student of that workspace.
create policy data_requests_select_office on public.data_requests
  for select to authenticated using (public.is_staff_of(workspace_id));
create policy data_requests_insert_office on public.data_requests
  for insert to authenticated
  with check (public.is_staff_of(workspace_id) and exists (
    select 1 from public.students st where st.id = data_requests.student_id and st.workspace_id = data_requests.workspace_id
  ));
create policy data_requests_update_office on public.data_requests
  for update to authenticated
  using (public.is_staff_of(workspace_id))
  with check (public.is_staff_of(workspace_id));

-- pilot_requests: admins read; anonymous visitors insert only through request_pilot.
create policy pilot_requests_select_admin on public.pilot_requests
  for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 4. Exam wizard
-- ---------------------------------------------------------------------------

-- Latin capitals for an exam code: Kazakh and Russian Cyrillic and common Latin accents become
-- ASCII. The same map is EXAM_CODE_LATIN in packages/contracts/src/exam-code.ts.
create or replace function public.exam_code_latin(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(string_agg(coalesce(m.map ->> t.c, t.c), '' order by t.n), '')
  from regexp_split_to_table(upper(coalesce(p, '')), '') with ordinality as t(c, n)
  cross join (select '{"А":"A","Ә":"A","Б":"B","В":"V","Г":"G","Ғ":"G","Д":"D","Е":"E","Ё":"E","Ж":"ZH",
    "З":"Z","И":"I","Й":"Y","І":"I","К":"K","Қ":"Q","Л":"L","М":"M","Н":"N","Ң":"N","О":"O","Ө":"O",
    "П":"P","Р":"R","С":"S","Т":"T","У":"U","Ұ":"U","Ү":"U","Ф":"F","Х":"KH","Һ":"H","Ц":"TS","Ч":"CH",
    "Ш":"SH","Щ":"SHCH","Ъ":"","Ы":"Y","Ь":"","Э":"E","Ю":"YU","Я":"YA","Ä":"A","Á":"A","À":"A","Â":"A",
    "Ç":"C","É":"E","È":"E","Ê":"E","Ë":"E","Ğ":"G","Í":"I","Ì":"I","Î":"I","Ï":"I","İ":"I","Ñ":"N",
    "Ó":"O","Ò":"O","Ô":"O","Ö":"O","Ş":"S","Ú":"U","Ù":"U","Û":"U","Ü":"U","Ū":"U"}'::jsonb as map) m
$$;

-- The exam code before a clash digit, like MATH2-204-FRI (buildExamCode in exam-code.ts):
-- course: the first word's first four letters, its trailing digits, then every later word that holds
-- a digit, at most 10 characters ("Mathematics 2" is MATH2, "English B2" is ENGLB2); group: the
-- first group code, at most 8; day: the weekday of the start in the workspace's time zone.
create or replace function public.exam_code_base(p_course text, p_group text, p_starts_at timestamptz, p_tz text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_words text[];
  v_first text;
  v_head text;
  v_group text;
  i int;
begin
  v_words := array(
    select w from regexp_split_to_table(public.exam_code_latin(p_course), '[^A-Z0-9]+') as w where w <> ''
  );
  if cardinality(v_words) = 0 then
    v_head := 'EXAM';
  else
    v_first := v_words[1];
    v_head := left(regexp_replace(v_first, '[0-9]', '', 'g'), 4) || coalesce(substring(v_first from '[0-9]+$'), '');
    if v_head = '' then
      v_head := v_first;
    end if;
    for i in 2 .. cardinality(v_words) loop
      if v_words[i] ~ '[0-9]' then
        v_head := v_head || v_words[i];
      end if;
    end loop;
    v_head := left(v_head, 10);
  end if;
  v_group := left(regexp_replace(public.exam_code_latin(p_group), '[^A-Z0-9]', '', 'g'), 8);
  return array_to_string(
    array_remove(array[v_head, nullif(v_group, ''), to_char(p_starts_at at time zone p_tz, 'DY')], null), '-');
end;
$$;

-- An exam as the wizard reads it: every column plus group_ids (ExamDraft in wizard.ts).
create or replace function public.exam_draft_json(p_exam_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(e) || jsonb_build_object('group_ids', coalesce((
    select jsonb_agg(eg.group_id order by g.code)
    from public.exam_groups eg join public.groups g on g.id = eg.group_id
    where eg.exam_id = e.id
  ), '[]'::jsonb))
  from public.exams e
  where e.id = p_exam_id
$$;

-- save_exam_draft(exam): creates a draft (no `id`) or updates one (with `id`) from any wizard step.
-- Exam office only. A new draft starts tomorrow at 09:00 in the workspace's time zone with the
-- workspace's default duration and checks; empty title, course and kind until step 1 fills them.
-- `checks` and `browser_rules` merge into the stored values; `group_ids` replaces the exam's groups.
-- lobby_opens_at follows starts_at by `lobby_minutes`. Raises forbidden, not_found, bad_request
-- (detail names the field) and not_draft.
create or replace function public.save_exam_draft(exam jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_in jsonb := save_exam_draft.exam;
  v_bad text;
  v_staff public.staff;
  v_ws public.workspaces;
  v_e public.exams;
  v_id uuid;
  v_start timestamptz;
  v_text text;
  v_json jsonb;
  v_groups uuid[];
  v_lobby int;
begin
  if v_uid is null or public.is_anonymous() then
    raise exception using message = 'forbidden', errcode = '42501';
  end if;
  if jsonb_typeof(v_in) is distinct from 'object' then
    raise exception using message = 'bad_request', detail = 'exam must be an object', errcode = '22023';
  end if;
  select k into v_bad from jsonb_object_keys(v_in) as k
  where k not in ('id', 'faculty_id', 'title', 'course', 'kind', 'mode', 'starts_at', 'duration_min', 'room',
    'rules_locale', 'checks', 'browser_rules', 'lms_url', 'lms_done_path', 'allowed_sites', 'group_ids')
  limit 1;
  if v_bad is not null then
    raise exception using message = 'bad_request', detail = 'unknown field ' || v_bad, errcode = '22023';
  end if;

  if jsonb_typeof(v_in -> 'id') = 'string' then
    v_id := public.try_uuid(v_in ->> 'id');
    if v_id is null then
      raise exception using message = 'bad_request', detail = 'id', errcode = '22023';
    end if;
    select e.* into v_e from public.exams e where e.id = v_id for update;
    if not found then
      raise exception using message = 'not_found', errcode = 'P0002';
    end if;
    if not public.is_staff_of(v_e.workspace_id) then
      raise exception using message = 'forbidden', errcode = '42501';
    end if;
    if v_e.status <> 'draft' then
      raise exception using message = 'not_draft', errcode = 'P0001';
    end if;
    select w.* into v_ws from public.workspaces w where w.id = v_e.workspace_id;
  else
    select st.* into v_staff from public.staff st where st.id = v_uid and st.role in ('exam_office', 'admin');
    if not found then
      raise exception using message = 'forbidden', errcode = '42501';
    end if;
    select w.* into v_ws from public.workspaces w where w.id = v_staff.workspace_id;
    v_start := ((now() at time zone v_ws.timezone)::date + 1 + time '09:00') at time zone v_ws.timezone;
    insert into public.exams (workspace_id, faculty_id, title, course, kind, mode, starts_at, duration_min,
      lobby_opens_at, status, checks, created_by)
    values (v_ws.id, v_staff.faculty_id, '', '', '', 'app', v_start,
      (v_ws.settings ->> 'default_duration_min')::int,
      v_start - make_interval(mins => (v_ws.settings ->> 'lobby_minutes')::int),
      'draft', v_ws.settings -> 'default_checks', v_uid)
    returning * into v_e;
    perform public.write_audit(v_ws.id, 'staff', 'exam.draft_created', 'exam', v_e.id::text);
  end if;

  -- Text fields: a string (trimmed) or null; title, course and kind store '' for null.
  if v_in ? 'title' then
    v_text := btrim(v_in ->> 'title');
    if jsonb_typeof(v_in -> 'title') not in ('string', 'null') or char_length(v_text) > 200 then
      raise exception using message = 'bad_request', detail = 'title', errcode = '22023';
    end if;
    v_e.title := coalesce(v_text, '');
  end if;
  if v_in ? 'course' then
    v_text := btrim(v_in ->> 'course');
    if jsonb_typeof(v_in -> 'course') not in ('string', 'null') or char_length(v_text) > 120 then
      raise exception using message = 'bad_request', detail = 'course', errcode = '22023';
    end if;
    v_e.course := coalesce(v_text, '');
  end if;
  if v_in ? 'kind' then
    v_text := btrim(v_in ->> 'kind');
    if jsonb_typeof(v_in -> 'kind') not in ('string', 'null') or char_length(v_text) > 60 then
      raise exception using message = 'bad_request', detail = 'kind', errcode = '22023';
    end if;
    v_e.kind := coalesce(v_text, '');
  end if;
  if v_in ? 'room' then
    v_text := nullif(btrim(v_in ->> 'room'), '');
    if jsonb_typeof(v_in -> 'room') not in ('string', 'null') or char_length(v_text) > 60 then
      raise exception using message = 'bad_request', detail = 'room', errcode = '22023';
    end if;
    v_e.room := v_text;
  end if;
  if v_in ? 'mode' then
    if v_in ->> 'mode' is null or v_in ->> 'mode' not in ('app', 'browser') then
      raise exception using message = 'bad_request', detail = 'mode', errcode = '22023';
    end if;
    v_e.mode := (v_in ->> 'mode')::public.exam_mode;
  end if;
  if v_in ? 'rules_locale' then
    if jsonb_typeof(v_in -> 'rules_locale') <> 'null' and v_in ->> 'rules_locale' not in ('kk', 'ru', 'en') then
      raise exception using message = 'bad_request', detail = 'rules_locale', errcode = '22023';
    end if;
    v_e.rules_locale := (v_in ->> 'rules_locale')::public.locale;
  end if;
  if v_in ? 'faculty_id' then
    if jsonb_typeof(v_in -> 'faculty_id') = 'null' then
      v_e.faculty_id := null;
    else
      v_id := public.try_uuid(v_in ->> 'faculty_id');
      if v_id is null or not exists (
        select 1 from public.faculties f where f.id = v_id and f.workspace_id = v_e.workspace_id
      ) then
        raise exception using message = 'bad_request', detail = 'faculty_id', errcode = '22023';
      end if;
      v_e.faculty_id := v_id;
    end if;
  end if;
  if v_in ? 'starts_at' then
    begin
      v_start := (v_in ->> 'starts_at')::timestamptz;
    exception when others then
      v_start := null;
    end;
    if jsonb_typeof(v_in -> 'starts_at') <> 'string' or v_start is null then
      raise exception using message = 'bad_request', detail = 'starts_at', errcode = '22023';
    end if;
    v_e.starts_at := v_start;
  end if;
  if v_in ? 'duration_min' then
    if not public.json_number_between(v_in -> 'duration_min', 5, 600, true) then
      raise exception using message = 'bad_request', detail = 'duration_min', errcode = '22023';
    end if;
    v_e.duration_min := (v_in ->> 'duration_min')::int;
  end if;
  if v_in ? 'checks' then
    v_json := v_e.checks || coalesce(v_in -> 'checks', '{}'::jsonb);
    if jsonb_typeof(v_in -> 'checks') <> 'object' or not public.valid_checks(v_json) then
      raise exception using message = 'bad_request', detail = 'checks', errcode = '22023';
    end if;
    v_e.checks := v_json;
  end if;
  if v_in ? 'browser_rules' then
    v_json := v_e.browser_rules || coalesce(v_in -> 'browser_rules', '{}'::jsonb);
    if jsonb_typeof(v_in -> 'browser_rules') <> 'object' or not public.valid_browser_rules(v_json) then
      raise exception using message = 'bad_request', detail = 'browser_rules', errcode = '22023';
    end if;
    v_e.browser_rules := v_json;
  end if;
  if v_in ? 'lms_url' then
    v_text := nullif(btrim(v_in ->> 'lms_url'), '');
    if jsonb_typeof(v_in -> 'lms_url') not in ('string', 'null') or char_length(v_text) > 2048
      or v_text !~ '^https?://[^[:space:]]+$' then
      raise exception using message = 'bad_request', detail = 'lms_url', errcode = '22023';
    end if;
    v_e.lms_url := v_text;
  end if;
  if v_in ? 'lms_done_path' then
    v_text := nullif(btrim(v_in ->> 'lms_done_path'), '');
    if jsonb_typeof(v_in -> 'lms_done_path') not in ('string', 'null') or char_length(v_text) > 512
      or v_text !~ '^/[^[:space:]]*$' then
      raise exception using message = 'bad_request', detail = 'lms_done_path', errcode = '22023';
    end if;
    v_e.lms_done_path := v_text;
  end if;
  if v_in ? 'allowed_sites' then
    if jsonb_typeof(v_in -> 'allowed_sites') <> 'array' or jsonb_array_length(v_in -> 'allowed_sites') > 20
      or exists (
        select 1 from jsonb_array_elements(v_in -> 'allowed_sites') as s
        where jsonb_typeof(s) <> 'string' or char_length(s #>> '{}') > 260
          or (s #>> '{}') !~* '^(\[[0-9a-f:.]+\]|[a-z0-9_-]+(\.[a-z0-9_-]+)*\.?)(:[0-9]{1,5})?$'
      ) then
      raise exception using message = 'bad_request', detail = 'allowed_sites', errcode = '22023';
    end if;
    v_e.allowed_sites := array(select lower(s) from jsonb_array_elements_text(v_in -> 'allowed_sites') as s);
  end if;
  if v_in ? 'group_ids' then
    if jsonb_typeof(v_in -> 'group_ids') <> 'array' or jsonb_array_length(v_in -> 'group_ids') > 50 then
      raise exception using message = 'bad_request', detail = 'group_ids', errcode = '22023';
    end if;
    v_groups := array(
      select distinct public.try_uuid(g) from jsonb_array_elements_text(v_in -> 'group_ids') as g
    );
    if exists (select 1 from unnest(v_groups) as g(id) where g.id is null or not exists (
      select 1 from public.groups gr where gr.id = g.id and gr.workspace_id = v_e.workspace_id
    )) then
      raise exception using message = 'bad_request', detail = 'group_ids', errcode = '22023';
    end if;
    delete from public.exam_groups eg where eg.exam_id = v_e.id and eg.group_id <> all (v_groups);
    insert into public.exam_groups (exam_id, group_id)
    select v_e.id, g from unnest(v_groups) as g
    on conflict do nothing;
  end if;

  v_lobby := (v_ws.settings ->> 'lobby_minutes')::int;
  update public.exams e
  set faculty_id = v_e.faculty_id, title = v_e.title, course = v_e.course, kind = v_e.kind, mode = v_e.mode,
      starts_at = v_e.starts_at, duration_min = v_e.duration_min,
      lobby_opens_at = v_e.starts_at - make_interval(mins => v_lobby),
      room = v_e.room, rules_locale = v_e.rules_locale, checks = v_e.checks, browser_rules = v_e.browser_rules,
      lms_url = v_e.lms_url, lms_done_path = v_e.lms_done_path, allowed_sites = v_e.allowed_sites
  where e.id = v_e.id;

  return public.exam_draft_json(v_e.id);
end;
$$;

-- import_roster(exam_id, rows): the roster from 0.3, already checked in the browser with RosterRow.
-- Each row {student_number, full_name, email, group, locale} is checked again (8 digits, a name, an
-- address with @, a group code of the workspace, kk/ru/en, no number twice); the first bad row raises
-- bad_request with detail 'row <n>: <field>' and nothing is written. Then, in one transaction:
-- students upserted by (workspace_id, student_number); exam_students set to exactly the file, seats in
-- file order (rows left out of the file are removed with their invites); one `invites` row per student,
-- back to `pending` when the address changed. Draft or scheduled exams only. Returns
-- {inserted, updated, seats, removed}: new and existing students, the roster size, and removed rows.
create or replace function public.import_roster(exam_id uuid, rows jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_e public.exams;
  v_row jsonb;
  v_n bigint;
  v_number text;
  v_name text;
  v_email text;
  v_group uuid;
  v_locale text;
  v_numbers text[] := '{}';
  v_names text[] := '{}';
  v_emails text[] := '{}';
  v_groups uuid[] := '{}';
  v_locales public.locale[] := '{}';
  v_ids uuid[];
  v_inserted int;
  v_updated int;
  v_removed int;
begin
  if v_uid is null or public.is_anonymous() then
    raise exception using message = 'forbidden', errcode = '42501';
  end if;
  select e.* into v_e from public.exams e where e.id = import_roster.exam_id for update;
  if not found then
    raise exception using message = 'not_found', errcode = 'P0002';
  end if;
  if not public.is_staff_of(v_e.workspace_id) then
    raise exception using message = 'forbidden', errcode = '42501';
  end if;
  if v_e.status not in ('draft', 'scheduled') then
    raise exception using message = 'not_editable', errcode = 'P0001';
  end if;
  if jsonb_typeof(import_roster.rows) is distinct from 'array'
    or jsonb_array_length(import_roster.rows) not between 1 and 2000 then
    raise exception using message = 'bad_request', detail = 'rows must hold 1 to 2000 rows', errcode = '22023';
  end if;

  for v_row, v_n in
    select r.value, r.n from jsonb_array_elements(import_roster.rows) with ordinality as r(value, n) order by r.n
  loop
    if jsonb_typeof(v_row) <> 'object' then
      raise exception using message = 'bad_request', detail = format('row %s: not an object', v_n), errcode = '22023';
    end if;
    v_number := btrim(v_row ->> 'student_number');
    v_name := btrim(v_row ->> 'full_name');
    v_email := lower(btrim(v_row ->> 'email'));
    v_locale := lower(btrim(v_row ->> 'locale'));
    if v_number is null or v_number !~ '^[0-9]{8}$' then
      raise exception using message = 'bad_request', detail = format('row %s: student_number', v_n), errcode = '22023';
    end if;
    if v_number = any (v_numbers) then
      raise exception using message = 'bad_request', detail = format('row %s: duplicate', v_n), errcode = '22023';
    end if;
    if v_name is null or v_name = '' or char_length(v_name) > 200 then
      raise exception using message = 'bad_request', detail = format('row %s: full_name', v_n), errcode = '22023';
    end if;
    if v_email is null or char_length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
      raise exception using message = 'bad_request', detail = format('row %s: email', v_n), errcode = '22023';
    end if;
    v_group := null;
    select g.id into v_group from public.groups g
    where g.workspace_id = v_e.workspace_id and upper(g.code) = upper(btrim(v_row ->> 'group'));
    if v_group is null then
      raise exception using message = 'bad_request', detail = format('row %s: group', v_n), errcode = '22023';
    end if;
    if v_locale is null or v_locale not in ('kk', 'ru', 'en') then
      raise exception using message = 'bad_request', detail = format('row %s: locale', v_n), errcode = '22023';
    end if;
    v_numbers := v_numbers || v_number;
    v_names := v_names || v_name;
    v_emails := v_emails || v_email;
    v_groups := v_groups || v_group;
    v_locales := v_locales || v_locale::public.locale;
  end loop;

  with input as (
    select * from unnest(v_numbers, v_names, v_emails, v_groups, v_locales)
      as u(student_number, full_name, email, group_id, locale)
  ), up as (
    insert into public.students as st (workspace_id, student_number, full_name, email, group_id, locale)
    select v_e.workspace_id, i.student_number, i.full_name, i.email, i.group_id, i.locale from input i
    on conflict (workspace_id, student_number) do update
      set full_name = excluded.full_name, email = excluded.email, group_id = excluded.group_id,
          locale = excluded.locale
    returning st.id, (xmax = 0) as is_new
  )
  select count(*) filter (where up.is_new), count(*) filter (where not up.is_new), array_agg(up.id)
  into v_inserted, v_updated, v_ids
  from up;

  delete from public.invites iv
  where iv.exam_id = v_e.id and iv.student_id <> all (v_ids);
  delete from public.exam_students es
  where es.exam_id = v_e.id and es.student_id <> all (v_ids);
  get diagnostics v_removed = row_count;

  insert into public.exam_students as es (exam_id, student_id, seat, invite_status)
  select v_e.id, st.id, u.seat, 'pending'
  from unnest(v_numbers) with ordinality as u(student_number, seat)
  join public.students st on st.workspace_id = v_e.workspace_id and st.student_number = u.student_number
  on conflict (exam_id, student_id) do update set seat = excluded.seat;

  insert into public.invites as iv (exam_id, student_id, email, locale)
  select v_e.id, st.id, st.email, st.locale
  from public.students st
  where st.id = any (v_ids)
  on conflict (exam_id, student_id) do update
    set email = excluded.email,
        locale = excluded.locale,
        state = case when iv.email is distinct from excluded.email then 'pending'::public.invite_state else iv.state end,
        provider_id = case when iv.email is distinct from excluded.email then null else iv.provider_id end,
        error = case when iv.email is distinct from excluded.email then null else iv.error end,
        sent_at = case when iv.email is distinct from excluded.email then null else iv.sent_at end;

  perform public.write_audit(v_e.workspace_id, 'staff', 'roster.import', 'exam', v_e.id::text,
    jsonb_build_object('inserted', v_inserted, 'updated', v_updated, 'seats', cardinality(v_ids), 'removed', v_removed));

  return jsonb_build_object('inserted', v_inserted, 'updated', v_updated, 'seats', cardinality(v_ids),
    'removed', v_removed);
end;
$$;

-- One proctor assignment as 0.3, 0.5 and 0.9 read it (ProctorAssignment in wizard.ts).
create or replace function public.assignment_json(p_exam_id uuid, p_staff_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'exam_id', pa.exam_id,
    'staff_id', pa.staff_id,
    'full_name', st.full_name,
    'seat_from', pa.seat_from,
    'seat_to', pa.seat_to,
    'languages', to_jsonb(pa.languages),
    'is_lead', pa.is_lead,
    'confirmed_at', pa.confirmed_at,
    'change_request', pa.change_request
  )
  from public.proctor_assignments pa
  join public.staff st on st.id = pa.staff_id
  where pa.exam_id = p_exam_id and pa.staff_id = p_staff_id
$$;

-- assign_proctors(exam_id, rows): the proctors table on 0.3. Each row {staff_id, seat_from, seat_to,
-- languages, is_lead?}; the table replaces the exam's assignments. Ranges start at seat 1 and follow
-- each other with no gap and no overlap; the error names them (`gap` or `overlap`, detail the seats).
-- At most one lead; with none, the range from seat 1 leads. A changed range clears confirmed_at and
-- change_request. Draft or scheduled exams only. Returns the assignments in seat order.
create or replace function public.assign_proctors(exam_id uuid, rows jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_e public.exams;
  r record;
  v_prev_to int;
  v_leads int;
  v_staff uuid[];
begin
  if v_uid is null or public.is_anonymous() then
    raise exception using message = 'forbidden', errcode = '42501';
  end if;
  select e.* into v_e from public.exams e where e.id = assign_proctors.exam_id for update;
  if not found then
    raise exception using message = 'not_found', errcode = 'P0002';
  end if;
  if not public.is_staff_of(v_e.workspace_id) then
    raise exception using message = 'forbidden', errcode = '42501';
  end if;
  if v_e.status not in ('draft', 'scheduled') then
    raise exception using message = 'not_editable', errcode = 'P0001';
  end if;
  if jsonb_typeof(assign_proctors.rows) is distinct from 'array' or jsonb_array_length(assign_proctors.rows) > 50 then
    raise exception using message = 'bad_request', detail = 'rows must hold 0 to 50 rows', errcode = '22023';
  end if;

  create temporary table if not exists pg_temp.uki_assign (
    n int, staff_id uuid, seat_from int, seat_to int, languages public.locale[], is_lead boolean
  ) on commit drop;
  delete from pg_temp.uki_assign;

  for r in
    select x.value as v, x.n from jsonb_array_elements(assign_proctors.rows) with ordinality as x(value, n)
  loop
    if jsonb_typeof(r.v) <> 'object'
      or public.try_uuid(r.v ->> 'staff_id') is null
      or not public.json_number_between(r.v -> 'seat_from', 1, 100000, true)
      or not public.json_number_between(r.v -> 'seat_to', 1, 100000, true)
      or (r.v ->> 'seat_to')::int < (r.v ->> 'seat_from')::int
      or jsonb_typeof(r.v -> 'languages') <> 'array'
      or jsonb_array_length(r.v -> 'languages') not between 1 and 3
      or exists (select 1 from jsonb_array_elements_text(r.v -> 'languages') as l where l not in ('kk', 'ru', 'en'))
      or (r.v ? 'is_lead' and jsonb_typeof(r.v -> 'is_lead') <> 'boolean') then
      raise exception using message = 'bad_request', detail = format('row %s', r.n), errcode = '22023';
    end if;
    if not exists (
      select 1 from public.staff st
      where st.id = (r.v ->> 'staff_id')::uuid and st.workspace_id = v_e.workspace_id
    ) then
      raise exception using message = 'bad_request', detail = format('row %s: staff_id', r.n), errcode = '22023';
    end if;
    insert into pg_temp.uki_assign values (r.n, (r.v ->> 'staff_id')::uuid, (r.v ->> 'seat_from')::int,
      (r.v ->> 'seat_to')::int,
      array(select distinct l::public.locale from jsonb_array_elements_text(r.v -> 'languages') as l),
      coalesce((r.v ->> 'is_lead')::boolean, false));
  end loop;

  if exists (select 1 from pg_temp.uki_assign a group by a.staff_id having count(*) > 1) then
    raise exception using message = 'bad_request', detail = 'a proctor appears twice', errcode = '22023';
  end if;
  select count(*) filter (where a.is_lead) into v_leads from pg_temp.uki_assign a;
  if v_leads > 1 then
    raise exception using message = 'bad_request', detail = 'one lead at most', errcode = '22023';
  end if;

  v_prev_to := 0;
  for r in select a.* from pg_temp.uki_assign a order by a.seat_from, a.seat_to loop
    if r.seat_from <= v_prev_to then
      raise exception using message = 'overlap', detail = format('seats %s to %s', r.seat_from, v_prev_to),
        errcode = 'P0001';
    elsif r.seat_from > v_prev_to + 1 then
      raise exception using message = 'gap', detail = format('seats %s to %s', v_prev_to + 1, r.seat_from - 1),
        errcode = 'P0001';
    end if;
    v_prev_to := r.seat_to;
  end loop;
  if v_leads = 0 then
    update pg_temp.uki_assign a set is_lead = true where a.seat_from = 1;
  end if;

  v_staff := array(select a.staff_id from pg_temp.uki_assign a);
  delete from public.proctor_assignments pa
  where pa.exam_id = v_e.id and pa.staff_id <> all (v_staff);
  insert into public.proctor_assignments as pa (exam_id, staff_id, seat_from, seat_to, languages, is_lead)
  select v_e.id, a.staff_id, a.seat_from, a.seat_to, a.languages, a.is_lead from pg_temp.uki_assign a
  on conflict (exam_id, staff_id) do update
    set seat_from = excluded.seat_from,
        seat_to = excluded.seat_to,
        languages = excluded.languages,
        is_lead = excluded.is_lead,
        confirmed_at = case
          when (pa.seat_from, pa.seat_to) is distinct from (excluded.seat_from, excluded.seat_to) then null
          else pa.confirmed_at end,
        change_request = case
          when (pa.seat_from, pa.seat_to) is distinct from (excluded.seat_from, excluded.seat_to) then null
          else pa.change_request end;

  perform public.write_audit(v_e.workspace_id, 'staff', 'proctors.assign', 'exam', v_e.id::text,
    jsonb_build_object('proctors', cardinality(v_staff)));

  return coalesce((
    select jsonb_agg(public.assignment_json(pa.exam_id, pa.staff_id) order by pa.seat_from)
    from public.proctor_assignments pa where pa.exam_id = v_e.id
  ), '[]'::jsonb);
end;
$$;

-- schedule_exam(exam_id): 0.5's Schedule exam. Exam office only, draft exams only (a scheduled exam
-- returns its code again). Checks every step and raises the first problem as the message, with its
-- step in detail (SCHEDULE_PROBLEMS in wizard.ts): details (title_missing, course_missing,
-- kind_missing, duration_invalid, starts_in_past, groups_missing), checks (checks_invalid), browser
-- for browser exams (lms_url_missing, lms_url_invalid, browser_rules_invalid), roster (roster_empty,
-- proctors_missing, seats_uncovered). Then makes the code (exam_code_base plus 2, 3, ... on a clash),
-- sets lobby_opens_at from lobby_minutes, scheduled_at and status `scheduled`. Returns
-- {code, starts_at, lobby_opens_at, status}.
create or replace function public.schedule_exam(exam_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_e public.exams;
  v_ws public.workspaces;
  v_group text;
  v_base text;
  v_code text;
  v_try int := 1;
begin
  if v_uid is null or public.is_anonymous() then
    raise exception using message = 'forbidden', errcode = '42501';
  end if;
  select e.* into v_e from public.exams e where e.id = schedule_exam.exam_id for update;
  if not found then
    raise exception using message = 'not_found', errcode = 'P0002';
  end if;
  if not public.is_staff_of(v_e.workspace_id) then
    raise exception using message = 'forbidden', errcode = '42501';
  end if;
  if v_e.status = 'scheduled' and v_e.code is not null then
    return jsonb_build_object('code', v_e.code, 'starts_at', v_e.starts_at, 'lobby_opens_at', v_e.lobby_opens_at,
      'status', v_e.status);
  end if;
  if v_e.status <> 'draft' then
    raise exception using message = 'not_draft', errcode = 'P0001';
  end if;
  select w.* into v_ws from public.workspaces w where w.id = v_e.workspace_id;

  -- details (0.4)
  if btrim(v_e.title) = '' then
    raise exception using message = 'title_missing', detail = 'details', errcode = 'P0001';
  end if;
  if btrim(v_e.course) = '' then
    raise exception using message = 'course_missing', detail = 'details', errcode = 'P0001';
  end if;
  if btrim(v_e.kind) = '' then
    raise exception using message = 'kind_missing', detail = 'details', errcode = 'P0001';
  end if;
  if v_e.duration_min not between 5 and 600 then
    raise exception using message = 'duration_invalid', detail = 'details', errcode = 'P0001';
  end if;
  if v_e.starts_at <= now() then
    raise exception using message = 'starts_in_past', detail = 'details', errcode = 'P0001';
  end if;
  if not exists (select 1 from public.exam_groups eg where eg.exam_id = v_e.id) then
    raise exception using message = 'groups_missing', detail = 'details', errcode = 'P0001';
  end if;
  -- checks (0.2)
  if not public.valid_checks(v_e.checks) then
    raise exception using message = 'checks_invalid', detail = 'checks', errcode = 'P0001';
  end if;
  -- browser (E.1), browser exams only
  if v_e.mode = 'browser' then
    if v_e.lms_url is null or btrim(v_e.lms_url) = '' then
      raise exception using message = 'lms_url_missing', detail = 'browser', errcode = 'P0001';
    end if;
    if v_e.lms_url !~ '^https?://[^[:space:]]+$' then
      raise exception using message = 'lms_url_invalid', detail = 'browser', errcode = 'P0001';
    end if;
    if not public.valid_browser_rules(v_e.browser_rules) then
      raise exception using message = 'browser_rules_invalid', detail = 'browser', errcode = 'P0001';
    end if;
  end if;
  -- roster (0.3)
  if not exists (select 1 from public.exam_students es where es.exam_id = v_e.id) then
    raise exception using message = 'roster_empty', detail = 'roster', errcode = 'P0001';
  end if;
  if not exists (select 1 from public.proctor_assignments pa where pa.exam_id = v_e.id) then
    raise exception using message = 'proctors_missing', detail = 'roster', errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.exam_students es
    where es.exam_id = v_e.id and not exists (
      select 1 from public.proctor_assignments pa
      where pa.exam_id = v_e.id and es.seat between pa.seat_from and pa.seat_to
    )
  ) then
    raise exception using message = 'seats_uncovered', detail = 'roster', errcode = 'P0001';
  end if;

  select g.code into v_group
  from public.exam_groups eg join public.groups g on g.id = eg.group_id
  where eg.exam_id = v_e.id
  order by g.code
  limit 1;
  v_base := public.exam_code_base(v_e.course, v_group, v_e.starts_at, v_ws.timezone);
  -- Two exams with the same base code take their digits one at a time.
  perform pg_advisory_xact_lock(hashtextextended('exam_code:' || v_base, 0));
  v_code := v_base;
  while exists (select 1 from public.exams x where upper(x.code) = v_code and x.id <> v_e.id) loop
    v_try := v_try + 1;
    if v_try > 99 then
      raise exception using message = 'code_exhausted', detail = 'details', errcode = 'P0001';
    end if;
    v_code := v_base || v_try;
  end loop;

  update public.exams e
  set code = v_code,
      status = 'scheduled',
      scheduled_at = now(),
      lobby_opens_at = e.starts_at - make_interval(mins => (v_ws.settings ->> 'lobby_minutes')::int)
  where e.id = v_e.id
  returning * into v_e;

  perform public.write_audit(v_e.workspace_id, 'staff', 'exam.schedule', 'exam', v_e.id::text,
    jsonb_build_object('code', v_code));

  return jsonb_build_object('code', v_e.code, 'starts_at', v_e.starts_at, 'lobby_opens_at', v_e.lobby_opens_at,
    'status', v_e.status);
end;
$$;

-- confirm_seats(exam_id, change_request): 0.9a. The caller's own assignment on the exam: no text
-- confirms (confirmed_at, and any earlier request is cleared); text (1 to 500 characters) asks the
-- exam office for a change and clears confirmed_at. Returns the assignment.
create or replace function public.confirm_seats(exam_id uuid, change_request text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_pa public.proctor_assignments;
  v_text text := nullif(btrim(confirm_seats.change_request), '');
  v_ws uuid;
begin
  if v_uid is null or public.is_anonymous() then
    raise exception using message = 'forbidden', errcode = '42501';
  end if;
  select pa.* into v_pa from public.proctor_assignments pa
  where pa.exam_id = confirm_seats.exam_id and pa.staff_id = v_uid
  for update;
  if not found then
    if not exists (select 1 from public.exams e where e.id = confirm_seats.exam_id) then
      raise exception using message = 'not_found', errcode = 'P0002';
    end if;
    raise exception using message = 'forbidden', errcode = '42501';
  end if;
  if char_length(v_text) > 500 then
    raise exception using message = 'bad_request', detail = 'change_request is 1 to 500 characters', errcode = '22023';
  end if;

  update public.proctor_assignments pa
  set confirmed_at = case when v_text is null then now() end,
      change_request = v_text
  where pa.exam_id = v_pa.exam_id and pa.staff_id = v_uid;

  v_ws := public.exam_workspace(v_pa.exam_id);
  perform public.write_audit(v_ws, 'staff', case when v_text is null then 'seats.confirm' else 'seats.change_request' end,
    'exam', v_pa.exam_id::text);
  return public.assignment_json(v_pa.exam_id, v_uid);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Help requests
-- ---------------------------------------------------------------------------

-- A help request as 2.4d and the `help` broadcast carry it (HelpRequest in review.ts).
create or replace function public.help_json(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', h.id,
    'session_id', h.session_id,
    'exam_id', h.exam_id,
    'student_id', se.student_id,
    'student_name', st.full_name,
    'topic', h.topic,
    'text', h.text,
    'created_at', h.created_at,
    'reply', h.reply,
    'done_at', h.done_at,
    'done_by', h.done_by
  )
  from public.help_requests h
  join public.sessions se on se.id = h.session_id
  join public.students st on st.id = se.student_id
  where h.id = p_id
$$;

create or replace function public.help_broadcast(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_payload jsonb := public.help_json(p_id);
begin
  if v_payload is not null then
    perform realtime.send(v_payload, 'help', 'exam:' || (v_payload ->> 'exam_id'), true);
  end if;
end;
$$;

-- help_from_event: every stored student.help_requested (from the app or, through it, the Lock) makes
-- one help_requests row and a `help` broadcast to exam:{exam_id}. An unknown topic is stored as
-- `technical` and the text is cut to 280 characters, so a bad payload never fails an ingest call.
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
  if v_topic is null or v_topic not in ('identity', 'question', 'technical') then
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

create trigger help_from_event
  after insert on public.events
  for each row
  when (new.type = 'student.help_requested')
  execute function public.help_from_event();

-- close_help_request(id, reply): Reply and Mark done on 2.4d, for a proctor of the exam. Sets
-- done_at and done_by; a reply (1 to 280 characters) is stored and sent to the student as a `message`
-- command through issue_command (skipped once the session is final). A closed request is returned
-- unchanged. Broadcasts `help` with done_at so every proctor's badge clears. Returns the request
-- with message_sent.
create or replace function public.close_help_request(id uuid, reply text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_h public.help_requests;
  v_reply text := nullif(btrim(close_help_request.reply), '');
  v_sent boolean := false;
begin
  if v_uid is null or public.is_anonymous() then
    raise exception using message = 'forbidden', errcode = '42501';
  end if;
  select h.* into v_h from public.help_requests h where h.id = close_help_request.id for update;
  if not found then
    raise exception using message = 'not_found', errcode = 'P0002';
  end if;
  if not public.is_proctor_of(v_h.exam_id) then
    raise exception using message = 'forbidden', errcode = '42501';
  end if;
  if char_length(v_reply) > 280 then
    raise exception using message = 'bad_request', detail = 'reply is 1 to 280 characters', errcode = '22023';
  end if;
  if v_h.done_at is not null then
    return public.help_json(v_h.id) || jsonb_build_object('message_sent', false);
  end if;

  update public.help_requests h
  set done_at = now(), done_by = v_uid, reply = v_reply
  where h.id = v_h.id;

  if v_reply is not null and exists (
    select 1 from public.sessions se where se.id = v_h.session_id and not public.is_final_state(se.state)
  ) then
    perform public.issue_command(p_session_id => v_h.session_id, p_type => 'message'::public.command_type,
      p_payload => jsonb_build_object('text', v_reply, 'scope', 'student'));
    v_sent := true;
  end if;

  perform public.write_audit(public.exam_workspace(v_h.exam_id), 'staff', 'help.close', 'session',
    v_h.session_id::text, jsonb_build_object('help_request_id', v_h.id, 'replied', v_reply is not null));
  perform public.help_broadcast(v_h.id);
  return public.help_json(v_h.id) || jsonb_build_object('message_sent', v_sent);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Review
-- ---------------------------------------------------------------------------

-- The exam has a flag with no decision, or one newer than its session's decision (the queue rule).
create or replace function public.exam_has_open_flags(p_exam_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.events ev
    left join public.review_decisions d on d.session_id = ev.session_id
    where ev.exam_id = p_exam_id and ev.review = 'flag'
      and (d.decided_at is null or ev.received_at > d.decided_at)
  )
$$;

-- decide_session(session_id, decision, note): 3.3's decision, and Mark reviewed (no_issue) on 2.4a.
-- A proctor of the exam or its exam office. One decision per session, replaced by a later one; the
-- note is at most 1000 characters. Writes an audit row. A to_review exam turns reviewed once no flag
-- is left without a newer decision. Returns {session_id, decision, note, reviewer_id, decided_at,
-- exam_status}.
create or replace function public.decide_session(session_id uuid, decision public.review_decision, note text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_s public.sessions;
  v_e public.exams;
  v_note text := nullif(btrim(decide_session.note), '');
  v_d public.review_decisions;
begin
  if v_uid is null or public.is_anonymous() then
    raise exception using message = 'forbidden', errcode = '42501';
  end if;
  select se.* into v_s from public.sessions se where se.id = decide_session.session_id;
  if not found then
    raise exception using message = 'not_found', errcode = 'P0002';
  end if;
  select e.* into v_e from public.exams e where e.id = v_s.exam_id for update;
  if not (public.is_proctor_of(v_e.id) or public.is_staff_of(v_e.workspace_id)) then
    raise exception using message = 'forbidden', errcode = '42501';
  end if;
  if decide_session.decision is null then
    raise exception using message = 'bad_request', detail = 'decision', errcode = '22023';
  end if;
  if char_length(v_note) > 1000 then
    raise exception using message = 'bad_request', detail = 'note is at most 1000 characters', errcode = '22023';
  end if;

  insert into public.review_decisions as d (session_id, exam_id, decision, note, reviewer_id, decided_at)
  values (v_s.id, v_s.exam_id, decide_session.decision, v_note, v_uid, now())
  on conflict (session_id) do update
    set decision = excluded.decision, note = excluded.note, reviewer_id = excluded.reviewer_id,
        decided_at = excluded.decided_at
  returning * into v_d;

  perform public.write_audit(v_e.workspace_id, 'staff', 'review.decide', 'session', v_s.id::text,
    jsonb_build_object('decision', v_d.decision));

  if v_e.status = 'to_review' and not public.exam_has_open_flags(v_e.id) then
    update public.exams e set status = 'reviewed' where e.id = v_e.id returning * into v_e;
  end if;

  return jsonb_build_object('session_id', v_d.session_id, 'decision', v_d.decision, 'note', v_d.note,
    'reviewer_id', v_d.reviewer_id, 'decided_at', v_d.decided_at, 'exam_status', v_e.status);
end;
$$;

-- add_session_note(session_id, text): Add note on 2.5 and 3.3. A proctor of the exam or its exam
-- office; 1 to 500 characters. Stores a proctor.note event (source proctor, review none) with
-- {text, staff_id}; events_broadcast sends it to the wall. Returns the event id.
create or replace function public.add_session_note(session_id uuid, text text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_s public.sessions;
  v_text text := btrim(add_session_note.text);
  v_id uuid := gen_random_uuid();
  v_ws uuid;
begin
  if v_uid is null or public.is_anonymous() then
    raise exception using message = 'forbidden', errcode = '42501';
  end if;
  select se.* into v_s from public.sessions se where se.id = add_session_note.session_id;
  if not found then
    raise exception using message = 'not_found', errcode = 'P0002';
  end if;
  v_ws := public.exam_workspace(v_s.exam_id);
  if not (public.is_proctor_of(v_s.exam_id) or public.is_staff_of(v_ws)) then
    raise exception using message = 'forbidden', errcode = '42501';
  end if;
  if v_text is null or char_length(v_text) not between 1 and 500 then
    raise exception using message = 'bad_request', detail = 'text is 1 to 500 characters', errcode = '22023';
  end if;

  insert into public.events (id, session_id, exam_id, type, source, review, at, data)
  values (v_id, v_s.id, v_s.exam_id, 'proctor.note', 'proctor', 'none', now(),
    jsonb_build_object('text', v_text, 'staff_id', v_uid));
  perform public.write_audit(v_ws, 'staff', 'session.note', 'session', v_s.id::text,
    jsonb_build_object('event_id', v_id));
  return v_id;
end;
$$;

-- review_queue (3.2): sessions with a flag newer than their decision, or no decision, under the
-- caller's row-level security. flag_types feeds the ?flag= filter (3.2a).
create view public.review_queue
with (security_invoker = on)
as
select
  se.id as session_id,
  se.exam_id,
  se.student_id,
  e.workspace_id,
  e.faculty_id,
  count(*)::int as flags,
  count(*) filter (where d.decided_at is null or ev.received_at > d.decided_at)::int as open_flags,
  array_agg(distinct ev.type) as flag_types,
  min(ev.at) as first_flag_at,
  max(ev.received_at) as last_flag_received_at,
  d.decision,
  d.decided_at
from public.sessions se
join public.exams e on e.id = se.exam_id
join public.events ev on ev.session_id = se.id and ev.review = 'flag'
left join public.review_decisions d on d.session_id = se.id
group by se.id, se.exam_id, se.student_id, e.workspace_id, e.faculty_id, d.decision, d.decided_at
having count(*) filter (where d.decided_at is null or ev.received_at > d.decided_at) > 0;

-- ---------------------------------------------------------------------------
-- 7. Reports, verify codes and shares
-- ---------------------------------------------------------------------------

-- 12 characters of Crockford base32 from the first 60 bits of
-- sha256('<report id>:<content hash>'); verifyCodeFromDigest in review.ts makes the same code.
create or replace function public.make_verify_code(p_report_id uuid, p_content_hash text)
returns text
language sql
immutable
set search_path = ''
as $$
  select string_agg(substr('0123456789ABCDEFGHJKMNPQRSTVWXYZ', substring(b.bits from i * 5 + 1 for 5)::int + 1, 1), ''
    order by i)
  from (
    select ('x' || substr(encode(sha256(convert_to(p_report_id::text || ':' || p_content_hash, 'UTF8')), 'hex'), 1, 15))::bit(60)
      as bits
  ) b
  cross join generate_series(0, 11) as i
$$;

-- The code a person typed or scanned: case, spaces and hyphens do not matter, the printed
-- "UKI-RPT-" prefix is optional, O reads as 0 and I or L as 1 (normalizeVerifyCode in review.ts).
create or replace function public.normalize_verify_code(p text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := regexp_replace(upper(coalesce(p, '')), '[^A-Z0-9]', '', 'g');
begin
  if char_length(v) = 18 and left(v, 6) = 'UKIRPT' then
    v := substr(v, 7);
  end if;
  v := translate(v, 'OIL', '011');
  if v !~ '^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{12}$' then
    return null;
  end if;
  return v;
end;
$$;

-- What the content hash covers: the student, the exam, the session's result, every flag, every
-- note and the decision. Times are epoch microseconds, so the hash never depends on the session's
-- TimeZone. Exam-wide counts and the report's own fields stay out.
create or replace function public.report_content(p_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'session_id', se.id,
    'student', jsonb_build_object('full_name', st.full_name, 'student_number', st.student_number),
    'exam', jsonb_build_object('id', e.id, 'title', e.title,
      'starts_at', (extract(epoch from e.starts_at) * 1000000)::bigint, 'duration_min', e.duration_min),
    'state', se.state,
    'time_used_s', se.time_used_s,
    'identity_result', se.identity_result,
    'flags', coalesce((
      select jsonb_agg(jsonb_build_object('id', ev.id, 'type', ev.type,
        'at', (extract(epoch from ev.at) * 1000000)::bigint, 'data', ev.data, 'frame_count', ev.frame_count)
        order by ev.at, ev.id)
      from public.events ev where ev.session_id = se.id and ev.review = 'flag'
    ), '[]'::jsonb),
    'notes', coalesce((
      select jsonb_agg(jsonb_build_object('id', ev.id, 'at', (extract(epoch from ev.at) * 1000000)::bigint,
        'text', ev.data ->> 'text') order by ev.at, ev.id)
      from public.events ev where ev.session_id = se.id and ev.type = 'proctor.note'
    ), '[]'::jsonb),
    'decision', (
      select jsonb_build_object('decision', d.decision, 'note', d.note, 'reviewer_id', d.reviewer_id,
        'decided_at', (extract(epoch from d.decided_at) * 1000000)::bigint)
      from public.review_decisions d where d.session_id = se.id
    )
  )
  from public.sessions se
  join public.exams e on e.id = se.exam_id
  join public.students st on st.id = se.student_id
  where se.id = p_session_id
$$;

create or replace function public.report_content_hash(p_session_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(sha256(convert_to(public.report_content(p_session_id)::text, 'UTF8')), 'hex')
$$;

-- The session's reports row with a verify code for its current content: made on first use; a new
-- content hash makes a new code and issued_at, so a printout of an older version no longer verifies.
create or replace function public.report_sync(p_session_id uuid, p_actor uuid)
returns public.reports
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_r public.reports;
  v_hash text := public.report_content_hash(p_session_id);
  v_id uuid := gen_random_uuid();
begin
  select r.* into v_r from public.reports r where r.session_id = p_session_id for update;
  if not found then
    insert into public.reports (id, session_id, exam_id, verify_code, content_hash, created_by)
    select v_id, se.id, se.exam_id, public.make_verify_code(v_id, v_hash), v_hash, p_actor
    from public.sessions se where se.id = p_session_id
    on conflict (session_id) do nothing;
    select r.* into v_r from public.reports r where r.session_id = p_session_id for update;
  end if;
  if v_r.content_hash is distinct from v_hash then
    update public.reports r
    set content_hash = v_hash, verify_code = public.make_verify_code(r.id, v_hash), issued_at = now()
    where r.id = v_r.id
    returning * into v_r;
  end if;
  return v_r;
end;
$$;

-- The integrity report (ReportPayload in review.ts): 3.4 and 3.5.
create or replace function public.report_payload(p_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'report', (
      select jsonb_build_object('id', r.id, 'verify_code', r.verify_code, 'created_at', r.created_at,
        'issued_at', r.issued_at)
      from public.reports r where r.session_id = se.id
    ),
    'session', jsonb_build_object(
      'id', se.id, 'state', se.state, 'locale', se.locale, 'joined_at', se.joined_at, 'started_at', se.started_at,
      'submitted_at', se.submitted_at, 'ended_at', se.ended_at, 'end_reason', se.end_reason,
      'time_used_s', se.time_used_s, 'extra_min', se.extra_min, 'receipt_id', se.receipt_id,
      'identity_result', se.identity_result, 'identity_score', se.identity_score,
      'identity_at', (select min(ev.at) from public.events ev where ev.session_id = se.id and ev.type = 'identity.matched'),
      'rules_accepted_at', se.rules_accepted_at, 'rules_locale', se.rules_locale, 'device', se.device
    ),
    'student', jsonb_build_object('id', st.id, 'full_name', st.full_name, 'student_number', st.student_number,
      'group_code', g.code, 'programme', st.programme, 'year', st.year),
    'exam', jsonb_build_object('id', e.id, 'title', e.title, 'course', e.course, 'kind', e.kind, 'code', e.code,
      'mode', e.mode, 'starts_at', e.starts_at, 'duration_min', e.duration_min, 'faculty_name', f.name,
      'workspace_name', w.name, 'timezone', w.timezone),
    'proctor_name', (
      select pst.full_name
      from public.proctor_assignments pa
      join public.staff pst on pst.id = pa.staff_id
      left join public.exam_students es on es.exam_id = pa.exam_id and es.student_id = se.student_id
      where pa.exam_id = se.exam_id
      order by (es.seat is not null and es.seat between coalesce(pa.seat_from, es.seat) and coalesce(pa.seat_to, es.seat)) desc,
        pa.is_lead desc, pst.full_name
      limit 1
    ),
    'flags', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ev.id, 'type', ev.type, 'source', ev.source, 'at', ev.at, 'received_at', ev.received_at,
        'data', ev.data, 'frame_count', ev.frame_count,
        'frames', coalesce((
          select jsonb_agg(jsonb_build_object('id', fr.id, 'captured_at', fr.captured_at) order by fr.captured_at)
          from public.frames fr where fr.event_id = ev.id
        ), '[]'::jsonb)
      ) order by ev.at, ev.id)
      from public.events ev where ev.session_id = se.id and ev.review = 'flag'
    ), '[]'::jsonb),
    'notes', coalesce((
      select jsonb_agg(jsonb_build_object('id', ev.id, 'at', ev.at, 'text', ev.data ->> 'text',
        'staff_id', ev.data ->> 'staff_id',
        'by_name', (select nst.full_name from public.staff nst where nst.id::text = ev.data ->> 'staff_id'))
        order by ev.at, ev.id)
      from public.events ev where ev.session_id = se.id and ev.type = 'proctor.note'
    ), '[]'::jsonb),
    'decision', (
      select jsonb_build_object('decision', d.decision, 'note', d.note, 'reviewer_id', d.reviewer_id,
        'reviewer_name', rst.full_name, 'decided_at', d.decided_at)
      from public.review_decisions d join public.staff rst on rst.id = d.reviewer_id
      where d.session_id = se.id
    ),
    'data_kept', jsonb_build_object(
      'video_bytes', 0,
      'session_frames', (select count(*) from public.frames fr where fr.session_id = se.id),
      'session_events', (select count(*) from public.events ev where ev.session_id = se.id),
      'exam_frames', (select count(*) from public.frames fr where fr.exam_id = se.exam_id),
      'exam_events', (select count(*) from public.events ev where ev.exam_id = se.exam_id),
      'retention_days', (w.settings ->> 'retention_days')::int,
      'frames_kept_until', coalesce(
        (select min(fr.captured_at) from public.frames fr where fr.session_id = se.id), e.starts_at)
        + make_interval(days => (w.settings ->> 'retention_days')::int)
    ),
    'generated_at', now()
  )
  from public.sessions se
  join public.exams e on e.id = se.exam_id
  join public.workspaces w on w.id = e.workspace_id
  join public.students st on st.id = se.student_id
  left join public.groups g on g.id = st.group_id
  left join public.faculties f on f.id = e.faculty_id
  where se.id = p_session_id
$$;

-- get_report(session_id): 3.4, for staff of the exam. Makes or refreshes the reports row (verify
-- code), writes an audit row and returns the report.
create or replace function public.get_report(session_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_s public.sessions;
  v_r public.reports;
begin
  if v_uid is null or public.is_anonymous() then
    raise exception using message = 'forbidden', errcode = '42501';
  end if;
  select se.* into v_s from public.sessions se where se.id = get_report.session_id;
  if not found then
    raise exception using message = 'not_found', errcode = 'P0002';
  end if;
  if not public.is_exam_staff(v_s.exam_id) then
    raise exception using message = 'forbidden', errcode = '42501';
  end if;
  v_r := public.report_sync(v_s.id, v_uid);
  perform public.write_audit(public.exam_workspace(v_s.exam_id), 'staff', 'report.view', 'session', v_s.id::text,
    jsonb_build_object('report_id', v_r.id, 'verify_code', v_r.verify_code));
  return public.report_payload(v_s.id);
end;
$$;

-- create_share(report_id): Share link on 3.4, for staff of the exam. A random 32-byte token,
-- base64url (43 characters), returned only here; report_shares keeps its SHA-256 (hex) and an
-- expiry 7 days ahead. Audit row without the token. Returns {share_id, token, path, expires_at}.
create or replace function public.create_share(report_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_r public.reports;
  v_token text;
  v_share public.report_shares;
begin
  if v_uid is null or public.is_anonymous() then
    raise exception using message = 'forbidden', errcode = '42501';
  end if;
  select r.* into v_r from public.reports r where r.id = create_share.report_id;
  if not found then
    raise exception using message = 'not_found', errcode = 'P0002';
  end if;
  if not public.is_exam_staff(v_r.exam_id) then
    raise exception using message = 'forbidden', errcode = '42501';
  end if;
  v_token := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  insert into public.report_shares (report_id, token_hash, expires_at, created_by)
  values (v_r.id, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), now() + interval '7 days', v_uid)
  returning * into v_share;
  perform public.write_audit(public.exam_workspace(v_r.exam_id), 'staff', 'report.share', 'report', v_r.id::text,
    jsonb_build_object('share_id', v_share.id, 'expires_at', v_share.expires_at));
  return jsonb_build_object('share_id', v_share.id, 'token', v_token, 'path', '/r/' || v_token,
    'expires_at', v_share.expires_at);
end;
$$;

-- open_shared_report(token_hash): for the shared-report Edge Function (secret key only), which hashes
-- the token from /r/[token]. An unknown, revoked or expired share is not_found (detail says which).
-- Refreshes the verify code, writes one audit row per view (actor_kind share), and returns the report
-- with share {id, expires_at, shared_by, workspace_name}.
create or replace function public.open_shared_report(p_token_hash text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_share public.report_shares;
  v_r public.reports;
  v_by text;
begin
  select sh.* into v_share from public.report_shares sh where sh.token_hash = lower(p_token_hash);
  if not found then
    raise exception using message = 'not_found', detail = 'unknown', errcode = 'P0002';
  end if;
  if v_share.revoked_at is not null then
    raise exception using message = 'not_found', detail = 'revoked', errcode = 'P0002';
  end if;
  if v_share.expires_at <= now() then
    raise exception using message = 'not_found', detail = 'expired', errcode = 'P0002';
  end if;
  select r.* into v_r from public.reports r where r.id = v_share.report_id;
  v_r := public.report_sync(v_r.session_id, v_r.created_by);
  select st.full_name into v_by from public.staff st where st.id = v_share.created_by;
  perform public.write_audit(public.exam_workspace(v_r.exam_id), 'share', 'report.share_view', 'report',
    v_r.id::text, jsonb_build_object('share_id', v_share.id, 'session_id', v_r.session_id));
  return public.report_payload(v_r.session_id) || jsonb_build_object('share', jsonb_build_object(
    'id', v_share.id, 'expires_at', v_share.expires_at, 'shared_by', v_by,
    'workspace_name', (select w.name from public.workspaces w where w.id = public.exam_workspace(v_r.exam_id))));
end;
$$;

-- verify_report(code): /verify/[code], open to anonymous visitors. Returns {found: false}, or
-- {found: true, code, exam_title, exam_starts_at, timezone, initials, issued_at, intact} where intact
-- says the report's content still has the hash the code was made from.
create or replace function public.verify_report(code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_code text := public.normalize_verify_code(verify_report.code);
  v_r public.reports;
  v_words text[];
  v_initials text;
  v_out jsonb;
begin
  if v_code is null then
    return jsonb_build_object('found', false);
  end if;
  select r.* into v_r from public.reports r where r.verify_code = v_code;
  if not found then
    return jsonb_build_object('found', false);
  end if;
  select regexp_split_to_array(btrim(st.full_name), '\s+') into v_words
  from public.sessions se join public.students st on st.id = se.student_id
  where se.id = v_r.session_id;
  v_initials := upper(left(v_words[1], 1)) || case
    when cardinality(v_words) > 1 then upper(left(v_words[cardinality(v_words)], 1)) else '' end;
  select jsonb_build_object('found', true, 'code', v_r.verify_code, 'exam_title', e.title,
    'exam_starts_at', e.starts_at, 'timezone', w.timezone, 'initials', v_initials, 'issued_at', v_r.issued_at,
    'intact', public.report_content_hash(v_r.session_id) = v_r.content_hash)
  into v_out
  from public.exams e join public.workspaces w on w.id = e.workspace_id
  where e.id = v_r.exam_id;
  return v_out;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Views for A.1 (term_*) and A.2 (student_overview), under the caller's row-level security
-- ---------------------------------------------------------------------------
-- Terms follow the exam's local date: autumn from 1 September to 31 January ("2026-autumn"), spring
-- from 1 February to 31 August ("2027-spring"). Weeks are 7-day buckets from the term's first day.
-- Exams count once they have run (live, to_review or reviewed). Every term_* view has one row per
-- faculty and one row for all faculties (all_faculties true, faculty_id null).

create or replace function public.term_key(d date)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when extract(month from d) >= 9 then extract(year from d)::int::text || '-autumn'
    when extract(month from d) = 1 then (extract(year from d)::int - 1)::text || '-autumn'
    else extract(year from d)::int::text || '-spring'
  end
$$;

create or replace function public.term_start(d date)
returns date
language sql
immutable
set search_path = ''
as $$
  select case
    when extract(month from d) >= 9 then make_date(extract(year from d)::int, 9, 1)
    when extract(month from d) = 1 then make_date(extract(year from d)::int - 1, 9, 1)
    else make_date(extract(year from d)::int, 2, 1)
  end
$$;

-- Exams that ran, with their term and week.
create view public.term_exams
with (security_invoker = on)
as
select
  e.id as exam_id,
  e.workspace_id,
  e.faculty_id,
  e.starts_at,
  e.duration_min,
  x.day,
  public.term_key(x.day) as term,
  public.term_start(x.day) as term_start,
  public.term_start(x.day) + ((x.day - public.term_start(x.day)) / 7) * 7 as week_start
from public.exams e
join public.workspaces w on w.id = e.workspace_id
cross join lateral (select (e.starts_at at time zone w.timezone)::date as day) x
where e.status in ('live', 'to_review', 'reviewed');

-- Sessions of those exams with their flag count and decision.
create view public.term_sessions
with (security_invoker = on)
as
select
  te.*,
  se.id as session_id,
  (select count(*) from public.events ev where ev.session_id = se.id and ev.review = 'flag')::int as flags,
  d.decision,
  d.decided_at
from public.term_exams te
left join public.sessions se on se.exam_id = te.exam_id
left join public.review_decisions d on d.session_id = se.id;

create view public.term_kpis
with (security_invoker = on)
as
select
  workspace_id, term, term_start, faculty_id, grouping(faculty_id) = 1 as all_faculties,
  count(distinct exam_id)::int as exams_run,
  count(session_id)::int as sessions,
  coalesce(sum(flags), 0)::int as flags,
  count(session_id) filter (where flags > 0)::int as flagged_sessions,
  count(decision) filter (where flags > 0)::int as decisions,
  count(session_id) filter (where decision = 'committee')::int as committee,
  min(day) as first_day,
  max(day) as last_day
from public.term_sessions
group by grouping sets ((workspace_id, term, term_start, faculty_id), (workspace_id, term, term_start));

create view public.term_weekly_flags
with (security_invoker = on)
as
select
  workspace_id, term, term_start, faculty_id, grouping(faculty_id) = 1 as all_faculties, week_start,
  count(distinct exam_id)::int as exams,
  count(session_id)::int as sessions,
  coalesce(sum(flags), 0)::int as flags,
  round(coalesce(sum(flags), 0) * 100.0 / nullif(count(session_id), 0), 1) as flags_per_100
from public.term_sessions
group by grouping sets ((workspace_id, term, term_start, week_start, faculty_id),
  (workspace_id, term, term_start, week_start));

create view public.term_flag_types
with (security_invoker = on)
as
select
  te.workspace_id, te.term, te.term_start, te.faculty_id, grouping(te.faculty_id) = 1 as all_faculties,
  ev.type,
  count(*)::int as flags
from public.term_exams te
join public.events ev on ev.exam_id = te.exam_id and ev.review = 'flag'
group by grouping sets ((te.workspace_id, te.term, te.term_start, ev.type, te.faculty_id),
  (te.workspace_id, te.term, te.term_start, ev.type));

-- Decisions on flagged sessions.
create view public.term_decisions
with (security_invoker = on)
as
select
  workspace_id, term, term_start, faculty_id, grouping(faculty_id) = 1 as all_faculties, decision,
  count(*)::int as sessions
from public.term_sessions
where flags > 0 and decision is not null
group by grouping sets ((workspace_id, term, term_start, decision, faculty_id),
  (workspace_id, term, term_start, decision));

-- Review time: from the exam's end to the decision, in seconds; the median per week.
create view public.term_review_time
with (security_invoker = on)
as
select
  workspace_id, term, term_start, faculty_id, grouping(faculty_id) = 1 as all_faculties, week_start,
  count(*)::int as decisions,
  percentile_cont(0.5) within group (order by review_s)::int as median_review_s
from (
  select ts.*, greatest(0, extract(epoch from ts.decided_at
    - (ts.starts_at + make_interval(mins => ts.duration_min))))::int as review_s
  from public.term_sessions ts
  where ts.flags > 0 and ts.decided_at is not null
) x
group by grouping sets ((workspace_id, term, term_start, week_start, faculty_id),
  (workspace_id, term, term_start, week_start));

-- student_overview (A.2): one row per student with exams taken, flags, sessions still in review
-- (a flag with no newer decision), the last exam and the latest decision.
create view public.student_overview
with (security_invoker = on)
as
select
  st.id,
  st.workspace_id,
  st.student_number,
  st.full_name,
  st.email,
  st.locale,
  st.group_id,
  g.code as group_code,
  g.faculty_id,
  f.name as faculty_name,
  st.programme,
  st.year,
  coalesce(agg.exams_taken, 0) as exams_taken,
  coalesce(agg.flags, 0) as flags,
  coalesce(agg.sessions_in_review, 0) as sessions_in_review,
  last_exam.exam_id as last_exam_id,
  last_exam.title as last_exam_title,
  last_exam.starts_at as last_exam_at,
  latest.decision as latest_decision,
  latest.decided_at as latest_decision_at
from public.students st
left join public.groups g on g.id = st.group_id
left join public.faculties f on f.id = g.faculty_id
left join lateral (
  select
    count(*)::int as exams_taken,
    coalesce(sum(fl.flags), 0)::int as flags,
    (count(*) filter (where fl.open > 0))::int as sessions_in_review
  from public.sessions se
  cross join lateral (
    select count(*) as flags,
      count(*) filter (where d.decided_at is null or ev.received_at > d.decided_at) as open
    from public.events ev
    left join public.review_decisions d on d.session_id = se.id
    where ev.session_id = se.id and ev.review = 'flag'
  ) fl
  where se.student_id = st.id
) agg on true
left join lateral (
  select e.id as exam_id, e.title, e.starts_at
  from public.sessions se join public.exams e on e.id = se.exam_id
  where se.student_id = st.id
  order by e.starts_at desc
  limit 1
) last_exam on true
left join lateral (
  select d.decision, d.decided_at
  from public.review_decisions d join public.sessions se on se.id = d.session_id
  where se.student_id = st.id
  order by d.decided_at desc
  limit 1
) latest on true;

grant select on public.review_queue, public.term_exams, public.term_sessions, public.term_kpis,
  public.term_weekly_flags, public.term_flag_types, public.term_decisions, public.term_review_time,
  public.student_overview to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. Privacy
-- ---------------------------------------------------------------------------

-- The private `exports` bucket for copy requests (A.5b): one JSON file per request, read only through
-- 7-day signed links that the data-request function makes with the secret key. No storage.objects
-- policies on purpose. Also declared in supabase/config.toml.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exports', 'exports', false, 10485760, array['application/json'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Stills older than their workspace's retention_days, oldest first: what the retention function
-- deletes (from Storage, then the frames rows). Secret key only.
create or replace function public.retention_due(p_limit int default 500)
returns table (frame_id uuid, event_id uuid, session_id uuid, exam_id uuid, workspace_id uuid,
  storage_path text, captured_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select fr.id, fr.event_id, fr.session_id, fr.exam_id, e.workspace_id, fr.storage_path, fr.captured_at
  from public.frames fr
  join public.exams e on e.id = fr.exam_id
  join public.workspaces w on w.id = e.workspace_id
  where fr.captured_at < now() - make_interval(days => (w.settings ->> 'retention_days')::int)
  order by fr.captured_at, fr.id
  limit greatest(1, least(coalesce(p_limit, 500), 5000))
$$;

-- A new data request (A.5) and a changed settings row (A.4) each leave an audit row for A.6. The
-- data-request function writes its own rows for delete, copy and reply.
create or replace function public.data_requests_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.write_audit(new.workspace_id,
    case when auth.uid() is null then 'service' else 'staff' end,
    'data_request.received', 'student', new.student_id::text,
    jsonb_build_object('data_request_id', new.id, 'kind', new.kind));
  return null;
end;
$$;

create trigger data_requests_audit
  after insert on public.data_requests
  for each row execute function public.data_requests_audit();

create or replace function public.workspaces_settings_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.write_audit(new.id, case when auth.uid() is null then 'service' else 'staff' end,
    'settings.update', 'workspace', new.id::text,
    jsonb_build_object('before', old.settings, 'after', new.settings));
  return null;
end;
$$;

create trigger workspaces_settings_audit
  after update of settings on public.workspaces
  for each row
  when (old.settings is distinct from new.settings)
  execute function public.workspaces_settings_audit();

-- send-invites writes the outcome to `invites`; exam_students.invite_status, which the Phase 0
-- lobby reads, follows it here.
create or replace function public.invites_sync_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.exam_students es
  set invite_status = new.state::text
  where es.exam_id = new.exam_id and es.student_id = new.student_id
    and es.invite_status is distinct from new.state::text;
  return null;
end;
$$;

create trigger invites_sync_status
  after insert or update of state on public.invites
  for each row execute function public.invites_sync_status();

-- audit_read(action, object_type, object_id): the dashboard records a read of student data that
-- does not go through a function above (A.2's list, A.3's profile, 3.3's session, an export).
-- Staff only; the actor and workspace are the caller's.
create or replace function public.audit_read(action text, object_type text, object_id text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ws uuid;
begin
  select st.workspace_id into v_ws from public.staff st where st.id = auth.uid();
  if auth.uid() is null or public.is_anonymous() or v_ws is null then
    raise exception using message = 'forbidden', errcode = '42501';
  end if;
  if audit_read.action is null or char_length(audit_read.action) > 60
    or audit_read.action !~ '^[a-z_]+(\.[a-z_]+)+$' then
    raise exception using message = 'bad_request', detail = 'action', errcode = '22023';
  end if;
  if audit_read.object_type is null
    or audit_read.object_type not in ('student', 'session', 'exam', 'report', 'workspace', 'data_request') then
    raise exception using message = 'bad_request', detail = 'object_type', errcode = '22023';
  end if;
  perform public.write_audit(v_ws, 'staff', audit_read.action, audit_read.object_type, left(audit_read.object_id, 100));
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Pilot requests
-- ---------------------------------------------------------------------------

-- Calls an Edge Function with the secret key, through pg_net. The project URL and the key come from
-- Vault (`uki_project_url`, `uki_secret_key`); without them, as on a fresh local stack, nothing is
-- sent and the result is null. Returns pg_net's request id.
create or replace function public.call_edge_function(p_name text, p_body jsonb default '{}'::jsonb)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_key text;
begin
  select ds.decrypted_secret into v_url from vault.decrypted_secrets ds where ds.name = 'uki_project_url';
  select ds.decrypted_secret into v_key from vault.decrypted_secrets ds where ds.name = 'uki_secret_key';
  if coalesce(v_url, '') = '' or coalesce(v_key, '') = '' then
    return null;
  end if;
  return net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/' || p_name,
    body := coalesce(p_body, '{}'::jsonb),
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_key),
    timeout_milliseconds := 10000
  );
end;
$$;

-- request_pilot(...): Book a pilot (194:4014), open to anonymous visitors. Checks every field
-- (bad_request, detail names it); refuses a fourth request from one address within 24 hours, and
-- any request while 30 arrived in the last hour, with {status: rate_limited}; otherwise stores the
-- row (its trigger asks pilot-notify to email it) and returns {status: ok}.
create or replace function public.request_pilot(name text, email text, university text, role text default null,
  message text default null, exam_size text default null, pilot_month text default null,
  demo_invite boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  v_name text := btrim(request_pilot.name);
  v_email text := lower(btrim(request_pilot.email));
  v_university text := btrim(request_pilot.university);
  v_role text := nullif(btrim(request_pilot.role), '');
  v_message text := nullif(btrim(request_pilot.message), '');
  v_size text := nullif(btrim(request_pilot.exam_size), '');
  v_month text := nullif(btrim(request_pilot.pilot_month), '');
begin
  if v_name is null or char_length(v_name) not between 1 and 120 then
    raise exception using message = 'bad_request', detail = 'name', errcode = '22023';
  end if;
  if v_email is null or char_length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception using message = 'bad_request', detail = 'email', errcode = '22023';
  end if;
  if v_university is null or char_length(v_university) not between 1 and 160 then
    raise exception using message = 'bad_request', detail = 'university', errcode = '22023';
  end if;
  if char_length(v_role) > 80 then
    raise exception using message = 'bad_request', detail = 'role', errcode = '22023';
  end if;
  if char_length(v_message) > 500 then
    raise exception using message = 'bad_request', detail = 'message', errcode = '22023';
  end if;
  if char_length(v_size) > 40 then
    raise exception using message = 'bad_request', detail = 'exam_size', errcode = '22023';
  end if;
  if char_length(v_month) > 40 then
    raise exception using message = 'bad_request', detail = 'pilot_month', errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('request_pilot:' || v_email, 0));
  if (select count(*) from public.pilot_requests p
      where lower(p.email) = v_email and p.created_at > now() - interval '24 hours') >= 3
    or (select count(*) from public.pilot_requests p where p.created_at > now() - interval '1 hour') >= 30 then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  insert into public.pilot_requests (name, email, university, role, message, exam_size, pilot_month, demo_invite)
  values (v_name, v_email, v_university, v_role, v_message, v_size, v_month, coalesce(request_pilot.demo_invite, false));
  return jsonb_build_object('status', 'ok');
end;
$$;

create or replace function public.pilot_requests_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.call_edge_function('pilot-notify', jsonb_build_object('id', new.id));
  return null;
end;
$$;

create trigger pilot_requests_notify
  after insert on public.pilot_requests
  for each row execute function public.pilot_requests_notify();

-- ---------------------------------------------------------------------------
-- 11. retention_nightly: 22:00 UTC (03:00 in Almaty), the retention Edge Function through pg_net
-- ---------------------------------------------------------------------------
-- Harmless where the function or the Vault secrets are missing: call_edge_function sends nothing
-- without the secrets, and pg_net only records the 404 of a missing function.
select cron.schedule('retention_nightly', '0 22 * * *', 'select public.call_edge_function(''retention'')');

-- ---------------------------------------------------------------------------
-- 12. join_exam and ingest_batch
-- ---------------------------------------------------------------------------

-- join_exam: as in 20261007115927_rpc.sql; the exam object also carries browser_rules (for the
-- Lock's exam.state), rules_locale and room.
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
      'allowed_sites', to_jsonb(v_exam.allowed_sites),
      'browser_rules', v_exam.browser_rules,
      'rules_locale', v_exam.rules_locale,
      'room', v_exam.room
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

-- ingest_batch: as in 20261007221100_ingest_last_seen_every_call.sql, plus the consent record
-- ("Consent record" in docs/phase-1-plan.md): the first call whose status step is `ready` stamps
-- sessions.rules_accepted_at with the server's time and rules_locale with status.rules_locale (kk,
-- ru or en; otherwise the session's locale). Both are written once and never overwritten.
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
  v_rules_locale public.locale;
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
    and not coalesce(v_step = 'ready' and v_s.rules_accepted_at is null, false)
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
    v_rules_locale := case
      when p_status ->> 'rules_locale' in ('kk', 'ru', 'en') then (p_status ->> 'rules_locale')::public.locale
      else v_s.locale
    end;

    -- Every call that is not quiet writes last_seen_at (broadcast by sessions_broadcast when it changed).
    update public.sessions se
    set state = coalesce(v_new_state, se.state),
        status = v_status,
        last_seen_at = now(),
        rules_accepted_at = case
          when v_step = 'ready' and se.rules_accepted_at is null then now() else se.rules_accepted_at end,
        rules_locale = case
          when v_step = 'ready' and se.rules_accepted_at is null then v_rules_locale else se.rules_locale end
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

-- ---------------------------------------------------------------------------
-- Function privileges: functions here get no default EXECUTE, so every grant is explicit.
-- ---------------------------------------------------------------------------

revoke execute on function public.try_uuid(text) from public, anon, authenticated;
revoke execute on function public.json_number_between(jsonb, numeric, numeric, boolean) from public, anon, authenticated;
revoke execute on function public.valid_checks(jsonb) from public, anon, authenticated;
revoke execute on function public.valid_browser_rules(jsonb) from public, anon, authenticated;
revoke execute on function public.valid_settings(jsonb) from public, anon, authenticated;
revoke execute on function public.is_admin() from public, anon, authenticated;
revoke execute on function public.write_audit(uuid, text, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.exam_code_latin(text) from public, anon, authenticated;
revoke execute on function public.exam_code_base(text, text, timestamptz, text) from public, anon, authenticated;
revoke execute on function public.exam_draft_json(uuid) from public, anon, authenticated;
revoke execute on function public.save_exam_draft(jsonb) from public, anon, authenticated;
revoke execute on function public.import_roster(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.assignment_json(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.assign_proctors(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.schedule_exam(uuid) from public, anon, authenticated;
revoke execute on function public.confirm_seats(uuid, text) from public, anon, authenticated;
revoke execute on function public.help_json(uuid) from public, anon, authenticated;
revoke execute on function public.help_broadcast(uuid) from public, anon, authenticated;
revoke execute on function public.help_from_event() from public, anon, authenticated;
revoke execute on function public.close_help_request(uuid, text) from public, anon, authenticated;
revoke execute on function public.exam_has_open_flags(uuid) from public, anon, authenticated;
revoke execute on function public.decide_session(uuid, public.review_decision, text) from public, anon, authenticated;
revoke execute on function public.add_session_note(uuid, text) from public, anon, authenticated;
revoke execute on function public.make_verify_code(uuid, text) from public, anon, authenticated;
revoke execute on function public.normalize_verify_code(text) from public, anon, authenticated;
revoke execute on function public.report_content(uuid) from public, anon, authenticated;
revoke execute on function public.report_content_hash(uuid) from public, anon, authenticated;
revoke execute on function public.report_sync(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.report_payload(uuid) from public, anon, authenticated;
revoke execute on function public.get_report(uuid) from public, anon, authenticated;
revoke execute on function public.create_share(uuid) from public, anon, authenticated;
revoke execute on function public.open_shared_report(text) from public, anon, authenticated;
revoke execute on function public.verify_report(text) from public, anon, authenticated;
revoke execute on function public.term_key(date) from public, anon, authenticated;
revoke execute on function public.term_start(date) from public, anon, authenticated;
revoke execute on function public.retention_due(int) from public, anon, authenticated;
revoke execute on function public.data_requests_audit() from public, anon, authenticated;
revoke execute on function public.workspaces_settings_audit() from public, anon, authenticated;
revoke execute on function public.invites_sync_status() from public, anon, authenticated;
revoke execute on function public.audit_read(text, text, text) from public, anon, authenticated;
revoke execute on function public.call_edge_function(text, jsonb) from public, anon, authenticated;
revoke execute on function public.request_pilot(text, text, text, text, text, text, text, boolean) from public, anon, authenticated;
revoke execute on function public.pilot_requests_notify() from public, anon, authenticated;

-- Used inside constraints and views that the API roles evaluate.
grant execute on function public.try_uuid(text) to authenticated, service_role;
grant execute on function public.json_number_between(jsonb, numeric, numeric, boolean) to authenticated, service_role;
grant execute on function public.valid_checks(jsonb) to authenticated, service_role;
grant execute on function public.valid_browser_rules(jsonb) to authenticated, service_role;
grant execute on function public.valid_settings(jsonb) to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.term_key(date) to authenticated, service_role;
grant execute on function public.term_start(date) to authenticated, service_role;
-- Staff RPCs (each checks the caller).
grant execute on function public.save_exam_draft(jsonb) to authenticated;
grant execute on function public.import_roster(uuid, jsonb) to authenticated;
grant execute on function public.assign_proctors(uuid, jsonb) to authenticated;
grant execute on function public.schedule_exam(uuid) to authenticated;
grant execute on function public.confirm_seats(uuid, text) to authenticated;
grant execute on function public.close_help_request(uuid, text) to authenticated;
grant execute on function public.decide_session(uuid, public.review_decision, text) to authenticated;
grant execute on function public.add_session_note(uuid, text) to authenticated;
grant execute on function public.get_report(uuid) to authenticated;
grant execute on function public.create_share(uuid) to authenticated;
grant execute on function public.audit_read(text, text, text) to authenticated;
-- Public pages.
grant execute on function public.verify_report(text) to anon, authenticated, service_role;
grant execute on function public.request_pilot(text, text, text, text, text, text, text, boolean) to anon, authenticated, service_role;
-- Edge Functions with the secret key.
grant execute on function public.exam_code_latin(text) to service_role;
grant execute on function public.exam_code_base(text, text, timestamptz, text) to service_role;
grant execute on function public.exam_draft_json(uuid) to service_role;
grant execute on function public.assignment_json(uuid, uuid) to service_role;
grant execute on function public.help_json(uuid) to service_role;
grant execute on function public.exam_has_open_flags(uuid) to service_role;
grant execute on function public.make_verify_code(uuid, text) to service_role;
grant execute on function public.normalize_verify_code(text) to service_role;
grant execute on function public.report_content(uuid) to service_role;
grant execute on function public.report_content_hash(uuid) to service_role;
grant execute on function public.report_payload(uuid) to service_role;
grant execute on function public.open_shared_report(text) to service_role;
grant execute on function public.retention_due(int) to service_role;
grant execute on function public.write_audit(uuid, text, text, text, text, jsonb) to service_role;

-- Unchanged signatures keep their Phase 0 grants; restated for clarity.
revoke execute on function public.join_exam(text, text, public.locale, jsonb) from public, anon;
grant execute on function public.join_exam(text, text, public.locale, jsonb) to authenticated;
revoke execute on function public.ingest_batch(uuid, jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.ingest_batch(uuid, jsonb, jsonb, uuid) to service_role;
