-- WP 1.3, the exam wizard through the API (20261011090000_assign_proctors_safeupdate.sql): PostgREST
-- loads pg-safeupdate, which refuses a DELETE without WHERE, so no function in public may hold one;
-- assign_proctors runs twice in one session; and the demo roster (demo/roster.csv after the six fixes
-- 0.3a asks for) imports twice without a duplicate, takes Aigerim and Nurlan on seats 1 to 12 and 13
-- to 24, and schedules with a MATH2-204 code.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

create schema t;
grant usage on schema t to authenticated;
create table t.ids (k text primary key, v uuid not null);
grant select, insert on t.ids to authenticated;
create function t.id(p_k text) returns uuid language sql stable as $$ select v from t.ids where k = p_k $$;

create function t.new_staff(p_k text, p_name text, p_role public.staff_role) returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, is_anonymous, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at)
  values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    p_k || '.w13@kru.test', false, '{}'::jsonb, '{}'::jsonb, now(), now());
  insert into public.staff (id, workspace_id, full_name, role, languages)
  values (v_id, 'a0000000-0000-4000-8000-000000000001', p_name, p_role, '{kk,ru}');
  insert into t.ids (k, v) values (p_k, v_id);
  return v_id;
end $$;

create function t.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated',
    'aud', 'authenticated', 'is_anonymous', false)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- ---------------------------------------------------------------------------
-- No bare DELETE in a function the API can reach
-- ---------------------------------------------------------------------------
select is(
  (select array_agg(p.proname::text order by p.proname)
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosrc ~* '\mdelete\s+from\s+[a-z0-9_."]+(\s+(as\s+)?[a-z_][a-z0-9_]*)?\s*;'),
  null,
  'no function in public deletes without a WHERE clause, which PostgREST''s safeupdate refuses');
select ok(
  pg_get_functiondef('public.assign_proctors(uuid, jsonb)'::regprocedure) ~ 'delete from pg_temp\.uki_assign where true;',
  'assign_proctors empties its scratch table with a WHERE clause');

-- ---------------------------------------------------------------------------
-- The demo roster, as 0.3 sends it after 0.3a's fixes
-- ---------------------------------------------------------------------------
select t.new_staff('office', 'Office W13', 'exam_office');
select t.new_staff('aigerim', 'Aigerim W13', 'proctor');
select t.new_staff('nurlan', 'Nurlan W13', 'proctor');

create table t.demo as
select jsonb_agg(jsonb_build_object('student_number', s.student_number, 'full_name', s.full_name,
  'email', s.email, 'group', '204', 'locale', s.locale) order by es.seat) as rows
from public.exam_students es join public.students s on s.id = es.student_id
where es.exam_id = 'e0000000-0000-4000-8000-000000000001' and es.seat <= 24;
grant select on t.demo to authenticated;

select is(jsonb_array_length((select rows from t.demo)), 24, 'the demo file has the 24 first seats of group 204');

select t.login(t.id('office'));
insert into t.ids (k, v)
select 'draft', (public.save_exam_draft(jsonb_build_object('title', 'Mathematics 2 · Retake', 'course', 'Mathematics 2',
  'kind', 'Midterm', 'group_ids', jsonb_build_array('a2000000-0000-4000-8000-000000000204'))) ->> 'id')::uuid;
reset role;

select t.login(t.id('office'));
select is(public.import_roster(t.id('draft'), (select rows from t.demo)),
  '{"inserted": 0, "updated": 24, "seats": 24, "removed": 0}'::jsonb, 'the first import finds all 24 students');
select is(public.import_roster(t.id('draft'), (select rows from t.demo)),
  '{"inserted": 0, "updated": 24, "seats": 24, "removed": 0}'::jsonb, 'importing the same file again adds nobody');
reset role;
select is((select count(*)::int from public.exam_students where exam_id = t.id('draft')), 24, '24 roster rows');
select is((select count(*)::int from public.invites where exam_id = t.id('draft') and state = 'pending'), 24,
  '24 pending invites');

select t.login(t.id('office'));
select lives_ok($$ select public.assign_proctors(t.id('draft'), jsonb_build_array(
  jsonb_build_object('staff_id', t.id('aigerim'), 'seat_from', 1, 'seat_to', 24, 'languages', '["kk","ru"]'::jsonb))) $$,
  'Aigerim takes every seat');
select is(public.assign_proctors(t.id('draft'), jsonb_build_array(
  jsonb_build_object('staff_id', t.id('aigerim'), 'seat_from', 1, 'seat_to', 12, 'languages', '["kk","ru"]'::jsonb),
  jsonb_build_object('staff_id', t.id('nurlan'), 'seat_from', 13, 'seat_to', 24, 'languages', '["ru","en"]'::jsonb)))
  -> 1 ->> 'full_name', 'Nurlan W13', 'a second call in the same session splits the seats 1 to 12 and 13 to 24');
select matches(public.schedule_exam(t.id('draft')) ->> 'code', '^MATH2-204-[A-Z]{3}[0-9]*$',
  'Schedule exam returns the code');
reset role;

select * from finish();
rollback;
