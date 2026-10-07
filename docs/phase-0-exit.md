# Phase 0 exit evidence

One row per work package check and per exit criterion. Status is `pass`, `fail` or `pending` (a hand check on the demo laptops, or a step that needs the cloud keys). Evidence is a command and its result, a CI link, a network log or a screen recording, with the date.

## Work packages

| WP | Check | Run by | Status | Evidence | Date |
| --- | --- | --- | --- | --- | --- |
| 0.1 | `pnpm check` passes locally (Biome, typecheck and tests of every package, Edge Function typecheck and unit tests) | Agent | pass | `pnpm check`: 22/22 turbo tasks; functions tsc; 47 function unit tests | 2026-10-07 |
| 0.1 | `pnpm check` passes in CI | Agent | pending | No GitHub remote yet; `.github/workflows/ci.yml` lands with WP 0.7/0.10 | |
| 0.1 | A sample screen renders a key in kk, ru and en | Agent | pass | `@uki/i18n` translator tests (kk, ru, en); desktop skeleton window switches `join.title` between kk and en (electron-vite dev) | 2026-10-07 |
| 0.1 | `pnpm i18n:build` checks every message | Agent | pass | 225 catalog keys; crafted bad catalogs fail (missing kk, empty, placeholder mismatch, parse error) | 2026-10-07 |
| 0.1 | Kazakh glyph check (ӘҒҚҢӨҰҮҺІ әғқңөұүһі) | Agent | pass | `pnpm --filter @uki/tokens glyphs`: Geist 18/18, Geist Mono 18/18; no fallback needed | 2026-10-07 |
| 0.1 | Kazakh letters render in Geist on every student screen | You | pending | Hand check on the demo laptops | |
| 0.2 | `pnpm tokens` reproduces the printed CSS | Agent | pass | tokens test compares tokens.css declaration by declaration with the plan's block (plus the dark focus ring, see decisions); 72 variables; 24 text styles | 2026-10-07 |
| 0.2 | Gallery shows every primitive in every state next to its Figma screenshot | Agent | pass | `pnpm --filter @uki/ui gallery` (port 5190); web `/gallery` in development; each group compared with Figma by Playwright screenshots | 2026-10-07 |
| 0.3 | `pnpm db:reset` and `supabase test db` pass | Agent | pass | 7 migrations + seed apply; pgTAP 7 files, 311 tests (RLS for exam office, assigned proctor, other proctor, session owner, other student; join_exam codes; session states; pause credit; triggers) | 2026-10-07 |
| 0.3 | `pnpm seed:staff` creates the four staff accounts | Agent | pass | Idempotent on a second run | 2026-10-07 |
| 0.4 | 50 events stored once with the server's review value | Agent | pass | `pnpm test:integration` 65/65, three runs | 2026-10-07 |
| 0.4 | A staff client gets the broadcast within 1 s | Agent | pass | Local: event broadcast median 9 ms, max 11.9 ms (n=5); cloud latency from Kostanay pending (WP 0.10/0.11) | 2026-10-07 |
| 0.4 | A command reaches the session channel; a still uploads and confirms | Agent | pass | Integration tests: command broadcast, group scope, add_time, 403 for another proctor; upload via signed URL, frames confirm, stills signed URL + audit row | 2026-10-07 |
| 0.5 | Detection rules fire for every Tuning moment; 5 minutes of writing raise no flag | Agent | pass | `pnpm --filter @uki/detection test`: 103 tests replaying traces | 2026-10-07 |
| 0.5 | Models ship with a SHA-256 manifest; nothing from a CDN | Agent | pass | `pnpm --filter @uki/detection models` + `models:verify`: 15 files, 55.9 MB | 2026-10-07 |
| 0.5 | Performance budget on the M1 Air and the Core i5 laptop (15 fps, 2 phone checks/s, CPU under 40%), also with the window hidden | You | pending | Measure with the developer overlay (Ctrl+Shift+D) | |
| 0.5 | Every Tuning moment fires 5/5 on both laptops | You | pending | Hand check | |
| 0.5 | Card match accepts your own card and rejects someone else's | You | pending | Print the two mock cards; tune `identity.minSimilarity` (0.5 let a different low-res photo through at 0.53) | |

## Exit criteria

| # | Criterion | Status | Evidence | Date |
| --- | --- | --- | --- | --- |
| 1 | Clean MacBook: README takes a new developer from clone to all four apps running in under 15 minutes | pending | | |
| 2 | CI passes on `main`: lint, type check, unit tests, builds for web, desktop on macOS and Windows, and the extension | pending | | |
| 3 | M1 Air and 8th-gen i5: face tracking 15 fps or more, phone checks 2 fps or more, app under 40% CPU | pending | | |
| 4 | Phone held 1 s creates `phone.detected` on the wall within 1 s at p95, with one still | pending | | |
| 5 | Network capture of a 10-minute exam shows no image or video upload except flagged stills | pending | | |
| 6 | Looking away over 2 s creates `gaze.off_screen`; no face for 10 s pauses the session and the wall shows it | pending | | |
| 7 | Proctor pause, message and end reach the student app within 1 s and show 2.1c, 2.1e and 2.1d | pending | | |
| 8 | Network cut for 2 minutes: answers stay on the laptop and sync with no loss and no duplicates | pending | | |
| 9 | Üki Lock pairs by its 6-digit code, blocks a second tab and logs `tab.blocked` | pending | | |
| 10 | Student screens switch between Kazakh, Russian and English from the catalog | pending | | |
| 11 | Dashboard on Vercel against the Supabase Cloud project, with seed data and RLS on every table | pending | | |
