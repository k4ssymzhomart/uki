-- The exam wizard (docs/phase-1-plan.md, Testing: 10_wizard): the exam code rule, draft saves, a roster
-- imported twice without duplicates, proctor gaps and overlaps refused, confirm_seats, schedule_exam's
-- errors per step and a code clash.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Test helpers, rolled back with the transaction (as in 01_rls.test.sql), plus t.err and t.anon.
create schema t;
grant usage, create on schema t to anon, authenticated, service_role;
-- Scratch tables made later in a file are readable by every role the file switches to.
alter default privileges in schema t grant select on tables to anon, authenticated, service_role;
create table t.ids (k text primary key, v uuid not null);
grant select, insert, update on t.ids to anon, authenticated, service_role;

create function t.id(p_k text) returns uuid language sql stable as $$ select v from t.ids where k = p_k $$;

create function t.put(p_k text, p_v uuid) returns uuid language sql as $$
  insert into t.ids (k, v) values (p_k, p_v) on conflict (k) do update set v = excluded.v returning v
$$;

create function t.new_user(p_email text, p_anon boolean default false) returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, is_anonymous, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at)
  values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    case when p_anon then null else p_email end, p_anon, '{}'::jsonb, '{}'::jsonb, now(), now());
  return v_id;
end $$;

create function t.new_staff(p_email text, p_name text, p_role public.staff_role,
  p_workspace uuid default 'a0000000-0000-4000-8000-000000000001') returns uuid language plpgsql as $$
declare v_id uuid := t.new_user(p_email);
begin
  insert into public.staff (id, workspace_id, full_name, role, languages) values (v_id, p_workspace, p_name, p_role, '{ru}');
  return v_id;
end $$;

create function t.assign(p_exam uuid, p_staff uuid, p_lead boolean default false, p_from int default null,
  p_to int default null) returns void language sql as $$
  insert into public.proctor_assignments (exam_id, staff_id, seat_from, seat_to, languages, is_lead)
  values (p_exam, p_staff, p_from, p_to, '{ru}', p_lead)
$$;

create function t.new_session(p_exam uuid, p_number text, p_state public.session_state default 'writing',
  p_uid uuid default null) returns uuid language plpgsql as $$
declare
  v_id uuid;
  v_uid uuid := coalesce(p_uid, t.new_user(null, true));
begin
  insert into public.sessions (exam_id, student_id, auth_uid, state, locale, started_at)
  select p_exam, s.id, v_uid, p_state, 'kk', case when p_state in ('writing', 'paused') then now() end
  from public.students s where s.student_number = p_number
  returning id into v_id;
  return v_id;
end $$;

create function t.uid_of(p_session uuid) returns uuid language sql stable as $$
  select auth_uid from public.sessions where id = p_session
$$;

create function t.login(p_uid uuid) returns void language plpgsql as $$
declare v_anon boolean;
begin
  select u.is_anonymous into v_anon from auth.users u where u.id = p_uid;
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated',
    'aud', 'authenticated', 'is_anonymous', coalesce(v_anon, false))::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- A visitor with only the publishable key: role anon, no user.
create function t.anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end $$;

-- An Edge Function with the secret key: role service_role, no user.
create function t.service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);
end $$;

create function t.schedule(p_exam uuid, p_starts_in interval, p_status public.exam_status,
  p_duration int default 90) returns void language sql as $$
  update public.exams
  set starts_at = now() + p_starts_in, lobby_opens_at = now() + p_starts_in - interval '20 minutes',
      status = p_status, duration_min = p_duration
  where id = p_exam
$$;

create function t.event(p_session uuid, p_type text, p_at timestamptz default now(),
  p_received timestamptz default now(), p_data jsonb default '{}', p_source public.event_source default 'app',
  p_review public.event_review default 'none', p_frames int default 0) returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into public.events (id, session_id, exam_id, type, source, review, at, received_at, data, frame_count)
  select v_id, s.id, s.exam_id, p_type, p_source, p_review, p_at, p_received, p_data, p_frames
  from public.sessions s where s.id = p_session;
  return v_id;
end $$;

create function t.ev(p_session uuid, p_type text, p_review text default 'none', p_seq int default 0,
  p_frames int default 0, p_id uuid default null, p_data jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('id', coalesce(p_id, gen_random_uuid()), 'session_id', p_session, 'type', p_type,
    'source', 'app', 'review', p_review, 'seq', p_seq, 'at', now(), 'data', p_data, 'frame_count', p_frames,
    'app_version', '0.1.0')
$$;

create function t.messages(p_topic text, p_event text, p_payload jsonb default '{}') returns bigint
language sql stable as $$
  select count(*) from realtime.messages m
  where m.topic = p_topic and m.event = p_event and m.private and m.payload @> p_payload
$$;

-- The error a statement raises, as '<message>' or '<message>:<detail>', or null when it succeeds.
-- Runs as the current role; the failed statement's changes roll back with its subtransaction.
create function t.err(p_sql text) returns text language plpgsql as $$
declare
  v_msg text;
  v_detail text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics v_msg = message_text, v_detail = pg_exception_detail;
  return v_msg || coalesce(':' || nullif(v_detail, ''), '');
end $$;

-- Seeded ids (supabase/seed.sql).
select t.put('ws', 'a0000000-0000-4000-8000-000000000001');
select t.put('math2', 'e0000000-0000-4000-8000-000000000001');
select t.put('phys1', 'e0000000-0000-4000-8000-000000000002');
select t.put('history', 'e0000000-0000-4000-8000-000000000003');
select t.put('english', 'e0000000-0000-4000-8000-000000000005');
select t.put('g204', 'a2000000-0000-4000-8000-000000000204');
select t.put('g101', 'a2000000-0000-4000-8000-000000000101');
select t.put('fac_math', 'a1000000-0000-4000-8000-000000000001');

-- Start from the seed alone: staff assignments made by `pnpm seed:staff` are set aside.
delete from public.proctor_assignments;

select t.put('office', t.new_staff('office@wizard.test', 'Dana Akhmetova', 'exam_office'));
update public.staff set faculty_id = t.id('fac_math') where id = t.id('office');
select t.put('aigerim', t.new_staff('aigerim@wizard.test', 'Aigerim Sadykova', 'proctor'));
select t.put('nurlan', t.new_staff('nurlan@wizard.test', 'Nurlan Bekov', 'proctor'));
select t.put('other_proctor', t.new_staff('other@wizard.test', 'Other Proctor', 'proctor'));
insert into public.workspaces (id, name, slug) values ('a0000000-0000-4000-8000-0000000000fa', 'Other U', 'other-wiz');
select t.put('office2', t.new_staff('office2@wizard.test', 'Other Office', 'exam_office',
  'a0000000-0000-4000-8000-0000000000fa'));
select t.put('student', t.new_user(null, true));

-- Next week's Friday, 10:00 in Almaty: a start in the future whose weekday is FRI.
create table t.when as select date_trunc('week', now() + interval '7 days') + interval '4 days 5 hours' as friday;
grant select on t.when to authenticated;

-- ---------------------------------------------------------------------------
-- The exam code rule (the same cases as packages/contracts/src/exam-code.test.ts)
-- ---------------------------------------------------------------------------
select is(public.exam_code_base('Mathematics 2', '204', '2026-10-09T05:00:00Z', 'Asia/Almaty'), 'MATH2-204-FRI',
  'exam code: Mathematics 2, group 204, Friday');
select is(public.exam_code_base('Математика 2', '204', '2026-10-09T05:00:00Z', 'Asia/Almaty'), 'MATE2-204-FRI',
  'exam code: a Russian course name');
select is(public.exam_code_base('Қазақ тілі 1', null, '2026-10-12T05:00:00Z', 'Asia/Almaty'), 'QAZA1-MON',
  'exam code: a Kazakh course name and no group');
select is(public.exam_code_base('English B2', '301', '2026-10-04T20:00:00Z', 'Asia/Almaty'), 'ENGLB2-301-MON',
  'exam code: the weekday in the workspace''s time zone');
select is(public.exam_code_base('  ', '1-02', '2026-10-09T05:00:00Z', 'Asia/Almaty'), 'EXAM-102-FRI',
  'exam code: an empty course');
select is(public.exam_code_base('Physics1 lab', 'ab', '2026-10-09T05:00:00Z', 'UTC'), 'PHYS1-AB-FRI',
  'exam code: digits on the first word');

-- ---------------------------------------------------------------------------
-- save_exam_draft
-- ---------------------------------------------------------------------------
select t.login(t.id('office'));
select t.put('draft', (public.save_exam_draft('{}') ->> 'id')::uuid);
reset role;
select is((select status::text from public.exams where id = t.id('draft')), 'draft', 'a new draft is a draft');
select is((select title || course || kind from public.exams where id = t.id('draft')), '', 'a new draft has no title yet');
select is((select duration_min from public.exams where id = t.id('draft')), 90, 'a new draft takes the default duration');
select is((select checks from public.exams where id = t.id('draft')),
  (select settings -> 'default_checks' from public.workspaces where id = t.id('ws')), 'a new draft takes the default checks');
select is((select (starts_at at time zone 'Asia/Almaty')::time from public.exams where id = t.id('draft')), time '09:00',
  'a new draft starts at 09:00 in Almaty');
select is((select (starts_at at time zone 'Asia/Almaty')::date from public.exams where id = t.id('draft')),
  (now() at time zone 'Asia/Almaty')::date + 1, 'a new draft starts tomorrow');
select is((select starts_at - lobby_opens_at from public.exams where id = t.id('draft')), interval '20 minutes',
  'the lobby opens lobby_minutes before the start');
select is((select faculty_id from public.exams where id = t.id('draft')), t.id('fac_math'),
  'a new draft takes the office''s faculty');
select is((select created_by from public.exams where id = t.id('draft')), t.id('office'), 'created_by is the office');
select is((select count(*) from public.audit_log where action = 'exam.draft_created' and object_id = t.id('draft')::text),
  1::bigint, 'creating a draft writes an audit row');

select t.login(t.id('office'));
select is((public.save_exam_draft(jsonb_build_object('id', t.id('draft'), 'title', ' Mathematics 2 · Midterm ',
  'course', 'Mathematics 2', 'kind', 'Midterm', 'group_ids', jsonb_build_array(t.id('g204')),
  'starts_at', (select friday from t.when), 'duration_min', 90, 'room', '204')) ->> 'title'),
  'Mathematics 2 · Midterm', 'step 1 (0.4) saves the details, trimmed');
select is((public.save_exam_draft(jsonb_build_object('id', t.id('draft'), 'checks', '{"gaze_s":3}'::jsonb)) -> 'checks'),
  '{"gaze_s":3,"phone_score":0.85,"face_missing_s":10,"identity":true,"lock":true}'::jsonb,
  'step 2 (0.2) merges one check into the rest');
select is((public.save_exam_draft(jsonb_build_object('id', t.id('draft'), 'browser_rules', '{"calculator":false}'::jsonb))
  -> 'browser_rules' ->> 'calculator'), 'false', 'E.1 switches one rule');
select is((public.save_exam_draft(jsonb_build_object('id', t.id('draft'))) -> 'browser_rules' ->> 'copy_paste'), 'true',
  'the other rules are kept');
-- A refresh, or a second tab: reading the draft back loses nothing.
select is((public.save_exam_draft(jsonb_build_object('id', t.id('draft'))) - 'group_ids'),
  (select to_jsonb(e) from public.exams e where e.id = t.id('draft')), 'the reply is the stored row; an empty save changes nothing');
select is((public.save_exam_draft(jsonb_build_object('id', t.id('draft'))) -> 'group_ids'),
  jsonb_build_array(t.id('g204')), 'the groups survive a reload');
select is((select starts_at - lobby_opens_at from public.exams where id = t.id('draft')), interval '20 minutes',
  'the lobby follows the new start');
select is((select room from public.exams where id = t.id('draft')), '204', 'the room is saved');
select is(t.err($$ select public.save_exam_draft(jsonb_build_object('id', t.id('draft'), 'status', 'scheduled')) $$),
  'bad_request:unknown field status', 'a field the wizard does not own is refused');
select is(t.err($$ select public.save_exam_draft(jsonb_build_object('id', t.id('draft'), 'mode', 'paper')) $$),
  'bad_request:mode', 'an unknown mode is refused');
select is(t.err($$ select public.save_exam_draft(jsonb_build_object('id', t.id('draft'), 'duration_min', 4)) $$),
  'bad_request:duration_min', 'a 4-minute exam is refused');
select is(t.err($$ select public.save_exam_draft(jsonb_build_object('id', t.id('draft'), 'checks', '{"gaze_s":"2"}'::jsonb)) $$),
  'bad_request:checks', 'a check of the wrong type is refused');
select is(t.err($$ select public.save_exam_draft(jsonb_build_object('id', t.id('draft'),
  'browser_rules', '{"devtools":"blocked"}'::jsonb)) $$), 'bad_request:browser_rules',
  'a rule E.1 fixes cannot be changed');
select is(t.err($$ select public.save_exam_draft(jsonb_build_object('id', t.id('draft'), 'starts_at', 'Friday')) $$),
  'bad_request:starts_at', 'a start that is not a time is refused');
select is(t.err($$ select public.save_exam_draft(jsonb_build_object('id', t.id('draft'),
  'group_ids', jsonb_build_array(gen_random_uuid()))) $$), 'bad_request:group_ids', 'an unknown group is refused');
select is(t.err($$ select public.save_exam_draft(jsonb_build_object('id', t.id('draft'), 'lms_url', 'exam.kru.test')) $$),
  'bad_request:lms_url', 'an exam link without a scheme is refused');
select is(t.err($$ select public.save_exam_draft(jsonb_build_object('id', t.id('math2'), 'title', 'X')) $$),
  'not_draft', 'a scheduled exam is not edited through the wizard');
select is(t.err($$ select public.save_exam_draft(jsonb_build_object('id', gen_random_uuid())) $$), 'not_found',
  'an unknown id is not_found');
reset role;

select t.login(t.id('office2'));
select is(t.err($$ select public.save_exam_draft(jsonb_build_object('id', t.id('draft'), 'title', 'X')) $$), 'forbidden',
  'another workspace''s office cannot edit the draft');
reset role;
select t.login(t.id('aigerim'));
select is(t.err($$ select public.save_exam_draft('{}') $$), 'forbidden', 'a proctor cannot create an exam');
reset role;
select t.login(t.id('student'));
select is(t.err($$ select public.save_exam_draft('{}') $$), 'forbidden', 'a student cannot create an exam');
reset role;

-- ---------------------------------------------------------------------------
-- import_roster
-- ---------------------------------------------------------------------------
create table t.roster as select jsonb_build_array(
  jsonb_build_object('student_number', '20231187', 'full_name', 'Madina Tulegenova', 'email', 'Madina@KRU.test',
    'group', '204', 'locale', 'kk'),
  jsonb_build_object('student_number', '20231044', 'full_name', 'Dias Kenzhebekov', 'email', 'dias@kru.test',
    'group', '204', 'locale', 'ru'),
  jsonb_build_object('student_number', '20269999', 'full_name', 'New Student', 'email', 'new@kru.test',
    'group', '204', 'locale', 'en')) as rows;
grant select on t.roster to authenticated;

select t.login(t.id('office'));
select is(public.import_roster(t.id('draft'), (select rows from t.roster)),
  '{"inserted":1,"updated":2,"seats":3,"removed":0}'::jsonb, 'the roster imports: one new student, two known');
select is(public.import_roster(t.id('draft'), (select rows from t.roster)),
  '{"inserted":0,"updated":3,"seats":3,"removed":0}'::jsonb, 'importing the same file again adds nobody');
reset role;
select results_eq($$
  select s.student_number from public.exam_students es join public.students s on s.id = es.student_id
  where es.exam_id = t.id('draft') order by es.seat
$$, array['20231187', '20231044', '20269999'], 'seats follow the file order');
select is((select count(*) from public.exam_students where exam_id = t.id('draft')), 3::bigint, 'no duplicate roster rows');
select is((select count(*) from public.students where student_number = '20269999'), 1::bigint, 'no duplicate students');
select is((select email from public.students where student_number = '20231187'), 'madina@kru.test',
  'the address is stored in lower case');
select is((select count(*) from public.invites where exam_id = t.id('draft') and state = 'pending'), 3::bigint,
  'one pending invite per student');
select is((select count(*) from public.audit_log where action = 'roster.import' and object_id = t.id('draft')::text),
  2::bigint, 'each import writes an audit row');

-- A sent invite stays sent on a re-import, and goes back to pending when the address changes.
update public.invites set state = 'sent', sent_at = now(), provider_id = 'r1' where exam_id = t.id('draft');
select is((select invite_status from public.exam_students es join public.students s on s.id = es.student_id
  where es.exam_id = t.id('draft') and s.student_number = '20231044'), 'sent', 'exam_students.invite_status follows invites');
select t.login(t.id('office'));
select lives_ok($$
  select public.import_roster(t.id('draft'), jsonb_build_array(
    (select rows -> 0 from t.roster),
    (select rows -> 1 from t.roster) || '{"email":"dias.k@kru.test"}'::jsonb))
$$, 'a fixed address and a shorter file import');
reset role;
select is((select state::text || '/' || coalesce(provider_id, '-') from public.invites i join public.students s on s.id = i.student_id
  where i.exam_id = t.id('draft') and s.student_number = '20231044'), 'pending/-', 'a changed address is invited again');
select is((select state::text from public.invites i join public.students s on s.id = i.student_id
  where i.exam_id = t.id('draft') and s.student_number = '20231187'), 'sent', 'an unchanged address keeps its invite');
select is((select count(*) from public.exam_students where exam_id = t.id('draft')), 2::bigint,
  'a row left out of the file leaves the roster');
select is((select count(*) from public.invites where exam_id = t.id('draft')), 2::bigint, '... with its invite');
select is((select invite_status from public.exam_students es join public.students s on s.id = es.student_id
  where es.exam_id = t.id('draft') and s.student_number = '20231044'), 'pending', 'the lobby sees the new invite state');

select t.login(t.id('office'));
select is(t.err($$ select public.import_roster(t.id('draft'), jsonb_build_array((select rows -> 0 from t.roster),
  (select rows -> 1 from t.roster) || '{"student_number":"2023104"}'::jsonb)) $$), 'bad_request:row 2: student_number',
  'a 7-digit number names its row');
select is(t.err($$ select public.import_roster(t.id('draft'), jsonb_build_array(
  (select rows -> 0 from t.roster) || '{"email":"madina.kru.test"}'::jsonb)) $$), 'bad_request:row 1: email',
  'an address without @ names its row');
select is(t.err($$ select public.import_roster(t.id('draft'), jsonb_build_array(
  (select rows -> 0 from t.roster) || '{"group":"999"}'::jsonb)) $$), 'bad_request:row 1: group',
  'an unknown group names its row');
select is(t.err($$ select public.import_roster(t.id('draft'), jsonb_build_array(
  (select rows -> 0 from t.roster), (select rows -> 0 from t.roster))) $$), 'bad_request:row 2: duplicate',
  'a number twice names the second row');
select is(t.err($$ select public.import_roster(t.id('draft'), jsonb_build_array(
  (select rows -> 0 from t.roster) || '{"locale":"de"}'::jsonb)) $$), 'bad_request:row 1: locale',
  'an unknown language names its row');
select is(t.err($$ select public.import_roster(t.id('draft'), '[]') $$), 'bad_request:rows must hold 1 to 2000 rows',
  'an empty file is refused');
select is((select count(*) from public.exam_students where exam_id = t.id('draft')), 2::bigint,
  'a refused file writes nothing');
reset role;
select t.login(t.id('aigerim'));
select is(t.err($$ select public.import_roster(t.id('draft'), (select rows from t.roster)) $$), 'forbidden',
  'a proctor cannot import a roster');
reset role;

-- Back to three students for the proctors and the schedule.
select t.login(t.id('office'));
select lives_ok($$ select public.import_roster(t.id('draft'), (select rows from t.roster)) $$, 'the full roster again');
reset role;

-- ---------------------------------------------------------------------------
-- assign_proctors
-- ---------------------------------------------------------------------------
select t.login(t.id('office'));
select is(t.err($$ select public.assign_proctors(t.id('draft'), jsonb_build_array(
  jsonb_build_object('staff_id', t.id('aigerim'), 'seat_from', 1, 'seat_to', 1, 'languages', '["kk","ru"]'::jsonb),
  jsonb_build_object('staff_id', t.id('nurlan'), 'seat_from', 3, 'seat_to', 3, 'languages', '["ru"]'::jsonb))) $$),
  'gap:seats 2 to 2', 'a gap between ranges is refused');
select is(t.err($$ select public.assign_proctors(t.id('draft'), jsonb_build_array(
  jsonb_build_object('staff_id', t.id('aigerim'), 'seat_from', 1, 'seat_to', 2, 'languages', '["kk"]'::jsonb),
  jsonb_build_object('staff_id', t.id('nurlan'), 'seat_from', 2, 'seat_to', 3, 'languages', '["ru"]'::jsonb))) $$),
  'overlap:seats 2 to 2', 'an overlap is refused');
select is(t.err($$ select public.assign_proctors(t.id('draft'), jsonb_build_array(
  jsonb_build_object('staff_id', t.id('aigerim'), 'seat_from', 2, 'seat_to', 3, 'languages', '["kk"]'::jsonb))) $$),
  'gap:seats 1 to 1', 'ranges start at seat 1');
select is(t.err($$ select public.assign_proctors(t.id('draft'), jsonb_build_array(
  jsonb_build_object('staff_id', t.id('aigerim'), 'seat_from', 1, 'seat_to', 3, 'languages', '[]'::jsonb))) $$),
  'bad_request:row 1', 'a proctor needs a language');
select is(t.err($$ select public.assign_proctors(t.id('draft'), jsonb_build_array(
  jsonb_build_object('staff_id', t.id('office2'), 'seat_from', 1, 'seat_to', 3, 'languages', '["kk"]'::jsonb))) $$),
  'bad_request:row 1: staff_id', 'a proctor from another workspace is refused');
select is(jsonb_array_length(public.assign_proctors(t.id('draft'), jsonb_build_array(
  jsonb_build_object('staff_id', t.id('nurlan'), 'seat_from', 3, 'seat_to', 3, 'languages', '["ru","en"]'::jsonb),
  jsonb_build_object('staff_id', t.id('aigerim'), 'seat_from', 1, 'seat_to', 2, 'languages', '["kk","ru"]'::jsonb)))),
  2, 'ranges that tile the roster are stored');
reset role;
select is((select is_lead from public.proctor_assignments where exam_id = t.id('draft') and staff_id = t.id('aigerim')),
  true, 'with no lead given, seat 1''s proctor leads');
select is((select languages from public.proctor_assignments where exam_id = t.id('draft') and staff_id = t.id('nurlan')),
  '{ru,en}'::public.locale[], 'languages are stored');

-- ---------------------------------------------------------------------------
-- confirm_seats (0.9a)
-- ---------------------------------------------------------------------------
select t.login(t.id('nurlan'));
select ok((public.confirm_seats(t.id('draft')) ->> 'confirmed_at') is not null, 'a proctor confirms its seats');
select is(public.confirm_seats(t.id('draft'), 'Only seats 3 to 10, please') ->> 'change_request',
  'Only seats 3 to 10, please', 'a proctor asks for a change');
reset role;
select is((select confirmed_at from public.proctor_assignments where exam_id = t.id('draft') and staff_id = t.id('nurlan')),
  null, 'a change request clears the confirmation');
select t.login(t.id('office'));
select is((select change_request from public.proctor_assignments where exam_id = t.id('draft') and staff_id = t.id('nurlan')),
  'Only seats 3 to 10, please', 'the exam office sees the change request');
reset role;
select t.login(t.id('other_proctor'));
select is(t.err($$ select public.confirm_seats(t.id('draft')) $$), 'forbidden', 'a proctor not on the exam cannot confirm');
reset role;
select t.login(t.id('nurlan'));
select is((public.confirm_seats(t.id('draft'), '  ') ->> 'change_request'), null, 'blank text confirms');
reset role;
select t.login(t.id('office'));
select lives_ok($$ select public.assign_proctors(t.id('draft'), jsonb_build_array(
  jsonb_build_object('staff_id', t.id('aigerim'), 'seat_from', 1, 'seat_to', 1, 'languages', '["kk"]'::jsonb),
  jsonb_build_object('staff_id', t.id('nurlan'), 'seat_from', 2, 'seat_to', 3, 'languages', '["ru"]'::jsonb))) $$,
  'the office moves the ranges');
reset role;
select is((select confirmed_at from public.proctor_assignments where exam_id = t.id('draft') and staff_id = t.id('nurlan')),
  null, 'a changed range must be confirmed again');

-- ---------------------------------------------------------------------------
-- schedule_exam: errors name the step, then the code
-- ---------------------------------------------------------------------------
select t.login(t.id('office'));
select t.put('bare', (public.save_exam_draft('{}') ->> 'id')::uuid);
select is(t.err($$ select public.schedule_exam(t.id('bare')) $$), 'title_missing:details', 'no title: details');
select lives_ok($$ select public.save_exam_draft(jsonb_build_object('id', t.id('bare'), 'title', 'T')) $$, 'title');
select is(t.err($$ select public.schedule_exam(t.id('bare')) $$), 'course_missing:details', 'no course: details');
select lives_ok($$ select public.save_exam_draft(jsonb_build_object('id', t.id('bare'), 'course', 'Mathematics 2')) $$, 'course');
select is(t.err($$ select public.schedule_exam(t.id('bare')) $$), 'kind_missing:details', 'no type: details');
select lives_ok($$ select public.save_exam_draft(jsonb_build_object('id', t.id('bare'), 'kind', 'Midterm',
  'starts_at', now() - interval '1 hour')) $$, 'kind and a past start');
select is(t.err($$ select public.schedule_exam(t.id('bare')) $$), 'starts_in_past:details', 'a past start: details');
select lives_ok($$ select public.save_exam_draft(jsonb_build_object('id', t.id('bare'), 'starts_at',
  (select friday from t.when))) $$, 'a future start');
select is(t.err($$ select public.schedule_exam(t.id('bare')) $$), 'groups_missing:details', 'no group: details');
select lives_ok($$ select public.save_exam_draft(jsonb_build_object('id', t.id('bare'), 'group_ids',
  jsonb_build_array(t.id('g204')), 'mode', 'browser')) $$, 'a group, browser mode');
select is(t.err($$ select public.schedule_exam(t.id('bare')) $$), 'lms_url_missing:browser', 'no exam link: browser');
select lives_ok($$ select public.save_exam_draft(jsonb_build_object('id', t.id('bare'),
  'lms_url', 'https://exam.kru.test/math-2')) $$, 'an exam link');
select is(t.err($$ select public.schedule_exam(t.id('bare')) $$), 'roster_empty:roster', 'no roster: roster');
select lives_ok($$ select public.import_roster(t.id('bare'), (select rows from t.roster)) $$, 'a roster');
select is(t.err($$ select public.schedule_exam(t.id('bare')) $$), 'proctors_missing:roster', 'no proctor: roster');
select lives_ok($$ select public.assign_proctors(t.id('bare'), jsonb_build_array(
  jsonb_build_object('staff_id', t.id('aigerim'), 'seat_from', 1, 'seat_to', 2, 'languages', '["kk"]'::jsonb))) $$,
  'a proctor for seats 1 and 2 of 3');
select is(t.err($$ select public.schedule_exam(t.id('bare')) $$), 'seats_uncovered:roster', 'seat 3 uncovered: roster');
reset role;
update public.exams set checks = '{"gaze_s":"x"}' where id = t.id('bare');
select t.login(t.id('office'));
select is(t.err($$ select public.schedule_exam(t.id('bare')) $$), 'checks_invalid:checks', 'bad checks: checks');
reset role;
update public.exams set checks = '{}' where id = t.id('bare');

-- A.4 changed the lobby to 25 minutes since the draft was saved: scheduling uses today's setting.
update public.workspaces set settings = jsonb_set(settings, '{lobby_minutes}', '25') where id = t.id('ws');

-- The seed's Mathematics 2 already holds MATH2-204-FRI: a clash adds a digit.
select t.login(t.id('office'));
select is((public.schedule_exam(t.id('draft')) ->> 'code'), 'MATH2-204-FRI2', 'a clash adds 2');
select is((public.schedule_exam(t.id('draft')) ->> 'code'), 'MATH2-204-FRI2', 'scheduling again returns the same code');
select lives_ok($$ select public.assign_proctors(t.id('bare'), jsonb_build_array(
  jsonb_build_object('staff_id', t.id('aigerim'), 'seat_from', 1, 'seat_to', 3, 'languages', '["kk"]'::jsonb))) $$,
  'every seat covered');
select is((public.schedule_exam(t.id('bare')) ->> 'code'), 'MATH2-204-FRI3', 'a second clash adds 3');
reset role;
select is((select status::text from public.exams where id = t.id('draft')), 'scheduled', 'the exam is scheduled');
select ok((select scheduled_at is not null from public.exams where id = t.id('draft')), 'scheduled_at is set');
select is((select starts_at - lobby_opens_at from public.exams where id = t.id('draft')), interval '25 minutes',
  'lobby_opens_at follows lobby_minutes at scheduling time');
select is((select count(*) from public.audit_log where action = 'exam.schedule' and object_id = t.id('draft')::text),
  1::bigint, 'scheduling writes one audit row');
select t.login(t.id('office'));
select is(t.err($$ select public.save_exam_draft(jsonb_build_object('id', t.id('draft'), 'title', 'X')) $$), 'not_draft',
  'a scheduled exam leaves the wizard');
reset role;
select t.login(t.id('aigerim'));
select is(t.err($$ select public.schedule_exam(t.id('draft')) $$), 'forbidden', 'a proctor cannot schedule');
reset role;
select t.login(t.id('student'));
select is(t.err($$ select public.schedule_exam(t.id('draft')) $$), 'forbidden', 'a student cannot schedule');
reset role;

-- A student can now join the new exam with its code.
update public.exams set starts_at = now() + interval '5 minutes', lobby_opens_at = now() - interval '5 minutes'
where id = t.id('draft');
select t.login(t.id('student'));
select is((public.join_exam('math2-204-fri2', '20231044', 'ru', '{"os":"windows","app_version":"0.1.0"}')
  -> 'exam' ->> 'title'), 'Mathematics 2 · Midterm', 'a student joins the scheduled exam by its code');
select is((public.join_exam('MATH2-204-FRI2', '20231044', 'ru', '{"os":"windows","app_version":"0.1.0"}')
  -> 'exam' -> 'browser_rules' ->> 'calculator'), 'false', 'join_exam carries the browser rules');
select is((public.join_exam('MATH2-204-FRI2', '20231044', 'ru', '{"os":"windows","app_version":"0.1.0"}')
  -> 'exam' ->> 'room'), '204', 'join_exam carries the room');
reset role;

select * from finish();
rollback;
