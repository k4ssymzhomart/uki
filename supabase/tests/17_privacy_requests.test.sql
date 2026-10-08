-- WP 1.12, data requests (20261012190000_privacy_requests.sql): a request is due 7 days after it
-- arrives; the data-request function's database half (privacy_delete_plan, privacy_delete_student,
-- privacy_export, privacy_export_done, privacy_reply) runs for the secret key only and for the exam
-- office of the request's workspace as the actor; a delete removes the student's frames and events,
-- clears the identity score and the device record, and keeps the sessions with their receipts, the
-- answers, the decisions and the reports; a copy lists exam history, flags with frames, consent and
-- devices; every action writes its audit row. Seeded rows from supabase/seed.sql: History of Kazakhstan's
-- seat 7 has two flags.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

create schema t;
grant usage, create on schema t to anon, authenticated, service_role;
-- Tables made later in the file (as the secret key) are readable by every role the file switches to.
alter default privileges in schema t grant select on tables to anon, authenticated, service_role;
create table t.ids (k text primary key, v uuid not null);
grant select on t.ids to anon, authenticated, service_role;

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

create function t.login(p_uid uuid) returns void language plpgsql as $$
declare v_anon boolean;
begin
  select u.is_anonymous into v_anon from auth.users u where u.id = p_uid;
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated',
    'aud', 'authenticated', 'is_anonymous', coalesce(v_anon, false))::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

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

-- The error a statement raises, as '<message>' or '<message>:<detail>', or null when it succeeds.
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
grant execute on function t.err(text) to anon, authenticated, service_role;

create function t.request(p_student uuid, p_kind public.data_request_kind,
  p_workspace uuid default 'a0000000-0000-4000-8000-000000000001') returns uuid language sql as $$
  insert into public.data_requests (workspace_id, student_id, kind) values (p_workspace, p_student, p_kind)
  returning id
$$;

-- Seeded ids.
select t.put('ws', 'a0000000-0000-4000-8000-000000000001');
select t.put('history', 'e0000000-0000-4000-8000-000000000003');
select t.put('math2', 'e0000000-0000-4000-8000-000000000001');
select t.put('s7', 'd0000000-0000-4000-8003-000000000007');
select t.put('s21', 'd0000000-0000-4000-8003-000000000021');
select t.put('student7', (select student_id from public.sessions where id = t.id('s7')));
select t.put('student21', (select student_id from public.sessions where id = t.id('s21')));

select t.put('office', t.new_staff('office@w112.test', 'Dana Akhmetova', 'exam_office'));
select t.put('admin', t.new_staff('admin@w112.test', 'Admin W112', 'admin'));
select t.put('proctor', t.new_staff('proctor@w112.test', 'Aigerim Sadykova', 'proctor'));
insert into public.proctor_assignments (exam_id, staff_id, languages, is_lead)
values (t.id('history'), t.id('proctor'), '{ru}', true);
insert into public.workspaces (id, name, slug) values ('a0000000-0000-4000-8000-0000000001fb', 'Other U', 'other-w112');
select t.put('ws2', 'a0000000-0000-4000-8000-0000000001fb');
select t.put('office2', t.new_staff('office2@w112.test', 'Other Office', 'exam_office', t.id('ws2')));

-- Seat 7's student: a still on each of the two seeded flags, an answer, a decision, a report and a help
-- request, so the delete has every kind of row to remove or keep.
insert into public.frames (id, event_id, session_id, exam_id, storage_path, captured_at)
select t.put('frame_a', gen_random_uuid()), ev.id, ev.session_id, ev.exam_id,
  lower(ev.exam_id::text) || '/' || lower(ev.session_id::text) || '/' || lower(ev.id::text) || '-0.jpg', ev.at
from public.events ev where ev.session_id = t.id('s7') and ev.type = 'phone.detected';
insert into public.frames (id, event_id, session_id, exam_id, storage_path, captured_at)
select t.put('frame_b', gen_random_uuid()), ev.id, ev.session_id, ev.exam_id,
  lower(ev.exam_id::text) || '/' || lower(ev.session_id::text) || '/' || lower(ev.id::text) || '-0.jpg', ev.at
from public.events ev where ev.session_id = t.id('s7') and ev.type = 'gaze.off_screen';
-- Seat 21 (another student) keeps its still.
insert into public.frames (id, event_id, session_id, exam_id, storage_path, captured_at)
select t.put('frame_other', gen_random_uuid()), ev.id, ev.session_id, ev.exam_id, 'other/still-0.jpg', ev.at
from public.events ev where ev.session_id = t.id('s21') and ev.type = 'face.second';
insert into public.answers (session_id, question_id, choice_id, saved_at)
select t.id('s7'), q.id, 'a', now() - interval '1 day' from public.questions q order by q.id limit 1;
insert into public.review_decisions (session_id, exam_id, decision, note, reviewer_id)
values (t.id('s7'), t.id('history'), 'talk', 'Phone on the desk.', t.id('proctor'));
-- The verify code comes from the column default (WP 1.9's unused_verify_code).
insert into public.reports (session_id, exam_id, content_hash, created_by)
values (t.id('s7'), t.id('history'), 'hash', t.id('proctor'))
returning t.put('report', id);
insert into public.events (id, session_id, exam_id, type, source, review, at, data)
values (t.put('help_event', gen_random_uuid()), t.id('s7'), t.id('history'), 'student.help_requested', 'app', 'log',
  now() - interval '1 day', '{"topic":"question","text":"Question 7"}');
update public.sessions set rules_accepted_at = joined_at, rules_locale = 'kk' where id = t.id('s7');

-- ---------------------------------------------------------------------------
-- Due date
-- ---------------------------------------------------------------------------
select t.put('del', t.request(t.id('student7'), 'delete'));
select is((select (due_at - received_at)::text from public.data_requests where id = t.id('del')), '7 days',
  'a new request is due 7 days after it arrives, as A.5a draws it');

-- ---------------------------------------------------------------------------
-- Only the secret key runs the data-request functions
-- ---------------------------------------------------------------------------
select t.login(t.id('office'));
select is(t.err(format('select public.privacy_delete_plan(%L, %L)', t.id('del'), t.id('office'))),
  'permission denied for function privacy_delete_plan', 'the exam office cannot call the delete plan itself');
select is(t.err(format('select public.privacy_delete_student(%L, %L, 0)', t.id('del'), t.id('office'))),
  'permission denied for function privacy_delete_student', 'nor the delete');
select is(t.err(format('select public.privacy_export(%L, %L)', t.id('del'), t.id('office'))),
  'permission denied for function privacy_export', 'nor the export');
select is(t.err(format('select public.privacy_reply(%L, %L, %L)', t.id('del'), t.id('office'), 'No')),
  'permission denied for function privacy_reply', 'nor the reply');
select is(t.err(format('select public.privacy_export_done(%L, %L, %L, 1, now())', t.id('del'), t.id('office'), 'x')),
  'permission denied for function privacy_export_done', 'nor the copy''s completion');
reset role;
select t.anon();
select is(t.err(format('select public.privacy_delete_student(%L, %L, 0)', t.id('del'), t.id('office'))),
  'permission denied for function privacy_delete_student', 'an anonymous visitor cannot delete');
reset role;

-- ---------------------------------------------------------------------------
-- The actor: the exam office or an admin of the request's workspace
-- ---------------------------------------------------------------------------
select t.service();
select is(t.err(format('select public.privacy_delete_plan(%L, %L)', t.id('del'), t.id('proctor'))),
  'forbidden:exam office of the workspace only', 'a proctor is refused as the actor');
select is(t.err(format('select public.privacy_delete_plan(%L, %L)', t.id('del'), t.id('office2'))),
  'forbidden:exam office of the workspace only', 'another workspace''s office is refused');
select is(t.err(format('select public.privacy_delete_plan(%L, %L)', gen_random_uuid(), t.id('office'))),
  'not_found:request', 'an unknown request is not found');
select is(t.err(format('select public.privacy_export(%L, %L)', t.id('del'), t.id('office'))),
  'bad_request:kind', 'a delete request cannot be exported');
select is(t.err(format('select public.privacy_delete_plan(%L, %L)', t.id('del'), t.id('admin'))), null,
  'an admin of the workspace may act');
reset role;

-- ---------------------------------------------------------------------------
-- Not while the student writes a live exam
-- ---------------------------------------------------------------------------
select t.put('live_student', (select es.student_id from public.exam_students es where es.exam_id = t.id('math2')
  order by es.seat limit 1));
update public.exams set status = 'live' where id = t.id('math2');
insert into public.sessions (exam_id, student_id, auth_uid, state, locale)
values (t.id('math2'), t.id('live_student'), t.new_user(null, true), 'writing', 'kk');
select t.put('live_del', t.request(t.id('live_student'), 'delete'));
select t.service();
select is(t.err(format('select public.privacy_delete_plan(%L, %L)', t.id('live_del'), t.id('office'))),
  'conflict:in_exam', 'a student writing a live exam is not deleted');
reset role;

-- ---------------------------------------------------------------------------
-- The plan: still folders and paths, nothing changed
-- ---------------------------------------------------------------------------
select t.service();
create table t.plan as select public.privacy_delete_plan(t.id('del'), t.id('office')) as p;
reset role;
select is((select p ->> 'student_id' from t.plan), t.id('student7')::text, 'the plan names the student');
select ok((select p -> 'folders' from t.plan) ? (lower(t.id('history')::text) || '/' || lower(t.id('s7')::text)),
  'and lists each session''s still folder');
select is((select jsonb_array_length(p -> 'paths') from t.plan), 2, 'and the path of each of the two stills');
select is((select count(*) from public.frames where session_id = t.id('s7')), 2::bigint, 'the plan deletes nothing');

-- ---------------------------------------------------------------------------
-- The delete
-- ---------------------------------------------------------------------------
create table t.before as
select (select count(*) from public.events where session_id <> t.id('s7')) as other_events,
  (select receipt_id from public.sessions where id = t.id('s7')) as receipt;
select t.service();
create table t.deleted as select public.privacy_delete_student(t.id('del'), t.id('office'), 2) as r;
reset role;
select is((select r -> 'request' ->> 'status' from t.deleted), 'done', 'the request is done');
select is((select (r ->> 'frames')::int || '|' || (r ->> 'events')::int from t.deleted), '2|3',
  'two frames and three events (two flags and a help request) are deleted');
select is((select count(*) from public.frames where session_id = t.id('s7')), 0::bigint, 'the frames are gone');
select is((select count(*) from public.events where session_id = t.id('s7')), 0::bigint, 'the events are gone');
select is((select count(*) from public.help_requests where event_id = t.id('help_event')), 0::bigint,
  'the help request went with its event');
select is((select identity_score from public.sessions where id = t.id('s7')), null, 'the identity score is cleared');
select is((select device from public.sessions where id = t.id('s7')), '{}'::jsonb, 'the device record is cleared');
select is((select receipt_id from public.sessions where id = t.id('s7')), (select receipt from t.before),
  'the receipt is kept');
select is((select state::text || '|' || identity_result from public.sessions where id = t.id('s7')), 'submitted|matched',
  'the session is kept, with its result');
select is((select count(*) from public.answers where session_id = t.id('s7')), 1::bigint, 'the answers are kept');
select is((select decision::text from public.review_decisions where session_id = t.id('s7')), 'talk',
  'the decision is kept');
select is((select count(*) from public.reports where id = t.id('report')), 1::bigint, 'the integrity report is kept');
select is((select rules_locale::text from public.sessions where id = t.id('s7')), 'kk', 'the consent record is kept');
select is((select count(*) from public.events where session_id <> t.id('s7')), (select other_events from t.before),
  'no other student''s event is touched');
select is((select count(*) from public.frames where id = t.id('frame_other')), 1::bigint,
  'nor another student''s still');
select is((select status::text || '|' || done_by::text from public.data_requests where id = t.id('del')),
  'done|' || t.id('office')::text, 'the request records who did it');
select is((select actor_kind || '|' || object_type || '|' || (meta ->> 'stills') || '|' || (meta ->> 'frames') || '|'
    || (meta ->> 'events') || '|' || (meta ->> 'identity_scores') || '|' || (meta ->> 'devices')
  from public.audit_log where action = 'data_request.delete' and actor_id = t.id('office')
    and object_id = t.id('student7')::text),
  'staff|student|2|2|3|1|1', 'one audit row names the office, the student and what was deleted');
select t.service();
select is(t.err(format('select public.privacy_delete_student(%L, %L, 0)', t.id('del'), t.id('office'))),
  'conflict:already done', 'a delete runs once');
reset role;

-- ---------------------------------------------------------------------------
-- Copy
-- ---------------------------------------------------------------------------
select t.put('copy', t.request(t.id('student21'), 'copy'));
update public.sessions set rules_accepted_at = joined_at, rules_locale = 'ru' where id = t.id('s21');
select t.service();
create table t.package as select public.privacy_export(t.id('copy'), t.id('office')) as p;
reset role;
select is((select p ->> 'format' from t.package), 'uki.data-copy.v1', 'the package says what it is');
select is((select p -> 'student' ->> 'student_number' from t.package),
  (select student_number from public.students where id = t.id('student21')), 'and whose it is');
select is((select jsonb_array_length(p -> 'exams') from t.package), 1, 'exam history: the History session');
select is((select p -> 'exams' -> 0 ->> 'receipt_id' from t.package),
  (select receipt_id from public.sessions where id = t.id('s21')), 'with the receipt');
select is((select jsonb_array_length(p -> 'flags') from t.package), 1, 'flags: the second-face flag');
select is((select p -> 'flags' -> 0 -> 'frames' -> 0 ->> 'id' from t.package), t.id('frame_other')::text,
  'with its still');
select is((select p -> 'consent' -> 0 ->> 'rules_locale' from t.package), 'ru', 'consent records');
select is((select p -> 'devices' -> 0 -> 'device' ->> 'app_version' from t.package), '0.1.0', 'devices');
select is((select status::text from public.data_requests where id = t.id('copy')), 'received',
  'building the package changes nothing');
select t.service();
select is(t.err(format('select public.privacy_export_done(%L, %L, %L, 10, now())', t.id('copy'), t.id('office'),
  'elsewhere/file.json')), 'bad_request:path', 'the file must be the request''s own path');
select is((select (public.privacy_export_done(t.id('copy'), t.id('office'),
    lower(t.id('ws')::text) || '/' || lower(t.id('copy')::text) || '.json', 2048, now() + interval '7 days'))
  ->> 'status'), 'done', 'the written copy marks the request done');
reset role;
select is((select export_path from public.data_requests where id = t.id('copy')),
  lower(t.id('ws')::text) || '/' || lower(t.id('copy')::text) || '.json', 'with the file''s path');
select is((select (meta ->> 'bytes') from public.audit_log where action = 'data_request.copy'
  and object_id = t.id('student21')::text and actor_id = t.id('office')), '2048', 'and an audit row');

-- ---------------------------------------------------------------------------
-- Reply with a reason
-- ---------------------------------------------------------------------------
select t.put('reply', t.request(t.id('student21'), 'delete'));
select t.service();
select is(t.err(format('select public.privacy_reply(%L, %L, %L)', t.id('reply'), t.id('office'), '  ')),
  'bad_request:reply', 'a reply needs a reason');
select is((select public.privacy_reply(t.id('reply'), t.id('office'), 'Kept until the committee closes the case.')
  ->> 'status'), 'replied', 'the reply answers the request');
select is(t.err(format('select public.privacy_reply(%L, %L, %L)', t.id('reply'), t.id('office'), 'Again')),
  'conflict:already replied', 'once');
select is(t.err(format('select public.privacy_delete_plan(%L, %L)', t.id('reply'), t.id('office'))),
  'conflict:already replied', 'a replied delete request is not carried out');
reset role;
select is((select reply from public.data_requests where id = t.id('reply')), 'Kept until the committee closes the case.',
  'the reason is stored on the request');
select is((select (meta ->> 'reply_length')::int from public.audit_log where action = 'data_request.reply'
  and object_id = t.id('student21')::text), 41, 'the audit row notes its length, not its text');
select is((select count(*) from public.audit_log where action = 'data_request.reply'
  and meta::text like '%committee%'), 0::bigint, 'the reason itself is not in the audit log');

select * from finish();
rollback;
