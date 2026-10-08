# Üki

Üki proctors university exams on the student's own laptop. Face, gaze and phone detection run on the laptop with ready-made models; only events and flagged stills (up to three 640 × 360 JPEGs per flag) reach the server. Proctors watch a live wall in the browser and can pause, message and end a session. For exams that run in the university's portal, the Üki Lock browser extension keeps the student on one tab.

Built for the Qostanai Industry Hackathon; the case customer is KRU, Kostanay. This repository is Phase 0, the walking skeleton: every surface runs end to end on seeded data. The plan is [docs/phase-0-plan.md](docs/phase-0-plan.md), the screens are in Figma file `9RB9aBz6lzS6XHpf5do5Gh`, and the house rules are in [CLAUDE.md](CLAUDE.md).

| App | What it is | Local URL |
| --- | --- | --- |
| `apps/desktop` | Üki, the Electron student app: join, system and identity check, exam, receipt, lockdown | Electron window (renderer on 5173) |
| `apps/web` | Next.js dashboard for the exam office and proctors: sign-in, overview, lobby, live wall | http://localhost:3000 |
| `apps/lock` | Üki Lock, a Manifest V3 extension paired with the app over a local WebSocket | unpacked from `apps/lock/.output/chrome-mv3-dev` |
| `apps/lms-mock` | A static mock of the KRU exam portal for the browser exam | http://localhost:5180/physics-1/quiz-3 |

Everything talks to one Supabase project: `pnpm dev` runs the apps against the cloud demo project in Frankfurt (`eu-central-1`), and `pnpm dev:local` against a Supabase CLI stack on your laptop.

## Download

The [latest release](https://github.com/k4ssymzhomart/uki/releases/latest) has the student app and Üki Lock, built against the cloud project. Each file keeps its name from release to release, so these links always serve the newest one:

| File | For |
| --- | --- |
| [`Uki-mac-arm64.dmg`](https://github.com/k4ssymzhomart/uki/releases/latest/download/Uki-mac-arm64.dmg) | Macs with Apple silicon (M1 and later) |
| [`Uki-mac-x64.dmg`](https://github.com/k4ssymzhomart/uki/releases/latest/download/Uki-mac-x64.dmg) | Intel Macs |
| [`Uki-Setup-win-x64.exe`](https://github.com/k4ssymzhomart/uki/releases/latest/download/Uki-Setup-win-x64.exe) | Windows 10 and 11 (x64), the installer; "Only for me" needs no admin rights |
| [`Uki-win-x64.zip`](https://github.com/k4ssymzhomart/uki/releases/latest/download/Uki-win-x64.zip) | Windows (x64) without an install: unzip anywhere and run `Uki.exe` |
| [`Uki-Lock-chrome.zip`](https://github.com/k4ssymzhomart/uki/releases/latest/download/Uki-Lock-chrome.zip) | Üki Lock for Google Chrome |
| [`Uki-Lock-edge.zip`](https://github.com/k4ssymzhomart/uki/releases/latest/download/Uki-Lock-edge.zip) | Üki Lock for Microsoft Edge |

The builds are unsigned. On macOS, right-click Üki in Applications and choose Open (on macOS 15 and later, System Settings, Privacy & Security, Open Anyway), or run `xattr -dr com.apple.quarantine /Applications/Uki.app` once. On Windows, if SmartScreen says "Windows protected your PC", choose More info, then Run anyway. For Üki Lock, unzip it, open `chrome://extensions` (or `edge://extensions`), turn on Developer mode, choose Load unpacked and pick the unzipped folder. The release's app pairs only with the release's Lock. The release notes have the details, and each file's size and SHA-256.

A release is made from `main` by the Desktop installers workflow: `gh workflow run desktop-dist.yml --ref main -f publish=true` publishes `v0.1.<run number>` as the latest release. The lab zip, with its developer overlay, is never released: it is a CI artifact ([docs/runbooks/lab-session.md](docs/runbooks/lab-session.md)).

## Prerequisites

| Tool | Version | Install on macOS |
| --- | --- | --- |
| Node.js | 24 (see `.nvmrc`) | `brew install node@24`, or `nvm install` / `fnm use` in the repository |
| pnpm | 10 (pinned in `package.json`) | `corepack enable` (ships with Node) |
| Docker | Only for the local stack: Docker Desktop or OrbStack, running, about 6 GB of free disk | https://docs.docker.com/desktop/ |
| Supabase CLI | Only for the local stack: 2.107 or later | `brew install supabase/tap/supabase` |

`pnpm dev` needs neither Docker nor the Supabase CLI. Windows works the same with Node from nodejs.org, and for the local stack Docker Desktop with WSL 2 and the Supabase CLI from Scoop (`scoop install supabase`).

## From clone to all four apps running

`pnpm dev` runs the four apps against the cloud demo project: no Docker and no local database. Most of the setup time is `pnpm install` and the models.

```sh
git clone <repository-url> uki && cd uki
corepack enable                 # pnpm 10, as pinned in package.json
pnpm install
pnpm models                     # detection models for the desktop app (59 MB, checked against a SHA-256 manifest)
# put the cloud project's address and publishable key into .env.cloud (below)
pnpm dev                        # web, mock portal, desktop app and Üki Lock in watch mode, against the cloud
```

`pnpm dev` reads the cloud project's public values from `.env.cloud` in the repository root, which git ignores. Two lines are enough (Supabase dashboard, Project Settings, API Keys):

```sh
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

It reads only `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and any `NEXT_PUBLIC_*`, `VITE_*` and `LOCK_*` lines of that file. On the machine that runs the demo the same file also holds the secret key and the passwords for the demo scripts ([docs/runbooks/cloud-setup.md](docs/runbooks/cloud-setup.md)); `pnpm dev` skips those lines unread, and no secret key, password or token reaches an app, not even one exported in your shell. It starts no Docker, no local Supabase and no `functions serve`: the cloud project's own Edge Functions answer. `pnpm dev --only web,lock` runs a subset of `web`, `lms-mock`, `desktop` and `lock`. More, with the troubleshooting, in [docs/runbooks/development.md](docs/runbooks/development.md).

**This is the shared, live demo data.** Whatever you do in the apps (sign in, join an exam, send a command to a student) happens on the project everyone, the judges included, is looking at. Look around freely; change data only when you mean to. Its owner restores the demo with `pnpm demo:reset --env-file .env.cloud`.

Then check each app:

1. **Dashboard**: open http://localhost:3000. Staff sign in as `dana.akhmetova@kru.test` (exam office) or `aigerim.sadykova@kru.test` (proctor); on the cloud their password is the demo owner's `SEED_STAFF_PASSWORD`, on the local stack `SEED_STAFF_PASSWORD` from `.env`.
2. **Desktop app**: the Electron window opens on 1.1 Join in Kazakh. macOS asks for camera access the first time. On the cloud a join takes a real seat in the live demo, so try joins on the local stack (below), where Mathematics 2 takes `MATH2-204-FRI` and `20231187`.
3. **Üki Lock**: in Chrome or Edge open `chrome://extensions` (or `edge://extensions`), turn on Developer mode, choose Load unpacked and pick `apps/lock/.output/chrome-mv3-dev`. Pairing: [docs/runbooks/lock-pairing.md](docs/runbooks/lock-pairing.md).
4. **Mock portal**: http://localhost:5180/physics-1/quiz-3.

### The local stack, on request

`pnpm dev:local` is the old `pnpm dev`: the same four apps against a Supabase CLI stack on your laptop, with the Edge Functions served locally. It needs Docker and the Supabase CLI; the first start pulls images and takes minutes.

```sh
pnpm db:start                   # local stack on 547xx without the containers Üki does not use; the first start applies the migrations and supabase/seed.sql
pnpm env:local                  # creates .env from .env.example with the local URL and keys and a generated staff password
pnpm seed:staff                 # the four staff accounts; their password is SEED_STAFF_PASSWORD in .env
pnpm demo:reset                 # Mathematics 2 starts in 15 minutes, Physics 1 started 5 minutes ago
pnpm dev:local                  # functions:sync and supabase functions serve, then the four apps against the local stack
```

`pnpm db:start` leaves out Studio, postgres-meta, imgproxy, Mailpit, logflare, vector, supavisor and the edge runtime container (`scripts/lib/local-stack.ts` says why for each; [docs/decisions.md](docs/decisions.md)). `pnpm dev:local` starts the stack the same way when it is not running, copies the contracts into the functions and runs `supabase functions serve` with `supabase/functions/local.env` itself, so there is no second terminal. Without `pnpm dev:local` (for example before `pnpm test:integration`), run `pnpm functions:serve`.

`pnpm env:local` reads `supabase status -o env` and writes only the Supabase lines (and `SEED_STAFF_PASSWORD` when it is empty); every other line of `.env.example`, such as `VITE_EXAM_OFFICE_EMAIL` and `SEED_LMS_URL`, is kept as it is. To fill `.env` by hand instead, copy `.env.example` and take `API_URL`, `PUBLISHABLE_KEY` and `SECRET_KEY` from `supabase status -o env`. The apps only ever get the publishable key; the secret key is for the scripts.

The demo schedule is relative to the last `pnpm demo:reset` (or to the seed's load, on a fresh stack or after `pnpm db:reset`): Mathematics 2 starts 15 minutes later and Physics 1 started 5 minutes earlier. Run `pnpm demo:reset` to get that schedule back at any time; after a `pnpm db:reset`, run `pnpm seed:staff` again.

### The database tests run in CI

pgTAP (`pnpm db:test`), `pnpm test:integration`, `pnpm test:integration:desktop`, `pnpm e2e`, `pnpm e2e:load` and the desktop end-to-end tests need the local stack, and so do `pnpm db:reset`, `pnpm db:types` and `pnpm functions:serve`. Each first checks that something answers on the stack's API and database ports (no Docker needed for the check) and otherwise stops at once with one line ending "needs pnpm dev:local, or runs in CI". CI's stack job runs all of them on every push and pull request: follow it with `gh pr checks <number> --watch` and read a failure with `gh run view <run id> --log-failed`. What needs no database runs anywhere: `pnpm check`, `pnpm test:functions` and the builds.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Web on 3000, the mock portal on 5180, the desktop app and Üki Lock in watch mode, against the cloud demo project (public values of `.env.cloud`); no Docker, no local Supabase. `--only web,lock` runs a subset |
| `pnpm dev:local` | The same against the local stack: starts it (as `pnpm db:start`) when it is not running and serves the Edge Functions |
| `pnpm db:start` | Starts the local stack without the containers Üki does not use |
| `pnpm env:local` | Writes the local stack's URL and keys into `.env` (refuses to overwrite a cloud `.env` without `--force`) |
| `pnpm db:reset` | Re-applies the migrations and `supabase/seed.sql` to the local database (then `pnpm seed:staff` again); needs the local stack |
| `pnpm seed:staff` | Creates or updates the staff accounts (idempotent) |
| `pnpm db:types` | Regenerates `packages/db/src/database.types.ts` from the local schema; needs the local stack |
| `pnpm db:test` | pgTAP tests: row-level security for every role, the RPCs and triggers; needs the local stack, runs in CI |
| `pnpm functions:serve` | Serves the Edge Functions on the local stack (`pnpm dev:local` does this too) |
| `pnpm test:integration` | Edge Function and realtime tests against the local stack (needs `pnpm dev:local` or `pnpm functions:serve`); runs in CI |
| `pnpm test:functions` | The Edge Functions' unit tests alone; needs nothing running (`pnpm check` runs them too) |
| `pnpm test:integration:desktop` | The desktop flow's services against the local stack: join, ingest, frames, commands, Realtime, submit (same needs); runs in CI |
| `pnpm check` | Biome (with the i18n GritQL plugin), `pnpm guards`, type checks (workspace, Edge Functions, scripts, `e2e/`), unit tests; CI runs the same |
| `pnpm guards` | Fails on `MediaRecorder`, colour or pixel literals in components, and uploads outside the `frames` bucket |
| `pnpm e2e` | The Playwright smoke test for the dashboard against the local stack (needs `pnpm seed:staff` and the functions; `pnpm exec playwright install chromium` once); runs in CI |
| `pnpm e2e:load` | The live wall under 120 simulated students on the local stack, several minutes; Mathematics 2 must be open (`pnpm demo:reset`) |
| `pnpm --filter lock smoke` | Üki Lock in headless Chrome for Testing next to the app's real relay: pairing, lock, blocked tab and site, copy, release (after `pnpm --filter lock build` and `pnpm --filter lms-mock build`; `PW_CHROMIUM` names the browser binary, as CI sets it to Playwright's) |
| `pnpm tokens` | Rebuilds `packages/tokens` from `figma-variables.json` |
| `pnpm i18n:build` | Builds `packages/i18n/messages/{en,kk,ru}.json` from the catalog and checks every message |
| `pnpm models`, `pnpm models:verify` | Fetches the detection models into `apps/desktop/resources/models`; verifies them against the manifest |
| `pnpm demo:reset` | Clears the demo exams' sessions, events and stills; Mathematics 2 starts in 15 minutes, Physics 1 started 5 minutes ago |
| `pnpm demo:simulate` | 120 simulated Mathematics 2 students for the lobby and the live wall (`--help` for options) |
| `pnpm supabase:deploy` | Pushes migrations and deploys the Edge Functions to the linked cloud project |
| `pnpm --filter desktop dist` | Unsigned installers for the current OS into `apps/desktop/release/` |
| `pnpm --filter lock zip` | Üki Lock zips for Chrome and Edge into `apps/lock/.output/` |
| `pnpm release:assets` | The release's file names, Lock id checks and notes, for `desktop-dist.yml` (`scripts/release-assets.ts`) |

Per app: `pnpm --filter <web|desktop|lock|lms-mock> <dev|build|typecheck|test>`. The UI kit gallery runs with `pnpm --filter @uki/ui gallery` on 5190, and in development builds at http://localhost:3000/gallery and at `#/gallery` in the desktop window.

## Where things live

```text
apps/
  desktop/        Electron 44 + electron-vite + React; main process (lockdown, uki:// protocol, IPC, Lock relay) and renderer (flow, screens)
  web/            Next.js 16 App Router dashboard; src/app routes, src/features, src/lib/supabase
  lock/           WXT 0.21 extension: background, popup, block page, content scripts
  lms-mock/       Vite site: the mock KRU portal for Physics 1 · Quiz 3
packages/
  contracts/      Zod schemas for every boundary: events, commands, Edge Function payloads, realtime, Lock messages, IPC, wall rules
  detection/      Camera loop, MediaPipe Face Landmarker and Object Detector worker, rules engine, card match
  ui/             React components on Radix, styled with the tokens; icons through src/icons.ts
  tokens/         tokens.css, the Tailwind v4 theme and text styles, generated from figma-variables.json
  i18n/           catalog.json (student and Lock strings), dashboard*.json (dashboard, en and ru), built messages
  db/             Typed Supabase client factory and the generated database types
  config/         Shared tsconfig and Vitest settings
supabase/         config.toml, migrations, Edge Functions (ingest, frames, command, stills), seed.sql, pgTAP tests
scripts/          seed-staff, demo-reset, demo-simulate, guards, dev runner, model fetcher
biome-plugins/    GritQL plugin: JSX text must be an i18n key
test/integration/ Function and realtime tests against the local stack
e2e/              Playwright smoke test for the dashboard; simulate/ has the wall under load (pnpm e2e:load)
docs/             The plan, the design handoff, decisions, exit evidence, runbooks
.github/          ci.yml, deploy-supabase.yml, desktop-dist.yml
```

## The demo

The Demo Day script is in [docs/phase-0-plan.md](docs/phase-0-plan.md#script): on the student machine (a Windows 11 lab PC at the university if the organizers allow it, otherwise the MacBook Pro with its lockdown guard), Madina writes Mathematics 2 in the Üki app and Aliya writes Physics 1 in the browser under Üki Lock, and the dashboard shows both. On the cloud project:

1. `pnpm demo:reset --env-file .env.cloud`: Mathematics 2 opens its lobby and starts in 15 minutes; Physics 1 is live.
2. Dana signs in to the dashboard (A.0) and sees the overview (0.1); Aigerim opens the Mathematics 2 lobby (1.5).
3. `pnpm demo:simulate --env-file .env.cloud`: 120 simulated students join and check in; three need help. They are marked `device.simulated` and the presenter says so on stage.
4. Madina joins on the student machine with `MATH2-204-FRI` and `20231187`, passes 1.2 to 1.4; Aigerim presses Start exam.
5. The wall (2.4) fills with the simulated moments (looks away, a blocked tab, a second face, a phone at 0.94, an empty seat, a lost camera, a student with no signal, early submissions) next to Madina's real ones.
6. Aliya joins `PHYS1-102-FRI` on the student machine and pairs Üki Lock (E.3 to E.9).

The lab session on a Windows 11 lab PC (the release and the CI artifacts, SmartScreen, antivirus and the keyboard hook, the checklist), setting up the MacBook as the student machine, the quarantine step and the network fallback are in [docs/runbooks/lab-session.md](docs/runbooks/lab-session.md); creating the cloud project and the Vercel projects is in [docs/runbooks/cloud-setup.md](docs/runbooks/cloud-setup.md).

## Known limits

Phase 0 scope:

- Installers are unsigned: macOS needs the quarantine flag removed for a downloaded or copied build, and Windows SmartScreen needs "Run anyway" (see Download). Signing, notarization and auto-update come in Phase 2.
- The browser lock enforces copy and paste, printing and full screen; it detects but cannot block screen sharing, and cannot block developer tools outside university-managed computers.
- macOS screen recorders built on ScreenCaptureKit can still capture the exam window; the process scan names them.
- Not in Phase 0: the exam wizard and roster import, the review queue and reports, the privacy centre, the dashboard in Russian, and every frame the plan lists under Not in Phase 0.
- Simulated students write through the database with the secret key; they have no camera, so their flags carry no stills.
- One Supabase project serves development rehearsals and Demo Day; `main` takes no deploys from the demo tag until Demo Day ends.

Technical limits recorded in [docs/decisions.md](docs/decisions.md):

- The local stack runs without the edge runtime container; the Edge Functions run under `supabase functions serve` (`pnpm dev:local` or `pnpm functions:serve`). `pnpm dev` uses the cloud project's functions.
- Edge Functions get the contracts by copy: `pnpm functions:sync` writes `supabase/functions/_shared/contracts/` (gitignored) before serve and deploy, so contracts import only `zod` and use explicit `.ts` extensions.
- The cloud project must sign JWTs with an asymmetric key (ES256 or RS256): `@supabase/server` refuses tokens signed with the legacy shared secret.
- Each function bundle is about 15.9 MB of the 20 MB limit.
- The ingest limit of 10 calls a second per session lives in memory per function instance, so it is best effort.
- The local stack allows 1000 anonymous sign-ins an hour; the cloud project keeps Supabase's default of 30 an hour per IP, which laptops on one hotspot share during rehearsals.
- The identity similarity threshold is 0.5; a different person's low-resolution photo passed at 0.53 in a smoke test, so it must be tuned on the printed demo cards (about 0.6 may be needed).
- Model binaries are not in git: `pnpm models` and `pnpm models:verify` must run before packaging.
- Only message and add_time can go to a whole group; pause (of a writing session), resume (of a paused one) and end go to one session, and a finished session refuses every command.
- The live wall's StudentTile has Figma's ok, warn, flag and paused states only; Done and No signal map onto them until Design draws those.
- The dashboard is English and Russian (`packages/i18n/dashboard*.json`, switched in the account menu and kept in the `uki_locale` cookie); its Russian is a first pass awaiting a native read-through (P.18). Students get Kazakh, Russian and English.
- Windows keeps the native window frame until the Windows frame (2.1w, Phase 2) is decided.
- TypeScript is pinned to 5.9 (not 7) until after Demo Day.
- The desktop's built content security policy has no `style-src`, so inline `<style>` elements are blocked: the student window must not use the UI kit's Dialog, Select or menus (Radix's scroll lock injects one) unless the policy changes first.
