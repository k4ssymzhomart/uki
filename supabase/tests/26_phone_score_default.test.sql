-- A1 (20261014010000_phone_score_default.sql): the default phone_score is 0.55. The column defaults of
-- exams.checks and workspaces.settings, the seed (which takes them), a new draft from save_exam_draft,
-- and the migration's move of a workspace whose 0.85 nobody chose (phone_score_untouched), while a
-- value chosen on A.4, 0.85 included, stays.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Test helpers, rolled back with the transaction (as in 10_wizard.test.sql).
create schema t;
grant usage, create on schema t to anon, authenticated, service_role;
create table t.ids (k text primary key, v uuid not null);
grant select on t.ids to anon, authenticated, service_role;

create function t.id(p_k text) returns uuid language sql stable as $$ select v from t.ids where k = p_k $$;

create function t.put(p_k text, p_v uuid) returns uuid language sql as $$
  insert into t.ids (k, v) values (p_k, p_v) on conflict (k) do update set v = excluded.v returning v
$$;

create function t.new_user(p_email text) returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, is_anonymous, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at)
  values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email, false,
    '{}'::jsonb, '{}'::jsonb, now(), now());
  return v_id;
end $$;

create function t.new_office(p_email text, p_workspace uuid) returns uuid language plpgsql as $$
declare v_id uuid := t.new_user(p_email);
begin
  insert into public.staff (id, workspace_id, full_name, role, languages)
  values (v_id, p_workspace, 'Office A1', 'exam_office', '{ru}');
  return v_id;
end $$;

create function t.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated',
    'aud', 'authenticated', 'is_anonymous', false)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- A column default, evaluated.
create function t.column_default(p_table regclass, p_column text) returns jsonb language plpgsql as $$
declare v_expr text; v_value jsonb;
begin
  select pg_get_expr(d.adbin, d.adrelid) into v_expr
  from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
  where d.adrelid = p_table and a.attname = p_column;
  execute 'select (' || v_expr || ')::jsonb' into v_value;
  return v_value;
end $$;

create function t.workspace(p_key text, p_slug text, p_phone numeric default null) returns uuid language plpgsql as $$
declare v_id uuid := t.put(p_key, gen_random_uuid());
begin
  insert into public.workspaces (id, name, slug) values (v_id, 'A1 ' || p_slug, p_slug);
  if p_phone is not null then
    -- As a workspace made before this migration: its settings column default held this phone_score.
    alter table public.workspaces disable trigger workspaces_settings_audit;
    update public.workspaces set settings = jsonb_set(settings, '{default_checks,phone_score}', to_jsonb(p_phone))
    where id = v_id;
    alter table public.workspaces enable trigger workspaces_settings_audit;
  end if;
  return v_id;
end $$;

create function t.phone(p_workspace uuid) returns jsonb language sql stable as $$
  select settings #> '{default_checks,phone_score}' from public.workspaces where id = p_workspace
$$;

-- The migration's move, as it ran on the cloud project.
create function t.move() returns void language sql as $$
  update public.workspaces w
  set settings = jsonb_set(w.settings, '{default_checks,phone_score}', '0.55'::jsonb)
  where public.phone_score_untouched(w.id)
$$;

-- ---------------------------------------------------------------------------
-- Column defaults (DEFAULT_EXAM_CHECKS and DEFAULT_WORKSPACE_SETTINGS in packages/contracts)
-- ---------------------------------------------------------------------------
select is(t.column_default('public.exams', 'checks'),
  '{"gaze_s":2,"phone_score":0.55,"face_missing_s":10,"identity":true,"lock":true}'::jsonb,
  'exams.checks defaults to phone_score 0.55 and the other checks unchanged');
select is(t.column_default('public.workspaces', 'settings'),
  '{"retention_days":90,"lobby_minutes":20,"default_duration_min":90,
    "default_checks":{"gaze_s":2,"phone_score":0.55,"face_missing_s":10,"identity":true,"lock":true}}'::jsonb,
  'workspaces.settings defaults to phone_score 0.55 and the other settings unchanged');
select ok(public.valid_settings(t.column_default('public.workspaces', 'settings')),
  'the new settings default passes workspaces_settings_valid');
select ok(public.valid_checks(t.column_default('public.exams', 'checks')), 'the new checks default passes valid_checks');

-- ---------------------------------------------------------------------------
-- The seed takes the column defaults
-- ---------------------------------------------------------------------------
select is((select settings #> '{default_checks,phone_score}' from public.workspaces
  where id = 'a0000000-0000-4000-8000-000000000001'), '0.55'::jsonb, 'the seeded KRU workspace defaults to 0.55');
select is((select checks ->> 'phone_score' from public.exams where code = 'MATH2-204-FRI'), '0.55',
  'the seeded Mathematics 2 checks phones at 0.55');
select is((select checks ->> 'phone_score' from public.exams where id = 'e0000000-0000-4000-8000-000000000004'), '0.55',
  'the seeded Linear Algebra draft checks phones at 0.55');

-- ---------------------------------------------------------------------------
-- phone_score_untouched and the move (before any login: the audit rows are the service's)
-- ---------------------------------------------------------------------------
select t.workspace('old', 'a1-old', 0.85);
select t.workspace('old_other_settings', 'a1-old-retention', 0.85);
update public.workspaces set settings = jsonb_set(settings, '{retention_days}', '30')
where id = t.id('old_other_settings');
select t.workspace('chosen_085', 'a1-chosen-085', 0.85);
update public.workspaces set settings = jsonb_set(settings, '{default_checks,phone_score}', '0.9')
where id = t.id('chosen_085');
update public.workspaces set settings = jsonb_set(settings, '{default_checks,phone_score}', '0.85')
where id = t.id('chosen_085');
select t.workspace('chosen_07', 'a1-chosen-07', 0.7);
select t.workspace('fresh', 'a1-fresh');

select ok(public.phone_score_untouched(t.id('old')), 'an untouched 0.85 counts as untouched');
select ok(public.phone_score_untouched(t.id('old_other_settings')),
  'a settings change that left phone_score alone keeps it untouched');
select ok(not public.phone_score_untouched(t.id('chosen_085')), 'a 0.85 chosen on A.4 (0.9, then 0.85 again) is not');
select ok(not public.phone_score_untouched(t.id('chosen_07')), 'another value is not');
select ok(not public.phone_score_untouched(t.id('fresh')), 'a workspace already at 0.55 is not');
select ok(not public.phone_score_untouched(gen_random_uuid()), 'an unknown workspace is not');

select t.move();
select is(t.phone(t.id('old')), '0.55'::jsonb, 'the move takes an untouched 0.85 to 0.55');
select is(t.phone(t.id('old_other_settings')), '0.55'::jsonb, 'also when other settings were changed');
select is((select settings -> 'retention_days' from public.workspaces where id = t.id('old_other_settings')), '30'::jsonb,
  'the move keeps the other settings');
select is(t.phone(t.id('chosen_085')), '0.85'::jsonb, 'a chosen 0.85 stays');
select is(t.phone(t.id('chosen_07')), '0.7'::jsonb, 'a chosen 0.7 stays');
select is((select count(*) from public.audit_log where action = 'settings.update' and object_id = t.id('old')::text
  and actor_kind = 'service' and meta #> '{before,default_checks,phone_score}' = '0.85'::jsonb
  and meta #> '{after,default_checks,phone_score}' = '0.55'::jsonb), 1::bigint,
  'the move is in the audit log as a settings.update by the service');
select ok(not public.phone_score_untouched(t.id('old')), 'after the move the workspace is no longer untouched');
select t.move();
select is((select count(*) from public.audit_log where action = 'settings.update' and object_id = t.id('old')::text),
  1::bigint, 'running the move again changes nothing');

select ok(not has_function_privilege('anon', 'public.phone_score_untouched(uuid)', 'execute'),
  'anon cannot call phone_score_untouched');
select ok(not has_function_privilege('authenticated', 'public.phone_score_untouched(uuid)', 'execute'),
  'authenticated cannot call phone_score_untouched');

-- ---------------------------------------------------------------------------
-- A new draft shows 0.55 (0.2 reads exams.checks)
-- ---------------------------------------------------------------------------
select t.put('office_fresh', t.new_office('office@a1-fresh.test', t.id('fresh')));
select t.put('office_kru', t.new_office('office@a1-kru.test', 'a0000000-0000-4000-8000-000000000001'));
select t.put('office_chosen', t.new_office('office@a1-chosen.test', t.id('chosen_07')));

select t.login(t.id('office_fresh'));
select is((public.save_exam_draft('{}') -> 'checks' ->> 'phone_score'), '0.55',
  'a new draft in a new workspace checks phones at 0.55');
select t.login(t.id('office_kru'));
select is((public.save_exam_draft('{}') -> 'checks'),
  '{"gaze_s":2,"phone_score":0.55,"face_missing_s":10,"identity":true,"lock":true}'::jsonb,
  'a new draft in the seeded KRU workspace takes the 0.55 default checks');
select t.login(t.id('office_chosen'));
select is((public.save_exam_draft('{}') -> 'checks' ->> 'phone_score'), '0.7',
  'a workspace that chose 0.7 still gives its drafts 0.7');
reset role;

select * from finish();
rollback;
