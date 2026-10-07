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
