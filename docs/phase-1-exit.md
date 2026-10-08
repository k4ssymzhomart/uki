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
| CI on the pull request | pass | PR #10 at 8c367b1: every job of the pull-request run 37762433261 and the push run 37762428367 passed. The jobs were lint, guards, types and unit tests; database, functions, desktop flow, dashboard smoke test and demo scripts (pgTAP 01 to 14 after `supabase start`); the web, mock portal and Lock builds; the macOS and Windows installers; and the secret scan. Merged as 2aed25d | 2026-10-08 |
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

## 1.2 Shell and Russian

Branches `wp/1.2-i18n-format` (PR #3) and `wp/1.2-shell-russian` (PR #8). The Figma comparisons put the frame on the left and the page on the right, both at 1440 × 960, scaled to half. The page shows the local stack's data, which other packages' tests change, so numbers and rows differ from the frames. Differences that are not data are listed in the evidence column and logged in `docs/decisions.md` under “1.2 Shell and Russian”.

| Check | Status | Evidence | Date |
| --- | --- | --- | --- |
| Dashboard strings are `key → { en, ru }`, and `pnpm i18n:build` fails on a missing or empty Russian or English message | pass | `pnpm i18n:build`: 239 catalog keys and 305 dashboard keys in en and ru. `packages/i18n/test/build.test.ts` covers ru missing, ru empty, en missing and en empty, en and ru arguments that differ, a plural arm Russian lacks, the Phase 0 plain-string format, a duplicate key across files and `$comment`; i18n 48 tests | 2026-10-08 |
| Russian for every dashboard key, marked for the read-through | pass | All 289 keys on main (Phase 0's 287 and WP 1.1's two proctor-note keys) and the 16 keys added here have Russian; each file's `$comment` says “native review needed, P.18”. The test asserts that ru and en have the same dashboard leaves | 2026-10-08 |
| Every Phase 0 dashboard page and the new pieces render in Russian with no missing key | pass | `apps/web/test/russian.test.tsx`, 11 tests. It renders A.0, the lookup error, 0.1 with each filter, 0.1b open, 1.5 with each tab, 2.4 with Message group (2.4b), Extend time (2.4c), the tile menu (2.4a) and End (2.4e), 2.5, 3.4a open, 0.1c open, and a proctor's sidebar in `ru`. Each test fails on any next-intl `onError` and on any raw `dashboard.*` key. A self-check proves that a deleted Russian message fails | 2026-10-08 |
| The language comes from `uki_locale`, else the staff member's first language (ru unless en), else English | pass | `apps/web/src/i18n/request.test.ts` (7 tests): a visitor gets en; `{ru}` gets ru; the cookie wins without a staff lookup; a cookie of `kk` is ignored | 2026-10-08 |
| The choice survives a new session (cookie) | pass | `e2e/language.spec.ts` against `next dev -p 3200` and the local stack: Dana (first language ru) opens in Russian; 3.4a Language switches to English; the cookie lasts a year; after Log out and a new sign-in the page is still English; a new browser context with the same storage state is English; the switch goes back to Russian | 2026-10-08 |
| Phase 0 dashboard e2e still passes with the cookie locale | pass | `UKI_E2E_BASE_URL=http://localhost:3200 playwright test -c e2e/playwright.config.ts`: 5/5 (4 Phase 0 tests and the language test). The wall: event to tile p95 67 ms | 2026-10-08 |
| Sidebar per role (0.1 for the exam office, 0.9 for proctors); unbuilt pages and Phase 2 and 3 entry points hidden | pass | `shell-model.test.ts`: the exam office gets Workspace and Admin with all eight items once they are built, proctors get Workspace with six; today only Overview, Exams and Live are built, so the Admin section is hidden. `activeNav` covers `/review`, `/reports`, `/students`, `/settings`, `/privacy-centre` and `/my-exams`, but not `/privacy` | 2026-10-08 |
| Proctors land on `/my-exams` after sign-in | pending | Behind `PROCTORS_LAND_ON_MY_EXAMS = false` (`apps/web/src/features/shell/shell-model.ts`) until WP 1.5 builds `/my-exams`. Sign-in, `/`, `/sign-in` and the Overview item already use `staffHomePath(role)`. Unit-tested both ways | 2026-10-08 |
| 0.1c filters the overview by faculty and keeps it in a cookie | pass | `scope.test.ts`, `preferences.test.ts` (the cookie is set and cleared, a proctor and a non-uuid are refused), `overview-model.test.ts` (rows per faculty; exams this Monday-to-Sunday week in Asia/Almaty) | 2026-10-08 |
| 0.1b counts stills in `frames` and `events` for the overview's exams | pass | `russian.test.tsx` opens 0.1b and reads 38 and 9 870; `packages/ui/src/feedback/popover.test.tsx` covers PopoverInfo. Counts only, without sizes (decisions) | 2026-10-08 |
| `pnpm check` | pass | Exit 0 on the branch rebased onto WP 1.1: Biome 775 files, guards 801 files, turbo 22/22 tasks (web 188, ui 173, i18n 48 tests), functions-unit 61, scripts 83 | 2026-10-08 |
| CI on the pull requests | pass | PR #3 (the string format) at 10b8d2f: every job of runs 37764320216 and 37764328144 passed (Linux checks, pgTAP, integration, dashboard e2e, macOS and Windows installers, builds, secret scan); merged as 5d62252. PR #8: CI on the merge request, see the PR | 2026-10-08 |
| Figma 3.4a `87:8591` (account menu) | pass | ![3.4a](evidence/phase-1/1.2/3.4a.jpg) Same panel, header, separators and rows. Profile and Notifications are hidden on purpose (no Phase 1 page; A.7 is Phase 3) | 2026-10-08 |
| Figma 3.4a in Russian | pass | ![3.4a ru](evidence/phase-1/1.2/3.4a-ru.jpg) “Язык РУС”, “Выйти”; the role line fits | 2026-10-08 |
| Figma 0.1b `84:5341` (why 0 MB) | pass | ![0.1b](evidence/phase-1/1.2/0.1b.jpg) Same place under the tile, face, title, body and rows. The sizes (“· 2.6 MB”) and “Open privacy centre” are left out on purpose (decisions; the link returns with 1.12) | 2026-10-08 |
| Figma 0.1c `84:5436` (faculty switcher) | pass | ![0.1c](evidence/phase-1/1.2/0.1c.jpg) Same header, rows with building icon, count and check, separator and All faculties. Add faculty is hidden on purpose. The local workspace has no faculty chosen, so All faculties is checked | 2026-10-08 |
| Figma 0.1 `51:2046` in Russian | pass | ![0.1 ru](evidence/phase-1/1.2/0.1-ru.jpg) Layout as in English; dates as “ср, 7 окт”. The long role label “Экзаменационный отдел” is clipped in the user block (P.18) | 2026-10-08 |
| Figma 2.4 `51:2080` in Russian | pass | ![2.4 ru](evidence/phase-1/1.2/2.4-ru.jpg) A throwaway live exam with 6 students (e2e wall fixture, removed afterwards). The longer Russian status line is cut on one tile (P.18) | 2026-10-08 |
| Native Russian read-through of every dashboard string | pending | P.18, you, Wed 14 | |
