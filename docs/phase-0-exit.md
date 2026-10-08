# Phase 0 exit evidence

One row per work package check and per exit criterion. Status is `pass`, `fail` or `pending` (a hand check on the MacBook Pro or, in the lab session, on a Windows 11 lab PC, or a step that needs the cloud keys). Evidence is a command and its result, a CI link, a network log or a screen recording, with the date.

Everything marked pass below ran on one shared development Mac (Apple M4, 16 GB, macOS 15.6) against the local Supabase stack. The Windows 11 lab PCs, the cloud project and CI have produced no evidence yet. Other projects' Docker stacks loaded this Mac during the runs (load average 13 to 48), which matters for every latency figure.

## Work packages

| WP | Check | Run by | Status | Evidence | Date |
| --- | --- | --- | --- | --- | --- |
| 0.1 | `pnpm check` passes locally (Biome, typecheck and tests of every package, Edge Function typecheck and unit tests) | Agent | pass | `pnpm check`: 22/22 turbo tasks; functions tsc; 47 function unit tests | 2026-10-07 |
| 0.1 | `pnpm check` on the tree after the hardening run | Agent | pass | Exit 0. Biome 741 files; guards 759 files. Turbo 22/22 tasks, replayed from cache: the same inputs had already passed. Tests: contracts 369, desktop 374, lock 122, web 136, ui 172, detection 103, i18n 43. Functions, scripts and e2e type checks clean; functions-unit 58 and scripts 82 tests | 2026-10-07 |
| 0.1 | `pnpm check` passes in CI | Agent | pending | No GitHub remote yet. `.github/workflows/ci.yml` exists (WP 0.10) but has never run | |
| 0.1 | A sample screen renders a key in kk, ru and en | Agent | pass | `@uki/i18n` translator tests (kk, ru, en); desktop skeleton window switches `join.title` between kk and en (electron-vite dev) | 2026-10-07 |
| 0.1 | `pnpm i18n:build` checks every message | Agent | pass | 225 catalog keys; crafted bad catalogs fail (missing kk, empty, placeholder mismatch, parse error) | 2026-10-07 |
| 0.1 | Kazakh glyph check (ӘҒҚҢӨҰҮҺІ әғқңөұүһі) | Agent | pass | `pnpm --filter @uki/tokens glyphs`: Geist 18/18, Geist Mono 18/18; no fallback needed | 2026-10-07 |
| 0.1 | Kazakh letters render in Geist on every student screen | You | pending | Hand check on the MacBook and, in the lab session, on a Windows 11 lab PC | |
| 0.2 | `pnpm tokens` reproduces the printed CSS | Agent | pass | tokens test compares tokens.css declaration by declaration with the plan's block (plus the dark focus ring, see decisions); 72 variables; 24 text styles | 2026-10-07 |
| 0.2 | Gallery shows every primitive in every state next to its Figma screenshot | Agent | pass | `pnpm --filter @uki/ui gallery` (port 5190); web `/gallery` in development; each group compared with Figma by Playwright screenshots | 2026-10-07 |
| 0.3 | `pnpm db:reset` and `supabase test db` pass | Agent | pass | 7 migrations + seed apply; pgTAP 7 files, 311 tests (RLS for exam office, assigned proctor, other proctor, session owner, other student; join_exam codes; session states; pause credit; triggers) | 2026-10-07 |
| 0.3 | `pnpm seed:staff` creates the four staff accounts | Agent | pass | Idempotent on a second run | 2026-10-07 |
| 0.3 | `supabase test db` with the five migrations added later on 2026-10-07 (`20261007200000` to `20261007221100`) | Agent | pass | 8 files, 390 tests, run twice. Includes `08_command_followups` (55 assertions). The review's regression cases fail against the old policies and functions | 2026-10-07 |
| 0.3 | A clean `pnpm db:reset` applies all 13 migrations and the seed | Agent | pass | P.9 below: `supabase db reset` on a fresh second stack applied the 13 Phase 0 migrations and `seed.sql` in one run, and pgTAP passed 8 files with 404 tests | 2026-10-08 |
| 0.3 | Every public table has row-level security | Agent | pass | `pg_class` query on the local database: all 17 tables in `public` have `relrowsecurity` on | 2026-10-07 |
| 0.4 | 50 events stored once with the server's review value | Agent | pass | `pnpm test:integration` 65/65, three runs | 2026-10-07 |
| 0.4 | A staff client gets the broadcast within 1 s | Agent | pass | Local: event broadcast median 9 ms, max 11.9 ms (n=5); cloud latency from Kostanay pending (WP 0.10/0.11) | 2026-10-07 |
| 0.4 | A command reaches the session channel; a still uploads and confirms | Agent | pass | Integration tests: command broadcast, group scope, add_time, 403 for another proctor; upload via signed URL, frames confirm, stills signed URL + audit row | 2026-10-07 |
| 0.4 | `pnpm test:integration` after the hardening changes | Agent | pass | Full run after the ingest change: 14 files, 78 tests, with `functions serve`. After the review repairs only `ingest.test.ts` (8/8) and `stills.test.ts` (6/6) ran, each alone; the first attempt failed in setup on an Auth 504 under load | 2026-10-07 |
| 0.4 | A quiet heartbeat writes nothing, and one ingest call is one transaction | Agent | pass | Per-call counters, 2 × 50 calls per kind. A quiet heartbeat before: 1 row version, 1 broadcast row, 2 transaction ids, about 0.75 KB of WAL; after: none. Function time p50 went from 8.6 and 9.0 ms to 5.9 and 7.9 ms (2 rounds of 120 sequential heartbeats) | 2026-10-07 |
| 0.4 | A command whose broadcast is lost reaches the app through the ingest reply | Agent | pending | Unit and runtime tests pass: the command applies once, and the test fails with delivery turned off. Live check not run: restart `supabase_realtime_uki` during an exam, pause from the wall, and expect 2.1c within about 10 s, applied once | |
| 0.5 | Detection rules fire for every Tuning moment; 5 minutes of writing raise no flag | Agent | pass | `pnpm --filter @uki/detection test`: 103 tests replaying traces | 2026-10-07 |
| 0.5 | Models ship with a SHA-256 manifest; nothing from a CDN | Agent | pass | `pnpm --filter @uki/detection models` + `models:verify`: 15 files, 55.9 MB | 2026-10-07 |
| 0.5 | A held phone scores at or above the 0.85 `phone_score` default | Agent | fail | Desktop e2e, synthetic camera showing the brand kit's held-phone picture: EfficientDet-Lite0 int8 scored 0.77 on every check, so the default never fires `phone.detected`. The e2e lowers its exam's `phone_score` to 0.7. Not a real phone; tune on the laptops (see decisions, "Detection thresholds") | 2026-10-07 |
| 0.5 | Card match on the synthetic camera | Agent | pass | Desktop e2e: a card drawn from the student's own enrolment photo matched at 0.93 on the first try (3.3 s). This does not test rejecting someone else's card | 2026-10-07 |
| 0.5 | Performance budget on the MacBook Pro and, in the lab session, on a Windows 11 lab PC (15 fps, 2 phone checks/s, CPU under 40%), also with the window hidden | You | pending | Measure with the developer overlay (Ctrl+Shift+D; on a lab PC, the lab zip from GitHub's Windows runners) | |
| 0.5 | Every Tuning moment fires 5/5 on the MacBook and on a Windows 11 lab PC | You | pending | Hand check | |
| 0.5 | Card match accepts your own card and rejects someone else's | You | pending | Print the two mock cards; tune `identity.minSimilarity` (0.5 let a different low-res photo through at 0.53) | |
| 0.6 | Desktop unit, runtime and screen tests; typecheck of main, preload, renderer and test | Agent | pass | 41 files, 374 tests after the review repairs. Each of the 9 desktop repair tests failed with its fix reverted | 2026-10-07 |
| 0.6 | Join to receipt in Electron on macOS against the local stack (`pnpm --filter desktop e2e`) | Agent | pass | 12/12 in 2.1 min (16:16 UTC). Synthetic camera; stand-in Lock paired by code; 1.3 matched at 0.93; 2.2 flagged with 3 confirmed stills; receipt `UKI-204-9166-MT` with a 28,130-byte PDF. 44 screenshots: 13 of the 14 frames and E.3 in en, kk and ru, plus two extra English states. 1.3a is missing because the card matched on the first try. `docs/evidence/desktop-e2e-2026-10-07.json`. Ran before the hardening and review changes and has not run since | 2026-10-07 |
| 0.6 | The same run with real kiosk lockdown (`UKI_E2E_KIOSK=1`) | Agent | pass | Rerun on 2026-10-08 on the quiet host: 12/12, resume 22 ms (see "P.11 kiosk e2e rerun" below). The first run, on 2026-10-07: tests 1 to 11 passed: kiosk on during the exam, quit refused, Close Üki quits at 3.1. The criterion 7 test failed because resume took 7,832 ms; the command function alone took 8,125 ms on the loaded host. The Mac was not left in kiosk mode | 2026-10-07 |
| 0.6 | A 2-minute network cut loses nothing | Agent | pass | `UKI_E2E_OFFLINE_S=120`, using Chromium's offline emulation. 2.1a after 5.3 s; no request got through during the cut. 9 answers on the laptop and 9 on the server, one of them changed offline; the 6 waiting events were stored once; seq 0 to 13, 0 duplicates; `net.offline` 126,122 ms with 11 queued. The file also records a second `net.offline` spell (27.1 s, 1 queued). `docs/evidence/desktop-e2e-offline-120s-2026-10-07.json` | 2026-10-07 |
| 0.6 | Scripted commands show 2.1c, 2.1e and 2.1d within 1 s | Agent | pass | Desktop e2e, final run, from command to screen: start 169 ms, pause 132, resume 636, message 612, add time 190, end 150. Other quiet runs: pause 111 to 210 ms, message 22 to 118 ms. Under host load, up to 7.8 s for resume and 9.5 s for message, almost all inside the command function | 2026-10-07 |
| 0.6 | The flow against the stack: ingest, frames, still uploads, commands, join to receipt (`pnpm test:integration:desktop`) | Agent | pass | 3/3 after the review repairs, on the third attempt: the first two timed out creating the fixture under load and left nothing behind. Commands reached the app in 12 to 579 ms in the WP 0.6 runs | 2026-10-07 |
| 0.6 | Packaged macOS arm64 build | Agent | pass | `Uki-0.0.0-arm64.dmg`, 156,423,040 bytes. Fuse wire as planned: RunAsNode, NODE_OPTIONS and CLI inspect off; only-from-asar and asar integrity on. `codesign --verify --deep --strict` valid (ad hoc). Exits 1 with `--remote-debugging-port`. Built with the local stack's CSP, so not a demo build | 2026-10-07 |
| 0.6 | Lockdown, tray, process scan and receipt PDF in a development build, driven over CDP | Agent | pass | Kiosk held in 4 of 4 rounds; quit refused in lockdown and in tray mode; development escape works; the 15 s scan pushed running apps; savePdf refused without a card. Keys sent over CDP never reach menu accelerators, so only unit tests cover reload blocking | 2026-10-07 |
| 0.6 | Join to receipt with a real camera and the printed cards on the MacBook | You | pending | | |
| 0.6 | macOS lockdown with a real keyboard: Cmd+Tab, Force Quit and the menu bar do nothing; a screenshot shows no exam window | You | pending | | |
| 0.6 | Windows 11 lab PC, in the lab session: the NSIS build and the zip from GitHub's Windows runners, install or run from a folder, join to receipt; Alt+Tab and the Windows key refocus and log `tab.blocked` | You | pending | Not built: needs Windows or CI. The macOS x64 dmg is not built either (a 130 MB Electron download) | |
| 0.6 | Real Wi-Fi off for 2 minutes during 2.1 | You | pending | The e2e used Chromium's offline emulation | |
| 0.7 | Web unit tests and typecheck | Agent | pass | 25 files, 136 tests after the review repairs; each new regression test failed on the old code | 2026-10-07 |
| 0.7 | `pnpm --filter web build` | Agent | pass | Next 16.4 build with its TypeScript step during WP 0.7. Not run again after the hardening changes | 2026-10-07 |
| 0.7 | Dashboard smoke test (`pnpm e2e`): sign-in, the wall from injected events, pause to `session_commands` | Agent | pass | 4/4. Event `at` to tile: p50 28 ms, p95 62 ms (n=6); after the ingest change, p50 19 ms, p95 27 ms | 2026-10-07 |
| 0.7 | A proctor sees only assigned exams | Agent | pass | `pnpm e2e`: Aigerim gets 404 on the Physics 1 wall and lobby. Gulnara gets 404 on Mathematics 2, reads 0 rows of it in 9 tables, and Realtime refuses its channel as Unauthorized. All of this also held during the 120-session load runs | 2026-10-07 |
| 0.7 | With `demo:simulate` running 120 sessions, the wall follows events within 1 s (p95) | Agent | fail | `pnpm e2e:load` on this shared laptop. Probe event `at` to tile: p50 254 ms, p95 15,352 ms (n=62) before the ingest change; p50 403 and 366 ms, p95 22.0 and 31.0 s in the two runs after it. The dashboard's own part passes: Realtime frame to tile p50 14 ms, p95 32 ms, and 76 of 76 events were shown. The tails come from the gateway and the local edge runtime (546 WORKER_LIMIT replies, cold boots, out-of-memory kills) on a saturated host | 2026-10-07 |
| 0.7 | The same on a quiet machine, and on the cloud project from Kostanay | You | pending | | |
| 0.7 | Lobby, overview and wall against the local stack (Playwright scripts) | Agent | pass | 27 lobby, overview and sign-in checks: realtime updates in 31 to 74 ms; Message everyone made 116 commands; Start exam made 116 start commands; 12-hour and session cookies. Wall: ingest to tile in 49 to 279 ms. Pause, resume, preset and free-text messages, group add_time and end each wrote the expected `session_commands` row. A held-back socket caught up on focus with one feed row | 2026-10-07 |
| 0.7 | A.0, 0.1, 1.5, 2.4, 2.4a to 2.4c, 2.4e and 2.5 match Figma | Agent | pass | Playwright screenshots at 1440 px (plus 1280 and 1024 for the rail), compared with the frame screenshots. After the UI kit polish: tile menu at the tile's x + 12 and y + 8; menus 228.98 px against Figma's 229; header rows 36 px (0.1) and 33 px (1.5) | 2026-10-07 |
| 0.7 | Real Chrome, Safari and Edge: cookie lifetimes, and the wall with the real student app | You | pending | | |
| 0.8 | Üki Lock typecheck and tests; relay and LockLink tests | Agent | pass | Lock: 15 files, 122 tests. In the desktop suite: relay 20, relay slot 3, LockLink outage 6 and events 5. All 25 new repair tests failed on the old code | 2026-10-07 |
| 0.8 | Build and zip | Agent | pass | `.output/chrome-mv3` about 2.4 MB; Chrome and Edge zips 1.01 MB each | 2026-10-07 |
| 0.8 | Smoke test: the unpacked MV3 extension in Chrome for Testing (headless), the real relay and the mock portal (`pnpm --filter lock smoke`) | Agent | pass | Paired by code. Lock and start closed 3 tabs. A new tab was closed with `tab.blocked`. `site.closed` for 127.0.0.1 showed E.7. `copy.blocked`; `lock.fullscreen_exit` count 1; `exam.submitted`, then `lock.released` with 2 tabs restored. App-exam lock and release passed, and the Lock was still paired after 45 s quiet. Builds 1234 and 1243 (the one CI installs). Not run again after the review repairs | 2026-10-07 |
| 0.8 | Extension id from the key pair | Agent | pass | The id `make-key` derived equals the id Chromium reported for a keyed build | 2026-10-07 |
| 0.8 | Popups, bar, toast and block page match E.3, E.4, E.5, E.6, E.7 and E.9 | Agent | pass | Smoke screenshots compared with Figma 95:9192, 97:9304, 97:9529, 98:9620, 98:9737 and 98:10081 | 2026-10-07 |
| 0.8 | The service worker stays paired through 10 quiet minutes in Chrome on macOS, and in Chrome and Edge on Windows | You | pending | Only a 45 s headless run so far | |
| 0.8 | Lock and release with the real app and the live wall: `tab.blocked` on the wall, E.7 with `site.closed`, copy blocked, tabs restored | You | pending | | |
| 0.9 | Every student frame in kk, ru and en: no raw key and no missing message | Agent | pass | Desktop screen tests (66), with use-intl's onError collecting nothing | 2026-10-07 |
| 0.9 | Every Lock screen (popup, block page, bar and toast) in kk, ru and en | Agent | pass | Part of the lock suite (122 tests) | 2026-10-07 |
| 0.9 | `pnpm i18n:build` | Agent | pass | 238 catalog keys and 284 dashboard keys; `build:check` reports up to date | 2026-10-07 |
| 0.9 | Kazakh numbers and dates in Chromium and Electron | Agent | pass | `test:browser` in Chromium 153, and a real Electron 44.6.0 window. 0.94 became 0,94; 1,234.5 became 1 234,5; "M10 9, Fri" became "9 қазан, жұма"; the receipt reads "жм, 9 қаз". The app's gallery in Electron shows "кадрда телефон · 0,94". Bundle 243,669 bytes (budget 280 KB) | 2026-10-07 |
| 0.9 | Frames screenshotted in Electron in kk, ru and en | Agent | pass | 44 PNGs from the desktop e2e, kept on this Mac only (`apps/desktop/test/results/frames`): 13 of the 14 frames and E.3 in all three languages; 1.3a is missing. Taken before the Kazakh fix, so Kazakh decimals there still show a point. The screens gallery screenshots cover all 14 frames in every language (84 in Chromium, at 1280 × 800 and 1024 × 700) | 2026-10-07 |
| 0.9 | A Kazakh and a Russian speaker read every student and Lock screen | You | pending | The kk and ru strings are first-pass, including the 13 keys added on 2026-10-07 | |
| 0.10 | Workflows parse: `ci.yml`, `deploy-supabase.yml`, `desktop-dist.yml` | Agent | pass | js-yaml strict load plus a structural check: each step has exactly one of run or uses, `with` appears only on uses steps, and every needs target exists. `ci.yml` has 5 jobs. actionlint and gitleaks are not installed here | 2026-10-07 |
| 0.10 | Vercel installs skip Electron and WXT | Agent | pass | Offline frozen installs in scratch copies of the workspace: 214 packages for lms-mock and 266 for web, none of them Electron or WXT; lms-mock builds | 2026-10-07 |
| 0.10 | Linked cloud project and `pnpm supabase:deploy` | Agent, with your keys | pending | No cloud project or keys on this machine | |
| 0.10 | The dashboard on Vercel signs in against the cloud project with seed data | Agent, with your keys | pending | | |
| 0.10 | A merge to `main` deploys migrations, functions and web | Agent | pending | No GitHub remote yet | |

## Exit criteria

Every criterion stays pending until it runs against the cloud project on the MacBook Pro and, in the lab session, on a Windows 11 lab PC (WP 0.11). The evidence column shows what this Mac has proved so far, and what is still needed.

| # | Criterion | Status | Evidence | Date |
| --- | --- | --- | --- | --- |
| 1 | Clean MacBook: README takes a new developer from clone to all four apps running in under 15 minutes | pending | | |
| 2 | CI passes on `main`: lint, type check and unit tests on Linux and Windows (GitHub's Windows runners), and builds for web, the extension and the desktop app on macOS and Windows, including the Windows zip that runs without install | pending | Local only. `pnpm check` exits 0 (WP 0.1). `ci.yml` (check, gitleaks, stack, build and desktop jobs) parses. Web, the mock portal and Üki Lock build here, and so does the macOS arm64 dmg. Still needed: a GitHub remote and a CI run, including the Windows and macOS x64 builds | 2026-10-07 |
| 3 | MacBook Pro and a Windows 11 lab PC: face tracking 15 fps or more, phone checks 2 per second or more, app under 40% CPU | pending | Not measured on either machine. A hint only, from the desktop e2e on this Apple M4 (development build, synthetic camera, loaded host): 12 to 14 fps, 2 to 2.5 phone checks a second, 48 to 91 ms per phone check. CPU was not measured | 2026-10-07 |
| 4 | Phone held 1 s creates `phone.detected` on the wall within 1 s at p95, with one still | pending | Local only. Desktop e2e: a phone in view gave the 2.2 warning after 682 ms and `phone.detected` with 3 confirmed stills, but only with `phone_score` lowered to 0.7, because the model scored 0.77. Wall: `pnpm e2e` event to tile p95 62 ms, and 27 ms after the ingest change. With 120 simulated students, p95 was 15.4 s, then 22.0 and 31.0 s, on a saturated host: not met here. Still needed: a real phone, a tuned `phone_score` and the cloud project | 2026-10-07 |
| 5 | Network capture of a 10-minute exam shows no image or video upload except flagged stills | pending | No network capture yet. `pnpm guards` (759 files) rejects `MediaRecorder` anywhere, and Storage writes to any bucket other than `frames`. The production desktop bundle has no `MediaRecorder` and no CDN URL. The e2e's phone flag uploaded its 3 stills through signed `frames/` URLs. Still needed: a network log of a 10-minute exam from a development build on the MacBook | 2026-10-07 |
| 6 | Looking away over 2 s creates `gaze.off_screen`; no face for 10 s pauses the session and the wall shows it | pending | Local only. The detection tests replay look-away and empty-seat traces (103 tests). Desktop e2e: an empty seat on the synthetic camera showed 2.3, and I'm here resumed the exam. `pnpm e2e`: `gaze.off_screen` events sent through ingest changed the tile within 1 s, and the paused tile was checked with a proctor pause. Nobody has yet watched the wall show a no-face pause. Still needed: a person and a real camera on the MacBook and on a lab PC, with the wall open | 2026-10-07 |
| 7 | Proctor pause, message and end reach the student app within 1 s and show 2.1c, 2.1e and 2.1d | pending | Local only. Desktop e2e final run: pause 132 ms (2.1c), message 612 ms (2.1e), end 150 ms (2.1d); resume 636 ms, add time 190 ms. Under host load, up to 7.8 s (resume, kiosk run) and 9.5 s (message), almost all inside the command function. Still needed: the MacBook and a lab PC against the cloud project | 2026-10-07 |
| 8 | Network cut for 2 minutes: answers stay on the laptop and sync with no loss and no duplicates | pending | Local only. Desktop e2e with a 120 s cut (Chromium's offline emulation): 9 answers on the laptop and 9 on the server; the 6 waiting events stored once; seq 0 to 13; 0 duplicates; `net.offline` 126,122 ms. `docs/evidence/desktop-e2e-offline-120s-2026-10-07.json`. Still needed: real Wi-Fi off on the MacBook | 2026-10-07 |
| 9 | Üki Lock pairs by its 6-digit code, blocks a second tab and logs `tab.blocked` | pending | Local only. The Lock smoke test (headless Chrome for Testing, real relay) paired by code, closed a new tab with `tab.blocked`, showed E.7 with `site.closed`, blocked a copy and restored the tabs at release. Still needed: Chrome on macOS, and Chrome and Edge on Windows, with the real app and `tab.blocked` on the wall | 2026-10-07 |
| 10 | Lockdown holds on the MacBook and, in one lab session, on a Windows 11 lab PC: blocked keys do nothing, other apps and screenshots are caught, and the packaged app starts from a folder without admin rights | pending | Local only. Added with the hardware correction (docs/phase-0-plan.md, Exit criteria). The kiosk e2e and the CDP-driven development build on this Mac held kiosk mode and refused quit (WP 0.6 rows above). Still needed: the MacBook hand checks on the packaged build (WP 0.13) and the lab session on a Windows 11 lab PC (WP 0.14) | |
| 11 | Student screens switch between Kazakh, Russian and English from the catalog | pending | Local. Every student frame and Lock screen renders in kk, ru and en with no raw key and no missing message. The desktop e2e took 44 Electron screenshots in the three languages, covering 13 of the 14 frames and E.3. Kazakh numbers and dates are fixed in Electron and Chromium. Still needed: the MacBook and a lab PC, and a native-speaker review of the kk and ru strings | 2026-10-07 |
| 12 | Dashboard on Vercel against the Supabase Cloud project, with seed data and RLS on every table | pending | Local only. Against the local stack with seed data, `pnpm e2e` passes 4/4: the exam office sees all five seeded exams; a proctor sees only assigned ones; another exam's proctor gets 404, 0 rows in 9 tables and a refused Realtime channel. pgTAP passes 390 tests with RLS for each role, and all 17 `public` tables have RLS on. Still needed: the cloud project, `pnpm supabase:deploy`, the seed there and the Vercel deployment | 2026-10-07 |

## Your tasks

- [ ] Create the Supabase project in Frankfurt with an asymmetric JWT signing key (ES256 or RS256), because `@supabase/server` refuses tokens signed with the legacy shared secret. Turn on anonymous sign-ins, then follow `docs/runbooks/cloud-setup.md`.
- [ ] Create the GitHub repository and remote. Put the cloud URL and the publishable and secret keys into your local `.env.cloud` and into GitHub secrets.
- [ ] Create the two Vercel projects (dashboard and mock portal), then set `UKI_ALLOWED_ORIGINS` to their origins.
- [ ] Make the Üki Lock key pair with `apps/lock/scripts/make-key.ts` and keep the private key out of the repository. Set `VITE_LOCK_EXTENSION_ID`, and build the demo installers with the cloud `VITE_SUPABASE_URL` in `.env`: the built CSP fixes the URL at build time.
- [ ] Print the two mock student cards: your photo with 20231187, and the photo of whoever plays Aliya with 20231455, both with large digits.
- [ ] Book the lab session on a Windows 11 lab PC for the NSIS build and the zips from GitHub's Windows runners, lockdown, and Üki Lock in Chrome and Edge.
- [ ] Have a Kazakh and a Russian speaker review the first-pass kk and ru strings, including the 13 keys added on 2026-10-07.
- [ ] On the MacBook and a Windows 11 lab PC, tune `phone_score` with real phones and the identity similarity with the printed cards, then record both values in `docs/decisions.md`.
- [ ] Run the pending hand checks above and fill in their rows.

## Quiet-host run, 2026-10-08

The earlier end-to-end runs shared this laptop with four other Supabase stacks (Docker at 450 to 700 % CPU, the edge runtime killed for memory). With those stacks stopped, every automated gate was run again in sequence on the same Apple M4. These are local numbers; the cloud project, the MacBook hand checks and the Windows 11 lab PCs are still pending.

| Gate | Result |
| --- | --- |
| `pnpm check` | pass |
| `supabase test db` | pass, 8 files, 404 tests |
| `pnpm test:integration` | pass, 15 files, 83 tests |
| `pnpm test:integration:desktop` | pass, 3 tests |
| `pnpm e2e` (dashboard) | pass, 4 tests; event `at` to tile p50 11 ms, p95 14 ms (n=6) |
| `pnpm --filter desktop e2e` | pass, 12 tests; evidence in `docs/evidence/desktop-e2e-2026-10-08.json` |
| `pnpm --filter lock smoke` | pass: paired by code, tabs closed, full screen, copy blocked, new tab closed, block page, tabs restored |
| `pnpm e2e:load` (120 simulated students) | pass, 1 test (5.7 min) |

- **Criterion 7 (commands within 1 s):** start 42 ms, pause 56 ms (2.1c), resume 81 ms, message 15 ms (2.1e), add time 30 ms, end 41 ms (2.1d).
- **Criterion 8 (network cut):** a 20 s cut showed 2.1a after 5.3 s; 5 answers and 6 events waited on the laptop; after reconnect 9 answers on the laptop and 9 on the server, app events seq 0 to 12, 0 duplicates, one `net.offline` of 20,029 ms. The 120 s run from 2026-10-07 is in `docs/evidence/desktop-e2e-offline-120s-2026-10-07.json`.
- **Card match:** a card made from the student's own photo matched at 0.93 on the first try.
- **Phone:** the e2e flag uploaded 3 confirmed stills with `phone_score` set to 0.7, because EfficientDet-Lite0 int8 scored the held phone 0.77. Tune on a real phone before Demo Day.
- **Load, 120 simulated students on the wall (WP 0.7, criterion 4's wall leg):** the probe event's `at` to tile p50 52 ms, p95 79 ms (n=120, one clock); simulated flag and log events to their Live events row p50 47 ms, p95 95 ms (n=14); ingest call p95 39 ms; the simulator's 449 events reached its own Realtime client with send to broadcast p95 20 ms, 0 missed, 0 failed; Realtime frame to tile p95 44 ms. Another exam's proctor got 404 on the lobby and the wall, a refused `exam:` channel and 0 rows in every table.
- **Two test fixes in this run:** the network-cut test now counts only requests that start during the cut (one ingest call already in flight finished 2 ms after the cut began), and the load test measures look-aways and second faces from when the app can send them (they are stamped at their threshold crossing and sent when the episode ends) and asserts the 1 s budget only on legs timed on one clock.

## P.8 1.3a evidence

`pnpm --filter desktop e2e` on the MacBook Pro (Apple M4) against the local stack, branch `polish/p8-identity-help-evidence`, 2026-10-08 09:37 UTC: 14 of 14 tests passed in 1.7 minutes. A first run, before the two fixes below, also passed 14 of 14 (1.9 minutes). The run's numbers are in `docs/evidence/desktop-e2e-identity-help-2026-10-08.json`. The e2e now has 14 tests, because the old "1.2, 1.3 and 1.4" test became three: "1.2 and E.3", "1.3a: three failed card matches ask the proctor (student.help_requested, topic identity)" and "1.3 and 1.4: a later card match recovers, then the rules".

| Check | Status | Evidence | Date |
| --- | --- | --- | --- |
| 1.3a opens after three failed card matches | pass | The synthetic camera's card shows another student's number (20230912) next to the student's own photo, so the face matches and the number does not. 1.3a showed 11.4 s after 1.3 opened. Face Ready, Student card "Couldn't read the card · 3 of 3 tries" with Needs help, One person Ready, Continue disabled | 2026-10-08 |
| The help request reaches the server | pass | One `student.help_requested` row in `events`: source `app`, review `log`, data `{"topic":"identity"}`. The session was in state `identity`, with no `identity.matched` yet | 2026-10-08 |
| The flow recovers on a later match | pass | With the right number back on the card, Continue was enabled 6.3 s later on 1.3. `identity.matched` arrived with score 0.93 and tries 5. There was still one help request. Then 1.4 showed and the session reached `ready` | 2026-10-08 |
| 1.3a screenshots in kk, ru and en | pass | `1.3a-kk.png`, `1.3a-ru.png` and `1.3a-en.png` (2560 × 1600: the 1280 × 800 window at 2x) in `/Users/k4ssym/Downloads/qostanai/uki-wt/polish-p8-identity-help-evidence/apps/desktop/test/results/frames/`. The run took 47 screenshots: all 14 Phase 0 student frames and E.3 in three languages, plus `1.3-checking-en` and `2.1e-time-en`. They are kept on this Mac only, like the 2026-10-07 frames | 2026-10-08 |
| 1.3a matches Figma `151:11547` | pass | Side by side at the frame's window size: the 1280 × 800 window at 80, 80 in the 1440 × 960 frame (`get_screenshot` at frame size). The images are `compare-1.3a-en.png`, `compare-1.3a-kk.png` and `compare-1.3a-ru.png` in `.../apps/desktop/test/results/compare/`, next to the frame render `figma-151-11547-1440.png`. The stepper, rows, chips, banner and buttons line up. The mean pixel difference is 2 to 6 of 255 outside the camera picture. Every difference left is known: the camera picture (the synthetic camera draws its own card), the native window buttons (a page screenshot has none), the request time, and the hint pill, face detail and banner body, where the catalog wins (`.figma-cache/151-11547/design-context.md`) | 2026-10-08 |
| Two fixes from the comparison | pass | After the help request, 1.3a went on counting tries ("4 of 3 tries"); the count now stops at 3. The waiting button named the proctor in full; it now reads "Waiting for Aigerim S.", as in Figma and on 2.1c. Each new unit test fails with its fix reverted | 2026-10-08 |

The same run measured the commands from request to screen: start 31 ms, pause 66 ms (2.1c), resume 112 ms, message 46 ms (2.1e), add time 89 ms, end 24 ms (2.1d).

## P.11 kiosk e2e rerun

`UKI_E2E_KIOSK=1 pnpm --filter desktop e2e` ran on the MacBook Pro (Apple M4) against the local stack, from branch `polish/p11-kiosk-e2e` (main at `e399267`). It started at 09:43:38 UTC on 2026-10-08, and 12 of 12 tests passed in 1.6 minutes. The Mac was in real kiosk lockdown from Start exam (2.1) until Close Üki on 3.1. The 2.1 test read `isKiosk()` as true and saw quit refused. The numbers are in `docs/evidence/desktop-e2e-kiosk-2026-10-08.json`, and the 44 screenshots are in `/Users/k4ssym/Downloads/qostanai/uki-wt/polish-p11-kiosk-e2e/apps/desktop/test/results/frames/`, kept on this Mac only.

The host was quiet:

- **Before the run:** load average 5.36, 6.25 and 5.90 (1, 5 and 15 minutes) on 10 cores. No Docker container was over 8 % CPU: the main stack, one other agent's stack and an unrelated database. Two minutes earlier, the busiest processes were macOS file indexing (`fseventsd`, `mds_stores`) and the Docker VM, and the run waited until the 1-minute load fell under 6.
- **After the run:** load average 8.15.
- **The 2026-10-07 run, for comparison:** load 13 to 48, with four Supabase stacks at 450 to 700 % CPU.

Exit criterion 7, from the proctor's request to the frame on screen:

| Command | Frame | Request to screen | Command function alone | Within 1 s |
| --- | --- | --- | --- | --- |
| start | 2.1 | 16 ms | (`start_exam` RPC) | yes |
| pause | 2.1c | 45 ms | 47 ms | yes |
| resume | 2.1 | 22 ms | 26 ms | yes |
| message | 2.1e | 15 ms | 14 ms | yes |
| add time | 2.1e | 22 ms | 23 ms | yes |
| end | 2.1d | 57 ms | not timed | yes |

The end command goes to the second student, whose app runs without kiosk. No command needed a retry. Resume took 7,832 ms on 2026-10-07, with 8,125 ms inside the command function on the loaded host. Now it took 22 ms, with 26 ms in the function. Nothing is over 1 s, so there was no cause to investigate. The slow resume was the host load, as the plan says.

The rest of the run:

- **Card match:** 0.93 on the first try, after 2.6 s.
- **Network cut:** a 20 s cut showed 2.1a after 5.3 s. There were 9 answers on the laptop and 9 on the server, app events seq 0 to 12, and 0 duplicates.
- **Phone:** the phone flag came with 3 confirmed stills. The model scored the phone 0.77 against the e2e's `phone_score` of 0.7.
- **Receipt:** `UKI-204-6677-MT`, with a 27,733-byte PDF.

After the run, `ps` showed no Electron process left and `ioreg` reported `IOConsoleLocked = No`. The app that had been in front before the run was in front again, so the Mac was not left locked.

## P.9 clean db reset

On 2026-10-08, P.9 ran on a second local Supabase stack. The stack used project `uki-p1` on ports 548xx and the same CLI as CI (2.107.0). The scratch config copied `supabase/config.toml` with only the project id and ports changed, and it linked `migrations/`, `seed.sql` and `tests/` from the `wp/1.1-schema` worktree at `origin/main` (33a7a78). The main stack on 547xx was left alone.

- `supabase start -x vector,logflare,imgproxy,studio,edge-runtime`, then `supabase db reset` (29 s). The reset recreated the database and applied all 13 migrations in one run, with no error and no manual step:
  1. `20261007115920_core.sql`
  2. `20261007115925_helpers_rls.sql`
  3. `20261007115927_rpc.sql`
  4. `20261007115930_internals.sql`
  5. `20261007115933_realtime_triggers.sql`
  6. `20261007115936_storage.sql`
  7. `20261007115938_cron.sql`
  8. `20261007200000_command_followups.sql`
  9. `20261007210000_ingest_performance.sql`
  10. `20261007213000_pause_credit_server_only.sql`
  11. `20261007221000_answers_until_real_end.sql`
  12. `20261007221100_ingest_last_seen_every_call.sql`
  13. `20261008090000_proctor_pause_ends_by_proctor.sql`

  Then it seeded `seed.sql` and created the `frames` bucket from `config.toml`.
- `supabase test db`: pass, 8 files and 404 tests. Per file: `01_rls` 86, `02_join_exam` 40, `03_start_submit` 34, `04_session_states` 63, `05_ingest_frames` 50, `06_commands` 48, `07_realtime` 28, `08_command_followups` 55.
- This closes the 0.3 row above. These 13 migrations were applied to the main local stack one at a time, partly by hand, under load. A full reset through the CLI now applies them cleanly. CI's `supabase start` repeats the reset on every push. The same reset with the Phase 1 migration added is evidence for WP 1.1 in `docs/phase-1-exit.md`.

## P.1 CI green, 2026-10-08

| Check | Status | Evidence | Date |
| --- | --- | --- | --- |
| `pnpm check` passes in CI on `main` (row 0.1) | pass | main's first run, [37756081782](https://github.com/k4ssymzhomart/uki/actions/runs/37756081782), failed in "Lint, guards, types and unit tests": the Edge Functions' copy of the contracts is generated and ignored by git, so a fresh checkout had none for `typecheck:functions`. #1 makes `typecheck:functions` sync it first. The next main run, [37757782353](https://github.com/k4ssymzhomart/uki/actions/runs/37757782353), passed all six jobs: check, secret scan, stack, builds, and the macOS and Windows installers | 2026-10-08 |
| Deploy Supabase deploys nothing while `CLOUD_DEPLOY` is unset | pass | Its deploy job was skipped after the red run ([37756551152](https://github.com/k4ssymzhomart/uki/actions/runs/37756551152)) and after the green one ([37758275025](https://github.com/k4ssymzhomart/uki/actions/runs/37758275025)) | 2026-10-08 |

## P.3 Windows CI

WP 0.12. The CI job "Windows (unit tests, zips, installer, launch test)" runs on `windows-latest` (image `windows-2025-vs2026`, Windows Server 2025). Evidence run: [37758235170](https://github.com/k4ssymzhomart/uki/actions/runs/37758235170), PR #4 at `8aff5a5`, before its rebase onto `main`.

| Check | Status | Evidence | Date |
| --- | --- | --- | --- |
| Text files check out with LF on Windows | pass | `.gitattributes`: `* text=auto eol=lf`, with images (the Figma SVGs included), fonts, models and archives marked binary. The first step finds no `w/crlf` file in `git ls-files --eol`; the index was already LF, so nothing renormalized | 2026-10-08 |
| `pnpm check` on Windows (the whole check, not a subset) | pass | Biome; guards; turbo 22/22 tasks (desktop 43 files, 399 tests); functions, scripts and e2e type checks; functions-unit 58 tests; scripts 82 tests. The first run failed 2 receipt-PDF tests that expected `/` in a path built with `node:path`; the tests now expect the OS separator | 2026-10-08 |
| NSIS installer and zip, x64 | pass | `Uki-0.0.0-x64.exe` (137 MB; `oneClick=false`, `perMachine=false`, so the install-mode page offers the current user) and `Uki-0.0.0-x64.zip` (183 MB, the unpacked app) | 2026-10-08 |
| Launch test from the zip, in a new folder | pass | `.github/scripts/windows-launch-test.ps1`: unzipped into a fresh temp folder, then "Uki.exe still runs after 20 s with a window titled 'Üki' (4 Uki processes)"; stopped afterwards | 2026-10-08 |
| Current-user install, then the launch test | pass | `Uki-0.0.0-x64.exe /S /currentuser` installed to `%LOCALAPPDATA%\Programs\Uki`, and the installed `Uki.exe` passed the same 20 s window check. The runner is an administrator, so starting without admin rights stays a lab check | 2026-10-08 |
| The lab zip, never shipped | pass | `pnpm --filter desktop dist:lab` (`electron-vite build --mode lab` with `electron-builder.lab.yml`) gave `Uki-lab-0.0.0-x64.zip`, with the developer overlay (Ctrl+Shift+D) and Ctrl+Shift+Q on. The job checks that the lab renderer has the overlay chunk and the shipped renderer does not; `desktop-dist.yml` never uploads `release/lab` | 2026-10-08 |
| Artifacts for the lab session | pass | `uki-windows-x64-zip`, `uki-windows-x64-lab-zip`, `uki-windows-x64-installer`, and `windows-launch-test` (screenshots of both launches), kept 14 days. To get them: the run's Summary page, Artifacts | 2026-10-08 |
| P.9 in CI: a clean `pnpm db:reset` of every migration | pass | Stack job step "Clean db reset with every migration and the seed (P.9)", right after `supabase start`: `db reset: 13 of 13 migrations applied; seed: 5 exams`. pgTAP after it: 8 files, 404 tests | 2026-10-08 |
| On a Windows 11 lab PC: the zip from a USB drive or profile folder without admin rights, SmartScreen, the NSIS install for the current user | pending | Lab session (P.5) with the artifacts above | |
