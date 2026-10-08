# Phase 1 exit evidence

One table per work package: check, status, evidence and date. Status is `pass`, `fail`, `pending` (a hand check, or a step that needs the cloud project or you) or `not-run` (with the reason). Polish items P.1 to P.19 keep their evidence in `docs/phase-0-exit.md`.

## 1.1 Schema and contracts

Ran on the development MacBook against a second local Supabase stack, project `uki-p1` on ports 548xx with CLI 2.107.0, so the main stack on 547xx stayed untouched. The branch was `wp/1.1-schema`, rebased on `origin/main` at ff27edb.

| Check | Status | Evidence | Date |
| --- | --- | --- | --- |
| A clean `db:reset` with the Phase 1 migration | pass | `supabase db reset` applied the 13 Phase 0 migrations, then `20261009000000_phase1.sql`, then `seed.sql`, on a fresh database with no error | 2026-10-08 |
| pgTAP 01 to 14 for every role | pass | `supabase test db`: 14 files, 757 tests. Phase 0's 01 to 08 are unchanged at 404. The new files: `09_phase1_rls` 84, `10_wizard` 109, `11_help_review` 51, `12_reports` 50, `13_privacy` 36, `14_pilot` 23 | 2026-10-08 |
| Row-level security on every table | pass | `09_phase1_rls` checks that every table in `public` has RLS on: 24 tables, 17 from Phase 0 and 7 from Phase 1. For each new table and view it covers the exam office, another workspace's office, an admin, the assigned proctor, another exam's proctor, a student and an anonymous visitor | 2026-10-08 |
| `pnpm check` | pass | Exit 0. Biome 761 files; guards 787 files; turbo 22/22 tasks. Tests: contracts 442 (73 new), web 158, desktop 397, lock 124, ui 172, detection 102, i18n 43, tokens 30, lms-mock 8, db 6. Functions, scripts and e2e type checks clean; functions-unit 61; scripts 83 | 2026-10-08 |
| `pnpm test:integration` against the second stack | pass | 16 files, 86 tests, with `supabase functions serve` on the second stack. The functions runtime of `uki-p1` served all 120 requests of the run | 2026-10-08 |
| `pnpm test:integration:desktop` against the second stack | pass | 3 tests: join, ingest, frames, commands and submit through the replaced `join_exam` and `ingest_batch` | 2026-10-08 |
| `pnpm e2e` (dashboard smoke) against the second stack | pass | 4 tests, `next dev` on port 3141, after `pnpm seed:staff` on the second stack | 2026-10-08 |
| `pnpm db:types` | pass | `packages/db/src/database.types.ts` regenerated from the second stack (`supabase gen types typescript --local`) | 2026-10-08 |
| `pnpm functions:sync` | pass | 21 contract files copied into the functions, `--check` clean, function type check clean | 2026-10-08 |
| CI on the pull request | pending | PR #10. Linux, macOS and Windows jobs | |
| The main local stack has the migration | pending | The coordinator runs `supabase migration up` on 547xx after the merge | |
| The cloud project has the migration | pending | P.2: `pnpm supabase:deploy` from your machine. Then create the two Vault secrets in `docs/runbooks/cloud-setup.md` so that `retention_nightly` and pilot emails can call their functions | |

What the package adds, for the packages that build on it:

- **Tables (7):** `invites`, `help_requests`, `review_decisions`, `reports`, `report_shares`, `data_requests` and `pilot_requests`. The four enums and the plan's columns on `workspaces`, `exams`, `proctor_assignments`, `students` and `sessions`.
- **RPCs:** `save_exam_draft`, `import_roster`, `assign_proctors`, `schedule_exam`, `confirm_seats`, `close_help_request`, `decide_session`, `add_session_note`, `get_report`, `create_share`, `verify_report` (anon), `request_pilot` (anon) and `audit_read`. For the Edge Functions, with the secret key only: `open_shared_report` and `retention_due`.
- **Triggers:**
  - `help_from_event` creates a help request and sends the `help` broadcast.
  - `invites_sync_status` keeps `exam_students.invite_status` in step with the invite.
  - `pilot_requests_notify` calls pilot-notify through `pg_net`.
  - The audit triggers on `data_requests` and on `workspaces.settings`.
- **Views:** `term_kpis`, `term_weekly_flags`, `term_flag_types`, `term_decisions` and `term_review_time`, built on `term_exams` and `term_sessions`, plus `student_overview` and `review_queue`. All use `security_invoker`.
- **Storage and cron:** the private `exports` bucket, and `retention_nightly` at 22:00 UTC.
- **Replaced functions:** `join_exam` now returns `browser_rules`, `rules_locale` and `room`. `ingest_batch` now stamps `rules_accepted_at` and `rules_locale` once.
- **Contracts:** `wizard.ts`, `review.ts`, `privacy.ts`, `exam-code.ts` and `browser-rules.ts`. Phase 1 blocks were added to `events.ts` (`proctor.note`), `realtime.ts` (`help`), `lock.ts` (`help.queued`, the Lock's `student.help_requested`, `LockExam.browser_rules`) and `api.ts` (`JoinExam` and `IngestStatus`).
- **`_shared/http.ts`:** `serveApi({ auth })` takes `"user"` (the default, unchanged for the four Phase 0 functions), `"none"` or `"secret"`.

Figma: 1.1 builds no screen, so no screen was compared. These frames were read to shape the contracts: 0.4 `158:12473`, 0.3 `51:2050`, 0.3a `160:12932`, E.1 `99:10209`, 0.9a `164:15836`, 2.4d `155:11803`, 3.3 `51:2094`, 3.4 `51:2096`, 3.5 `162:13464`, A.1 `102:10454`, A.2 `104:10579`, A.5a `165:14035` and Book a pilot `194:4014`. Their screenshots are in `.figma-cache/`. Where the frames and the plan disagree, the choice is logged in `docs/decisions.md` under "2026-10-08 · Phase 1 schema and contracts (WP 1.1)".
