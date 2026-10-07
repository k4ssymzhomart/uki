-- supabase/migrations/0001_core.sql (Phase 0)
-- Verbatim from docs/phase-0-plan.md, "Data model". Later migrations add helpers, RLS, functions and triggers.
create type staff_role as enum ('exam_office', 'proctor', 'admin');
create type locale as enum ('kk', 'ru', 'en');
create type exam_mode as enum ('app', 'browser');
create type exam_status as enum ('draft', 'scheduled', 'live', 'to_review', 'reviewed', 'cancelled');
create type session_state as enum ('joined', 'checking', 'identity', 'rules', 'ready',
  'writing', 'paused', 'submitted', 'time_up', 'ended');
create type event_source as enum ('app', 'lock', 'proctor', 'server');
create type event_review as enum ('flag', 'log', 'none');
create type command_type as enum ('pause', 'resume', 'end', 'message', 'add_time', 'start');

create table workspaces (id uuid primary key default gen_random_uuid(), name text not null,
  slug text unique not null, timezone text not null default 'Asia/Almaty', created_at timestamptz default now());
create table faculties (id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces, name text not null);
create table staff (id uuid primary key references auth.users on delete cascade,
  workspace_id uuid not null references workspaces, faculty_id uuid references faculties,
  full_name text not null, role staff_role not null, languages locale[] not null default '{ru}');
create table groups (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspaces,
  faculty_id uuid references faculties, code text not null, unique (workspace_id, code));
create table students (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspaces,
  student_number text not null, full_name text not null, email text, group_id uuid references groups,
  locale locale not null default 'kk', unique (workspace_id, student_number));

create table exams (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspaces,
  faculty_id uuid references faculties, title text not null, course text not null, kind text not null,
  code text unique, mode exam_mode not null, starts_at timestamptz not null, duration_min int not null,
  lobby_opens_at timestamptz not null, status exam_status not null default 'scheduled',
  checks jsonb not null default '{"gaze_s":2,"phone_score":0.85,"face_missing_s":10,"identity":true,"lock":true}',
  lms_url text, lms_done_path text, allowed_sites text[] not null default '{}', created_by uuid references staff,
  created_at timestamptz default now());
create table exam_groups (exam_id uuid references exams on delete cascade, group_id uuid references groups,
  primary key (exam_id, group_id));
create table exam_students (exam_id uuid references exams on delete cascade, student_id uuid references students,
  seat int, invite_status text not null default 'pending', primary key (exam_id, student_id));
create table proctor_assignments (exam_id uuid references exams on delete cascade, staff_id uuid references staff,
  seat_from int, seat_to int, languages locale[] not null, is_lead boolean not null default false,
  confirmed_at timestamptz, primary key (exam_id, staff_id));
create table questions (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspaces,
  body jsonb not null,           -- {"kk":"...","ru":"...","en":"..."}
  choices jsonb not null,        -- [{"id":"a","body":{"kk":"...",...}}, ...]
  topic text);
create table exam_questions (exam_id uuid references exams on delete cascade, question_id uuid references questions,
  position int not null, primary key (exam_id, question_id));

create table sessions (id uuid primary key default gen_random_uuid(), exam_id uuid not null references exams,
  student_id uuid not null references students, auth_uid uuid not null, state session_state not null default 'joined',
  locale locale not null, device jsonb not null default '{}',   -- os, app_version, browser, lock_version
  identity_result text, identity_score real, joined_at timestamptz default now(), started_at timestamptz,
  submitted_at timestamptz, ended_at timestamptz, end_reason text, extra_min int not null default 0, paused_s int not null default 0,
  time_used_s int not null default 0, receipt_id text unique, last_seen_at timestamptz, status jsonb not null default '{}',
  unique (exam_id, student_id));
create table answers (session_id uuid references sessions on delete cascade, question_id uuid references questions,
  choice_id text not null, saved_at timestamptz not null, synced_at timestamptz default now(),
  primary key (session_id, question_id));
create table events (id uuid primary key, session_id uuid not null references sessions, exam_id uuid not null references exams,
  type text not null, source event_source not null, review event_review not null, seq int,
  at timestamptz not null, received_at timestamptz not null default now(), data jsonb not null default '{}',
  frame_count int not null default 0);
create index events_exam_recent on events (exam_id, received_at desc);
create index events_session_time on events (session_id, at);
create table frames (id uuid primary key, event_id uuid not null references events, session_id uuid not null references sessions,
  exam_id uuid not null references exams, storage_path text not null, captured_at timestamptz not null);
create table session_commands (id uuid primary key default gen_random_uuid(), session_id uuid not null references sessions,
  exam_id uuid not null references exams, type command_type not null, payload jsonb not null default '{}',
  issued_by uuid not null references staff, issued_at timestamptz default now(), acked_at timestamptz);
create table audit_log (id bigint generated always as identity primary key, workspace_id uuid not null,
  actor_id uuid, actor_kind text not null, action text not null, object_type text not null, object_id text,
  at timestamptz not null default now(), meta jsonb not null default '{}');
