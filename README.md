# Üki

Üki proctors university exams on the student's own laptop. Face, gaze and phone detection run on the laptop with ready-made models; only events and flagged stills (up to three 640 × 360 JPEGs per flag) reach the server. Proctors watch a live wall in the browser and can pause, message and end a session. For exams that run in the university's portal, the Üki Lock browser extension keeps the student on one tab.

Built for the Qostanai Industry Hackathon; the case customer is KRU, Kostanay. This repository is Phase 0, the walking skeleton: every surface runs end to end on seeded data. The plan is [docs/phase-0-plan.md](docs/phase-0-plan.md), the screens are in Figma file `9RB9aBz6lzS6XHpf5do5Gh`, and the house rules are in [CLAUDE.md](CLAUDE.md).

| App | What it is | Local URL |
| --- | --- | --- |
| `apps/desktop` | Üki, the Electron student app: join, system and identity check, exam, receipt, lockdown | Electron window (renderer on 5173) |
| `apps/web` | Next.js dashboard for the exam office and proctors: sign-in, overview, lobby, live wall | http://localhost:3000 |
| `apps/lock` | Üki Lock, a Manifest V3 extension paired with the app over a local WebSocket | unpacked from `apps/lock/.output/chrome-mv3-dev` |
| `apps/lms-mock` | A static mock of the KRU exam portal for the browser exam | http://localhost:5180/physics-1/quiz-3 |

Everything talks to one Supabase project: locally the Supabase CLI stack, on Demo Day the cloud project in Frankfurt (`eu-central-1`).

## Prerequisites

| Tool | Version | Install on macOS |
| --- | --- | --- |
| Node.js | 24 (see `.nvmrc`) | `brew install node@24`, or `nvm install` / `fnm use` in the repository |
| pnpm | 10 (pinned in `package.json`) | `corepack enable` (ships with Node) |
| Docker | Docker Desktop or OrbStack, running, about 6 GB of free disk | https://docs.docker.com/desktop/ |
| Supabase CLI | 2.107 or later | `brew install supabase/tap/supabase` |

Windows works the same with Node from nodejs.org, Docker Desktop with WSL 2, and the Supabase CLI from Scoop (`scoop install supabase`).

## From clone to all four apps running

On a clean MacBook with a normal connection this takes under 15 minutes; most of it is the first Docker image pull and `pnpm install`.

```sh
git clone <repository-url> uki && cd uki
corepack enable                 # pnpm 10, as pinned in package.json
pnpm install
cp .env.example .env
supabase start -x vector,logflare,imgproxy,edge-runtime   # local stack on 547xx; pnpm dev serves the Edge Functions
pnpm env:local                  # fills .env with the local URL and keys and a generated staff password
pnpm db:reset                   # migrations and supabase/seed.sql: the KRU world
pnpm seed:staff                 # the four staff accounts; their password is SEED_STAFF_PASSWORD in .env
pnpm models                     # detection models for the desktop app (59 MB, checked against a SHA-256 manifest)
pnpm dev                        # web, mock portal, desktop app and Üki Lock in watch mode, plus the Edge Functions
```

`pnpm env:local` reads `supabase status -o env` and writes only the Supabase lines (and `SEED_STAFF_PASSWORD` when it is empty); to fill `.env` by hand instead, copy `API_URL`, `PUBLISHABLE_KEY` and `SECRET_KEY` from `supabase status -o env`. The apps only ever get the publishable key; the secret key is for the scripts.

Then check each app:

1. **Dashboard**: open http://localhost:3000 and sign in as `dana.akhmetova@kru.test` (exam office) or `aigerim.sadykova@kru.test` (proctor) with `SEED_STAFF_PASSWORD` from `.env`.
2. **Desktop app**: the Electron window opens on 1.1 Join in Kazakh. Join Mathematics 2 with `MATH2-204-FRI` and `20231187`. macOS asks for camera access the first time.
3. **Üki Lock**: in Chrome or Edge open `chrome://extensions` (or `edge://extensions`), turn on Developer mode, choose Load unpacked and pick `apps/lock/.output/chrome-mv3-dev`. Pairing: [docs/runbooks/lock-pairing.md](docs/runbooks/lock-pairing.md).
4. **Mock portal**: http://localhost:5180/physics-1/quiz-3.

The seed is relative to the time you ran `pnpm db:reset`: Mathematics 2 starts 15 minutes later and Physics 1 started 5 minutes earlier. Run `pnpm demo:reset` to get that schedule back at any time.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Starts the local Supabase if it is not running, serves the Edge Functions, then web on 3000, the mock portal on 5180, the desktop app and Üki Lock in watch mode |
| `pnpm env:local` | Writes the local stack's URL and keys into `.env` (refuses to overwrite a cloud `.env` without `--force`) |
| `pnpm db:reset` | Re-applies the migrations and `supabase/seed.sql` to the local database |
| `pnpm seed:staff` | Creates or updates the staff accounts (idempotent) |
| `pnpm db:types` | Regenerates `packages/db/src/database.types.ts` from the local schema |
| `supabase test db` | pgTAP tests: row-level security for every role, the RPCs and triggers |
| `pnpm functions:serve` | Serves the four Edge Functions locally (`pnpm dev` does this too) |
| `pnpm test:integration` | Edge Function and realtime tests against the local stack (needs `functions:serve`) |
| `pnpm check` | Biome (with the i18n GritQL plugin), `pnpm guards`, type checks, unit tests; CI runs the same |
| `pnpm guards` | Fails on `MediaRecorder`, colour or pixel literals in components, and uploads outside the `frames` bucket |
| `pnpm e2e` | The Playwright smoke test for the dashboard against the local stack |
| `pnpm tokens` | Rebuilds `packages/tokens` from `figma-variables.json` |
| `pnpm i18n:build` | Builds `packages/i18n/messages/{en,kk,ru}.json` from the catalog and checks every message |
| `pnpm models`, `pnpm models:verify` | Fetches the detection models into `apps/desktop/resources/models`; verifies them against the manifest |
| `pnpm demo:reset` | Clears the demo exams' sessions, events and stills; Mathematics 2 starts in 15 minutes, Physics 1 started 5 minutes ago |
| `pnpm demo:simulate` | 120 simulated Mathematics 2 students for the lobby and the live wall (`--help` for options) |
| `pnpm supabase:deploy` | Pushes migrations and deploys the Edge Functions to the linked cloud project |
| `pnpm --filter desktop dist` | Unsigned installers for the current OS into `apps/desktop/release/` |
| `pnpm --filter lock zip` | Üki Lock zips for Chrome and Edge into `apps/lock/.output/` |

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
  i18n/           catalog.json (student and Lock strings), dashboard*.json (dashboard, English), built messages
  db/             Typed Supabase client factory and the generated database types
  config/         Shared tsconfig and Vitest settings
supabase/         config.toml, migrations, Edge Functions (ingest, frames, command, stills), seed.sql, pgTAP tests
scripts/          seed-staff, demo-reset, demo-simulate, guards, dev runner, model fetcher
biome-plugins/    GritQL plugin: JSX text must be an i18n key
test/integration/ Function and realtime tests against the local stack
e2e/              Playwright smoke test for the dashboard
docs/             The plan, the design handoff, decisions, exit evidence, runbooks
.github/          ci.yml, deploy-supabase.yml, desktop-dist.yml
```

## The demo

The Demo Day script is in [docs/phase-0-plan.md](docs/phase-0-plan.md#script): a MacBook writes Mathematics 2 in the Üki app, a Windows laptop writes Physics 1 in the browser under Üki Lock, and the dashboard shows both. On the cloud project:

1. `pnpm demo:reset --env-file .env.cloud`: Mathematics 2 opens its lobby and starts in 15 minutes; Physics 1 is live.
2. Dana signs in to the dashboard (A.0) and sees the overview (0.1); Aigerim opens the Mathematics 2 lobby (1.5).
3. `pnpm demo:simulate --env-file .env.cloud`: 120 simulated students join and check in; three need help. They are marked `device.simulated` and the presenter says so on stage.
4. Madina's MacBook joins with `MATH2-204-FRI` and `20231187`, passes 1.2 to 1.4; Aigerim presses Start exam.
5. The wall (2.4) fills with the simulated moments (looks away, a blocked tab, a second face, a phone at 0.94, an empty seat, a lost camera, a student with no signal, early submissions) next to Madina's real ones.
6. Aliya's Windows laptop joins `PHYS1-102-FRI` and pairs Üki Lock (E.3 to E.9).

Laptop setup, the quarantine and SmartScreen steps and the network fallback are in [docs/runbooks/demo-laptops.md](docs/runbooks/demo-laptops.md); creating the cloud project and the Vercel projects is in [docs/runbooks/cloud-setup.md](docs/runbooks/cloud-setup.md).

## Phase 0 limits

- Installers are unsigned: macOS needs the quarantine flag removed for a copied build, and Windows SmartScreen needs "Run anyway". Signing, notarization and auto-update come in Phase 2.
- The browser lock enforces copy and paste, printing and full screen; it detects but cannot block screen sharing, and cannot block developer tools outside university-managed computers.
- macOS screen recorders built on ScreenCaptureKit can still capture the exam window; the process scan names them.
- The cloud project allows 30 anonymous sign-ins an hour per IP by default; laptops on one hotspot share that limit during rehearsals.
- The identity match threshold is untuned until the printed demo cards are tried on the demo laptops.
- Not in Phase 0: the exam wizard and roster import, the review queue and reports, the privacy centre, the dashboard in Russian, and every frame the plan lists under Not in Phase 0.
- Simulated students write through the database with the secret key; they have no camera, so their flags carry no stills.
- One Supabase project serves development rehearsals and Demo Day; `main` takes no deploys from the demo tag until Demo Day ends.
