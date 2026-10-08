-- KRU demo world for Phase 0 (docs/phase-0-plan.md, "Demo script and seed data").
-- Times are relative to now(), so a fresh `supabase db reset` is demo-ready:
--   Mathematics 2 · Midterm   MATH2-204-FRI  app      scheduled  starts in 15 min, lobby open 20 min before
--   Physics 1 · Quiz 3        PHYS1-102-FRI  browser  live       started 5 min ago
--   History of Kazakhstan     no code        app      to_review  today 11:00 Almaty, 7 flag events
--   Linear Algebra · Final    no code        app      draft      in 6 days, 09:00 Almaty
--   English B2 · Reading      no code        app      reviewed   4 days ago, 15:00 Almaty
-- Staff rows need auth users, so `pnpm seed:staff` (scripts/seed-staff.ts) creates them after this.
-- Set `app.seed_lms_url` (the mock portal's base URL, SEED_LMS_URL) before loading this file to point
-- Physics 1 at a deployed portal; it defaults to http://localhost:5180.
--
-- Fixed ids (UUID v4 layout so the contracts' z.uuid() accepts them):
--   workspace  a0000000-0000-4000-8000-000000000001
--   faculties  a1000000-0000-4000-8000-00000000000{1 Mathematics, 2 Physics, 3 History, 4 Languages}
--   groups     a2000000-0000-4000-8000-000000000{204,101,102,103,110,301}
--   exams      e0000000-0000-4000-8000-00000000000{1 Mathematics 2, 2 Physics 1, 3 History, 4 Linear Algebra, 5 English B2}
--   students   b0000000-0000-4000-8000-0000<student number>
--   questions  c0000000-0000-4000-8000-0000000000<01..20>

-- One DO block: the CLI prepares every statement of a seed file up front, so statements that use
-- the scratch helpers below must be planned only when they run.
do $seed$
begin

-- Scratch schema for seed helpers; dropped at the end.
drop schema if exists seed_tmp cascade;
create schema seed_tmp;

-- ---------------------------------------------------------------------------
-- Workspace, faculties, groups
-- ---------------------------------------------------------------------------

insert into public.workspaces (id, name, slug, timezone) values
  ('a0000000-0000-4000-8000-000000000001', 'KRU · Kostanay', 'kru', 'Asia/Almaty');

insert into public.faculties (id, workspace_id, name) values
  ('a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Faculty of Mathematics'),
  ('a1000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'Faculty of Physics'),
  ('a1000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'Faculty of History'),
  ('a1000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'Faculty of Languages');

insert into public.groups (id, workspace_id, faculty_id, code) values
  ('a2000000-0000-4000-8000-000000000204', 'a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', '204'),
  ('a2000000-0000-4000-8000-000000000101', 'a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', '101'),
  ('a2000000-0000-4000-8000-000000000102', 'a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', '102'),
  ('a2000000-0000-4000-8000-000000000103', 'a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', '103'),
  ('a2000000-0000-4000-8000-000000000110', 'a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000003', '110'),
  ('a2000000-0000-4000-8000-000000000301', 'a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000004', '301');

-- ---------------------------------------------------------------------------
-- Students
-- ---------------------------------------------------------------------------

-- Deterministic generated Kazakh names (Latin transliteration, as on the Figma frames).
create function seed_tmp.seed_name(k int)
returns text
language sql
immutable
as $$
  select case when k % 2 = 0 then
    (array['Aigerim', 'Aruzhan', 'Madina', 'Zhansaya', 'Kamila', 'Dana', 'Saule', 'Ainur', 'Akbota', 'Aliya',
      'Asel', 'Dariga', 'Gulnaz', 'Inkar', 'Karina', 'Laura', 'Meruyert', 'Nazerke', 'Raushan', 'Togzhan',
      'Tomiris', 'Zarina', 'Dilnaz', 'Aisha'])[1 + (k * 7) % 24]
    || ' ' ||
    (array['Abenov', 'Akhmetov', 'Baimukhanov', 'Dzhaksybekov', 'Ermekov', 'Ibrayev', 'Kairatov', 'Mukanov',
      'Nurgaliyev', 'Rakhimov', 'Serikbayev', 'Suleimenov', 'Temirbekov', 'Tursynov', 'Utepov', 'Zhaksylykov',
      'Zhumabayev', 'Yessenov', 'Alimov', 'Baizakov', 'Iskakov', 'Karimov', 'Nurpeisov', 'Sarsenbayev',
      'Smagulov', 'Tolegenov', 'Zhunussov', 'Amanov', 'Beisenov', 'Kuanyshev', 'Orazov'])[1 + (k * 11) % 31]
    || 'a'
  else
    (array['Arman', 'Dias', 'Timur', 'Nurlan', 'Yerlan', 'Daniyar', 'Askar', 'Erlan', 'Bauyrzhan', 'Alikhan',
      'Azamat', 'Dauren', 'Ilyas', 'Kairat', 'Marat', 'Nursultan', 'Olzhas', 'Rustem', 'Sanzhar', 'Temirlan',
      'Yerzhan', 'Zhandos', 'Aibek', 'Abylai'])[1 + (k * 5) % 24]
    || ' ' ||
    (array['Abenov', 'Akhmetov', 'Baimukhanov', 'Dzhaksybekov', 'Ermekov', 'Ibrayev', 'Kairatov', 'Mukanov',
      'Nurgaliyev', 'Rakhimov', 'Serikbayev', 'Suleimenov', 'Temirbekov', 'Tursynov', 'Utepov', 'Zhaksylykov',
      'Zhumabayev', 'Yessenov', 'Alimov', 'Baizakov', 'Iskakov', 'Karimov', 'Nurpeisov', 'Sarsenbayev',
      'Smagulov', 'Tolegenov', 'Zhunussov', 'Amanov', 'Beisenov', 'Kuanyshev', 'Orazov'])[1 + (k * 11) % 31]
  end
$$;

create function seed_tmp.seed_student_id(p_number text)
returns uuid
language sql
immutable
as $$
  select ('b0000000-0000-4000-8000-' || lpad(p_number, 12, '0'))::uuid
$$;

-- Group 204: 128 students, seats 1 to 128. The named students from 1.5 and 2.4 keep their numbers
-- and seats; the other wall names (2.4 shows only initials) get generated surnames.
create table seed_tmp.seed_204 (seat int primary key, student_number text not null, full_name text not null,
  locale public.locale not null default 'kk', invite_status text not null default 'sent');

insert into seed_tmp.seed_204 (seat, student_number, full_name, invite_status) values
  (2, '20235002', 'Aigerim Baimukhanova', 'sent'),
  (5, '20230912', 'Arman Bekzhanov', 'sent'),
  (9, '20235009', 'Dana Zhaksylykova', 'sent'),
  (12, '20231044', 'Dias Kenzhebekov', 'sent'),
  (14, '20231219', 'Aruzhan Kassymova', 'sent'),
  (17, '20235017', 'Erlan Kairatov', 'sent'),
  (23, '20231187', 'Madina Tulegenova', 'sent'),
  (26, '20235026', 'Askar Mukanov', 'sent'),
  (30, '20235030', 'Timur Nurgaliyev', 'sent'),
  (33, '20231302', 'Zhansaya Omarova', 'sent'),
  (35, '20235035', 'Nurlan Abenov', 'sent'),
  (38, '20235038', 'Kamila Rakhimova', 'sent'),
  (41, '20230877', 'Yerlan Tokhtarov', 'bounced'),
  (47, '20235047', 'Daniyar Serikbayev', 'sent'),
  (55, '20235055', 'Saule Temirbekova', 'sent'),
  (61, '20235061', 'Bauyrzhan Tursynov', 'sent');

insert into seed_tmp.seed_204 (seat, student_number, full_name, locale)
select s, (20235000 + s)::text,
  -- Keep the 16 wall names unique: skip a generated name whose short form (Daniyar S.) is taken.
  case when split_part(seed_tmp.seed_name(s), ' ', 1) || ' ' || left(split_part(seed_tmp.seed_name(s), ' ', 2), 1)
      in (select split_part(full_name, ' ', 1) || ' ' || left(split_part(full_name, ' ', 2), 1) from seed_tmp.seed_204)
    then seed_tmp.seed_name(s + 1000) else seed_tmp.seed_name(s) end,
  case when s % 5 = 0 then 'ru'::public.locale else 'kk'::public.locale end
from generate_series(1, 128) as s
where s not in (select seat from seed_tmp.seed_204);

insert into public.students (id, workspace_id, student_number, full_name, email, group_id, locale)
select seed_tmp.seed_student_id(student_number), 'a0000000-0000-4000-8000-000000000001', student_number, full_name,
  student_number || '@student.kru.test', 'a2000000-0000-4000-8000-000000000204', locale
from seed_tmp.seed_204;

-- Groups 101 to 103: 28 students each. Aliya Seitkali (20231455) is in 102 and writes Physics 1.
insert into public.students (id, workspace_id, student_number, full_name, email, group_id, locale)
select seed_tmp.seed_student_id(n::text), 'a0000000-0000-4000-8000-000000000001', n::text,
  seed_tmp.seed_name(n % 997), n::text || '@student.kru.test',
  ('a2000000-0000-4000-8000-000000000' || g)::uuid,
  case when i % 3 = 0 then 'ru'::public.locale else 'kk'::public.locale end
from generate_series(101, 103) as g
cross join generate_series(1, 28) as i
cross join lateral (select 20250000 + (g - 100) * 1000 + i as n) x
where not (g = 102 and i = 28);

insert into public.students (id, workspace_id, student_number, full_name, email, group_id, locale) values
  (seed_tmp.seed_student_id('20231455'), 'a0000000-0000-4000-8000-000000000001', '20231455', 'Aliya Seitkali',
    '20231455@student.kru.test', 'a2000000-0000-4000-8000-000000000102', 'kk');

-- Group 110: 140 students (History of Kazakhstan).
insert into public.students (id, workspace_id, student_number, full_name, email, group_id, locale)
select seed_tmp.seed_student_id((20241000 + i)::text), 'a0000000-0000-4000-8000-000000000001', (20241000 + i)::text,
  seed_tmp.seed_name(i + 300), (20241000 + i)::text || '@student.kru.test', 'a2000000-0000-4000-8000-000000000110',
  case when i % 4 = 0 then 'ru'::public.locale else 'kk'::public.locale end
from generate_series(1, 140) as i;

-- Group 301: 96 students (English B2).
insert into public.students (id, workspace_id, student_number, full_name, email, group_id, locale)
select seed_tmp.seed_student_id((20223000 + i)::text), 'a0000000-0000-4000-8000-000000000001', (20223000 + i)::text,
  seed_tmp.seed_name(i + 600), (20223000 + i)::text || '@student.kru.test', 'a2000000-0000-4000-8000-000000000301',
  case when i % 3 = 0 then 'en'::public.locale when i % 3 = 1 then 'ru'::public.locale else 'kk'::public.locale end
from generate_series(1, 96) as i;

-- ---------------------------------------------------------------------------
-- Exams
-- ---------------------------------------------------------------------------

create table seed_tmp.seed_times as
select
  date_trunc('minute', now()) as now_min,
  (now() at time zone 'Asia/Almaty')::date as today_almaty;

insert into public.exams (id, workspace_id, faculty_id, title, course, kind, code, mode, starts_at, duration_min,
  lobby_opens_at, status, lms_url, lms_done_path)
select 'e0000000-0000-4000-8000-000000000001'::uuid, 'a0000000-0000-4000-8000-000000000001'::uuid,
  'a1000000-0000-4000-8000-000000000001'::uuid, 'Mathematics 2 · Midterm', 'Mathematics 2', 'Midterm',
  'MATH2-204-FRI', 'app'::public.exam_mode, t.now_min + interval '15 minutes', 90,
  t.now_min + interval '15 minutes' - interval '20 minutes', 'scheduled'::public.exam_status, null, null
from seed_tmp.seed_times t
union all
select 'e0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000002', 'Physics 1 · Quiz 3', 'Physics 1', 'Quiz 3',
  'PHYS1-102-FRI', 'browser', t.now_min - interval '5 minutes', 40,
  t.now_min - interval '25 minutes', 'live',
  case
    when coalesce(nullif(current_setting('app.seed_lms_url', true), ''), 'http://localhost:5180') like '%/physics-1/quiz-3'
      then current_setting('app.seed_lms_url', true)
    else rtrim(coalesce(nullif(current_setting('app.seed_lms_url', true), ''), 'http://localhost:5180'), '/')
      || '/physics-1/quiz-3'
  end,
  '/physics-1/quiz-3/review'
from seed_tmp.seed_times t
union all
select 'e0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000003', 'History of Kazakhstan · Test', 'History of Kazakhstan', 'Test',
  null, 'app', h.starts_at, 60, h.starts_at - interval '20 minutes', 'to_review', null, null
from seed_tmp.seed_times t
cross join lateral (
  -- Today at 11:00 in Almaty, or yesterday's when today's has not finished yet.
  select case
    when ((t.today_almaty + time '11:00') at time zone 'Asia/Almaty') + interval '60 minutes' < now()
      then (t.today_almaty + time '11:00') at time zone 'Asia/Almaty'
    else ((t.today_almaty - 1 + time '11:00') at time zone 'Asia/Almaty')
  end as starts_at
) h
union all
select 'e0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001', 'Linear Algebra · Final', 'Linear Algebra', 'Final',
  null, 'app', (t.today_almaty + 6 + time '09:00') at time zone 'Asia/Almaty', 180,
  ((t.today_almaty + 6 + time '09:00') at time zone 'Asia/Almaty') - interval '20 minutes', 'draft', null, null
from seed_tmp.seed_times t
union all
select 'e0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000004', 'English B2 · Reading', 'English B2', 'Reading',
  null, 'app', (t.today_almaty - 4 + time '15:00') at time zone 'Asia/Almaty', 50,
  ((t.today_almaty - 4 + time '15:00') at time zone 'Asia/Almaty') - interval '20 minutes', 'reviewed', null, null
from seed_tmp.seed_times t;

insert into public.exam_groups (exam_id, group_id) values
  ('e0000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000204'),
  ('e0000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000101'),
  ('e0000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000102'),
  ('e0000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000103'),
  ('e0000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000110'),
  ('e0000000-0000-4000-8000-000000000004', 'a2000000-0000-4000-8000-000000000204'),
  ('e0000000-0000-4000-8000-000000000004', 'a2000000-0000-4000-8000-000000000101'),
  ('e0000000-0000-4000-8000-000000000004', 'a2000000-0000-4000-8000-000000000102'),
  ('e0000000-0000-4000-8000-000000000004', 'a2000000-0000-4000-8000-000000000103'),
  ('e0000000-0000-4000-8000-000000000005', 'a2000000-0000-4000-8000-000000000301');

-- Rosters. Mathematics 2 keeps the 204 seats; the others number seats by group, then student number.
insert into public.exam_students (exam_id, student_id, seat, invite_status)
select 'e0000000-0000-4000-8000-000000000001', seed_tmp.seed_student_id(s.student_number), s.seat, s.invite_status
from seed_tmp.seed_204 s;

insert into public.exam_students (exam_id, student_id, seat, invite_status)
select x.exam_id, st.id, row_number() over (partition by x.exam_id order by g.code, st.student_number), 'sent'
from (values
  ('e0000000-0000-4000-8000-000000000002'::uuid, array['101', '102', '103']),
  ('e0000000-0000-4000-8000-000000000003'::uuid, array['110']),
  ('e0000000-0000-4000-8000-000000000005'::uuid, array['301'])
) as x(exam_id, codes)
join public.groups g on g.code = any (x.codes)
join public.students st on st.group_id = g.id;

-- Linear Algebra · Final: all four Mathematics-faculty course groups, 212 students; 204 first.
insert into public.exam_students (exam_id, student_id, seat, invite_status)
select 'e0000000-0000-4000-8000-000000000004', st.id,
  row_number() over (order by case when g.code = '204' then 0 else 1 end, g.code, st.student_number), 'pending'
from public.students st
join public.groups g on g.id = st.group_id
where g.code in ('204', '101', '102', '103');

-- ---------------------------------------------------------------------------
-- Mathematics 2 questions: 20 single-choice questions in kk, ru and en. Question 7 is frame 2.1
-- (51:2074, 167:14760, 168:15535). Formulas read the same in every language.
-- ---------------------------------------------------------------------------

create function seed_tmp.same(t text)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object('kk', t, 'ru', t, 'en', t)
$$;

create function seed_tmp.choices(a text, b text, c text, d text)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_array(
    jsonb_build_object('id', 'a', 'body', seed_tmp.same(a)),
    jsonb_build_object('id', 'b', 'body', seed_tmp.same(b)),
    jsonb_build_object('id', 'c', 'body', seed_tmp.same(c)),
    jsonb_build_object('id', 'd', 'body', seed_tmp.same(d))
  )
$$;

insert into public.questions (id, workspace_id, body, choices, topic)
select ('c0000000-0000-4000-8000-0000000000' || lpad(q.n::text, 2, '0'))::uuid,
  'a0000000-0000-4000-8000-000000000001',
  jsonb_build_object('kk', q.kk, 'ru', q.ru, 'en', q.en),
  q.choices, q.topic
from (values
  (1, 'limits',
    'x → 1 кезде (x² − 1)/(x − 1) өрнегінің шегін табыңыз.',
    'Найдите предел (x² − 1)/(x − 1) при x → 1.',
    'Find the limit of (x² − 1)/(x − 1) as x → 1.',
    seed_tmp.choices('1', '2', '0', '∞')),
  (2, 'derivatives',
    'f(x) = sin x · cos x функциясының туындысын табыңыз.',
    'Найдите производную f(x) = sin x · cos x.',
    'Find the derivative of f(x) = sin x · cos x.',
    seed_tmp.choices('sin 2x', 'cos 2x', '−sin 2x', 'cos² x')),
  (3, 'integrals',
    '∫₀¹ 2x dx интегралын есептеңіз.',
    'Вычислите ∫₀¹ 2x dx.',
    'Evaluate ∫₀¹ 2x dx.',
    seed_tmp.choices('0', '1/2', '1', '2')),
  (4, 'derivatives',
    'f(x) = x · eˣ функциясының туындысын табыңыз.',
    'Найдите производную f(x) = x · eˣ.',
    'Find the derivative of f(x) = x · eˣ.',
    seed_tmp.choices('eˣ', 'x · eˣ', 'eˣ(x − 1)', 'eˣ(x + 1)')),
  (5, 'tangents',
    'y = x² қисығына x = 3 нүктесінде жүргізілген жанаманың бұрыштық коэффициентін табыңыз.',
    'Найдите угловой коэффициент касательной к y = x² в точке x = 3.',
    'Find the slope of the tangent to y = x² at x = 3.',
    seed_tmp.choices('6', '3', '9', '2')),
  (6, 'integrals',
    'x > 0 болғанда f(x) = 1/x функциясының алғашқы функциясын табыңыз.',
    'Найдите первообразную f(x) = 1/x при x > 0.',
    'Find an antiderivative of f(x) = 1/x for x > 0.',
    seed_tmp.choices('−1/x² + C', 'ln x + C', 'x + C', 'eˣ + C')),
  (7, 'derivatives',
    'f(x) = x³ − 4x + 1 функциясының туындысын табыңыз.',
    'Найдите производную f(x) = x³ − 4x + 1.',
    'Find the derivative of f(x) = x³ − 4x + 1.',
    seed_tmp.choices('3x² − 4', 'x² − 4x', '3x² − 4x + 1', '3x − 4')),
  (8, 'derivatives',
    'f(x) = x⁴ функциясының екінші ретті туындысын табыңыз.',
    'Найдите вторую производную f(x) = x⁴.',
    'Find the second derivative of f(x) = x⁴.',
    seed_tmp.choices('4x³', '12x', '12x²', '24x')),
  (9, 'limits',
    'x → 0 кезде sin x / x өрнегінің шегін табыңыз.',
    'Найдите предел sin x / x при x → 0.',
    'Find the limit of sin x / x as x → 0.',
    seed_tmp.choices('0', '∞', '−1', '1')),
  (10, 'extrema',
    'x-тің қандай мәнінде f(x) = x² − 6x + 5 функциясы ең кіші мәнін қабылдайды?',
    'При каком x функция f(x) = x² − 6x + 5 принимает наименьшее значение?',
    'At which x does f(x) = x² − 6x + 5 take its smallest value?',
    seed_tmp.choices('3', '−3', '5', '1')),
  (11, 'integrals',
    '∫ cos x dx интегралын есептеңіз.',
    'Вычислите ∫ cos x dx.',
    'Evaluate ∫ cos x dx.',
    seed_tmp.choices('−sin x + C', 'sin x + C', 'cos x + C', '−cos x + C')),
  (12, 'derivatives',
    'f(x) = ln(x² + 1) функциясының туындысын табыңыз.',
    'Найдите производную f(x) = ln(x² + 1).',
    'Find the derivative of f(x) = ln(x² + 1).',
    seed_tmp.choices('1/(x² + 1)', '2x', '2x/(x² + 1)', 'ln 2x')),
  (13, 'integrals',
    'x = 0-ден x = 3-ке дейін y = x² графигінің астындағы ауданды табыңыз.',
    'Найдите площадь под графиком y = x² от x = 0 до x = 3.',
    'Find the area under y = x² from x = 0 to x = 3.',
    seed_tmp.choices('27', '3', '6', '9')),
  (14, 'series',
    'Қай қатар жинақты?',
    'Какой из рядов сходится?',
    'Which series converges?',
    seed_tmp.choices('∑ 1/n²', '∑ 1/n', '∑ n', '∑ 1')),
  (15, 'derivatives',
    'f(x) = √x функциясының туындысын табыңыз.',
    'Найдите производную f(x) = √x.',
    'Find the derivative of f(x) = √x.',
    seed_tmp.choices('2√x', '1/(2√x)', '√x/2', '1/√x')),
  (16, 'extrema',
    'x > 0 болғанда f(x) = x³ − 3x функциясының сындық нүктесін табыңыз.',
    'Найдите критическую точку f(x) = x³ − 3x при x > 0.',
    'Find the critical point of f(x) = x³ − 3x for x > 0.',
    seed_tmp.choices('3', '√3', '1', '2')),
  (17, 'integrals',
    '∫₁ᵉ (1/x) dx интегралын есептеңіз.',
    'Вычислите ∫₁ᵉ (1/x) dx.',
    'Evaluate ∫₁ᵉ (1/x) dx.',
    seed_tmp.choices('e', '0', 'e − 1', '1')),
  (18, 'derivatives',
    'f(x) = 1/x функциясының туындысын табыңыз.',
    'Найдите производную f(x) = 1/x.',
    'Find the derivative of f(x) = 1/x.',
    seed_tmp.choices('−1/x²', '1/x²', 'ln x', '−1/x')),
  (19, 'limits',
    'n → ∞ кезде (1 + 1/n)ⁿ өрнегінің шегін табыңыз.',
    'Найдите предел (1 + 1/n)ⁿ при n → ∞.',
    'Find the limit of (1 + 1/n)ⁿ as n → ∞.',
    seed_tmp.choices('1', 'e', '∞', '0')),
  (20, 'derivatives',
    'f(x) = cos(3x) функциясының туындысын табыңыз.',
    'Найдите производную f(x) = cos(3x).',
    'Find the derivative of f(x) = cos(3x).',
    seed_tmp.choices('3 sin(3x)', '−sin(3x)', '3 cos(3x)', '−3 sin(3x)'))
) as q(n, topic, kk, ru, en, choices);

insert into public.exam_questions (exam_id, question_id, position)
select 'e0000000-0000-4000-8000-000000000001', ('c0000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, n
from generate_series(1, 20) as n;

-- ---------------------------------------------------------------------------
-- Past sessions: History (to_review, 7 flags) and English B2 (reviewed)
-- ---------------------------------------------------------------------------

-- History: 136 of 140 wrote; two ran out of time. Session ids d0000000-0000-4000-8003-<seat>.
insert into public.sessions (id, exam_id, student_id, auth_uid, state, locale, device, identity_result,
  identity_score, joined_at, started_at, submitted_at, extra_min, paused_s, time_used_s, last_seen_at)
select
  ('d0000000-0000-4000-8003-' || lpad(es.seat::text, 12, '0'))::uuid,
  e.id, es.student_id,
  ('f0000000-0000-4000-8003-' || lpad(es.seat::text, 12, '0'))::uuid,
  case when es.seat in (40, 90) then 'time_up'::public.session_state else 'submitted'::public.session_state end,
  st.locale,
  case when es.seat % 3 = 0
    then '{"os":"windows","app_version":"0.1.0"}'::jsonb
    else '{"os":"macos","app_version":"0.1.0"}'::jsonb end,
  'matched', 0.7 + (es.seat % 25) / 100.0,
  e.starts_at - make_interval(mins => 5 + es.seat % 10),
  e.starts_at + make_interval(secs => es.seat % 50),
  e.starts_at + make_interval(mins => case when es.seat in (40, 90) then 60 else 35 + es.seat % 24 end),
  0, 0,
  case when es.seat in (40, 90) then 3600 else (35 + es.seat % 24) * 60 end,
  e.starts_at + make_interval(mins => case when es.seat in (40, 90) then 62 else 35 + es.seat % 24 end)
from public.exams e
join public.exam_students es on es.exam_id = e.id
join public.students st on st.id = es.student_id
where e.id = 'e0000000-0000-4000-8000-000000000003' and es.seat <= 136;

update public.sessions se
set receipt_id = public.make_receipt_id(se.student_id)
where se.exam_id = 'e0000000-0000-4000-8000-000000000003';

-- Seven flag events and a few log events for the History review queue.
insert into public.events (id, session_id, exam_id, type, source, review, seq, at, received_at, data, frame_count, app_version)
select
  ('e1000000-0000-4000-8003-' || lpad(x.n::text, 12, '0'))::uuid,
  ('d0000000-0000-4000-8003-' || lpad(x.seat::text, 12, '0'))::uuid,
  'e0000000-0000-4000-8000-000000000003',
  x.type, 'app', x.review::public.event_review, x.seq,
  e.starts_at + make_interval(mins => x.minute),
  e.starts_at + make_interval(mins => x.minute, secs => 1),
  x.data::jsonb, 0, '0.1.0'
from public.exams e
cross join (values
  (1, 7, 'phone.detected', 'flag', 14, 12, '{"score":0.94,"held_ms":6000}'),
  (2, 7, 'gaze.off_screen', 'flag', 15, 18, '{"duration_ms":4200,"direction":"left"}'),
  (3, 21, 'face.second', 'flag', 9, 22, '{"duration_ms":4000,"faces":2}'),
  (4, 33, 'phone.detected', 'flag', 20, 31, '{"score":0.91,"held_ms":2400}'),
  (5, 48, 'tab.blocked', 'flag', 11, 26, '{"app":"Telegram"}'),
  (6, 48, 'gaze.down', 'flag', 13, 40, '{"duration_ms":3100}'),
  (7, 64, 'camera.lost', 'flag', 6, 44, '{"reason":"ended"}'),
  (8, 12, 'net.offline', 'log', 10, 29, '{"offline_ms":42000,"queued":6}'),
  (9, 64, 'session.paused', 'log', 7, 44, '{"reason":"camera_lost"}'),
  (10, 64, 'session.resumed', 'none', 8, 45, '{"paused_ms":38000,"by":"student"}')
) as x(n, seat, type, review, seq, minute, data)
where e.id = 'e0000000-0000-4000-8000-000000000003';

-- English B2: 94 of 96 submitted. Session ids d0000000-0000-4000-8005-<seat>.
insert into public.sessions (id, exam_id, student_id, auth_uid, state, locale, device, identity_result,
  identity_score, joined_at, started_at, submitted_at, time_used_s, last_seen_at)
select
  ('d0000000-0000-4000-8005-' || lpad(es.seat::text, 12, '0'))::uuid,
  e.id, es.student_id,
  ('f0000000-0000-4000-8005-' || lpad(es.seat::text, 12, '0'))::uuid,
  'submitted', st.locale,
  case when es.seat % 2 = 0
    then '{"os":"windows","app_version":"0.1.0"}'::jsonb
    else '{"os":"macos","app_version":"0.1.0"}'::jsonb end,
  'matched', 0.7 + (es.seat % 25) / 100.0,
  e.starts_at - make_interval(mins => 5 + es.seat % 10),
  e.starts_at + make_interval(secs => es.seat % 50),
  e.starts_at + make_interval(mins => 30 + es.seat % 19),
  (30 + es.seat % 19) * 60,
  e.starts_at + make_interval(mins => 30 + es.seat % 19)
from public.exams e
join public.exam_students es on es.exam_id = e.id
join public.students st on st.id = es.student_id
where e.id = 'e0000000-0000-4000-8000-000000000005' and es.seat <= 94;

update public.sessions se
set receipt_id = public.make_receipt_id(se.student_id)
where se.exam_id = 'e0000000-0000-4000-8000-000000000005';

drop schema seed_tmp cascade;

end
$seed$;

-- ===========================================================================
-- Seed v2 (docs/phase-1-plan.md, "Seed v2"; WP 1.14). scripts/lib/seed-v2 holds the same world as data.
-- This file adds what every test and every fresh `supabase db reset` can live with:
--   - Seven more Mathematics groups (201 to 208 without 204, 836 students), so the workspace has
--     A.2's 1,284 students, and a programme and year for every seeded student
--   - Yerlan Tokhtarov's mistyped address, the one 0.3b strikes out
--   - The "Autumn 2026" term: 42 past exams in three faculties from 1 September to 7 October, with
--     rosters, sessions and flags, tuned so A.1 (102:10454) shows its frame's numbers for the Faculty
--     of Mathematics. The data comes from scripts/lib/seed-v2/term.ts (`pnpm seed:term` writes it)
-- Review decisions need their reviewers' staff rows, so `pnpm seed:staff` writes the term's decisions.
-- The rest of seed v2 changes rows the pgTAP and e2e tests count (invites, help requests, data
-- requests, shares, Dana's languages) or needs Storage, so only `pnpm demo:reset` writes it: Mathematics
-- 2's invites with Yerlan's bounced, Nurlan's unconfirmed seats, History of Kazakhstan's seven stills,
-- the open help request on Physics 1, the two data requests, the shared English B2 report and the still
-- dated 91 days ago.
--
-- More fixed ids:
--   groups      a2000000-0000-4000-8000-000000000{201,202,203,205,206,207,208}
--   students    of those groups: 20240000 + ((code - 199) % 9) * 1000 + n, so group 201 is 20242001 to
--               20242124 and group 208 is 20240001 to 20240122 (20249xxx is judge mode's DEMO group)
--   term exams  e0000000-0000-4000-8100-0000000000<01..42>
--   sessions    d1000000-0000-4000-81<exam>-<student number>, auth uids f1000000-…, flags e1100000-…
-- ===========================================================================

do $seed_v2$
begin

drop schema if exists seed_v2 cascade;
create schema seed_v2;

-- seed_tmp.seed_name of the Phase 0 block, which dropped its schema.
create function seed_v2.seed_name(k int)
returns text
language sql
immutable
as $$
  select case when k % 2 = 0 then
    (array['Aigerim', 'Aruzhan', 'Madina', 'Zhansaya', 'Kamila', 'Dana', 'Saule', 'Ainur', 'Akbota', 'Aliya',
      'Asel', 'Dariga', 'Gulnaz', 'Inkar', 'Karina', 'Laura', 'Meruyert', 'Nazerke', 'Raushan', 'Togzhan',
      'Tomiris', 'Zarina', 'Dilnaz', 'Aisha'])[1 + (k * 7) % 24]
    || ' ' ||
    (array['Abenov', 'Akhmetov', 'Baimukhanov', 'Dzhaksybekov', 'Ermekov', 'Ibrayev', 'Kairatov', 'Mukanov',
      'Nurgaliyev', 'Rakhimov', 'Serikbayev', 'Suleimenov', 'Temirbekov', 'Tursynov', 'Utepov', 'Zhaksylykov',
      'Zhumabayev', 'Yessenov', 'Alimov', 'Baizakov', 'Iskakov', 'Karimov', 'Nurpeisov', 'Sarsenbayev',
      'Smagulov', 'Tolegenov', 'Zhunussov', 'Amanov', 'Beisenov', 'Kuanyshev', 'Orazov'])[1 + (k * 11) % 31]
    || 'a'
  else
    (array['Arman', 'Dias', 'Timur', 'Nurlan', 'Yerlan', 'Daniyar', 'Askar', 'Erlan', 'Bauyrzhan', 'Alikhan',
      'Azamat', 'Dauren', 'Ilyas', 'Kairat', 'Marat', 'Nursultan', 'Olzhas', 'Rustem', 'Sanzhar', 'Temirlan',
      'Yerzhan', 'Zhandos', 'Aibek', 'Abylai'])[1 + (k * 5) % 24]
    || ' ' ||
    (array['Abenov', 'Akhmetov', 'Baimukhanov', 'Dzhaksybekov', 'Ermekov', 'Ibrayev', 'Kairatov', 'Mukanov',
      'Nurgaliyev', 'Rakhimov', 'Serikbayev', 'Suleimenov', 'Temirbekov', 'Tursynov', 'Utepov', 'Zhaksylykov',
      'Zhumabayev', 'Yessenov', 'Alimov', 'Baizakov', 'Iskakov', 'Karimov', 'Nurpeisov', 'Sarsenbayev',
      'Smagulov', 'Tolegenov', 'Zhunussov', 'Amanov', 'Beisenov', 'Kuanyshev', 'Orazov'])[1 + (k * 11) % 31]
  end
$$;

-- mix() of scripts/lib/seed-v2/term.ts: a Lehmer step twice over a linear mix, all below 2^53.
create function seed_v2.mix(a bigint, b bigint, salt bigint)
returns bigint
language sql
immutable
as $$
  select ((((((a * 73856093 + b * 19349663 + salt * 83492791) % 2147483647) * 48271) % 2147483647) * 48271)
    % 2147483647)
$$;

-- ---------------------------------------------------------------------------
-- Groups, students, programme and year (world.ts)
-- ---------------------------------------------------------------------------

create table seed_v2.groups (code text primary key, faculty_id uuid not null, programme text not null,
  year int not null, size int);
insert into seed_v2.groups (code, faculty_id, programme, year, size) values
  ('204', 'a1000000-0000-4000-8000-000000000001', 'Mathematics', 2, null),
  ('101', 'a1000000-0000-4000-8000-000000000002', 'Physics', 1, null),
  ('102', 'a1000000-0000-4000-8000-000000000002', 'Physics', 1, null),
  ('103', 'a1000000-0000-4000-8000-000000000002', 'Physics', 1, null),
  ('110', 'a1000000-0000-4000-8000-000000000003', 'History', 1, null),
  ('301', 'a1000000-0000-4000-8000-000000000004', 'Foreign languages', 3, null),
  ('201', 'a1000000-0000-4000-8000-000000000001', 'Mathematics', 2, 124),
  ('202', 'a1000000-0000-4000-8000-000000000001', 'Mathematics', 2, 118),
  ('203', 'a1000000-0000-4000-8000-000000000001', 'Mathematics', 2, 122),
  ('205', 'a1000000-0000-4000-8000-000000000001', 'Mathematics', 2, 116),
  ('206', 'a1000000-0000-4000-8000-000000000001', 'Mathematics', 2, 120),
  ('207', 'a1000000-0000-4000-8000-000000000001', 'Mathematics', 2, 114),
  ('208', 'a1000000-0000-4000-8000-000000000001', 'Mathematics', 2, 122);

insert into public.groups (id, workspace_id, faculty_id, code)
select ('a2000000-0000-4000-8000-' || lpad(g.code, 12, '0'))::uuid, 'a0000000-0000-4000-8000-000000000001',
  g.faculty_id, g.code
from seed_v2.groups g
where g.size is not null;

insert into public.students (id, workspace_id, student_number, full_name, email, group_id, locale)
select ('b0000000-0000-4000-8000-' || lpad(x.n::text, 12, '0'))::uuid, 'a0000000-0000-4000-8000-000000000001',
  x.n::text, seed_v2.seed_name(x.n % 997 + 1000), x.n::text || '@student.kru.test',
  ('a2000000-0000-4000-8000-' || lpad(g.code, 12, '0'))::uuid,
  case when i % 5 = 0 then 'ru'::public.locale else 'kk'::public.locale end
from seed_v2.groups g
cross join lateral generate_series(1, g.size) as i
cross join lateral (select 20240000 + ((g.code::int - 199) % 9) * 1000 + i as n) x
where g.size is not null;

update public.students st
set programme = g.programme, year = g.year
from public.groups pg
join seed_v2.groups g on g.code = pg.code
where pg.id = st.group_id;

-- A.2 draws Zhansaya Omarova as an exchange student, with no year.
update public.students set programme = 'Exchange student', year = null where student_number = '20231302';

-- Yerlan Tokhtarov's address on the roster is mistyped: his Mathematics 2 invite bounces there (0.3b,
-- Figma 160:13301), which `pnpm demo:reset` writes with the other invites.
update public.students set email = 'yerlan.tokhtarov@kru.test' where student_number = '20230877';

-- ---------------------------------------------------------------------------
-- The term's scratch tables, filled by the generated block below
-- ---------------------------------------------------------------------------

create table seed_v2.term_exams (idx int primary key, faculty text not null, course text not null,
  kind text not null, groups text[] not null, starts_at timestamptz not null, duration_min int not null);
create table seed_v2.term_absent (idx int not null, student_number text not null,
  primary key (idx, student_number));
create table seed_v2.term_flags (idx int not null, k int not null, student_number text not null, type text not null,
  seq int not null, at_s int not null, received_s int not null, data jsonb not null, primary key (idx, k));

end
$seed_v2$;

-- BEGIN seed v2 term data (generated by pnpm seed:term from scripts/lib/seed-v2, do not edit)
-- 42 exams, 164 absences, 537 flags (times in seconds from the exam's start).
do $seed_v2_term_data$
begin

insert into seed_v2.term_exams (idx, faculty, course, kind, groups, starts_at, duration_min) values
  (1, 'mathematics', 'Mathematical Analysis 3', 'Quiz 1', array['201', '202'], '2026-09-01T05:00:00.000Z', 40),
  (2, 'mathematics', 'Mathematics 2', 'Quiz 1', array['204'], '2026-09-02T05:00:00.000Z', 40),
  (3, 'mathematics', 'Discrete Mathematics', 'Quiz 1', array['203'], '2026-09-02T09:00:00.000Z', 40),
  (4, 'mathematics', 'Probability Theory', 'Quiz 1', array['205'], '2026-09-03T05:00:00.000Z', 40),
  (5, 'mathematics', 'Differential Equations', 'Quiz 1', array['206'], '2026-09-03T09:00:00.000Z', 40),
  (6, 'mathematics', 'Programming in Python', 'Quiz 1', array['207'], '2026-09-04T05:00:00.000Z', 40),
  (7, 'mathematics', 'Analytic Geometry', 'Quiz 1', array['208'], '2026-09-07T05:00:00.000Z', 40),
  (8, 'mathematics', 'Linear Algebra', 'Quiz 1', array['201'], '2026-09-08T05:00:00.000Z', 40),
  (9, 'mathematics', 'Discrete Mathematics', 'Quiz 1', array['202'], '2026-09-08T09:00:00.000Z', 40),
  (10, 'mathematics', 'Probability Theory', 'Quiz 1', array['203', '205'], '2026-09-09T05:00:00.000Z', 40),
  (11, 'mathematics', 'Linear Algebra', 'Quiz 1', array['204'], '2026-09-10T05:00:00.000Z', 40),
  (12, 'mathematics', 'Programming in Python', 'Quiz 1', array['206'], '2026-09-10T09:00:00.000Z', 40),
  (13, 'mathematics', 'Analytic Geometry', 'Quiz 1', array['207'], '2026-09-11T05:00:00.000Z', 40),
  (14, 'mathematics', 'Numerical Methods', 'Quiz 1', array['208'], '2026-09-14T05:00:00.000Z', 40),
  (15, 'mathematics', 'Discrete Mathematics', 'Test', array['201'], '2026-09-15T05:00:00.000Z', 60),
  (16, 'mathematics', 'Probability Theory', 'Test', array['202'], '2026-09-15T09:00:00.000Z', 60),
  (17, 'mathematics', 'Differential Equations', 'Test', array['203'], '2026-09-16T05:00:00.000Z', 60),
  (18, 'mathematics', 'Discrete Mathematics', 'Test', array['204'], '2026-09-16T09:00:00.000Z', 60),
  (19, 'mathematics', 'Programming in Python', 'Test', array['205'], '2026-09-17T05:00:00.000Z', 60),
  (20, 'mathematics', 'Analytic Geometry', 'Test', array['206', '207'], '2026-09-18T05:00:00.000Z', 60),
  (21, 'mathematics', 'Mathematical Analysis 3', 'Test', array['208'], '2026-09-21T05:00:00.000Z', 60),
  (22, 'mathematics', 'Probability Theory', 'Quiz 2', array['201', '208'], '2026-09-22T05:00:00.000Z', 40),
  (23, 'mathematics', 'Differential Equations', 'Quiz 2', array['202'], '2026-09-23T05:00:00.000Z', 40),
  (24, 'mathematics', 'Programming in Python', 'Quiz 2', array['203'], '2026-09-23T09:00:00.000Z', 40),
  (25, 'mathematics', 'Probability Theory', 'Quiz 1', array['204'], '2026-09-24T05:00:00.000Z', 40),
  (26, 'mathematics', 'Analytic Geometry', 'Quiz 2', array['205'], '2026-09-24T09:00:00.000Z', 40),
  (27, 'mathematics', 'Numerical Methods', 'Quiz 2', array['206'], '2026-09-25T05:00:00.000Z', 40),
  (28, 'mathematics', 'Mathematical Analysis 3', 'Quiz 2', array['207'], '2026-09-28T05:00:00.000Z', 40),
  (29, 'mathematics', 'Differential Equations', 'Colloquium', array['201'], '2026-09-29T05:00:00.000Z', 60),
  (30, 'mathematics', 'Programming in Python', 'Colloquium', array['202'], '2026-09-29T09:00:00.000Z', 60),
  (31, 'mathematics', 'Analytic Geometry', 'Colloquium', array['203'], '2026-09-30T05:00:00.000Z', 60),
  (32, 'mathematics', 'Numerical Methods', 'Colloquium', array['205'], '2026-09-30T09:00:00.000Z', 60),
  (33, 'mathematics', 'Mathematical Analysis 3', 'Colloquium', array['206'], '2026-10-01T05:00:00.000Z', 60),
  (34, 'mathematics', 'Linear Algebra', 'Colloquium', array['207'], '2026-10-02T05:00:00.000Z', 60),
  (35, 'mathematics', 'Discrete Mathematics', 'Colloquium', array['208'], '2026-10-05T05:00:00.000Z', 60),
  (36, 'mathematics', 'Programming in Python', 'Quiz 2', array['201'], '2026-10-06T05:00:00.000Z', 40),
  (37, 'mathematics', 'Analytic Geometry', 'Quiz 2', array['202'], '2026-10-06T09:00:00.000Z', 40),
  (38, 'mathematics', 'Mathematics 2', 'Quiz 2', array['204'], '2026-10-07T05:00:00.000Z', 40),
  (39, 'physics', 'Physics 1', 'Quiz 1', array['101', '102', '103'], '2026-09-10T05:00:00.000Z', 40),
  (40, 'physics', 'Physics 1', 'Quiz 2', array['101', '102', '103'], '2026-09-24T05:00:00.000Z', 40),
  (41, 'history', 'History of Kazakhstan', 'Quiz 1', array['110'], '2026-09-15T06:00:00.000Z', 40),
  (42, 'history', 'History of Kazakhstan', 'Quiz 2', array['110'], '2026-09-29T06:00:00.000Z', 40);

insert into seed_v2.term_absent (idx, student_number) values
  (1, '20242041'), (1, '20243084'), (2, '20235006'), (3, '20244048'), (4, '20246019'), (5, '20247020'),
  (6, '20248001'), (7, '20240034'), (8, '20242018'), (8, '20242023'), (8, '20242065'), (8, '20242088'),
  (8, '20242111'), (9, '20243077'), (9, '20243103'), (9, '20243107'), (9, '20243112'), (9, '20243117'),
  (10, '20244036'), (10, '20244068'), (10, '20244108'), (10, '20246022'), (10, '20246024'), (10, '20246034'),
  (10, '20246055'), (10, '20246063'), (10, '20246087'), (10, '20246114'), (11, '20235009'), (11, '20235038'),
  (11, '20235071'), (11, '20235084'), (11, '20235126'), (12, '20247007'), (12, '20247069'), (12, '20247078'),
  (12, '20247083'), (12, '20247110'), (13, '20248012'), (13, '20248040'), (13, '20248105'), (13, '20248110'),
  (14, '20240043'), (14, '20240054'), (14, '20240095'), (14, '20240113'), (14, '20240115'), (15, '20242011'),
  (15, '20242053'), (15, '20242096'), (16, '20243033'), (16, '20243074'), (16, '20243077'), (17, '20244006'),
  (17, '20244038'), (17, '20244040'), (18, '20235035'), (18, '20235039'), (18, '20235126'), (19, '20246017'),
  (19, '20246068'), (19, '20246075'), (20, '20247031'), (20, '20247063'), (20, '20248040'), (20, '20248041'),
  (20, '20248064'), (20, '20248074'), (21, '20240046'), (21, '20240076'), (21, '20240082'), (22, '20240026'),
  (22, '20240108'), (22, '20240122'), (22, '20242011'), (22, '20242032'), (22, '20242045'), (22, '20242052'),
  (22, '20242054'), (22, '20242067'), (22, '20242096'), (23, '20243007'), (23, '20243014'), (23, '20243030'),
  (23, '20243097'), (23, '20243113'), (24, '20244009'), (24, '20244032'), (24, '20244048'), (24, '20244066'),
  (24, '20244068'), (25, '20235011'), (25, '20235027'), (25, '20235032'), (25, '20235051'), (25, '20235070'),
  (26, '20246001'), (26, '20246012'), (26, '20246071'), (26, '20246080'), (26, '20246106'), (27, '20247050'),
  (27, '20247056'), (27, '20247063'), (27, '20247068'), (27, '20247080'), (28, '20248005'), (28, '20248056'),
  (28, '20248096'), (28, '20248098'), (29, '20242008'), (29, '20242074'), (29, '20242081'), (29, '20242116'),
  (30, '20243051'), (30, '20243057'), (30, '20243074'), (30, '20243110'), (31, '20244031'), (31, '20244062'),
  (31, '20244093'), (31, '20244095'), (32, '20246057'), (32, '20246073'), (32, '20246080'), (32, '20246111'),
  (33, '20247014'), (33, '20247070'), (33, '20247079'), (33, '20247089'), (34, '20248001'), (34, '20248019'),
  (34, '20248061'), (35, '20240031'), (35, '20240036'), (35, '20240065'), (35, '20240068'), (36, '20242007'),
  (36, '20242027'), (36, '20242058'), (36, '20242107'), (37, '20243002'), (37, '20243010'), (37, '20243055'),
  (37, '20243059'), (38, '20235011'), (38, '20235020'), (38, '20235021'), (38, '20235045'), (38, '20235116'),
  (39, '20251023'), (39, '20253001'), (39, '20253003'), (40, '20251014'), (40, '20252015'), (40, '20253021'),
  (41, '20241007'), (41, '20241021'), (41, '20241034'), (41, '20241107'), (42, '20241007'), (42, '20241021'),
  (42, '20241061'), (42, '20241075');

insert into seed_v2.term_flags (idx, k, student_number, type, seq, at_s, received_s, data) values
  (1, 1, '20242012', 'gaze.off_screen', 10, 557, 558, '{"duration_ms":6113,"direction":"left"}'),
  (1, 2, '20242012', 'tab.blocked', 20, 918, 919, '{"app":"WhatsApp"}'),
  (1, 3, '20242012', 'tab.blocked', 30, 1673, 1674, '{"app":"Telegram"}'),
  (1, 4, '20242024', 'phone.detected', 10, 1059, 1061, '{"score":0.87,"held_ms":4294}'),
  (1, 5, '20242024', 'gaze.off_screen', 20, 1294, 1296, '{"duration_ms":3799,"direction":"up"}'),
  (1, 6, '20242025', 'gaze.off_screen', 10, 459, 462, '{"duration_ms":5340,"direction":"left"}'),
  (1, 7, '20242025', 'tab.blocked', 20, 902, 903, '{"app":"WhatsApp"}'),
  (1, 8, '20242025', 'phone.detected', 30, 945, 946, '{"score":0.93,"held_ms":3765}'),
  (1, 9, '20242025', 'gaze.off_screen', 40, 1699, 1702, '{"duration_ms":5328,"direction":"up"}'),
  (1, 10, '20242045', 'face.missing', 10, 418, 421, '{"duration_ms":31970}'),
  (1, 11, '20242045', 'phone.detected', 20, 435, 438, '{"score":0.86,"held_ms":4893}'),
  (1, 12, '20242047', 'gaze.off_screen', 10, 1783, 1784, '{"duration_ms":6117,"direction":"up"}'),
  (1, 13, '20242047', 'tab.blocked', 20, 1892, 1893, '{"app":"WhatsApp"}'),
  (1, 14, '20242048', 'gaze.down', 10, 772, 773, '{"duration_ms":3695}'),
  (1, 15, '20242056', 'gaze.off_screen', 10, 995, 997, '{"duration_ms":6330,"direction":"left"}'),
  (1, 16, '20242056', 'tab.blocked', 20, 2189, 2192, '{"app":"Telegram"}'),
  (1, 17, '20242074', 'gaze.off_screen', 10, 547, 548, '{"duration_ms":4335,"direction":"up"}'),
  (1, 18, '20242074', 'phone.detected', 20, 1134, 1137, '{"score":0.94,"held_ms":2885}'),
  (1, 19, '20242074', 'gaze.off_screen', 30, 1762, 1765, '{"duration_ms":2757,"direction":"up"}'),
  (1, 20, '20242086', 'gaze.off_screen', 10, 211, 212, '{"duration_ms":3939,"direction":"up"}'),
  (1, 21, '20242100', 'phone.detected', 10, 835, 837, '{"score":0.91,"held_ms":1808}'),
  (1, 22, '20242101', 'face.missing', 10, 1760, 1761, '{"duration_ms":14737}'),
  (1, 23, '20242119', 'gaze.off_screen', 10, 777, 779, '{"duration_ms":6032,"direction":"up"}'),
  (1, 24, '20242119', 'tab.blocked', 20, 1174, 1177, '{"app":"WhatsApp"}'),
  (1, 25, '20242123', 'gaze.off_screen', 10, 747, 749, '{"duration_ms":2667,"direction":"up"}'),
  (1, 26, '20243017', 'gaze.off_screen', 10, 1576, 1577, '{"duration_ms":2994,"direction":"left"}'),
  (1, 27, '20243019', 'gaze.off_screen', 10, 649, 650, '{"duration_ms":5990,"direction":"right"}'),
  (1, 28, '20243019', 'gaze.off_screen', 20, 686, 689, '{"duration_ms":6227,"direction":"right"}'),
  (1, 29, '20243020', 'gaze.down', 10, 1114, 1117, '{"duration_ms":4987}'),
  (1, 30, '20243020', 'phone.detected', 20, 1192, 1194, '{"score":0.91,"held_ms":986}'),
  (1, 31, '20243030', 'gaze.off_screen', 10, 280, 283, '{"duration_ms":2432,"direction":"right"}'),
  (1, 32, '20243039', 'gaze.off_screen', 10, 393, 395, '{"duration_ms":2420,"direction":"up"}'),
  (1, 33, '20243065', 'face.missing', 10, 472, 474, '{"duration_ms":20912}'),
  (1, 34, '20243065', 'gaze.off_screen', 20, 1299, 1302, '{"duration_ms":2335,"direction":"up"}'),
  (1, 35, '20243065', 'camera.lost', 30, 1678, 1680, '{"reason":"ended"}'),
  (1, 36, '20243067', 'gaze.down', 10, 616, 617, '{"duration_ms":2831}'),
  (1, 37, '20243068', 'phone.detected', 10, 404, 407, '{"score":0.95,"held_ms":4412}'),
  (1, 38, '20243068', 'face.second', 20, 1422, 1424, '{"duration_ms":3474,"faces":2}'),
  (1, 39, '20243090', 'gaze.off_screen', 10, 1040, 1043, '{"duration_ms":5293,"direction":"left"}'),
  (1, 40, '20243090', 'camera.lost', 20, 1330, 1331, '{"reason":"ended"}'),
  (1, 41, '20243113', 'phone.detected', 10, 646, 649, '{"score":0.87,"held_ms":1805}'),
  (1, 42, '20243113', 'gaze.off_screen', 20, 675, 676, '{"duration_ms":2731,"direction":"right"}'),
  (2, 1, '20231044', 'face.second', 10, 319, 322, '{"duration_ms":2915,"faces":2}'),
  (2, 2, '20235004', 'gaze.down', 10, 465, 466, '{"duration_ms":2685}'),
  (2, 3, '20235004', 'tab.blocked', 20, 711, 714, '{"app":"Telegram"}'),
  (2, 4, '20235028', 'gaze.off_screen', 10, 1289, 1291, '{"duration_ms":4629,"direction":"left"}'),
  (2, 5, '20235050', 'gaze.down', 10, 1939, 1942, '{"duration_ms":4254}'),
  (2, 6, '20235055', 'gaze.off_screen', 10, 1209, 1210, '{"duration_ms":6033,"direction":"right"}'),
  (2, 7, '20235055', 'face.missing', 20, 1216, 1218, '{"duration_ms":27302}'),
  (2, 8, '20235055', 'phone.detected', 30, 1874, 1875, '{"score":0.93,"held_ms":2106}'),
  (2, 9, '20235084', 'gaze.down', 10, 669, 671, '{"duration_ms":2253}'),
  (2, 10, '20235085', 'gaze.off_screen', 10, 320, 321, '{"duration_ms":3071,"direction":"up"}'),
  (2, 11, '20235085', 'camera.lost', 20, 704, 706, '{"reason":"muted"}'),
  (2, 12, '20235085', 'face.second', 30, 1799, 1801, '{"duration_ms":3806,"faces":2}'),
  (2, 13, '20235088', 'phone.detected', 10, 421, 422, '{"score":0.94,"held_ms":1216}'),
  (2, 14, '20235090', 'gaze.down', 10, 917, 918, '{"duration_ms":3064}'),
  (2, 15, '20235090', 'gaze.off_screen', 20, 1003, 1006, '{"duration_ms":3982,"direction":"left"}'),
  (2, 16, '20235107', 'face.missing', 10, 535, 537, '{"duration_ms":36831}'),
  (2, 17, '20235107', 'gaze.down', 20, 757, 759, '{"duration_ms":3382}'),
  (3, 1, '20244021', 'gaze.off_screen', 10, 359, 360, '{"duration_ms":3742,"direction":"up"}'),
  (3, 2, '20244021', 'face.missing', 20, 397, 400, '{"duration_ms":24752}'),
  (3, 3, '20244021', 'gaze.off_screen', 30, 848, 849, '{"duration_ms":2502,"direction":"left"}'),
  (3, 4, '20244057', 'tab.blocked', 10, 568, 569, '{"app":"WhatsApp"}'),
  (3, 5, '20244062', 'gaze.off_screen', 10, 1156, 1157, '{"duration_ms":5909,"direction":"up"}'),
  (3, 6, '20244062', 'gaze.off_screen', 20, 1206, 1207, '{"duration_ms":2813,"direction":"right"}'),
  (3, 7, '20244070', 'face.second', 10, 941, 944, '{"duration_ms":2814,"faces":2}'),
  (3, 8, '20244090', 'tab.blocked', 10, 253, 255, '{"app":"WhatsApp"}'),
  (3, 9, '20244095', 'gaze.off_screen', 10, 1092, 1093, '{"duration_ms":2836,"direction":"up"}'),
  (3, 10, '20244112', 'gaze.off_screen', 10, 2052, 2054, '{"duration_ms":4071,"direction":"up"}'),
  (3, 11, '20244121', 'tab.blocked', 10, 939, 941, '{"app":"Telegram"}'),
  (3, 12, '20244121', 'face.missing', 20, 1034, 1035, '{"duration_ms":18231}'),
  (4, 1, '20246009', 'face.second', 10, 1756, 1758, '{"duration_ms":4457,"faces":2}'),
  (4, 2, '20246025', 'face.second', 10, 830, 833, '{"duration_ms":7029,"faces":2}'),
  (4, 3, '20246029', 'gaze.off_screen', 10, 439, 440, '{"duration_ms":3933,"direction":"up"}'),
  (4, 4, '20246048', 'tab.blocked', 10, 385, 387, '{"app":"WhatsApp"}'),
  (4, 5, '20246048', 'face.second', 20, 472, 473, '{"duration_ms":5466,"faces":2}'),
  (4, 6, '20246055', 'gaze.off_screen', 10, 746, 748, '{"duration_ms":5714,"direction":"right"}'),
  (4, 7, '20246058', 'phone.detected', 10, 757, 759, '{"score":0.93,"held_ms":1131}'),
  (4, 8, '20246093', 'gaze.off_screen', 10, 615, 616, '{"duration_ms":3271,"direction":"right"}'),
  (4, 9, '20246095', 'camera.lost', 10, 827, 829, '{"reason":"muted"}'),
  (4, 10, '20246106', 'phone.detected', 10, 1120, 1122, '{"score":0.9,"held_ms":4687}'),
  (5, 1, '20247011', 'phone.detected', 10, 1050, 1053, '{"score":0.94,"held_ms":3882}'),
  (5, 2, '20247022', 'gaze.off_screen', 10, 819, 820, '{"duration_ms":2716,"direction":"right"}'),
  (5, 3, '20247022', 'gaze.off_screen', 20, 1379, 1381, '{"duration_ms":3224,"direction":"right"}'),
  (5, 4, '20247034', 'phone.detected', 10, 1381, 1382, '{"score":0.95,"held_ms":3586}'),
  (5, 5, '20247042', 'tab.blocked', 10, 1027, 1029, '{"app":"WhatsApp"}'),
  (5, 6, '20247046', 'face.second', 10, 296, 299, '{"duration_ms":6639,"faces":2}'),
  (5, 7, '20247054', 'tab.blocked', 10, 323, 325, '{"app":"Telegram"}'),
  (5, 8, '20247054', 'gaze.off_screen', 20, 571, 573, '{"duration_ms":2867,"direction":"up"}'),
  (5, 9, '20247054', 'face.second', 30, 1464, 1467, '{"duration_ms":2641,"faces":2}'),
  (5, 10, '20247079', 'gaze.off_screen', 10, 873, 876, '{"duration_ms":5370,"direction":"up"}'),
  (5, 11, '20247079', 'gaze.off_screen', 20, 1749, 1751, '{"duration_ms":3842,"direction":"up"}'),
  (5, 12, '20247095', 'face.missing', 10, 420, 422, '{"duration_ms":35945}'),
  (5, 13, '20247095', 'face.missing', 20, 665, 666, '{"duration_ms":41906}'),
  (5, 14, '20247109', 'camera.lost', 10, 666, 669, '{"reason":"error"}'),
  (5, 15, '20247116', 'tab.blocked', 10, 828, 831, '{"app":"WhatsApp"}'),
  (5, 16, '20247116', 'gaze.down', 20, 1348, 1351, '{"duration_ms":3278}'),
  (6, 1, '20248011', 'face.missing', 10, 1210, 1211, '{"duration_ms":17567}'),
  (6, 2, '20248047', 'gaze.off_screen', 10, 288, 290, '{"duration_ms":4740,"direction":"left"}'),
  (6, 3, '20248047', 'face.missing', 20, 550, 551, '{"duration_ms":23640}'),
  (6, 4, '20248047', 'gaze.off_screen', 30, 769, 772, '{"duration_ms":6343,"direction":"right"}'),
  (6, 5, '20248047', 'gaze.off_screen', 40, 1480, 1482, '{"duration_ms":6266,"direction":"left"}'),
  (6, 6, '20248051', 'gaze.off_screen', 10, 292, 295, '{"duration_ms":3683,"direction":"up"}'),
  (6, 7, '20248051', 'tab.blocked', 20, 1033, 1034, '{"app":"Telegram"}'),
  (6, 8, '20248051', 'phone.detected', 30, 1720, 1721, '{"score":0.96,"held_ms":5484}'),
  (6, 9, '20248097', 'face.missing', 10, 908, 910, '{"duration_ms":32176}'),
  (7, 1, '20240020', 'phone.detected', 10, 313, 314, '{"score":0.91,"held_ms":2875}'),
  (7, 2, '20240020', 'face.second', 20, 1103, 1104, '{"duration_ms":2561,"faces":2}'),
  (7, 3, '20240075', 'gaze.off_screen', 10, 1269, 1270, '{"duration_ms":2830,"direction":"left"}'),
  (7, 4, '20240075', 'gaze.off_screen', 20, 1360, 1361, '{"duration_ms":2584,"direction":"right"}'),
  (7, 5, '20240094', 'gaze.down', 10, 376, 378, '{"duration_ms":3988}'),
  (8, 1, '20242021', 'gaze.off_screen', 10, 253, 256, '{"duration_ms":2971,"direction":"up"}'),
  (8, 2, '20242021', 'phone.detected', 20, 544, 546, '{"score":0.9,"held_ms":901}'),
  (8, 3, '20242060', 'tab.blocked', 10, 1485, 1487, '{"app":"Telegram"}'),
  (8, 4, '20242062', 'gaze.down', 10, 859, 862, '{"duration_ms":3387}'),
  (8, 5, '20242097', 'tab.blocked', 10, 759, 762, '{"app":"Telegram"}'),
  (9, 1, '20243073', 'tab.blocked', 10, 356, 357, '{"app":"Telegram"}'),
  (9, 2, '20243105', 'tab.blocked', 10, 684, 687, '{"app":"Telegram"}'),
  (10, 1, '20244001', 'phone.detected', 10, 1305, 1307, '{"score":0.86,"held_ms":4465}'),
  (10, 2, '20244001', 'gaze.off_screen', 20, 1350, 1351, '{"duration_ms":2880,"direction":"right"}'),
  (10, 3, '20244011', 'gaze.off_screen', 10, 1594, 1597, '{"duration_ms":4841,"direction":"up"}'),
  (10, 4, '20244016', 'gaze.off_screen', 10, 722, 725, '{"duration_ms":2396,"direction":"up"}'),
  (10, 5, '20244018', 'tab.blocked', 10, 1988, 1989, '{"app":"Telegram"}'),
  (10, 6, '20244053', 'phone.detected', 10, 699, 700, '{"score":0.91,"held_ms":4547}'),
  (10, 7, '20244053', 'gaze.off_screen', 20, 1201, 1203, '{"duration_ms":6337,"direction":"right"}'),
  (10, 8, '20244058', 'phone.detected', 10, 477, 479, '{"score":0.97,"held_ms":5732}'),
  (10, 9, '20244058', 'gaze.off_screen', 20, 1803, 1806, '{"duration_ms":4695,"direction":"right"}'),
  (10, 10, '20244078', 'face.missing', 10, 619, 622, '{"duration_ms":15157}'),
  (10, 11, '20244078', 'gaze.off_screen', 20, 908, 910, '{"duration_ms":4325,"direction":"left"}'),
  (10, 12, '20244079', 'gaze.off_screen', 10, 630, 633, '{"duration_ms":5711,"direction":"left"}'),
  (10, 13, '20244079', 'tab.blocked', 20, 847, 848, '{"app":"Telegram"}'),
  (10, 14, '20244083', 'face.missing', 10, 595, 597, '{"duration_ms":26746}'),
  (10, 15, '20244083', 'phone.detected', 20, 950, 952, '{"score":0.96,"held_ms":4617}'),
  (10, 16, '20244093', 'camera.lost', 10, 561, 562, '{"reason":"error"}'),
  (10, 17, '20244093', 'face.missing', 20, 1695, 1697, '{"duration_ms":32269}'),
  (10, 18, '20244103', 'gaze.down', 10, 2043, 2044, '{"duration_ms":2790}'),
  (10, 19, '20244119', 'gaze.off_screen', 10, 272, 274, '{"duration_ms":2749,"direction":"right"}'),
  (10, 20, '20244119', 'phone.detected', 20, 1323, 1324, '{"score":0.91,"held_ms":5826}'),
  (10, 21, '20244121', 'phone.detected', 10, 1077, 1078, '{"score":0.89,"held_ms":2700}'),
  (10, 22, '20246027', 'tab.blocked', 10, 710, 712, '{"app":"WhatsApp"}'),
  (10, 23, '20246027', 'gaze.off_screen', 20, 901, 903, '{"duration_ms":4412,"direction":"left"}'),
  (10, 24, '20246056', 'tab.blocked', 10, 831, 832, '{"app":"WhatsApp"}'),
  (10, 25, '20246075', 'face.second', 10, 1011, 1013, '{"duration_ms":3398,"faces":2}'),
  (10, 26, '20246096', 'gaze.down', 10, 519, 522, '{"duration_ms":3381}'),
  (11, 1, '20231044', 'phone.detected', 10, 341, 342, '{"score":0.95,"held_ms":5870}'),
  (11, 2, '20235017', 'tab.blocked', 10, 426, 429, '{"app":"WhatsApp"}'),
  (11, 3, '20235017', 'gaze.off_screen', 20, 1050, 1051, '{"duration_ms":2728,"direction":"up"}'),
  (11, 4, '20235031', 'gaze.off_screen', 10, 1162, 1163, '{"duration_ms":2980,"direction":"up"}'),
  (11, 5, '20235057', 'face.missing', 10, 205, 207, '{"duration_ms":30692}'),
  (11, 6, '20235057', 'gaze.off_screen', 20, 736, 739, '{"duration_ms":5201,"direction":"right"}'),
  (11, 7, '20235057', 'tab.blocked', 30, 926, 928, '{"app":"Telegram"}'),
  (11, 8, '20235076', 'gaze.down', 10, 973, 975, '{"duration_ms":2397}'),
  (11, 9, '20235078', 'face.missing', 10, 309, 311, '{"duration_ms":35587}'),
  (11, 10, '20235097', 'gaze.off_screen', 10, 1788, 1790, '{"duration_ms":5039,"direction":"up"}'),
  (11, 11, '20235108', 'camera.lost', 10, 648, 651, '{"reason":"muted"}'),
  (11, 12, '20235108', 'gaze.off_screen', 20, 777, 778, '{"duration_ms":5536,"direction":"right"}'),
  (11, 13, '20235108', 'gaze.off_screen', 30, 1357, 1360, '{"duration_ms":2743,"direction":"up"}'),
  (11, 14, '20235122', 'phone.detected', 10, 671, 673, '{"score":0.92,"held_ms":5324}'),
  (12, 1, '20247018', 'phone.detected', 10, 238, 241, '{"score":0.89,"held_ms":4515}'),
  (12, 2, '20247018', 'tab.blocked', 20, 1010, 1013, '{"app":"Telegram"}'),
  (12, 3, '20247028', 'tab.blocked', 10, 714, 715, '{"app":"Telegram"}'),
  (12, 4, '20247028', 'gaze.off_screen', 20, 897, 898, '{"duration_ms":4849,"direction":"left"}'),
  (12, 5, '20247028', 'gaze.off_screen', 30, 1376, 1377, '{"duration_ms":4869,"direction":"up"}'),
  (12, 6, '20247044', 'gaze.down', 10, 1594, 1597, '{"duration_ms":3636}'),
  (12, 7, '20247044', 'gaze.off_screen', 20, 2031, 2032, '{"duration_ms":3046,"direction":"up"}'),
  (12, 8, '20247048', 'face.second', 10, 348, 350, '{"duration_ms":6525,"faces":2}'),
  (12, 9, '20247048', 'gaze.off_screen', 20, 384, 386, '{"duration_ms":5127,"direction":"right"}'),
  (12, 10, '20247048', 'face.missing', 30, 1103, 1104, '{"duration_ms":34091}'),
  (12, 11, '20247059', 'gaze.off_screen', 10, 450, 453, '{"duration_ms":5889,"direction":"up"}'),
  (12, 12, '20247068', 'face.missing', 10, 980, 982, '{"duration_ms":18303}'),
  (12, 13, '20247068', 'phone.detected', 20, 1367, 1368, '{"score":0.91,"held_ms":1446}'),
  (12, 14, '20247081', 'face.missing', 10, 411, 412, '{"duration_ms":30038}'),
  (12, 15, '20247085', 'gaze.down', 10, 1558, 1560, '{"duration_ms":3522}'),
  (12, 16, '20247085', 'tab.blocked', 20, 1855, 1856, '{"app":"WhatsApp"}'),
  (12, 17, '20247111', 'phone.detected', 10, 395, 398, '{"score":0.87,"held_ms":2023}'),
  (12, 18, '20247111', 'phone.detected', 20, 1353, 1354, '{"score":0.97,"held_ms":994}'),
  (12, 19, '20247111', 'tab.blocked', 30, 1527, 1529, '{"app":"WhatsApp"}'),
  (12, 20, '20247111', 'gaze.down', 40, 1827, 1829, '{"duration_ms":2880}'),
  (13, 1, '20248018', 'tab.blocked', 10, 570, 571, '{"app":"WhatsApp"}'),
  (13, 2, '20248018', 'phone.detected', 20, 1002, 1004, '{"score":0.88,"held_ms":4432}'),
  (13, 3, '20248039', 'gaze.off_screen', 10, 1201, 1203, '{"duration_ms":4199,"direction":"up"}'),
  (13, 4, '20248041', 'gaze.off_screen', 10, 328, 329, '{"duration_ms":2401,"direction":"left"}'),
  (13, 5, '20248041', 'gaze.off_screen', 20, 954, 955, '{"duration_ms":5617,"direction":"up"}'),
  (13, 6, '20248054', 'face.missing', 10, 1128, 1131, '{"duration_ms":16310}'),
  (13, 7, '20248054', 'gaze.off_screen', 20, 1487, 1490, '{"duration_ms":2891,"direction":"up"}'),
  (13, 8, '20248055', 'tab.blocked', 10, 1026, 1029, '{"app":"Telegram"}'),
  (13, 9, '20248055', 'face.missing', 20, 1619, 1621, '{"duration_ms":23796}'),
  (13, 10, '20248071', 'tab.blocked', 10, 796, 798, '{"app":"Telegram"}'),
  (13, 11, '20248071', 'gaze.off_screen', 20, 1325, 1327, '{"duration_ms":4118,"direction":"left"}'),
  (13, 12, '20248083', 'gaze.off_screen', 10, 909, 912, '{"duration_ms":5336,"direction":"up"}'),
  (13, 13, '20248083', 'gaze.down', 20, 1658, 1661, '{"duration_ms":2897}'),
  (13, 14, '20248089', 'gaze.off_screen', 10, 290, 292, '{"duration_ms":4158,"direction":"left"}'),
  (13, 15, '20248089', 'gaze.down', 20, 774, 775, '{"duration_ms":5117}'),
  (13, 16, '20248089', 'gaze.off_screen', 30, 1072, 1073, '{"duration_ms":4687,"direction":"up"}'),
  (13, 17, '20248089', 'gaze.off_screen', 40, 1226, 1229, '{"duration_ms":6200,"direction":"right"}'),
  (13, 18, '20248091', 'gaze.off_screen', 10, 1740, 1741, '{"duration_ms":5325,"direction":"right"}'),
  (13, 19, '20248097', 'tab.blocked', 10, 855, 857, '{"app":"WhatsApp"}'),
  (13, 20, '20248104', 'face.missing', 10, 232, 233, '{"duration_ms":34417}'),
  (13, 21, '20248104', 'gaze.off_screen', 20, 662, 665, '{"duration_ms":4936,"direction":"left"}'),
  (13, 22, '20248104', 'gaze.off_screen', 30, 1347, 1350, '{"duration_ms":5595,"direction":"left"}'),
  (14, 1, '20240005', 'phone.detected', 10, 1267, 1269, '{"score":0.89,"held_ms":3249}'),
  (14, 2, '20240005', 'tab.blocked', 20, 1433, 1434, '{"app":"Telegram"}'),
  (14, 3, '20240027', 'gaze.off_screen', 10, 204, 205, '{"duration_ms":4567,"direction":"left"}'),
  (14, 4, '20240027', 'gaze.off_screen', 20, 845, 847, '{"duration_ms":3820,"direction":"up"}'),
  (14, 5, '20240028', 'gaze.off_screen', 10, 511, 513, '{"duration_ms":6150,"direction":"up"}'),
  (14, 6, '20240056', 'tab.blocked', 10, 1003, 1006, '{"app":"Telegram"}'),
  (14, 7, '20240062', 'gaze.off_screen', 10, 703, 706, '{"duration_ms":2861,"direction":"right"}'),
  (14, 8, '20240073', 'camera.lost', 10, 215, 216, '{"reason":"muted"}'),
  (14, 9, '20240073', 'phone.detected', 20, 924, 927, '{"score":0.94,"held_ms":3893}'),
  (14, 10, '20240087', 'gaze.off_screen', 10, 694, 696, '{"duration_ms":5024,"direction":"up"}'),
  (14, 11, '20240100', 'tab.blocked', 10, 1144, 1147, '{"app":"Telegram"}'),
  (15, 1, '20242005', 'phone.detected', 10, 342, 345, '{"score":0.97,"held_ms":2965}'),
  (15, 2, '20242005', 'gaze.off_screen', 20, 2072, 2075, '{"duration_ms":5804,"direction":"up"}'),
  (15, 3, '20242048', 'tab.blocked', 10, 1097, 1100, '{"app":"WhatsApp"}'),
  (15, 4, '20242048', 'face.missing', 20, 2129, 2130, '{"duration_ms":24459}'),
  (15, 5, '20242051', 'gaze.off_screen', 10, 1712, 1714, '{"duration_ms":5057,"direction":"left"}'),
  (15, 6, '20242052', 'phone.detected', 10, 2818, 2820, '{"score":0.95,"held_ms":2450}'),
  (15, 7, '20242055', 'gaze.off_screen', 10, 514, 517, '{"duration_ms":4776,"direction":"up"}'),
  (15, 8, '20242063', 'face.second', 10, 575, 577, '{"duration_ms":4539,"faces":2}'),
  (15, 9, '20242063', 'phone.detected', 20, 1062, 1063, '{"score":0.92,"held_ms":3220}'),
  (15, 10, '20242071', 'phone.detected', 10, 364, 367, '{"score":0.92,"held_ms":2098}'),
  (15, 11, '20242071', 'face.missing', 20, 650, 653, '{"duration_ms":35645}'),
  (15, 12, '20242071', 'face.second', 30, 1748, 1751, '{"duration_ms":3510,"faces":2}'),
  (15, 13, '20242093', 'camera.lost', 10, 1247, 1249, '{"reason":"error"}'),
  (15, 14, '20242095', 'gaze.off_screen', 10, 888, 891, '{"duration_ms":5001,"direction":"right"}'),
  (16, 1, '20243029', 'face.second', 10, 900, 901, '{"duration_ms":2544,"faces":2}'),
  (16, 2, '20243029', 'phone.detected', 20, 1336, 1338, '{"score":0.96,"held_ms":1817}'),
  (16, 3, '20243068', 'gaze.down', 10, 1863, 1866, '{"duration_ms":3092}'),
  (16, 4, '20243076', 'tab.blocked', 10, 676, 679, '{"app":"WhatsApp"}'),
  (16, 5, '20243078', 'gaze.down', 10, 1337, 1340, '{"duration_ms":2923}'),
  (16, 6, '20243087', 'face.missing', 10, 815, 817, '{"duration_ms":11950}'),
  (16, 7, '20243103', 'gaze.down', 10, 1187, 1189, '{"duration_ms":4483}'),
  (16, 8, '20243108', 'face.missing', 10, 1035, 1038, '{"duration_ms":12953}'),
  (16, 9, '20243108', 'tab.blocked', 20, 1778, 1781, '{"app":"WhatsApp"}'),
  (16, 10, '20243114', 'gaze.off_screen', 10, 1121, 1124, '{"duration_ms":4988,"direction":"up"}'),
  (17, 1, '20244001', 'phone.detected', 10, 1396, 1398, '{"score":0.86,"held_ms":1236}'),
  (17, 2, '20244001', 'gaze.down', 20, 2757, 2759, '{"duration_ms":3653}'),
  (17, 3, '20244004', 'gaze.down', 10, 810, 812, '{"duration_ms":2223}'),
  (17, 4, '20244004', 'face.second', 20, 1802, 1803, '{"duration_ms":4510,"faces":2}'),
  (17, 5, '20244004', 'gaze.off_screen', 30, 2550, 2552, '{"duration_ms":4664,"direction":"right"}'),
  (17, 6, '20244007', 'gaze.down', 10, 687, 690, '{"duration_ms":3503}'),
  (17, 7, '20244007', 'face.missing', 20, 844, 846, '{"duration_ms":11188}'),
  (17, 8, '20244007', 'gaze.off_screen', 30, 1524, 1526, '{"duration_ms":5237,"direction":"left"}'),
  (17, 9, '20244013', 'gaze.off_screen', 10, 430, 433, '{"duration_ms":6024,"direction":"up"}'),
  (17, 10, '20244013', 'gaze.off_screen', 20, 968, 971, '{"duration_ms":3652,"direction":"right"}'),
  (17, 11, '20244013', 'gaze.down', 30, 1365, 1368, '{"duration_ms":4856}'),
  (17, 12, '20244022', 'gaze.off_screen', 10, 1477, 1478, '{"duration_ms":4501,"direction":"up"}'),
  (17, 13, '20244022', 'phone.detected', 20, 1619, 1622, '{"score":0.93,"held_ms":952}'),
  (17, 14, '20244086', 'face.second', 10, 863, 864, '{"duration_ms":2355,"faces":2}'),
  (17, 15, '20244105', 'phone.detected', 10, 1513, 1514, '{"score":0.86,"held_ms":2935}'),
  (17, 16, '20244105', 'phone.detected', 20, 1935, 1937, '{"score":0.87,"held_ms":4498}'),
  (17, 17, '20244105', 'gaze.off_screen', 30, 2149, 2150, '{"duration_ms":2365,"direction":"left"}'),
  (17, 18, '20244105', 'face.missing', 40, 2283, 2286, '{"duration_ms":41647}'),
  (17, 19, '20244121', 'gaze.off_screen', 10, 1633, 1634, '{"duration_ms":3900,"direction":"left"}'),
  (17, 20, '20244121', 'gaze.down', 20, 2860, 2863, '{"duration_ms":3625}'),
  (18, 1, '20235052', 'face.missing', 10, 1107, 1110, '{"duration_ms":25483}'),
  (18, 2, '20235088', 'face.missing', 10, 1307, 1309, '{"duration_ms":21747}'),
  (18, 3, '20235088', 'gaze.off_screen', 20, 2417, 2418, '{"duration_ms":4986,"direction":"up"}'),
  (18, 4, '20235098', 'gaze.off_screen', 10, 1204, 1206, '{"duration_ms":5702,"direction":"up"}'),
  (18, 5, '20235122', 'phone.detected', 10, 415, 417, '{"score":0.92,"held_ms":3377}'),
  (19, 1, '20246005', 'gaze.off_screen', 10, 518, 521, '{"duration_ms":4647,"direction":"up"}'),
  (19, 2, '20246005', 'gaze.off_screen', 20, 1349, 1350, '{"duration_ms":6056,"direction":"right"}'),
  (19, 3, '20246010', 'phone.detected', 10, 1710, 1712, '{"score":0.88,"held_ms":2778}'),
  (19, 4, '20246014', 'phone.detected', 10, 1617, 1618, '{"score":0.93,"held_ms":5992}'),
  (19, 5, '20246026', 'camera.lost', 10, 1056, 1058, '{"reason":"error"}'),
  (19, 6, '20246028', 'camera.lost', 10, 1804, 1807, '{"reason":"error"}'),
  (19, 7, '20246038', 'tab.blocked', 10, 1007, 1010, '{"app":"WhatsApp"}'),
  (19, 8, '20246038', 'gaze.off_screen', 20, 2023, 2024, '{"duration_ms":2201,"direction":"left"}'),
  (19, 9, '20246087', 'gaze.off_screen', 10, 3070, 3073, '{"duration_ms":3273,"direction":"right"}'),
  (19, 10, '20246103', 'gaze.down', 10, 431, 432, '{"duration_ms":2250}'),
  (19, 11, '20246103', 'camera.lost', 20, 641, 642, '{"reason":"ended"}'),
  (19, 12, '20246103', 'face.missing', 30, 2165, 2167, '{"duration_ms":35562}'),
  (19, 13, '20246104', 'phone.detected', 10, 895, 896, '{"score":0.9,"held_ms":4068}'),
  (19, 14, '20246104', 'gaze.off_screen', 20, 1271, 1272, '{"duration_ms":4665,"direction":"left"}'),
  (19, 15, '20246114', 'gaze.down', 10, 1816, 1817, '{"duration_ms":4264}'),
  (19, 16, '20246114', 'phone.detected', 20, 1916, 1919, '{"score":0.95,"held_ms":5248}'),
  (20, 1, '20247053', 'tab.blocked', 10, 472, 475, '{"app":"WhatsApp"}'),
  (20, 2, '20247053', 'face.missing', 20, 475, 476, '{"duration_ms":10098}'),
  (20, 3, '20247053', 'gaze.down', 30, 2512, 2515, '{"duration_ms":3263}'),
  (20, 4, '20247084', 'phone.detected', 10, 1895, 1896, '{"score":0.93,"held_ms":3812}'),
  (20, 5, '20247088', 'face.missing', 10, 1134, 1136, '{"duration_ms":11277}'),
  (20, 6, '20247098', 'gaze.down', 10, 2636, 2637, '{"duration_ms":4591}'),
  (20, 7, '20247114', 'face.missing', 10, 839, 842, '{"duration_ms":22303}'),
  (20, 8, '20247116', 'phone.detected', 10, 474, 475, '{"score":0.95,"held_ms":4459}'),
  (20, 9, '20247116', 'gaze.down', 20, 2006, 2009, '{"duration_ms":3654}'),
  (20, 10, '20248020', 'tab.blocked', 10, 186, 188, '{"app":"WhatsApp"}'),
  (20, 11, '20248035', 'gaze.down', 10, 800, 802, '{"duration_ms":5050}'),
  (20, 12, '20248067', 'gaze.off_screen', 10, 1293, 1296, '{"duration_ms":2524,"direction":"right"}'),
  (20, 13, '20248067', 'face.second', 20, 1533, 1536, '{"duration_ms":2682,"faces":2}'),
  (20, 14, '20248070', 'phone.detected', 10, 2364, 2366, '{"score":0.87,"held_ms":4364}'),
  (20, 15, '20248070', 'gaze.down', 20, 2368, 2371, '{"duration_ms":3024}'),
  (20, 16, '20248078', 'gaze.off_screen', 10, 330, 331, '{"duration_ms":5427,"direction":"up"}'),
  (20, 17, '20248078', 'gaze.off_screen', 20, 489, 491, '{"duration_ms":4539,"direction":"right"}'),
  (20, 18, '20248078', 'phone.detected', 30, 634, 636, '{"score":0.96,"held_ms":4116}'),
  (20, 19, '20248078', 'phone.detected', 40, 2614, 2616, '{"score":0.87,"held_ms":1882}'),
  (20, 20, '20248079', 'phone.detected', 10, 1142, 1145, '{"score":0.93,"held_ms":5314}'),
  (20, 21, '20248099', 'gaze.off_screen', 10, 2379, 2381, '{"duration_ms":4937,"direction":"left"}'),
  (20, 22, '20248107', 'phone.detected', 10, 1051, 1052, '{"score":0.97,"held_ms":1729}'),
  (20, 23, '20248107', 'phone.detected', 20, 1992, 1993, '{"score":0.93,"held_ms":2582}'),
  (21, 1, '20240035', 'tab.blocked', 10, 824, 825, '{"app":"WhatsApp"}'),
  (21, 2, '20240035', 'phone.detected', 20, 867, 868, '{"score":0.97,"held_ms":2012}'),
  (21, 3, '20240064', 'gaze.off_screen', 10, 1951, 1952, '{"duration_ms":4996,"direction":"up"}'),
  (21, 4, '20240086', 'face.second', 10, 405, 406, '{"duration_ms":7687,"faces":2}'),
  (21, 5, '20240103', 'gaze.off_screen', 10, 1087, 1090, '{"duration_ms":4951,"direction":"right"}'),
  (21, 6, '20240103', 'tab.blocked', 20, 1775, 1776, '{"app":"WhatsApp"}'),
  (21, 7, '20240103', 'face.missing', 30, 2040, 2042, '{"duration_ms":26501}'),
  (22, 1, '20242016', 'gaze.off_screen', 10, 577, 580, '{"duration_ms":6007,"direction":"right"}'),
  (22, 2, '20242058', 'gaze.down', 10, 2271, 2272, '{"duration_ms":3720}'),
  (22, 3, '20242070', 'face.second', 10, 1343, 1345, '{"duration_ms":3687,"faces":2}'),
  (22, 4, '20242095', 'gaze.off_screen', 10, 207, 209, '{"duration_ms":2354,"direction":"right"}'),
  (22, 5, '20242117', 'tab.blocked', 10, 1232, 1235, '{"app":"Telegram"}'),
  (22, 6, '20242119', 'tab.blocked', 10, 1030, 1032, '{"app":"WhatsApp"}'),
  (22, 7, '20242119', 'phone.detected', 20, 1379, 1380, '{"score":0.94,"held_ms":5602}'),
  (22, 8, '20242123', 'face.second', 10, 1508, 1509, '{"duration_ms":3336,"faces":2}'),
  (23, 1, '20243013', 'gaze.off_screen', 10, 501, 503, '{"duration_ms":3095,"direction":"right"}'),
  (23, 2, '20243013', 'gaze.off_screen', 20, 584, 587, '{"duration_ms":3128,"direction":"right"}'),
  (23, 3, '20243025', 'face.missing', 10, 851, 854, '{"duration_ms":28029}'),
  (23, 4, '20243026', 'gaze.down', 10, 1262, 1264, '{"duration_ms":2735}'),
  (23, 5, '20243026', 'gaze.off_screen', 20, 1381, 1383, '{"duration_ms":2885,"direction":"right"}'),
  (23, 6, '20243032', 'gaze.off_screen', 10, 297, 298, '{"duration_ms":5303,"direction":"up"}'),
  (23, 7, '20243045', 'gaze.off_screen', 10, 551, 554, '{"duration_ms":4473,"direction":"up"}'),
  (23, 8, '20243045', 'gaze.down', 20, 917, 919, '{"duration_ms":4665}'),
  (23, 9, '20243045', 'phone.detected', 30, 1089, 1090, '{"score":0.94,"held_ms":1265}'),
  (23, 10, '20243047', 'gaze.down', 10, 934, 936, '{"duration_ms":5117}'),
  (23, 11, '20243076', 'gaze.off_screen', 10, 246, 248, '{"duration_ms":2861,"direction":"up"}'),
  (23, 12, '20243076', 'face.missing', 20, 1672, 1674, '{"duration_ms":15880}'),
  (23, 13, '20243082', 'gaze.off_screen', 10, 530, 531, '{"duration_ms":4667,"direction":"left"}'),
  (24, 1, '20244004', 'gaze.off_screen', 10, 337, 338, '{"duration_ms":2411,"direction":"right"}'),
  (24, 2, '20244004', 'face.missing', 20, 446, 447, '{"duration_ms":12090}'),
  (24, 3, '20244042', 'gaze.off_screen', 10, 768, 771, '{"duration_ms":4059,"direction":"right"}'),
  (24, 4, '20244042', 'gaze.down', 20, 1299, 1301, '{"duration_ms":3510}'),
  (24, 5, '20244042', 'gaze.off_screen', 30, 1446, 1447, '{"duration_ms":4181,"direction":"right"}'),
  (24, 6, '20244049', 'phone.detected', 10, 959, 960, '{"score":0.91,"held_ms":3271}'),
  (24, 7, '20244049', 'gaze.off_screen', 20, 1093, 1096, '{"duration_ms":2314,"direction":"up"}'),
  (24, 8, '20244057', 'face.missing', 10, 998, 1000, '{"duration_ms":39909}'),
  (24, 9, '20244091', 'gaze.down', 10, 1243, 1246, '{"duration_ms":4962}'),
  (24, 10, '20244091', 'gaze.off_screen', 20, 1366, 1369, '{"duration_ms":2328,"direction":"right"}'),
  (24, 11, '20244091', 'face.missing', 30, 1409, 1412, '{"duration_ms":12189}'),
  (24, 12, '20244118', 'gaze.down', 10, 374, 375, '{"duration_ms":5047}'),
  (24, 13, '20244118', 'gaze.down', 20, 736, 738, '{"duration_ms":5080}'),
  (24, 14, '20244121', 'gaze.down', 10, 671, 673, '{"duration_ms":4794}'),
  (25, 1, '20231219', 'gaze.down', 10, 600, 602, '{"duration_ms":3443}'),
  (25, 2, '20231219', 'gaze.off_screen', 20, 762, 765, '{"duration_ms":4096,"direction":"left"}'),
  (25, 3, '20231219', 'gaze.off_screen', 30, 1139, 1141, '{"duration_ms":5130,"direction":"right"}'),
  (25, 4, '20235006', 'gaze.down', 10, 276, 279, '{"duration_ms":5153}'),
  (25, 5, '20235006', 'phone.detected', 20, 487, 489, '{"score":0.88,"held_ms":3566}'),
  (25, 6, '20235019', 'tab.blocked', 10, 484, 486, '{"app":"WhatsApp"}'),
  (25, 7, '20235034', 'phone.detected', 10, 270, 271, '{"score":0.92,"held_ms":3274}'),
  (25, 8, '20235035', 'phone.detected', 10, 1036, 1039, '{"score":0.88,"held_ms":5196}'),
  (25, 9, '20235096', 'tab.blocked', 10, 514, 517, '{"app":"Telegram"}'),
  (25, 10, '20235096', 'phone.detected', 20, 769, 772, '{"score":0.92,"held_ms":4683}'),
  (25, 11, '20235096', 'gaze.off_screen', 30, 1354, 1355, '{"duration_ms":5736,"direction":"right"}'),
  (25, 12, '20235105', 'tab.blocked', 10, 763, 766, '{"app":"Telegram"}'),
  (25, 13, '20235120', 'phone.detected', 10, 875, 876, '{"score":0.9,"held_ms":2760}'),
  (25, 14, '20235123', 'face.missing', 10, 1047, 1048, '{"duration_ms":27860}'),
  (25, 15, '20235123', 'phone.detected', 20, 2138, 2140, '{"score":0.86,"held_ms":3681}'),
  (26, 1, '20246002', 'phone.detected', 10, 526, 527, '{"score":0.93,"held_ms":3993}'),
  (26, 2, '20246010', 'camera.lost', 10, 737, 740, '{"reason":"error"}'),
  (26, 3, '20246041', 'tab.blocked', 10, 1722, 1723, '{"app":"Telegram"}'),
  (26, 4, '20246045', 'tab.blocked', 10, 226, 229, '{"app":"WhatsApp"}'),
  (26, 5, '20246045', 'tab.blocked', 20, 459, 462, '{"app":"WhatsApp"}'),
  (26, 6, '20246045', 'phone.detected', 30, 570, 572, '{"score":0.95,"held_ms":1739}'),
  (26, 7, '20246045', 'phone.detected', 40, 886, 888, '{"score":0.87,"held_ms":3076}'),
  (26, 8, '20246072', 'gaze.off_screen', 10, 861, 862, '{"duration_ms":3242,"direction":"up"}'),
  (26, 9, '20246072', 'phone.detected', 20, 1973, 1974, '{"score":0.92,"held_ms":5071}'),
  (26, 10, '20246076', 'gaze.off_screen', 10, 1305, 1308, '{"duration_ms":2664,"direction":"left"}'),
  (26, 11, '20246076', 'tab.blocked', 20, 1477, 1480, '{"app":"Telegram"}'),
  (26, 12, '20246079', 'gaze.down', 10, 266, 269, '{"duration_ms":5138}'),
  (26, 13, '20246079', 'tab.blocked', 20, 1735, 1738, '{"app":"Telegram"}'),
  (27, 1, '20247021', 'face.missing', 10, 1655, 1658, '{"duration_ms":26163}'),
  (27, 2, '20247023', 'phone.detected', 10, 644, 645, '{"score":0.89,"held_ms":3280}'),
  (27, 3, '20247023', 'phone.detected', 20, 2178, 2179, '{"score":0.91,"held_ms":3101}'),
  (27, 4, '20247026', 'face.missing', 10, 567, 569, '{"duration_ms":36465}'),
  (27, 5, '20247026', 'camera.lost', 20, 876, 878, '{"reason":"error"}'),
  (27, 6, '20247026', 'face.second', 30, 1217, 1220, '{"duration_ms":4813,"faces":2}'),
  (27, 7, '20247054', 'phone.detected', 10, 1037, 1038, '{"score":0.89,"held_ms":1046}'),
  (27, 8, '20247054', 'gaze.off_screen', 20, 1368, 1370, '{"duration_ms":4442,"direction":"up"}'),
  (27, 9, '20247070', 'gaze.off_screen', 10, 309, 312, '{"duration_ms":2956,"direction":"right"}'),
  (27, 10, '20247070', 'gaze.off_screen', 20, 1435, 1438, '{"duration_ms":3860,"direction":"up"}'),
  (27, 11, '20247090', 'camera.lost', 10, 577, 579, '{"reason":"error"}'),
  (27, 12, '20247091', 'tab.blocked', 10, 343, 346, '{"app":"WhatsApp"}'),
  (27, 13, '20247100', 'gaze.off_screen', 10, 713, 715, '{"duration_ms":2793,"direction":"up"}'),
  (28, 1, '20248012', 'camera.lost', 10, 1066, 1067, '{"reason":"error"}'),
  (28, 2, '20248034', 'phone.detected', 10, 1190, 1191, '{"score":0.88,"held_ms":2137}'),
  (28, 3, '20248034', 'gaze.off_screen', 20, 1340, 1342, '{"duration_ms":5658,"direction":"up"}'),
  (28, 4, '20248060', 'phone.detected', 10, 395, 397, '{"score":0.91,"held_ms":2209}'),
  (28, 5, '20248060', 'gaze.off_screen', 20, 967, 970, '{"duration_ms":4086,"direction":"left"}'),
  (28, 6, '20248072', 'face.missing', 10, 299, 302, '{"duration_ms":39114}'),
  (28, 7, '20248072', 'phone.detected', 20, 505, 506, '{"score":0.86,"held_ms":3969}'),
  (28, 8, '20248072', 'camera.lost', 30, 866, 868, '{"reason":"muted"}'),
  (28, 9, '20248081', 'tab.blocked', 10, 431, 432, '{"app":"WhatsApp"}'),
  (28, 10, '20248081', 'tab.blocked', 20, 519, 521, '{"app":"Telegram"}'),
  (28, 11, '20248097', 'gaze.down', 10, 849, 850, '{"duration_ms":4718}'),
  (29, 1, '20242005', 'gaze.down', 10, 2765, 2766, '{"duration_ms":3585}'),
  (29, 2, '20242030', 'tab.blocked', 10, 1924, 1927, '{"app":"WhatsApp"}'),
  (29, 3, '20242030', 'gaze.off_screen', 20, 2365, 2368, '{"duration_ms":4403,"direction":"left"}'),
  (29, 4, '20242043', 'face.missing', 10, 2647, 2648, '{"duration_ms":15118}'),
  (29, 5, '20242051', 'camera.lost', 10, 1759, 1761, '{"reason":"ended"}'),
  (29, 6, '20242051', 'tab.blocked', 20, 2856, 2858, '{"app":"Telegram"}'),
  (29, 7, '20242067', 'face.second', 10, 523, 525, '{"duration_ms":4929,"faces":2}'),
  (29, 8, '20242096', 'tab.blocked', 10, 317, 320, '{"app":"WhatsApp"}'),
  (29, 9, '20242110', 'phone.detected', 10, 864, 867, '{"score":0.87,"held_ms":2396}'),
  (30, 1, '20243009', 'gaze.down', 10, 745, 746, '{"duration_ms":4252}'),
  (30, 2, '20243009', 'gaze.off_screen', 20, 1990, 1993, '{"duration_ms":4004,"direction":"left"}'),
  (30, 3, '20243027', 'gaze.down', 10, 1872, 1873, '{"duration_ms":4696}'),
  (30, 4, '20243027', 'phone.detected', 20, 2573, 2574, '{"score":0.91,"held_ms":936}'),
  (30, 5, '20243037', 'gaze.off_screen', 10, 545, 548, '{"duration_ms":4468,"direction":"right"}'),
  (30, 6, '20243037', 'gaze.off_screen', 20, 935, 936, '{"duration_ms":3459,"direction":"left"}'),
  (30, 7, '20243037', 'gaze.down', 30, 1964, 1967, '{"duration_ms":2414}'),
  (30, 8, '20243053', 'gaze.off_screen', 10, 482, 485, '{"duration_ms":4916,"direction":"right"}'),
  (30, 9, '20243053', 'tab.blocked', 20, 2512, 2515, '{"app":"WhatsApp"}'),
  (30, 10, '20243053', 'gaze.off_screen', 30, 3202, 3203, '{"duration_ms":5849,"direction":"left"}'),
  (30, 11, '20243094', 'gaze.off_screen', 10, 1554, 1557, '{"duration_ms":5877,"direction":"up"}'),
  (30, 12, '20243114', 'face.missing', 10, 2317, 2320, '{"duration_ms":29388}'),
  (30, 13, '20243114', 'face.missing', 20, 2464, 2466, '{"duration_ms":30964}'),
  (31, 1, '20244012', 'gaze.off_screen', 10, 481, 482, '{"duration_ms":2798,"direction":"right"}'),
  (31, 2, '20244012', 'gaze.off_screen', 20, 1636, 1637, '{"duration_ms":4831,"direction":"right"}'),
  (31, 3, '20244015', 'tab.blocked', 10, 1044, 1047, '{"app":"Telegram"}'),
  (31, 4, '20244015', 'gaze.down', 20, 1982, 1984, '{"duration_ms":4403}'),
  (31, 5, '20244017', 'gaze.off_screen', 10, 1168, 1169, '{"duration_ms":4817,"direction":"left"}'),
  (31, 6, '20244017', 'phone.detected', 20, 1803, 1804, '{"score":0.87,"held_ms":5984}'),
  (31, 7, '20244036', 'gaze.off_screen', 10, 1377, 1380, '{"duration_ms":6328,"direction":"up"}'),
  (31, 8, '20244036', 'phone.detected', 20, 2970, 2973, '{"score":0.87,"held_ms":954}'),
  (31, 9, '20244045', 'gaze.off_screen', 10, 1650, 1653, '{"duration_ms":4610,"direction":"left"}'),
  (31, 10, '20244045', 'camera.lost', 20, 3186, 3188, '{"reason":"ended"}'),
  (32, 1, '20246006', 'gaze.off_screen', 10, 761, 762, '{"duration_ms":2733,"direction":"left"}'),
  (32, 2, '20246011', 'gaze.down', 10, 1304, 1305, '{"duration_ms":5010}'),
  (32, 3, '20246024', 'gaze.off_screen', 10, 1977, 1979, '{"duration_ms":4530,"direction":"left"}'),
  (32, 4, '20246064', 'gaze.off_screen', 10, 1819, 1820, '{"duration_ms":4309,"direction":"up"}'),
  (32, 5, '20246082', 'camera.lost', 10, 2846, 2847, '{"reason":"muted"}'),
  (32, 6, '20246091', 'phone.detected', 10, 1082, 1083, '{"score":0.94,"held_ms":1066}'),
  (32, 7, '20246104', 'gaze.off_screen', 10, 248, 249, '{"duration_ms":2771,"direction":"right"}'),
  (32, 8, '20246104', 'gaze.off_screen', 20, 320, 323, '{"duration_ms":2166,"direction":"left"}'),
  (32, 9, '20246104', 'tab.blocked', 30, 541, 543, '{"app":"WhatsApp"}'),
  (32, 10, '20246104', 'tab.blocked', 40, 752, 754, '{"app":"Telegram"}'),
  (33, 1, '20247057', 'face.second', 10, 851, 854, '{"duration_ms":3854,"faces":2}'),
  (33, 2, '20247098', 'phone.detected', 10, 846, 847, '{"score":0.91,"held_ms":969}'),
  (33, 3, '20247099', 'gaze.off_screen', 10, 3234, 3235, '{"duration_ms":4229,"direction":"left"}'),
  (34, 1, '20248009', 'gaze.off_screen', 10, 282, 283, '{"duration_ms":6332,"direction":"left"}'),
  (34, 2, '20248009', 'tab.blocked', 20, 361, 364, '{"app":"WhatsApp"}'),
  (34, 3, '20248009', 'face.missing', 30, 1844, 1847, '{"duration_ms":29941}'),
  (34, 4, '20248012', 'face.missing', 10, 348, 351, '{"duration_ms":14279}'),
  (34, 5, '20248044', 'phone.detected', 10, 451, 454, '{"score":0.97,"held_ms":3071}'),
  (34, 6, '20248049', 'gaze.off_screen', 10, 1349, 1350, '{"duration_ms":2126,"direction":"right"}'),
  (34, 7, '20248068', 'gaze.off_screen', 10, 767, 770, '{"duration_ms":3708,"direction":"up"}'),
  (34, 8, '20248068', 'gaze.down', 20, 1984, 1986, '{"duration_ms":2837}'),
  (34, 9, '20248069', 'tab.blocked', 10, 1097, 1100, '{"app":"WhatsApp"}'),
  (34, 10, '20248081', 'face.second', 10, 657, 659, '{"duration_ms":7197,"faces":2}'),
  (34, 11, '20248081', 'phone.detected', 20, 708, 709, '{"score":0.92,"held_ms":3674}'),
  (34, 12, '20248084', 'face.missing', 10, 1175, 1178, '{"duration_ms":31670}'),
  (34, 13, '20248100', 'gaze.off_screen', 10, 209, 210, '{"duration_ms":3535,"direction":"up"}'),
  (34, 14, '20248100', 'gaze.off_screen', 20, 2475, 2476, '{"duration_ms":2720,"direction":"up"}'),
  (35, 1, '20240022', 'gaze.off_screen', 10, 315, 318, '{"duration_ms":5454,"direction":"right"}'),
  (35, 2, '20240022', 'gaze.off_screen', 20, 354, 357, '{"duration_ms":3782,"direction":"right"}'),
  (35, 3, '20240080', 'face.missing', 10, 583, 584, '{"duration_ms":39957}'),
  (35, 4, '20240080', 'gaze.down', 20, 976, 979, '{"duration_ms":4722}'),
  (35, 5, '20240080', 'face.second', 30, 1663, 1666, '{"duration_ms":2601,"faces":2}'),
  (35, 6, '20240110', 'face.missing', 10, 2553, 2556, '{"duration_ms":32833}'),
  (35, 7, '20240114', 'gaze.down', 10, 728, 730, '{"duration_ms":2680}'),
  (35, 8, '20240117', 'phone.detected', 10, 1857, 1859, '{"score":0.88,"held_ms":4482}'),
  (35, 9, '20240118', 'face.second', 10, 693, 694, '{"duration_ms":3381,"faces":2}'),
  (35, 10, '20240118', 'face.missing', 20, 1526, 1527, '{"duration_ms":20580}'),
  (35, 11, '20240121', 'face.second', 10, 1621, 1623, '{"duration_ms":3015,"faces":2}'),
  (35, 12, '20240121', 'tab.blocked', 20, 2789, 2790, '{"app":"WhatsApp"}'),
  (35, 13, '20240121', 'gaze.off_screen', 30, 2873, 2874, '{"duration_ms":5221,"direction":"left"}'),
  (36, 1, '20242041', 'phone.detected', 10, 1586, 1589, '{"score":0.92,"held_ms":5614}'),
  (36, 2, '20242054', 'gaze.off_screen', 10, 382, 385, '{"duration_ms":2290,"direction":"left"}'),
  (36, 3, '20242054', 'face.missing', 20, 535, 536, '{"duration_ms":29191}'),
  (36, 4, '20242054', 'gaze.off_screen', 30, 1953, 1954, '{"duration_ms":6267,"direction":"right"}'),
  (37, 1, '20243017', 'gaze.off_screen', 10, 898, 899, '{"duration_ms":4391,"direction":"up"}'),
  (37, 2, '20243058', 'phone.detected', 10, 285, 286, '{"score":0.93,"held_ms":3918}'),
  (37, 3, '20243058', 'gaze.down', 20, 1629, 1632, '{"duration_ms":4330}'),
  (37, 4, '20243106', 'gaze.off_screen', 10, 947, 950, '{"duration_ms":4230,"direction":"left"}'),
  (37, 5, '20243106', 'phone.detected', 20, 1287, 1290, '{"score":0.89,"held_ms":4333}'),
  (37, 6, '20243114', 'gaze.off_screen', 10, 552, 555, '{"duration_ms":3401,"direction":"right"}'),
  (37, 7, '20243115', 'tab.blocked', 10, 732, 734, '{"app":"Telegram"}'),
  (37, 8, '20243115', 'gaze.off_screen', 20, 1770, 1771, '{"duration_ms":5142,"direction":"left"}'),
  (38, 1, '20235006', 'face.missing', 10, 331, 334, '{"duration_ms":36823}'),
  (38, 2, '20235006', 'face.missing', 20, 1292, 1294, '{"duration_ms":15003}'),
  (38, 3, '20235015', 'phone.detected', 10, 1625, 1627, '{"score":0.93,"held_ms":1910}'),
  (38, 4, '20235022', 'phone.detected', 10, 315, 318, '{"score":0.95,"held_ms":1021}'),
  (38, 5, '20235030', 'gaze.off_screen', 10, 1009, 1011, '{"duration_ms":2737,"direction":"up"}'),
  (38, 6, '20235030', 'gaze.off_screen', 20, 1261, 1263, '{"duration_ms":3802,"direction":"left"}'),
  (38, 7, '20235030', 'face.missing', 30, 1342, 1343, '{"duration_ms":18117}'),
  (38, 8, '20235034', 'face.second', 10, 450, 452, '{"duration_ms":3620,"faces":2}'),
  (38, 9, '20235034', 'phone.detected', 20, 1346, 1349, '{"score":0.94,"held_ms":5811}'),
  (38, 10, '20235036', 'gaze.off_screen', 10, 852, 854, '{"duration_ms":3354,"direction":"up"}'),
  (38, 11, '20235036', 'face.second', 20, 1289, 1290, '{"duration_ms":6476,"faces":2}'),
  (38, 12, '20235056', 'gaze.off_screen', 10, 581, 583, '{"duration_ms":3656,"direction":"right"}'),
  (38, 13, '20235060', 'gaze.down', 10, 1999, 2002, '{"duration_ms":2239}'),
  (38, 14, '20235090', 'gaze.off_screen', 10, 978, 981, '{"duration_ms":3266,"direction":"right"}'),
  (38, 15, '20235103', 'tab.blocked', 10, 551, 553, '{"app":"Telegram"}'),
  (38, 16, '20235122', 'face.missing', 10, 576, 578, '{"duration_ms":35161}'),
  (38, 17, '20235122', 'gaze.off_screen', 20, 1382, 1383, '{"duration_ms":5996,"direction":"right"}'),
  (38, 18, '20235122', 'gaze.off_screen', 30, 1977, 1980, '{"duration_ms":4470,"direction":"left"}'),
  (39, 1, '20251007', 'phone.detected', 10, 1269, 1271, '{"score":0.95,"held_ms":5603}'),
  (39, 2, '20251009', 'gaze.down', 10, 780, 781, '{"duration_ms":2587}'),
  (39, 3, '20253013', 'gaze.down', 10, 1049, 1051, '{"duration_ms":3071}'),
  (39, 4, '20253013', 'gaze.off_screen', 20, 1325, 1328, '{"duration_ms":6375,"direction":"up"}'),
  (39, 5, '20253022', 'face.second', 10, 1496, 1497, '{"duration_ms":5666,"faces":2}'),
  (39, 6, '20253027', 'camera.lost', 10, 673, 676, '{"reason":"muted"}'),
  (39, 7, '20253028', 'gaze.off_screen', 10, 991, 994, '{"duration_ms":3019,"direction":"left"}'),
  (39, 8, '20253028', 'gaze.off_screen', 20, 1209, 1212, '{"duration_ms":2563,"direction":"left"}'),
  (40, 1, '20251006', 'phone.detected', 10, 1860, 1863, '{"score":0.9,"held_ms":3531}'),
  (40, 2, '20251022', 'phone.detected', 10, 1907, 1909, '{"score":0.88,"held_ms":5414}'),
  (40, 3, '20251022', 'face.missing', 20, 1936, 1939, '{"duration_ms":20472}'),
  (40, 4, '20251027', 'phone.detected', 10, 1616, 1618, '{"score":0.9,"held_ms":1747}'),
  (40, 5, '20252020', 'face.missing', 10, 635, 638, '{"duration_ms":25772}'),
  (40, 6, '20253004', 'face.missing', 10, 1444, 1447, '{"duration_ms":24246}'),
  (40, 7, '20253020', 'tab.blocked', 10, 1064, 1066, '{"app":"Telegram"}'),
  (41, 1, '20241024', 'camera.lost', 10, 461, 464, '{"reason":"muted"}'),
  (41, 2, '20241038', 'tab.blocked', 10, 383, 386, '{"app":"Telegram"}'),
  (41, 3, '20241038', 'face.missing', 20, 1324, 1326, '{"duration_ms":25756}'),
  (41, 4, '20241040', 'face.missing', 10, 400, 401, '{"duration_ms":33309}'),
  (41, 5, '20241040', 'face.missing', 20, 621, 623, '{"duration_ms":18361}'),
  (41, 6, '20241055', 'gaze.off_screen', 10, 1998, 2001, '{"duration_ms":4983,"direction":"right"}'),
  (41, 7, '20241099', 'tab.blocked', 10, 732, 733, '{"app":"Telegram"}'),
  (41, 8, '20241106', 'face.missing', 10, 744, 747, '{"duration_ms":31613}'),
  (41, 9, '20241128', 'gaze.off_screen', 10, 1080, 1082, '{"duration_ms":5755,"direction":"up"}'),
  (41, 10, '20241131', 'camera.lost', 10, 1619, 1622, '{"reason":"ended"}'),
  (41, 11, '20241136', 'camera.lost', 10, 271, 274, '{"reason":"muted"}'),
  (41, 12, '20241139', 'camera.lost', 10, 2057, 2058, '{"reason":"muted"}'),
  (42, 1, '20241012', 'gaze.down', 10, 560, 563, '{"duration_ms":2276}'),
  (42, 2, '20241025', 'gaze.off_screen', 10, 1920, 1923, '{"duration_ms":3330,"direction":"right"}'),
  (42, 3, '20241036', 'gaze.off_screen', 10, 1388, 1390, '{"duration_ms":3824,"direction":"right"}'),
  (42, 4, '20241049', 'camera.lost', 10, 958, 961, '{"reason":"error"}'),
  (42, 5, '20241083', 'tab.blocked', 10, 342, 343, '{"app":"WhatsApp"}'),
  (42, 6, '20241088', 'gaze.off_screen', 10, 712, 715, '{"duration_ms":6375,"direction":"right"}'),
  (42, 7, '20241097', 'gaze.down', 10, 784, 786, '{"duration_ms":2729}'),
  (42, 8, '20241097', 'phone.detected', 20, 1345, 1347, '{"score":0.93,"held_ms":1170}'),
  (42, 9, '20241104', 'face.second', 10, 1106, 1109, '{"duration_ms":6291,"faces":2}'),
  (42, 10, '20241121', 'face.second', 10, 928, 929, '{"duration_ms":3247,"faces":2}'),
  (42, 11, '20241125', 'phone.detected', 10, 337, 340, '{"score":0.91,"held_ms":1308}'),
  (42, 12, '20241125', 'gaze.off_screen', 20, 839, 842, '{"duration_ms":2338,"direction":"right"}'),
  (41, 13, '20241005', 'gaze.off_screen', 10, 1341, 1342, '{"duration_ms":2410,"direction":"left"}'),
  (41, 14, '20241005', 'phone.detected', 20, 1706, 1708, '{"score":0.96,"held_ms":1325}'),
  (42, 13, '20241005', 'gaze.down', 10, 416, 419, '{"duration_ms":2905}');

end
$seed_v2_term_data$;
-- END seed v2 term data

-- The term from the data above: exams (reviewed), rosters by group and student number, sessions by
-- termSession()'s formulas, flags. Receipts are UKI-<group>-<digits>-<initials> with digits distinct for
-- every exam and place in the group; one that a Phase 0 session already holds is drawn again.
do $seed_v2_term$
declare
  r record;
begin

insert into public.exams (id, workspace_id, faculty_id, title, course, kind, code, mode, starts_at, duration_min,
  lobby_opens_at, status, created_at, scheduled_at)
select ('e0000000-0000-4000-8100-' || lpad(x.idx::text, 12, '0'))::uuid, 'a0000000-0000-4000-8000-000000000001',
  case x.faculty
    when 'mathematics' then 'a1000000-0000-4000-8000-000000000001'::uuid
    when 'physics' then 'a1000000-0000-4000-8000-000000000002'::uuid
    when 'history' then 'a1000000-0000-4000-8000-000000000003'::uuid
    else 'a1000000-0000-4000-8000-000000000004'::uuid
  end,
  x.course || ' · ' || x.kind, x.course, x.kind, null, 'app', x.starts_at, x.duration_min,
  x.starts_at - interval '20 minutes', 'reviewed', x.starts_at - interval '9 days', x.starts_at - interval '8 days'
from seed_v2.term_exams x;

insert into public.exam_groups (exam_id, group_id)
select ('e0000000-0000-4000-8100-' || lpad(x.idx::text, 12, '0'))::uuid,
  ('a2000000-0000-4000-8000-' || lpad(g.code, 12, '0'))::uuid
from seed_v2.term_exams x
cross join lateral unnest(x.groups) as g(code);

insert into public.exam_students (exam_id, student_id, seat, invite_status)
select ('e0000000-0000-4000-8100-' || lpad(x.idx::text, 12, '0'))::uuid, st.id,
  row_number() over (partition by x.idx order by array_position(x.groups, pg.code), st.student_number), 'sent'
from seed_v2.term_exams x
join public.groups pg on pg.code = any (x.groups)
join public.students st on st.group_id = pg.id;

create table seed_v2.group_pos as
select st.id as student_id, row_number() over (partition by st.group_id order by st.student_number) as pos
from public.students st;

insert into public.sessions (id, exam_id, student_id, auth_uid, state, locale, device, identity_result,
  identity_score, joined_at, rules_accepted_at, rules_locale, started_at, submitted_at, time_used_s, last_seen_at,
  receipt_id)
select
  ('d1000000-0000-4000-81' || lpad(x.idx::text, 2, '0') || '-' || lpad(st.student_number, 12, '0'))::uuid,
  ('e0000000-0000-4000-8100-' || lpad(x.idx::text, 12, '0'))::uuid, st.id,
  ('f1000000-0000-4000-81' || lpad(x.idx::text, 2, '0') || '-' || lpad(st.student_number, 12, '0'))::uuid,
  case when v.time_up then 'time_up'::public.session_state else 'submitted'::public.session_state end,
  st.locale,
  jsonb_build_object('os', case when m.os % 10 < 6 then 'windows' else 'macos' end, 'app_version', '0.1.0'),
  'matched', (70 + m.identity % 27) / 100.0,
  v.joined_at, least(v.joined_at + make_interval(secs => 60 + m.rules % 121), x.starts_at - interval '30 seconds'),
  st.locale, v.started_at, v.submitted_at, v.used_s, v.submitted_at,
  case when not exists (select 1 from public.sessions se where se.receipt_id = v.receipt) then v.receipt end
from seed_v2.term_exams x
join public.groups pg on pg.code = any (x.groups)
join public.students st on st.group_id = pg.id
join seed_v2.group_pos gp on gp.student_id = st.id
cross join lateral (
  select
    seed_v2.mix(x.idx, st.student_number::bigint, 1) as joined,
    seed_v2.mix(x.idx, st.student_number::bigint, 2) as rules,
    seed_v2.mix(x.idx, st.student_number::bigint, 3) as started,
    seed_v2.mix(x.idx, st.student_number::bigint, 4) as used,
    seed_v2.mix(x.idx, st.student_number::bigint, 5) as os,
    seed_v2.mix(x.idx, st.student_number::bigint, 6) as identity,
    seed_v2.mix(x.idx, st.student_number::bigint, 7) as time_up,
    ((x.duration_min * 55 + 50) / 100) * 60 as low
) m
cross join lateral (
  select
    x.starts_at - make_interval(secs => 240 + m.joined % 601) as joined_at,
    x.starts_at + make_interval(secs => m.started % 51) as started_at,
    m.time_up % 100 = 0 as time_up,
    case when m.time_up % 100 = 0 then x.duration_min * 60
      else m.low + m.used % (x.duration_min * 60 - 60 - m.low + 1) end as used_s,
    'UKI-' || pg.code || '-' || lpad(((((x.idx - 1) * 150 + gp.pos) * 7919) % 10000)::text, 4, '0') || '-'
      || public.receipt_initial(split_part(st.full_name, ' ', 1))
      || public.receipt_initial((regexp_split_to_array(btrim(st.full_name), '\s+'))[
        array_length(regexp_split_to_array(btrim(st.full_name), '\s+'), 1)]) as receipt
) v0
cross join lateral (
  select v0.*,
    case when v0.time_up then x.starts_at + make_interval(mins => x.duration_min)
      else v0.started_at + make_interval(secs => v0.used_s) end as submitted_at
) v
where not exists (
  select 1 from seed_v2.term_absent a where a.idx = x.idx and a.student_number = st.student_number
);

for r in
  select se.id, se.student_id from public.sessions se
  where se.exam_id::text like 'e0000000-0000-4000-8100-%' and se.receipt_id is null
loop
  update public.sessions set receipt_id = public.make_receipt_id(r.student_id) where id = r.id;
end loop;

insert into public.events (id, session_id, exam_id, type, source, review, seq, at, received_at, data, frame_count,
  app_version)
select ('e1100000-0000-4000-81' || lpad(f.idx::text, 2, '0') || '-' || lpad(f.k::text, 12, '0'))::uuid,
  ('d1000000-0000-4000-81' || lpad(f.idx::text, 2, '0') || '-' || lpad(f.student_number, 12, '0'))::uuid,
  ('e0000000-0000-4000-8100-' || lpad(f.idx::text, 12, '0'))::uuid,
  f.type, 'app', 'flag', f.seq, x.starts_at + make_interval(secs => f.at_s),
  x.starts_at + make_interval(secs => f.received_s), f.data, 0, '0.1.0'
from seed_v2.term_flags f
join seed_v2.term_exams x on x.idx = f.idx;

drop schema seed_v2 cascade;

end
$seed_v2_term$;
