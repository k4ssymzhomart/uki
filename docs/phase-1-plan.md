# Üki · Phase 1 build plan

Oct 8, 2026 · @Kassymzhomart Shubay

Phase 1 builds the 35 Demo Day frames and the landing site on top of the Phase 0 skeleton, from Thursday 8 to Oct 14, 2026, while Phase 0 finishes its push, cloud and hardware checks beside it. The demo build freezes on Thursday 15 October, and Demo Day is Oct 16, 2026.

## Phase 0 polish

Phase 0’s agent work is built and merged on your Mac, but nothing is pushed, nothing runs in the cloud and nothing has run on Windows. These items finish Phase 0 by its exit review on Saturday 10 October. They run beside Phase 1, not before it: only P.1 and P.2 block Phase 1 work, and only for deploys.

| # | Item | Why | Run by | By |
| --- | --- | --- | --- | --- |
| P.1 | Add `origin` (github.com/k4ssymzhomart/uki), run gitleaks over the history, push `main` and every `wp/*` and `harden/*` branch; CI green | There is no remote: CI has never run and Vercel cannot import the repo | Agent | Thu 8 |
| P.2 | Cloud deploy, WP 0.10: asymmetric JWT signing key, `pnpm supabase:deploy`, seed, two Vercel projects, `UKI_ALLOWED_ORIGINS` | The dashboard must run on Vercel against Frankfurt | You, then the agent | Thu 8 |
| P.3 | Windows CI, WP 0.12: the Windows job, both zips, the launch test, `.gitattributes` with LF line endings | Windows breakage shows up without lab time | Agent | Thu 8 |
| P.4 | Lockdown guard, WP 0.13: the Koffi keyboard hook on Windows, the blur rule on macOS, `docs/runbooks/lab-session.md` | Lockdown that holds on a lab PC and on the MacBook fallback | Agent | Fri 9 |
| P.5 | Lab session, WP 0.14, with the lab checklist | The only proof of Windows lockdown and lab-PC speed | You | Fri 9 or Sat 10 |
| P.6 | `phone_score`: a held phone scored 0.77, under the 0.85 default; tune on the MacBook camera and the lab webcam, then set the default in `exams.checks` and `workspaces.settings` | Phones must flag on stage | You, then the agent | Fri 9 |
| P.7 | Card match: 0.5 let someone else’s low-resolution photo through at 0.53; raise `identity.minSimilarity` to 0.6 and test both printed cards plus one stranger’s card | The match must reject another person | Agent, then you | Fri 9 |
| P.8 | Fail the card three times in the desktop e2e so 1.3a gets its screenshot | The only Phase 0 frame without evidence | Agent | Thu 8 |
| P.9 | A clean `pnpm db:reset` with all 13 migrations; CI’s `supabase start` does it | Four migrations went in by hand under load | Agent | Thu 8 |
| P.10 | Live check: restart Realtime during an exam, pause from the wall, and 2.1c arrives within about 10 s through the ingest reply | The fallback path is only unit-tested | Agent | Fri 9 |
| P.11 | Re-run the kiosk e2e (`UKI_E2E_KIOSK=1`) on the quiet host | Resume took 7.8 s only because the host was loaded | Agent | Thu 8 |
| P.12 | The macOS x64 dmg in CI | Not built yet | Agent | Thu 8 |
| P.13 | Replace every “M1 Air”, “Windows i5” and “demo laptops” in `docs/phase-0-exit.md` and the runbooks | The hardware correction | Agent | Thu 8 |
| P.14 | README clean-clone test on the MacBook, under 15 minutes | Exit criterion 1 | You | Sat 10 |
| P.15 | Real Wi-Fi off for 2 minutes during 2.1 on the MacBook | Exit criterion 8; the e2e used Chromium’s offline emulation | You | Sat 10 |
| P.16 | Üki Lock stays paired through 10 quiet minutes in real Chrome | Only a 45 s headless run so far | You | Fri 9 |
| P.17 | Rotate the secret key and the database password that were posted in chat; turn off the legacy `anon` and `service_role` keys | They are exposed, and Üki never uses the legacy keys | You | Thu 8 |
| P.18 | Kazakh and Russian read-through of every student, Lock and dashboard string | First-pass translations | You | Wed 14 |
| P.19 | Phase 0 exit review: all 12 criteria with evidence in `docs/phase-0-exit.md` | Closes Phase 0 | You | Sat 10 |

Rows marked You need you at a machine or a dashboard; the agent writes the evidence into `docs/phase-0-exit.md` either way.

## Scope

Phase 1 builds the 35 frames the roadmap gives it, plus the landing site, on top of Phase 0. Every node ID is on the Prototype page of Figma file `9RB9aBz6lzS6XHpf5do5Gh`, except the landing frames, which are on the Landing page.

| Group | Frames and node IDs | Surface | Stories |
| --- | --- | --- | --- |
| New exam wizard | 0.4 details `158:12473` · 0.2 checks `51:2048` · 0.2a gaze info `85:6315` · 0.3 roster and proctors `51:2050` · 0.3a roster errors `160:12932` · 0.3b fix email `160:13301` · 0.5 review `159:12771` | Office | A1, A2, A3 |
| Invite email | 0.8 `161:13438` | Email | A2, S1 |
| Browser rules | E.1 `99:10209` | Office | E1 |
| Proctor home | 0.9 my exams `164:13518` · 0.9a confirm seats `164:15836` | Proctor | P1, A3 |
| Lobby additions | 1.5a student card `85:6412` · 1.5b identity help `156:12176` | Proctor | P1, S3 |
| Overview additions | 0.1b why 0 MB `84:5341` · 0.1c faculty switcher `84:5436` | Office | A6, A4 |
| Rules question | 1.4a `87:8156` | App | S4 |
| Ask proctor and calculator | E.5a `152:11597` · E.5b `153:11724` · 2.4d `155:11803`, and the Ask proctor button on 2.1, 2.2 and 2.3 | Lock, App, Proctor | E4, P2 |
| Lock status | E.8 `98:9927` | Lock | E4 |
| Review | 3.2 queue `51:2092` · 3.2a flag filter `87:8275` · 3.2b flag preview `87:8524` · 3.3 session review `51:2094` | Proctor | P5, S9 |
| Report and sharing | 3.4 integrity report `51:2096` · 3.4a account menu `87:8591` · 3.5 shared report `162:13464` | Office, public | A5, A6 |
| Exam office | A.1 reports `102:10454` · A.2 students `104:10579` · A.3 student profile `105:10746` · A.4 settings `106:10905` | Office | A7, A8, A9 |
| Privacy | A.5 privacy centre `107:11102` · A.5a delete request `165:14035` · A.5b copy request `165:16241` · A.6 audit log `108:11296` | Office | A10 |
| Landing site | Landing page `114:2039` with the 1440 px page · Mobile 390 `192:3586` · Book a pilot `194:4014` · Sent `195:4090` · Privacy policy `196:4125` · Terms of use `197:4144` | Public | — |

Also in Phase 1:

- The dashboard in Russian, with the switch in the account menu (3.4a).
- E.1’s last two rows relabelled “detected” and “university-managed computers only”, as Phase 0 decided.
- Ask proctor on 2.1, 2.2 and 2.3; Phase 0 showed it only on 1.3.
- The “Add note” field in the timeline drawer (2.5) and “Mark reviewed” in the tile menu (2.4a), which waited for the review queue.
- Lobby polish Phase 0 skipped: “Call” stays hidden; the network type joins the lobby row.
- Watch camera stays hidden: live video breaks the promise that video never leaves the laptop.

### Not in Phase 1

| Phase | Frames |
| --- | --- |
| 2 · Pilot | 0.6, 0.6a exam detail · 0.7 question bank · 3.4b report PDF · A.1a term report PDF · A.5c processing record · 3.2c queue clear · 0.1d, 0.1e, A.2a empty, loading and error states · A.0a, A.0b · 1.0, 1.0a, 1.0b · 2.1b, 2.1w · E.2, E.3a, E.5c, E.5d, E.5e, E.5f, E.10, E.10a · code signing |
| 3 · After pilot | 0.1a, A.7 notifications · A.4a–A.4d team, SSO, integrations · A.8 search · T.1, T.2 tablet · D.1–D.6 dark |

A frame that does not fit by Tuesday 13 October moves to Phase 2; nothing moves into Phase 1 after Saturday 10 October.

## Decisions

Every Phase 0 decision stands: Supabase Cloud in Frankfurt, Vercel, Electron, WXT, ready-made models, no legal or consent work. Phase 1 adds the rows below; each is settled unless `docs/decisions.md` says why it changed.

| Area | Decision | Why |
| --- | --- | --- |
| Wizard state | One `exams` row from step 1, with `status = 'draft'`; every step saves into it; Schedule exam (0.5) runs `schedule_exam`, which checks everything and sets `scheduled` | A refresh or a second tab never loses a step, and Save draft costs nothing |
| Exam code | `schedule_exam` builds it from course, group and weekday, like `MATH2-204-FRI`, and adds a digit on a clash | The format 1.1a teaches students |
| Roster CSV | Parsed in the browser with Papa Parse (MIT); columns: student number, full name, email, group, language; every row checked by a Zod schema in `packages/contracts` (8-digit number, valid email, known group); `import_roster` writes the valid rows in one transaction ([Papa Parse](https://www.papaparse.com/)) | 0.3a shows each bad row and what to fix before anything is written |
| Invite email | Resend, called from the `send-invites` Edge Function: one email per student, in that student’s language, built from 0.8 with React Email. Until you verify a domain in Resend, its test domain sends only to your own address ([Resend test domain](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain)) | A ready-made email API; the demo sends to your own inbox |
| Invite status | `sent` or `failed` from Resend’s reply; `bounced` arrives through Resend’s webhook in Phase 2; the demo seed holds one bounced row for 0.3b; opens are not tracked | No tracking pixel, which fits the privacy story |
| Help requests | Every `student.help_requested` event creates a `help_requests` row through the events trigger; 2.4d lists open ones; Reply sends a `message` command; Mark done closes it | One inbox for the app (1.3a, 2.1–2.3) and the Lock (E.5a) |
| Calculator | A pure client component in the Lock bar (E.5b): the four operations, percent and sign, no history, no network | E.5b promises offline and no history |
| Review | One decision per session in `review_decisions`: no issue, talk to the student, or committee, with a note; it covers all of that session’s flags; the exam turns `reviewed` when every flagged session has one | 3.3 shows three decisions; a flag is a signal, not a fail |
| Integrity report | One report per session, rendered by Next.js from `get_report`; Download PDF prints 3.4 through a print stylesheet (the designed PDF, 3.4b, is Phase 2); CSV export of its events in the browser | No PDF service; the page and its printout show the same data |
| Share link | `create_share` makes a random 32-byte token valid 7 days and stores only its hash; `/r/[token]` renders 3.5 on the server through the `shared-report` Edge Function, which checks the hash and expiry, signs 5-minute still URLs and writes one audit row per view | The committee gets a read-only page, and A.6 shows every view |
| Verify code | 12 characters derived from the report id and a hash of its content, printed on 3.4 and 3.5; `/verify/[code]` confirms the report exists and is unchanged | 3.4 and 3.5 show it; a printout can be checked |
| Reports page | SQL views per term and faculty: exams run, sessions, flags per 100 sessions, decisions, median review time; charts are SVG components built from the kit’s Chart parts (Figma Chart/Line, Bars, Donut), with no chart library | A.1’s charts are simple, and the kit already has the parts |
| Data requests | `data_requests` rows, entered by the exam office; Delete runs the `data-request` Edge Function, which removes the student’s stills, events, identity score and device record and keeps the answers and the receipt; Copy writes one JSON file to the private `exports` bucket and signs a 7-day link | A10; answers and receipts stay because they are the exam result. Check this split against A.5a’s list and log any change in `docs/decisions.md` |
| Retention | Back from the original design: a nightly `retention` Edge Function deletes stills older than the workspace’s `retention_days` (90); `pg_cron` calls it through `pg_net` with the key kept in Vault ([scheduling Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions)) | A.5 shows the rule and the next cleanup |
| Consent record | `sessions.rules_accepted_at` and `rules_locale`, set by `ingest` when the status step becomes `ready` after the agree box on 1.4 | A.3 shows when the rules were accepted and in which language; no separate consent table |
| Landing site | A `(marketing)` route group in `apps/web`: `/` for visitors, `/pilot`, `/privacy`, `/terms`; signed-in staff still land on `/overview`, proctors on `/my-exams`. Images are the brand kit’s generated images, exported from Figma, never redrawn by hand | One deployable; the designed art, as you asked |
| Pilot requests | The `request_pilot` RPC, open to anonymous visitors, stores a `pilot_requests` row (3 per email a day at most) and emails you through Resend | Book a pilot needs somewhere to land |
| Dashboard language | Russian for every dashboard key, a first pass by the agent marked for review; the switch is in the account menu (3.4a); a staff member’s first language picks the default | The Phase 0 plan promised Russian for Phase 1; KRU staff work in Russian |
| Proctor landing | Proctors land on 0.9 (`/my-exams`) after sign-in; the exam office lands on 0.1 | 0.9 is the proctor’s home |

### Assumptions

- The 35 frames are final; a design change after Saturday 10 October waits for Phase 2.
- Invites in the demo go only to your own inbox until a domain is verified in Resend.
- The seed supplies the term data A.1 needs; there is no real KRU history.
- The landing copy and the privacy and terms pages are drafts, shown as drafts.

## Data model

Phase 1 adds 7 tables to Phase 0’s 17, all with row-level security on, plus columns on four existing tables. Nothing existing is renamed, so Phase 0’s apps and tests keep working.

```sql
-- supabase/migrations/20261009000000_phase1.sql
create type review_decision as enum ('no_issue', 'talk', 'committee');
create type data_request_kind as enum ('delete', 'copy');
create type data_request_status as enum ('received', 'done', 'replied');
create type invite_state as enum ('pending', 'sent', 'failed', 'bounced');

alter table workspaces add column settings jsonb not null default
  '{"retention_days":90,"lobby_minutes":20,"default_duration_min":90,
    "default_checks":{"gaze_s":2,"phone_score":0.85,"face_missing_s":10,"identity":true,"lock":true}}';
alter table exams add column room text, add column rules_locale locale, add column scheduled_at timestamptz,
  add column browser_rules jsonb not null default
  '{"copy_paste":true,"print":true,"full_screen":true,"calculator":true,
    "other_extensions":"phase2","devtools":"managed_only","screen_share":"detected"}';
alter table proctor_assignments add column change_request text;
alter table students add column programme text, add column year int;
alter table sessions add column rules_accepted_at timestamptz, add column rules_locale locale;

create table invites (id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references exams on delete cascade, student_id uuid not null references students,
  email text not null, locale locale not null, state invite_state not null default 'pending',
  provider_id text, error text, sent_at timestamptz, unique (exam_id, student_id));
create table help_requests (id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions, exam_id uuid not null references exams,
  event_id uuid unique references events, topic text not null, text text,
  created_at timestamptz not null default now(), reply text, done_at timestamptz, done_by uuid references staff);
create table review_decisions (session_id uuid primary key references sessions,
  exam_id uuid not null references exams, decision review_decision not null, note text,
  reviewer_id uuid not null references staff, decided_at timestamptz not null default now());
create table reports (id uuid primary key default gen_random_uuid(), session_id uuid unique not null references sessions,
  exam_id uuid not null references exams, verify_code text unique not null, content_hash text not null,
  created_by uuid not null references staff, created_at timestamptz not null default now());
create table report_shares (id uuid primary key default gen_random_uuid(),
  report_id uuid not null references reports on delete cascade, token_hash text unique not null,
  expires_at timestamptz not null, created_by uuid not null references staff,
  created_at timestamptz not null default now(), revoked_at timestamptz);
create table data_requests (id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces, student_id uuid not null references students,
  kind data_request_kind not null, status data_request_status not null default 'received',
  received_at timestamptz not null default now(), due_at timestamptz not null default now() + interval '30 days',
  reply text, export_path text, done_by uuid references staff, done_at timestamptz);
create table pilot_requests (id uuid primary key default gen_random_uuid(), name text not null,
  email text not null, university text not null, role text, message text,
  created_at timestamptz not null default now());
```

The 30-day due date and the defaults in `settings` are starting values; where a frame shows another number, the frame wins and the change goes into `docs/decisions.md`.

### Database functions and triggers

| Name | Kind | What it does |
| --- | --- | --- |
| `save_exam_draft(exam jsonb)` | RPC, security definer | Exam office only. Creates or updates a `draft` exam from any wizard step; returns the row |
| `schedule_exam(exam_id)` | RPC, security definer | Exam office only. Checks title, date, duration, groups, at least one roster row, seat ranges covering the roster, and the browser rules for LMS exams; makes the code; sets `lobby_opens_at` from `lobby_minutes`, `status = 'scheduled'`, `scheduled_at`; returns the code. Errors name the step to fix |
| `import_roster(exam_id, rows jsonb)` | RPC, security definer | Upserts students by `(workspace_id, student_number)`, writes `exam_students` with seats in file order and `invites` rows as `pending`; one transaction; returns counts |
| `assign_proctors(exam_id, rows jsonb)` | RPC, security definer | Seat ranges and languages per proctor; refuses gaps and overlaps |
| `confirm_seats(exam_id, change_request)` | RPC, security definer | The proctor of that assignment: no text confirms (`confirmed_at`), text asks for a change |
| `help_from_event` | Trigger, after insert on `events` | For `student.help_requested`: inserts a `help_requests` row and broadcasts `help` to `exam:{exam_id}` |
| `close_help_request(id, reply)` | RPC, security definer | Proctor of the exam. Sets `done_at`; a reply also inserts a `message` command to the session |
| `decide_session(session_id, decision, note)` | RPC, security definer | Proctor of the exam or exam office. Upserts `review_decisions`, writes an audit row, and sets the exam to `reviewed` when every flagged session has a decision |
| `get_report(session_id)` | RPC, security definer | Staff of the exam. Returns the report payload: student, exam, flags with times and scores, the decision, data kept; creates the `reports` row with its verify code on first call |
| `create_share(report_id)` | RPC, security definer | Staff of the exam. Returns a new token once; stores its SHA-256 hash with `expires_at` 7 days ahead; audit row |
| `verify_report(code)` | RPC, open to anonymous users | Returns exam title, date, the student’s initials and whether the content hash still matches |
| `term_*` views | Views, `security_invoker = on` | `term_kpis`, `term_weekly_flags`, `term_flag_types`, `term_decisions`, `term_review_time` for A.1, under the caller’s RLS |
| `request_pilot(name, email, university, role, message)` | RPC, open to anonymous users | Validates, refuses a fourth request per email per day, inserts `pilot_requests`; the row’s trigger calls `pilot-notify` through `pg_net` |
| `retention_nightly` | `pg_cron`, 22:00 UTC (03:00 in Almaty) | Calls the `retention` Edge Function through `pg_net`, with its key from Vault |

### Row-level security

| Table | Exam office and admin | Proctor | Student | Anonymous |
| --- | --- | --- | --- | --- |
| `invites` | Read and write in their workspace | Read for assigned exams | None | None |
| `help_requests` | Read | Read and close for assigned exams | None; rows come only from the trigger | None |
| `review_decisions` | Read and write | Read and write for assigned exams | None | None |
| `reports`, `report_shares` | Read and write | Read and write for assigned exams | None | None; the share link goes through the Edge Function |
| `data_requests` | Read and write in their workspace | None | None | None |
| `pilot_requests` | Read (admin only) | None | None | Insert only through `request_pilot` |

pgTAP gets one file per new table with these cases for every role, as in Phase 0.

## API and realtime

Phase 1 adds five Edge Functions, ten RPCs and one Realtime message. Every function keeps Phase 0’s pattern: `withSupabase` from `@supabase/server`, Zod on input and output, the caller checked inside, an audit row for every read of student data.

### Edge Functions

| Function | Caller | Input | Output | Rules |
| --- | --- | --- | --- | --- |
| `send-invites` | Dashboard | `exam_id`, optional `student_ids[]`, or `test: true` | `sent`, `failed[]` | Exam office of the exam. Renders 0.8 with React Email in each student’s language, sends through Resend with `RESEND_API_KEY`, updates `invites`. A test invite goes to the signed-in staff member only |
| `shared-report` | Next.js server, for `/r/[token]` | `token` | the report payload with 5-minute still URLs | `withSupabase({ auth: 'none' })`; hashes the token, refuses expired or revoked shares, writes one audit row per view with `actor_kind = 'share'` |
| `data-request` | Dashboard | `request_id`, `action`: delete, copy or reply, `reply` | the request row; a 7-day link for copy | Exam office of the workspace. Delete removes the student’s stills from Storage, then their frames, events, identity score and device record; copy writes a JSON file to the private `exports` bucket. Audit rows for both |
| `retention` | `pg_cron` through `pg_net` | none | counts | `withSupabase({ auth: 'secret' })`; deletes stills older than each workspace’s `retention_days`, then their rows; audit row per run |
| `pilot-notify` | The `pilot_requests` trigger through `pg_net` | `id` | none | Secret-key only; emails you the request through Resend |

### RPCs

| Call | Caller | Input | Output |
| --- | --- | --- | --- |
| `rpc save_exam_draft` | Dashboard, every wizard step | `exam` (partial) | the exam row |
| `rpc import_roster` | 0.3 | `exam_id`, `rows[]` already validated in the browser | `inserted`, `updated`, `seats` |
| `rpc assign_proctors` | 0.3 | `exam_id`, `rows[]`: staff, seat range, languages | the assignments |
| `rpc schedule_exam` | 0.5 | `exam_id` | `code`, `lobby_opens_at`; or an error naming the step |
| `rpc confirm_seats` | 0.9a | `exam_id`, optional `change_request` | the assignment |
| `rpc close_help_request` | 2.4d | `id`, optional `reply` | the request |
| `rpc decide_session` | 3.3 | `session_id`, `decision`, `note` | the decision; the exam status |
| `rpc get_report` | 3.4 | `session_id` | the report payload with `verify_code` |
| `rpc create_share` | 3.4 | `report_id` | `url`, `expires_at` (the token appears only here) |
| `rpc verify_report` | `/verify/[code]` | `code` | exam, date, initials, `intact` |
| `rpc request_pilot` | `/pilot` | name, email, university, role, message | `ok` or `rate_limited` |
| `rpc add_session_note` | 2.5, 3.3 | `session_id`, `text` | the event id |

Settings (A.4) save through PostgREST under RLS: `workspaces.settings` for the exam office of the workspace only.

### Realtime

| Channel | New message | Sent by | Read by |
| --- | --- | --- | --- |
| `exam:{exam_id}` | `help` with the request id, student, topic, text, and `done_at` once closed | `help_from_event` and `close_help_request` | 2.4d and the Requests badge on 2.4 |

The Lock never talks to the server: E.5a sends `lock.event` with type `student.help_requested` to the app, which sends it through `ingest` like any other event.

### Contracts

`packages/contracts` gains Zod schemas for `RosterRow`, `ExamDraft`, `BrowserRules`, `ProctorAssignment`, `HelpRequest`, `ReviewDecision`, `ReportPayload`, `ShareLink`, `DataRequest` and `PilotRequest`, shared by the dashboard, the functions and the tests.

## Screens

Every screen is rebuilt from its frame as in Phase 0: pull it with the Figma MCP (`get_design_context`, then `get_screenshot`), build it from `packages/ui` and the tokens, and compare it with the screenshot before calling it done. Dashboard code keeps Phase 0’s layout: `apps/web/src/features/<area>/` holds a `-data.ts` file for queries, a `-model.ts` file for pure logic with unit tests, and a `-view.tsx` file for the screen. Pages under `app/(app)/` stay thin, and each checks the staff member itself.

### Dashboard

| Route | Frames | Who | Reads and writes |
| --- | --- | --- | --- |
| `/exams/new` | 0.4 | Exam office | `save_exam_draft` creates the draft, then redirects to its first step |
| `/exams/[examId]/edit/details` | 0.4 | Exam office | Title, course, groups, date, start, duration, room and mode; defaults from `workspaces.settings` |
| `/exams/[examId]/edit/checks` | 0.2, 0.2a | Exam office | `exams.checks`; 0.2a opens from the gaze row. For a browser exam, Next goes to E.1 |
| `/exams/[examId]/edit/browser` | E.1 | Exam office | `exams.browser_rules`, `lms_url`, `lms_done_path` and `allowed_sites`; browser exams only |
| `/exams/[examId]/edit/roster` | 0.3, 0.3a, 0.3b | Exam office | The CSV is parsed and checked in the browser; 0.3a lists the bad rows, and nothing is written until they are fixed; Edit opens 0.3b; then `import_roster`. The proctors table writes `assign_proctors`. 0.3b also fixes a bounced address after sending and resends that one invite |
| `/exams/[examId]/edit/review` | 0.5 | Exam office | Every step summed up; Send a test invite calls `send-invites` with `test: true`; Schedule exam calls `schedule_exam`, then `send-invites`, then returns to 0.1. An error from `schedule_exam` links to its step |
| `/my-exams` | 0.9, 0.9a | Proctor | Their `proctor_assignments` with the exams; 0.9a writes `confirm_seats`. The exam office sees a change request on 0.5 and in the exam’s proctor table |
| `/exams/[examId]/lobby` | 1.5a and 1.5b on top of 1.5 | Proctor | 1.5a is a hover card on a lobby row with step, problem and device from `sessions`. 1.5b lists students stuck on identity with the failed check; Send hint issues a `message` command |
| `/exams/[examId]/live` | 2.4d on top of 2.4; Mark reviewed in 2.4a; Add note in 2.5 | Proctor | Open `help_requests` plus the `help` broadcast; Reply and Mark done call `close_help_request`; Mark reviewed calls `decide_session` with `no_issue`; Add note calls `add_session_note` |
| `/review` | 3.2, 3.2a, 3.2b | Proctor, exam office | Sessions with a flag newer than their decision, grouped by exam; 3.2a filters through `?flag=`; 3.2b previews a still through Phase 0’s `stills` function |
| `/review/[sessionId]` | 3.3 | Proctor, exam office | Flags with stills, the timeline with notes, and the decision form; `decide_session` |
| `/review/[sessionId]/report` | 3.4 | Proctor, exam office | `get_report`; Download PDF prints the page through the print stylesheet; Export CSV builds the events file in the browser; Share link calls `create_share` and shows the link once |
| `/reports` | A.1 | Exam office | The `term_*` views; term and faculty pickers; Export PDF prints the page |
| `/students` | A.2 | Exam office | `student_overview`: search by name or number, filter by group, programme and year |
| `/students/[studentId]` | A.3 | Exam office | Exams and decisions, devices from `sessions.device`, rules accepted from `rules_accepted_at` and `rules_locale`, stills kept |
| `/settings` | A.4 | Exam office | `workspaces.settings`: retention days, lobby minutes, default duration and default checks |
| `/privacy-centre` | A.5, A.5a, A.5b | Exam office | `data_requests`; A.5a and A.5b open from a request and call `data-request`; the retention rule and its next run |
| `/privacy-centre/audit-log` | A.6 | Exam office | `audit_log`, newest first, filtered by actor, action and object; each share view is its own row |

Changes to the shell:

- The sidebar gains Review, Reports, Students, Settings and Privacy. Privacy is `/privacy-centre`, because `/privacy` is the public policy page. Items per role follow the frames: 0.9 for proctors, 0.1 for the exam office. Entry points to Phase 2 and 3 frames, such as A.4a to A.4d, A.7 and A.8, stay hidden; log that in `docs/decisions.md`.
- 3.4a is the account menu on every page: name, role, the EN and RU switch, and sign out. The switch sets a `uki_locale` cookie; `src/i18n/request.ts` reads it per request in place of the fixed `DASHBOARD_LOCALE`, and without it uses the staff member’s first language: `ru`, unless that is `en` ([next-intl without i18n routing](https://next-intl.dev/docs/getting-started/app-router/without-i18n-routing)).
- 0.1b opens from the overview’s video figure and counts the stills in `frames`. 0.1c is the workspace menu; the chosen faculty filters the overview and stays in a cookie.
- Dashboard strings stay in `packages/i18n/dashboard.json` and `dashboard-wall.json`, now in English and Russian; `pnpm i18n:build` fails on a missing Russian key.

### Public pages

| Route | Frame | Behaviour |
| --- | --- | --- |
| `/` | Landing page `114:2039` at 1440, Mobile 390 `192:3586` | `app/(marketing)/page.tsx`. Phase 0’s `app/page.tsx` goes and its redirect moves here: the exam office goes to `/overview`, proctors to `/my-exams`, visitors see the landing. Sign in in the header opens `/sign-in` |
| `/pilot` | Book a pilot `194:4014`, Sent `195:4090` | The form calls `request_pilot`; Sent replaces the form; a refusal shows the form’s error line |
| `/privacy`, `/terms` | Privacy policy `196:4125`, Terms of use `197:4144` | Text from the frames, marked as drafts |
| `/r/[token]` | 3.5 | Rendered on the server from `shared-report`, with `noindex`, `Referrer-Policy: no-referrer` and `Cache-Control: no-store`; an unknown, expired or revoked token gets the not-found page |
| `/verify/[code]` | None of its own | `verify_report`, shown with 3.5’s header and verify row; its two result lines are new catalog keys, logged in `docs/decisions.md` as a frame gap |

These pages need no session: `proxy.ts` passes requests without an auth cookie straight through, and they never call `requireStaff`. The `(marketing)` group has its own layout without the app shell ([route groups](https://nextjs.org/docs/app/api-reference/file-conventions/route-groups)).

Landing art: every background, image and animation on the landing pages is a generated asset, made with ChatGPT image generation and placed in the Figma frames. Export them with the Figma MCP into `apps/web/public/landing/` as WebP. A missing asset is generated the same way and placed in Figma first. Nothing is drawn by hand in CSS, SVG or canvas; code adds only fades and hover transitions.

### Student app

| Frame | Change |
| --- | --- |
| 1.4, 1.4a | “Where is the video?” opens in place. Continue after the agree box sends status `ready` with the rules locale; `ingest` stamps `sessions.rules_accepted_at` and `rules_locale` once and never overwrites them |
| 2.1, 2.2, 2.3 | Ask proctor opens the sheet from 1.3a. Sending queues a `student.help_requested` event with `topic` and `text` in the outbox, so it survives a network cut |
| 2.1e | A proctor’s reply or hint arrives as a `message` command and shows as Phase 0’s message state, also over 1.3a |

### Üki Lock

| Frame | Change |
| --- | --- |
| E.5a | Ask proctor in the bar, hidden in Phase 0. The sheet sends `lock.event` with type `student.help_requested`; the app queues it as its own event and answers `help.queued`, and the sheet confirms |
| E.5b | The Calculator tab, shown when `browser_rules.calculator` is on: a pure component in the bar’s shadow root, with no storage and no network, cleared when closed |
| E.8 | The toolbar popup while locked, off in Phase 0: time left from `exam.state`, the open allowed sites, and how many attempts the Lock noted (`tab.blocked`, `copy.blocked`, `site.closed`) |
| E.1 rules | `exam.state` gains `browser_rules`. Copy and paste, print and full screen follow it; with a rule off, the Lock skips that guard and its event. Developer tools and screen sharing stay as Phase 0 decided |

`help.queued` and the `browser_rules` field go into `packages/contracts/src/lock.ts`.

### Additions to the data model

- `add_session_note(session_id, text)`: an RPC for the exam’s proctors and the exam office that inserts a `proctor.note` event with source `proctor` and review `none`; 2.5, 3.3 and the report show it. `proctor.note` joins `packages/contracts/src/events.ts`.
- `student_overview`: a view with `security_invoker = on` for A.2, with student, group, programme, year, exams taken, flags and the latest decision.
- `exam_students.invite_status` stays, because the Phase 0 lobby reads it: `send-invites` writes the outcome to `invites` and to this column. `opened` appears only in seed data, since opens are not tracked.
- `_shared/http.ts` wraps every function with `withSupabase({ auth: 'user' })`; it gains an `auth` option, because `shared-report` uses `'none'`, and `retention` and `pilot-notify` use `'secret'`.

## Work plan

Fourteen packages run from Thursday 8 to Wednesday 14 October, beside the Phase 0 polish, in the order their Needs column allows; packages whose Needs are met run in parallel. Each package gets its own branch, for example `wp/1.3-wizard`, pushed as soon as it has a commit and merged through a pull request once CI is green. Its check goes into `docs/phase-1-exit.md`. After 1.1 merges, schema changes go into new migration files; a merged migration is never edited.

| Package | Days | Builds | Needs | Done when | Run by |
| --- | --- | --- | --- | --- | --- |
| 1.1 Schema and contracts | Thu 8 | `20261009000000_phase1.sql` with the enums, columns, tables, row-level security, functions, triggers and views from Data model and Screens; the private `exports` bucket; Zod contracts; `pnpm db:types`; `pnpm functions:sync` | P.9 | A clean `pnpm db:reset`; pgTAP files 09 to 14 pass for every role; `pnpm check` is green | Agent |
| 1.2 Shell and Russian | Thu 8 to Fri 9 | The sidebar per role, 3.4a with the language switch, the cookie locale, Russian for every dashboard key, 0.1b, 0.1c, proctors landing on `/my-exams` | None | Every Phase 0 and Phase 1 page renders in Russian with no missing key, and the choice survives a new session | Agent |
| 1.3 Exam wizard | Fri 9 to Sun 11 | 0.4, 0.2, 0.2a, E.1, 0.3, 0.3a, 0.3b and 0.5 under `/exams/[examId]/edit/`; Papa Parse with `RosterRow`; `save_exam_draft`, `import_roster`, `assign_proctors`, `schedule_exam` | 1.1, 1.2 | The demo CSV shows its bad rows on 0.3a; after the fixes, importing twice adds no duplicates; a refresh on any step loses nothing; Schedule returns a code | Agent |
| 1.4 Invites | Sat 10 | `send-invites` with 0.8 in React Email in Kazakh, Russian and English; Resend batches of up to 100; `UKI_EMAIL_SINK` for rehearsals; the test invite; outcomes in `invites` and `exam_students.invite_status` | 1.1; `RESEND_API_KEY` from you | Test and real invites reach your inbox in Kazakh and Russian and match 0.8 in Gmail and Apple Mail; a Resend error marks the row `failed` | Agent; you check the inbox |
| 1.5 Proctor home and lobby | Sat 10 | 0.9 and 0.9a with `confirm_seats`; 1.5a; 1.5b with Send hint | 1.1, 1.2 | Nurlan lands on 0.9 and confirms seats 65 to 128; a change request reaches the exam office; a hint reaches the student machine as 2.1e | Agent |
| 1.6 Ask proctor | Fri 9 to Sat 10 | The button on 2.1 to 2.3; E.5a; `help_from_event`; the `help` broadcast; 2.4d with its badge, Reply and Mark done; 1.4a and the rules stamp | 1.1 | A request from the app and one from the Lock reach 2.4d within 1 s at p95 on the cloud project; the reply shows as 2.1e; Mark done clears the badge on every proctor’s wall | Agent |
| 1.7 Lock additions | Sat 10 to Sun 11 | E.5b, E.8 and the `browser_rules` from E.1 | 1.1 | The Chrome test covers each rule on and off, the calculator offline, and E.8’s counts | Agent |
| 1.8 Review | Fri 9 to Sun 11 | 3.2, 3.2a, 3.2b, 3.3, `decide_session`, Mark reviewed in 2.4a, Add note in 2.5 | 1.1 | History of Kazakhstan’s 7 flags review to `reviewed`; a flag after a decision puts the session back in the queue; notes show in 2.5 and 3.3 | Agent |
| 1.9 Report and sharing | Sat 10 to Sun 11 | 3.4 with the print stylesheet and CSV; `get_report`; the verify code; `create_share`; `shared-report`; `/r/[token]` for 3.5; `/verify/[code]` | 1.8 | 3.4 prints on A4 from Chrome; the link opens in a private window without sign-in, its stills load, and each view writes an audit row; an expired link gets the not-found page; the code verifies, and a printout of an older version does not | Agent |
| 1.10 Reports page | Sun 11 to Mon 12 | A.1 from the `term_*` views, SVG charts from the kit’s Chart parts, Export PDF by print | 1.1; the seed v2 term | A.1 on seed v2 matches its frame | Agent |
| 1.11 Students and settings | Sun 11 | A.2 with `student_overview`, A.3, A.4 | 1.1 | Search finds Madina by name and by 20231187; A.3 shows when and in which language she accepted the rules; a changed default reaches the next new exam | Agent |
| 1.12 Privacy | Sun 11 to Mon 12 | A.5, A.5a, A.5b, A.6, `data-request`, `retention` with `retention_nightly` | 1.1 | Delete removes stills, frames, events, identity score and device record and keeps the answers and the receipt; Copy gives a 7-day link; both show on A.6; a manual retention run removes the 91-day-old seeded still | Agent |
| 1.13 Landing site | Thu 8 to Mon 12 | The `(marketing)` group; `/` at 1440 and 390; `/pilot` with Sent; `/privacy`; `/terms`; `request_pilot`; `pilot-notify`; the generated art exported from Figma | 1.1, for the form only | Each page matches its frame at both widths; a pilot request reaches your inbox; a fourth request from one address in a day is refused | Agent; you read the copy |
| 1.14 Demo v2 | Mon 12 to Wed 14 | Seed v2; `demo:reset` and `demo:simulate` v2; the demo CSV; Phase 1 on the cloud project and Vercel; `docs/phase-1-exit.md`; rehearsals | All | The script runs twice in under 10 minutes on the cloud project after `pnpm demo:reset`, and the 3-minute cut runs once | You and the agent |

### Your tasks

- [ ] Thu 8: put the cloud keys into `.env.cloud` and the GitHub secrets yourself (P.2), and rotate the exposed keys (P.17). Never paste a secret into chat.
- [ ] Thu 8: create a Resend account and an API key, then run `supabase secrets set RESEND_API_KEY=… UKI_EMAIL_SINK=<your address>` yourself. Invites send from `onboarding@resend.dev` until a domain is verified.
- [ ] Fri 9: tune the phone and card thresholds (P.6, P.7), and leave the Lock paired for 10 quiet minutes (P.16).
- [ ] Fri 9 or Sat 10: the lab session (P.5).
- [ ] Sat 10: the Phase 0 exit review (P.19) with the README test (P.14) and the Wi-Fi cut (P.15); check the invite emails on your phone.
- [ ] Mon 12: read the landing copy; ask the organizers about the student machine, the network and the length of the slot.
- [ ] Tue 13 and Wed 14: rehearse, and run the Kazakh and Russian read-through (P.18).
- [ ] Thu 15: freeze; reprint the two cards if needed; charge every device.

### Day by day

| Day | Agent | You |
| --- | --- | --- |
| Thu 8 | P.1, P.3, P.8, P.9, P.11, P.12, P.13; 1.1; 1.2 and 1.13 start | P.2, P.17, Resend |
| Fri 9 | P.4, P.10; 1.2 done; 1.3, 1.6 and 1.8 start | P.6, P.7, P.16; P.5 if the lab allows |
| Sat 10 | 1.4, 1.5 and 1.6 done; 1.7 and 1.9 start | Phase 0 exit review: P.19, P.14, P.15; P.5 if not done |
| Sun 11 | 1.3, 1.7, 1.8, 1.9 and 1.11 done; 1.10 and 1.12 start | Try the wizard and the review on the cloud project |
| Mon 12 | 1.10, 1.12 and 1.13 done; 1.14: seed v2 and the cloud deploy | The landing copy; the first full run |
| Tue 13 | Frames not done move to Phase 2; the Figma comparison pass; fixes | Rehearsal 1 |
| Wed 14 | Phase 1 exit review; fixes only | P.18; rehearsal 2 |
| Thu 15 | Freeze: the tag `demo-2026-10-16`, installers, the Lock zip | Rehearsal on the Demo Day machines |
| Fri 16 | Demo Day | Demo Day |

## Exit criteria

Phase 1 is done on Wednesday 14 October when every line below holds on the cloud project and the Vercel dashboard, with its evidence in `docs/phase-1-exit.md`.

- [ ] The exam office creates and schedules an exam through 0.4, 0.2, 0.3 and 0.5, and E.1 for a browser exam, in under 5 minutes; the demo CSV shows its bad rows on 0.3a, and the fixed import has no duplicates.
- [ ] Test and real invites reach your inbox in Kazakh and Russian and match 0.8; the seeded bounced address is fixed through 0.3b and resent.
- [ ] A proctor lands on 0.9 and confirms seats on 0.9a; a change request reaches the exam office.
- [ ] Ask proctor from the app and from the Lock reaches 2.4d within 1 s at p95; the reply shows on the student machine; Mark done clears it for every proctor.
- [ ] In the Lock, the calculator works offline and keeps no history, E.8 shows time left, open sites and noted attempts, and each E.1 rule takes effect.
- [ ] 3.2 lists every session with an undecided flag, filters and previews; 3.3 records one of three decisions with a note; the exam turns `reviewed` after the last one; Mark reviewed and Add note work from the wall.
- [ ] 3.4 prints on A4 and exports CSV; its share link opens 3.5 on a phone without sign-in, the stills load, the link expires after 7 days, and every view is on A.6; `/verify/[code]` confirms the printout.
- [ ] A.1 shows the seeded term; A.2 finds any student; A.3 shows exams, devices, rules accepted and data kept; A.4 changes the defaults of new exams.
- [ ] A delete request removes the student’s stills, frames, events, identity score and device record and keeps the answers and the receipt; a copy request gives a 7-day link; retention removes stills older than `retention_days`; each shows on A.6.
- [ ] `/`, `/pilot`, `/privacy` and `/terms` match their frames at 1440 and 390 on Vercel; a pilot request is stored and emailed, and a fourth from one address in a day is refused.
- [ ] Every dashboard page works in Russian, with no missing key.
- [ ] The Demo Day script v2 runs twice in under 10 minutes after `pnpm demo:reset`, and the 3-minute cut runs once.
- [ ] Phase 0’s 12 criteria still pass, and CI is green on macOS and Windows: `pnpm check`, pgTAP, integration, e2e, the Lock test and the load test.

## Demo Day script v2

The machines stay as Phase 0 planned: the student machine is a KRU lab PC if the organizers allow it, a borrowed Windows laptop, or the MacBook with its lockdown guard, and the dashboard opens on the other screen. You play the exam office and the proctors; a teammate plays Madina and Aliya, or you play both. Your phone shows the invite email and opens the shared report.

### Seed v2

Seed v2 adds to Phase 0’s seed, and `pnpm demo:reset` restores all of it.

| Data | For | Values |
| --- | --- | --- |
| Term “Autumn 2026” | A.1 | Three faculties and about 40 past exams from 1 September to 7 October, with sessions, flags, decisions and review times from a fixed random seed, tuned until A.1 shows the numbers in its frame |
| Programme and year | A.2, A.3 | For every seeded student |
| A bounced invite | 0.3b | One Mathematics 2 student with a mistyped address and `invite_status = 'bounced'` |
| Unconfirmed seats | 0.9a | Nurlan’s seats 65 to 128 on Mathematics 2 |
| The review queue | 3.2 | History of Kazakhstan’s 7 flags with stills, all undecided |
| An open help request | 2.4d | From a simulated student on Physics 1 |
| Data requests | A.5 | A delete request for a History of Kazakhstan student, received 3 days ago; a copy request done last week |
| A shared report | A.6 | An English B2 report, shared, with two views in the audit log |
| An old still | Retention | One still dated 91 days ago |
| `demo/roster.csv` | 0.3, 0.3a | 24 students of group 204 plus the bad rows 0.3a shows, such as a 7-digit number, a broken address and an unknown group |

### Demo commands

| Command | What it does |
| --- | --- |
| `pnpm demo:reset` | Phase 0’s reset plus seed v2: deletes the exams the wizard made, re-opens Nurlan’s seats, and clears History of Kazakhstan’s decisions and the help requests, shares and data requests made in rehearsal |
| `pnpm demo:simulate` | Phase 0’s 120 sessions plus two help requests in the first 3 minutes |

Invites go to `UKI_EMAIL_SINK`, your inbox. The 24-row CSV keeps each run well inside Resend’s free quota of 100 emails a day ([Resend quotas](https://resend.com/docs/knowledge-base/account-quotas-and-limits)). Simulated tiles and requests stay labelled as simulated in the presenter’s notes.

### Script, about 10 minutes

**Act 1 · The exam office, 2 minutes**

1. The landing page is on screen as people sit down. Sign in: Dana lands on 0.1 with Mathematics 2 next, Physics 1 live, History of Kazakhstan to review and 0 MB of video; open 0.1b for a moment.
2. New exam: 0.4, then 0.2 with 0.2a opened once, then 0.3: drop `demo/roster.csv`; 0.3a shows the bad rows; fix the address in 0.3b and the other rows; give Aigerim seats 1 to 12 and Nurlan 13 to 24. On 0.5, Send a test invite: your phone shows 0.8 in Kazakh. Schedule exam: the code appears, and 0.1 lists the exam.
3. Switch the dashboard to Russian in 3.4a, then back.

**Act 2 · The proctor, 30 seconds**

4. In a second browser profile, Nurlan’s 0.9 lists his exams; he confirms seats 65 to 128 on Mathematics 2 (0.9a).

**Act 3 · An exam in the app, 3 minutes**

5. Aigerim opens the Mathematics 2 lobby; simulated students join; hover a row for 1.5a. Madina joins with MATH2-204-FRI and 20231187, passes the system check and the card match (1.3), opens “Where is the video?” on the rules (1.4a) and agrees.
6. Start exam: the student machine shows 2.1 within 1 second, browser locked.
7. Madina lifts a phone: 2.2 on the student machine, the score on her tile, the still in 2.5. Aigerim adds a note in 2.5.
8. Madina presses Ask proctor on 2.1 and asks about question 7. The Requests badge and 2.4d show it within a second; Aigerim replies, 2.1e shows the reply in Kazakh, and she marks it done.
9. Madina submits and gets her receipt (3.1).

**Act 4 · A browser exam with Üki Lock, 2 minutes**

10. Aliya joins PHYS1-102-FRI and presses Lock and start (E.4); the portal locks (E.5).
11. Copy is blocked (E.6); she uses the calculator (E.5b); she asks the proctor from the bar (E.5a), and the request appears on Gulnara’s 2.4d; the Üki icon shows E.8 with the noted attempts.
12. She finishes the attempt: the Lock releases and her tabs come back (E.9).

**Act 5 · Review, report and privacy, 2.5 minutes**

13. Review (3.2): filter by phone (3.2a), hover a flag (3.2b), open Madina’s session (3.3) and decide “talk to the student” with a note. Open the report (3.4) with its verify code.
14. Share link: your phone opens 3.5 without signing in, and `/verify/[code]` confirms the printout.
15. Privacy (A.5): open the seeded delete request (A.5a) and delete; the audit log (A.6) shows the deletion and the view from your phone a minute ago.
16. End on A.1: the term in numbers, and 0 MB of video.

### The 3-minute cut

Before the slot, Madina waits in the lobby on 1.4. Run step 1 with the overview only, then steps 6, 7, 8, 13 and 14.

## Testing

Phase 0’s test layers, hand checks and merge gates stay. Phase 1 adds to each, and a package is not done until its tests are in.

| Layer | Tool | Phase 1 adds |
| --- | --- | --- |
| Database | pgTAP, `supabase test db` | `09_phase1_rls`: each new table for the exam office, proctors, students and anonymous users. `10_wizard`: draft saves, a roster imported twice without duplicates, proctor gaps and overlaps refused, `schedule_exam` errors per step, a code clash. `11_help_review`: `help_from_event`, `close_help_request`, `decide_session` turning the exam `reviewed`, the queue rule. `12_reports`: one report per session, the verify code, only the token hash stored, expiry. `13_privacy`: `data_requests` access and the retention selection. `14_pilot`: anonymous inserts only through `request_pilot`, and the daily limit |
| Edge Functions | Vitest against the local stack, `pnpm test:integration` | `send-invites` against a stub of the Resend API, reached through `RESEND_BASE_URL`, including a failed batch; `shared-report` valid, expired and revoked, with audit rows; `data-request` delete, with the Storage objects gone and the answers kept, and copy; `retention` with the 91-day still; `pilot-notify` |
| Unit | Vitest | CSV rows to `RosterRow` errors; the exam code; the calculator; the verify code; the report as CSV; Russian completeness; E.8’s counts |
| Dashboard | Playwright, `pnpm e2e` | The wizard with the demo CSV; 0.9a; a help request arriving on 2.4d; review to report to share, opened in a context without cookies; a privacy delete; the language switch; the landing pages at 1440 and 390, and the pilot form |
| Desktop app | Playwright for Electron | Ask proctor from 2.1 with the reply as 2.1e; 1.4a; `rules_accepted_at` set once |
| Üki Lock | Playwright with Chrome and the unpacked extension | E.5a through the app; the calculator offline; E.8’s counts; each browser rule on and off |
| Load | `pnpm e2e:load` | 120 sessions plus 20 help requests: request to 2.4d under 1 s at p95 |
| Design | Figma MCP and Playwright screenshots | Each Phase 1 frame beside its page at the frame’s size in `docs/phase-1-exit.md`; every difference fixed or logged |

### Hand checks on the MacBook

- An invite in Gmail on the web and in Apple Mail, in Kazakh and in Russian.
- 3.4’s Download PDF and A.1’s Export PDF from Chrome, on A4.
- The share link on your phone over mobile data.
- The landing page on your phone.
- Script v2 end to end, timed.

### Gates on every merge to main

Phase 0’s gates stay: Biome, type check, unit tests, pgTAP, integration tests, the dashboard e2e, gitleaks, and the macOS and Windows jobs. The Phase 1 tests above join them as each package lands.

## Risks and fallbacks

| Risk | Sign | Fallback |
| --- | --- | --- |
| 35 frames and a site in six days | A package past its day in the plan | Cut in this order and log each cut in `docs/decisions.md`: A.1’s charts become tables, then 0.1c, 3.2b, 1.5a, E.8, A.4, the 390 landing polish and A.3’s device list. Never cut the wizard, invites, Ask proctor, review, the report with its share link, A.5’s delete or the landing page at 1440 |
| Parallel packages collide in shared files: `events.ts`, `lock.ts`, `dashboard.json`, the sidebar | Merge conflicts or a red `main` | 1.1 lands every contract, event name and table first; later packages add keys in their own sorted blocks and rebase before each pull request |
| Resend’s test domain sends only to your own address, and the free plan sends 100 emails a day | `failed` rows; a 403 or a quota error | `UKI_EMAIL_SINK` sends every invite to your inbox; the demo roster has 24 rows; a paid month of Resend if rehearsals hit the quota ([403 with the test domain](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain)) |
| Kazakh text in email clients | Wrong glyphs or broken lines in 0.8 | A system font stack in the email styles; checks in Gmail and Apple Mail on Saturday 10 |
| Print to PDF differs between browsers | Cut tables or missing stills | Present from Chrome; `@page` set to A4 with margins; stills with fixed sizes ([@page](https://developer.mozilla.org/en-US/docs/Web/CSS/@page)) |
| A share link leaks | A view on A.6 you do not expect | 7-day expiry, `revoked_at`, `noindex`, no referrer, 5-minute still URLs |
| Deleting a student breaks reports and term numbers | A.1 or 3.4 fails for that student | Reports show what is left and say the data was deleted; term views count sessions and decisions, which a deletion keeps |
| Hand-built charts take longer | A.1 behind on Monday 12 | KPI tiles and tables from the same views |
| Landing art missing in Figma | An empty area in a frame | Generate it with ChatGPT image generation, place it in Figma and export it; never draw it by hand |
| The Russian dashboard reads badly | Odd phrases in rehearsal | P.18 on Wednesday 14; present in English if unsure |
| The demo runs long | A rehearsal over 10 minutes | The 3-minute cut |
| The venue network | Realtime or Vercel slow | A phone hotspot; the app’s outbox keeps the exam going |
| No Windows machine at the venue | The organizers say no | The MacBook as the student machine with its guard; the dashboard on the venue PC or a borrowed laptop |
| Supabase or Vercel free-plan limits | Usage warnings or a paused project | Check usage on Monday 12; upgrade for the week if needed |

## Open questions

Each answer goes into `docs/decisions.md`. Until then the plan’s choice stands.

| Question | Who answers | By | Until then |
| --- | --- | --- | --- |
| Do 0.3a’s bad rows match the CSV columns this plan picked: student number, full name, email, group, language? | You, in Figma | Oct 9, 2026 | The plan’s columns |
| On 1.5b, does the hint show as 2.1e over 1.3a, or as a line on 1.3a itself? | You, in Figma | Oct 10, 2026 | 2.1e over 1.3a |
| Does 3.4 get a Revoke action for shares? | You, in Figma | Oct 10, 2026 | `revoked_at` set by hand |
| Do you have a domain for sending invites, and who controls its DNS? | You | Oct 10, 2026 | The Resend test domain and `UKI_EMAIL_SINK` |
| May a KRU lab PC be the student machine on Demo Day, and what network does the venue have? | Organizers | Oct 12, 2026 | The MacBook and a phone hotspot |
| How long is the demo slot? | Organizers | Oct 12, 2026 | Plan for 10 minutes, rehearse the 3-minute cut |
| Who reads the Kazakh and Russian strings? | You | Oct 12, 2026 | First-pass strings, marked for review |
| Should the landing page name KRU, or stay neutral until a pilot is agreed? | You | Oct 12, 2026 | Neutral: KRU appears only as the hackathon case |

## Agent instructions

Replace `CLAUDE.md` in the repository root with this file. It keeps every Phase 0 rule and adds the Phase 1 frames, sources and rules.

```markdown
# Üki

Üki proctors university exams on the student’s own laptop. Detection runs on the laptop; only events and flagged stills reach the server, one Supabase Cloud project in Frankfurt (`eu-central-1`). Built for the Qostanai Industry Hackathon; the case customer is KRU, Kostanay.

- `apps/desktop`: Electron 44 student app with on-device detection and exam lockdown
- `apps/web`: Next.js 16 dashboard for the exam office and proctors, and the public landing site, on Vercel
- `apps/lock`: Üki Lock, a Manifest V3 extension built with WXT, paired with the app over a local WebSocket
- `apps/lms-mock`: static mock of the KRU exam portal for browser exams, on Vercel
- `supabase/`: migrations, Edge Functions and seed for the cloud project; the Supabase CLI runs the same stack locally

## Sources of truth

1. `docs/phase-1-plan.md`: the current plan, exported as Markdown from the Claude Doc “Üki · Phase 1 build plan”; it opens with the Phase 0 polish. `docs/phase-0-plan.md` still holds everything Phase 1 does not change, next to `docs/design-handoff.md`. The Decisions sections of both plans are settled. To change a decision, write the reason in `docs/decisions.md` first.
2. Figma file `9RB9aBz6lzS6XHpf5do5Gh`. Pull a frame with the Figma MCP (`get_design_context`, then `get_screenshot`) and rebuild it with `packages/ui` and the tokens. Never invent a colour, size or string.
3. `packages/i18n/catalog.json` for every student and Üki Lock string; `packages/i18n/dashboard.json` and `dashboard-wall.json` for the dashboard, in English and Russian. Students see Kazakh by default.

## Phase 0 frames

| Surface | Frame and node ID |
|---|---|
| Student app | 1.1 `51:2058`, 1.1a `151:11483`, 1.2 `51:2060`, 1.3 `51:2062`, 1.3a `151:11547`, 1.4 `51:2064`, 2.1 `51:2074`, 2.1a `180:18130`, 2.1c `180:18517`, 2.1d `181:16655`, 2.1e `199:18883`, 2.2 `51:2076`, 2.3 `51:2078`, 3.1 `51:2090` |
| Student app in Kazakh and Russian | Section “Languages · ҚАЗ and РУС” `167:14436` |
| Dashboard | A.0 `177:15946`, 0.1 `51:2046`, 1.5 `51:2066`, 2.4 `51:2080`, 2.4a `85:6504`, 2.4b `85:6635`, 2.4c `85:6750`, 2.4e `181:18746`, 2.5 `51:2082` |
| Üki Lock | E.3 `95:9192`, E.4 `97:9304`, E.5 `97:9529`, E.6 `98:9620`, E.7 `98:9737`, E.9 `98:10081` |
| Reference | Strings S.1 `171:15780` and S.2 `172:15868`; Event names `212:2039`; Windows and breakpoints `212:2521` |

## Phase 1 frames

| Surface | Frame and node ID |
|---|---|
| New exam | 0.4 `158:12473`, 0.2 `51:2048`, 0.2a `85:6315`, 0.3 `51:2050`, 0.3a `160:12932`, 0.3b `160:13301`, 0.5 `159:12771`; invite email 0.8 `161:13438`; browser rules E.1 `99:10209` |
| Proctor and lobby | 0.9 `164:13518`, 0.9a `164:15836`, 1.5a `85:6412`, 1.5b `156:12176` |
| Overview and student app | 0.1b `84:5341`, 0.1c `84:5436`, 1.4a `87:8156` |
| Ask proctor, calculator, Lock status | E.5a `152:11597`, E.5b `153:11724`, 2.4d `155:11803`, E.8 `98:9927` |
| Review and reports | 3.2 `51:2092`, 3.2a `87:8275`, 3.2b `87:8524`, 3.3 `51:2094`, 3.4 `51:2096`, 3.4a `87:8591`, 3.5 `162:13464` |
| Exam office and privacy | A.1 `102:10454`, A.2 `104:10579`, A.3 `105:10746`, A.4 `106:10905`, A.5 `107:11102`, A.5a `165:14035`, A.5b `165:16241`, A.6 `108:11296` |
| Landing site, on the Landing page | Landing `114:2039`, Mobile 390 `192:3586`, Book a pilot `194:4014`, Sent `195:4090`, Privacy policy `196:4125`, Terms of use `197:4144` |

## How to work

- This is a hackathon build: ready-made models, nothing self-hosted, no legal or consent work. Pick the smallest solution the plan allows.
- Hardware: one MacBook Pro for development; Windows 11 lab PCs at the university for Windows-only checks, in short sessions. Never assume another laptop. Every Windows-only behaviour gets a test in the Windows CI job and a line in the lab checklist, `docs/runbooks/lab-session.md`.
- Order: follow the day-by-day table in `docs/phase-1-plan.md`. The Phase 0 polish P.1 to P.19 runs beside work packages 1.1 to 1.14; P.1 and P.2 come first, and each package starts when its Needs are met. Packages whose Needs are met may run in parallel. One branch per item, for example `polish/p3-windows-ci` or `wp/1.3-wizard`.
- A package is done when its checks pass, its hand checks are listed as pending, and its evidence is in `docs/phase-1-exit.md`; polish evidence goes into `docs/phase-0-exit.md`.
- Build only Phase 1 frames; entry points to Phase 2 and 3 frames stay hidden. A frame not done by Tuesday 13 October moves to Phase 2; log it in `docs/decisions.md`.
- After work package 1.1 merges, schema changes go into new migration files; never edit a merged migration.
- Compare every screen with the screenshot of its frame before you call it done.
- When the plan and Figma disagree, Figma wins for visuals and the plan wins for behaviour. Write the conflict into `docs/decisions.md`.
- Art: every background, image and animation is a generated asset, made with ChatGPT image generation, placed in Figma and exported from there. Never draw art by hand in CSS, SVG or canvas.

## Commands

| Command | Does |
|---|---|
| `pnpm dev` | Local Supabase if needed, then web on 3000, the mock portal on 5180, the desktop app and the extension in watch mode |
| `pnpm db:reset` | Re-applies migrations and `seed.sql` locally |
| `pnpm db:types` | Regenerates `packages/db/src/database.types.ts` |
| `supabase test db` | pgTAP tests: RLS and database functions |
| `pnpm tokens` | Rebuilds `packages/tokens` from `figma-variables.json` |
| `pnpm i18n:build` | Builds `messages/{en,kk,ru}.json` from `catalog.json` and checks every message |
| `pnpm check` | Biome, type check and unit tests; CI runs the same |
| `pnpm functions:sync` | Copies `packages/contracts` into the Edge Functions; run it after every contract change |
| `pnpm test:integration` | Edge Function tests against the local stack |
| `pnpm e2e` | The Playwright tests for the dashboard against the local stack |
| `pnpm e2e:load` | The 120-session load test |
| `pnpm supabase:deploy` | Pushes migrations and deploys Edge Functions to the linked cloud project |
| `pnpm demo:reset`, `pnpm demo:simulate` | Demo data on the cloud project |
| `pnpm --filter desktop dist`, `pnpm --filter lock zip` | Installers and extension zips |

## Rules

- TypeScript strict. Zod checks every boundary: Edge Function input and output, events, commands, Lock messages, Electron IPC.
- Components use Tailwind classes generated from `packages/tokens` only: no colour, size or radius literals.
- No user-facing string in code: every string is an i18n key. No emoji in product copy.
- Icons come from lucide-react only, through `packages/ui/src/icons.ts`.
- Electron renderers run with `contextIsolation`, `sandbox` and no Node integration; the preload exposes one typed `window.uki`.
- The Windows keyboard hook runs only during lockdown and only swallows the keys the plan lists; it never records or sends a keystroke.
- Nothing leaves the laptop except events and flagged stills. Never use `MediaRecorder`, never upload an image outside `frames/`, never load models, wasm or fonts from a CDN.
- Apps carry only the Supabase publishable key. The secret key stays in the local `.env.cloud` for scripts; Edge Functions use `withSupabase` from `@supabase/server`. Never use the legacy `anon` or `service_role` keys.
- Every table has row-level security; every new table gets pgTAP tests for each role.
- No third-party analytics, crash reporting or tracking.
- Client-made ids are UUIDv7. Timestamps are `timestamptz` in UTC; screens show `Asia/Almaty`.
- The server owns exam time; the app corrects its clock from `server_time`.
- Events are named and typed only in `packages/contracts/src/events.ts`; the server sets `review`.
- Public pages (`/`, `/pilot`, `/privacy`, `/terms`, `/r/[token]`, `/verify/[code]`) never need a staff session. A shared report comes only from the `shared-report` Edge Function, which checks the token hash and expiry.
- A share token appears once, in the reply of `create_share`; only its SHA-256 hash is stored.
- Every read of student data by staff or through a share link writes an `audit_log` row.
- Email goes through Resend from Edge Functions only, with `RESEND_API_KEY` in Supabase secrets. No open or click tracking.
- Secrets never go into chat, commits, logs or screenshots; `.env` and `.env.cloud` stay ignored.

## Git

- Conventional Commits, for example `feat(web): exam wizard roster step`.
- Commits are authored as `k4ssymzhomart` and carry no co-author trailer.
- `origin` is github.com/k4ssymzhomart/uki. Push each branch as soon as it has a commit, and merge it into `main` through a pull request once CI is green, so nothing lives only on this Mac.
- From Thursday 15 October `main` is frozen at the tag `demo-2026-10-16`; only fixes for demo-blocking bugs merge until Demo Day ends.
```

## Sources

### Libraries and services

- [Papa Parse](https://www.papaparse.com/)
- [React Email](https://react.email/docs/introduction)
- [Resend: 403 error with the resend.dev domain](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain)
- [Resend: account quotas and limits](https://resend.com/docs/knowledge-base/account-quotas-and-limits)
- [Resend: send batch emails](https://resend.com/docs/api-reference/emails/send-batch-emails)
- [next-intl: App Router without i18n routing](https://next-intl.dev/docs/getting-started/app-router/without-i18n-routing)
- [Next.js: route groups](https://nextjs.org/docs/app/api-reference/file-conventions/route-groups)
- [Next.js: proxy.ts](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)
- [MDN: @page](https://developer.mozilla.org/en-US/docs/Web/CSS/@page)

### Supabase

- [Scheduling Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions)
- [JWT signing keys](https://supabase.com/docs/guides/auth/signing-keys)
- [API keys](https://supabase.com/docs/guides/api/api-keys)
- [Connecting to Postgres](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Storage: createSignedUrl](https://supabase.com/docs/reference/javascript/storage-from-createsignedurl)
- [Storage: remove](https://supabase.com/docs/reference/javascript/storage-from-remove)
- [Realtime: Broadcast](https://supabase.com/docs/guides/realtime/broadcast)
- [pgTAP](https://supabase.com/docs/guides/database/extensions/pgtap)

### Browser and extension

- [chrome.action](https://developer.chrome.com/docs/extensions/reference/api/action)
- [WXT: content scripts and shadow root UI](https://wxt.dev/guide/essentials/content-scripts)
