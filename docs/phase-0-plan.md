# Üki · Phase 0 build plan

Oct 7, 2026 · @Kassymzhomart Shubay

## Brief

Phase 0 builds a walking skeleton of Üki in 4 days, from Wed 7 Oct to Oct 10, 2026: every surface runs end to end on seeded data, and the three riskiest parts are proven on real laptops. Phase 1 (Sun 11 to Thu 15 Oct) fills in the Demo Day screens on top of it, for Demo Day on Oct 16, 2026.

This is a hackathon build for the Qostanai Industry Hackathon: ready-made models only, Supabase Cloud in Frankfurt, the dashboard on Vercel, and no legal, consent or data-residency work.

At the end of Phase 0:

- A student opens the Üki desktop app, joins with the exam code and student ID, passes the camera check, writes a seeded exam and gets a receipt.
- The laptop detects gaze, phones, a missing face and a second face at 15 frames per second or more, and sends only events and flagged stills.
- The proctor’s live wall shows each event within 1 second, and the proctor can pause, message and end a session.
- Üki Lock pairs with the desktop app and keeps a browser exam to one tab.
- All of it builds from one repository and runs on Supabase Cloud in Frankfurt, with the dashboard on Vercel.

The three risks Phase 0 must retire first: on-device detection speed on an average student laptop, realtime events from laptop to live wall, and pairing between the browser extension and the desktop app.

How the coding agent uses this plan:

1. Treat the Decisions section as settled. To change a decision, write the reason in `docs/decisions.md` first.
2. Work the packages in the order their Needs column allows; independent packages may run side by side. Each ends with an acceptance check: run the agent checks yourself, and mark hand checks as pending in docs/phase-0-exit.md.
3. Take every visual from Figma file `9RB9aBz6lzS6XHpf5do5Gh` and every student string from the string catalog. Never invent a colour, size or string.
4. On day 1, copy the starter files into the repository at the same paths: CLAUDE.md, docs/phase-0-plan.md (this plan), docs/design-handoff.md, packages/i18n/catalog.json and packages/tokens/figma-variables.json.

Every frame, token and component this plan names is listed in Üki design handoff: what is ready in Figma.

## Scope

Phase 0 covers the in-app exam path end to end and the Lock pairing; exam creation, review and reports start in Phase 1 on top of seeded data. Frame IDs refer to the Prototype page in Figma.

### In Phase 0

| Surface | What gets built | Frames |
| --- | --- | --- |
| Repository | Monorepo, CI, tokens, fonts, UI primitives, i18n with the 222-key catalog | — |
| Backend | Supabase locally and one Supabase Cloud project in Frankfurt; Phase 0 tables with row-level security; seed data for KRU; join, event ingest, realtime channels, frame storage | — |
| Desktop app | Electron shell for macOS and Windows; join with code and student ID; system check; identity check; rules and lobby; exam with seeded questions; phone warning; paused; proctor pause, message, end; receipt; kiosk lock; offline queue | 1.1, 1.1a, 1.2, 1.3, 1.3a, 1.4, 2.1, 2.1a, 2.1c, 2.1d, 2.1e, 2.2, 2.3, 3.1 |
| Detection | Gaze, face count, phone; flagged stills; a developer overlay with fps and scores | — |
| Web dashboard | Staff sign-in; app shell; exams overview from seed; lobby; live wall with realtime tiles; timeline drawer; tile actions with the end-session dialog | A.0, 0.1, 1.5, 2.4, 2.4a, 2.4b, 2.4c, 2.4e, 2.5 |
| Üki Lock | Pairing with the app; one-tab lock; copy and paste block; block page; release; a mock exam portal for the browser-exam demo | E.3, E.4, E.5, E.6, E.7, E.9 |
| Infrastructure | Supabase Cloud project; dashboard and mock portal on Vercel; CI checks | — |

### Not in Phase 0

| Item | Frames | Phase |
| --- | --- | --- |
| New exam wizard, roster import, invite email | 0.2, 0.3, 0.3a, 0.3b, 0.4, 0.5, 0.8 | 1 |
| Proctor home and seat confirmation | 0.9, 0.9a, 1.5b | 1 |
| Ask proctor on 2.1 and E.5, calculator | E.5a, E.5b, 2.4d | 1 |
| Browser rules settings and the Lock status popup | E.1, E.8 | 1 |
| Review queue, session review, integrity report, shared report | 3.2, 3.3, 3.4, 3.5 | 1 |
| Privacy centre with delete and copy requests, audit log | A.5, A.5a, A.5b, A.6 | 1 |
| Reports, students, student profile, settings | A.1, A.2, A.3, A.4 | 1 |
| Landing site | Landing page | 1 |
| Sign-in reset and invite acceptance, installer page, camera permission screen, update required | A.0a, A.0b, 1.0, 1.0a, 1.0b | 2 (pilot) |
| Get Üki Lock page | E.2 | 2 (pilot) |
| Time up, Windows frame, Lock error states, store listing | 2.1b, 2.1w, E.3a, E.5c, E.5d, E.5f, E.10, E.10a | 2 |
| Exam detail, question bank and import, PDFs, empty and error states | 0.6, 0.6a, 0.7, 3.4b, A.1a, A.5c, 0.1d, 0.1e, 3.2c, A.2a | 2 |
| Code signing and notarization | — | 2 |
| Team, SSO, integrations, notifications, search, dark dashboard, tablet | A.4a–A.4d, A.7, A.8, D.1–D.6, T.1, T.2 | 3 (after pilot) |

### Exit criteria

Phase 0 ends when every box below is ticked on real hardware.

- [ ] On a clean MacBook, the README takes a new developer from clone to all four apps running in under 15 minutes.
- [ ] CI passes on `main`: lint, type check, unit tests, and builds for web, desktop on macOS and Windows, and the extension.
- [ ] On an M1 MacBook Air and on a Windows laptop with an 8th-gen Core i5, face tracking runs at 15 fps or more and phone checks at 2 fps or more, with the app under 40% CPU.
- [ ] A phone held in view for 1 second creates `phone.detected` on the live wall within 1 second at the 95th percentile, with one still attached.
- [ ] A network capture of a 10-minute exam shows no image or video upload except flagged stills.
- [ ] Looking away for more than 2 seconds creates `gaze.off_screen`; no face for 10 seconds pauses the session and the wall shows it.
- [ ] Proctor pause, message and end reach the student app within 1 second and show 2.1c, 2.1e and 2.1d.
- [ ] With the network cut for 2 minutes mid-exam, answers stay on the laptop and sync on reconnect with no loss and no duplicates.
- [ ] Üki Lock pairs with the app by its 6-digit code, blocks a second tab and logs `tab.blocked`.
- [ ] Student screens switch between Kazakh, Russian and English from the catalog.
- [ ] The dashboard runs on Vercel against the Supabase Cloud project, with seed data and row-level security on every table.

## Roadmap

&#91;embedded content: Roadmap · 4 phases, 3 gates\]

Every one of the 120 product frames belongs to exactly one phase; the 16 Kazakh and Russian copies ship with Phase 0. Frames that do not fit Phase 1 by Thursday move to Phase 2, never into Phase 0.

| Phase | When | Frames |
| --- | --- | --- |
| 0 · Skeleton | Wed 7 to Sat 10 Oct | Student 1.1, 1.1a, 1.2, 1.3, 1.3a, 1.4, 2.1, 2.1a, 2.1c, 2.1d, 2.1e, 2.2, 2.3, 3.1 · Dashboard A.0, 0.1, 1.5, 2.4, 2.4a, 2.4b, 2.4c, 2.4e, 2.5 · Lock E.3, E.4, E.5, E.6, E.7, E.9 · the ҚАЗ and РУС copies |
| 1 · Demo Day screens | Sun 11 to Thu 15 Oct | New exam 0.2, 0.2a, 0.3, 0.3a, 0.3b, 0.4, 0.5, 0.8 · Proctor 0.9, 0.9a, 1.5a, 1.5b · Overview 0.1b, 0.1c · Rules 1.4a · Ask proctor and calculator E.5a, E.5b, 2.4d · Review and reports 3.2, 3.2a, 3.2b, 3.3, 3.4, 3.4a, 3.5 · Privacy A.5, A.5a, A.5b, A.6 · Exam office A.1, A.2, A.3, A.4 · Lock E.1, E.8 · the landing site |
| 2 · Pilot | After Demo Day, before the KRU pilot exam | Accounts A.0a, A.0b · Install 1.0, 1.0a, 1.0b · Exam 2.1b, 2.1w · Lock E.2, E.3a, E.5c, E.5d, E.5e, E.5f, E.10, E.10a · Exam office 0.6, 0.6a, 0.7, 0.1d, 0.1e, 3.2c, 3.4b, A.1a, A.2a, A.5c · code signing, a production deploy, the store listing |
| 3 · After pilot | After the pilot exam | Team and SSO A.4a, A.4b, A.4c, A.4d · Notifications 0.1a, A.7 · Search A.8 · Tablet T.1, T.2 · Dark theme D.1 to D.6 |

Phase 1 is the heaviest, 35 frames in five days; its own plan follows the Phase 0 exit review. Phases 2 and 3 get dates once KRU sets the pilot exam.

## Decisions

Üki is one TypeScript monorepo on Supabase Cloud in Frankfurt, with an Electron desktop app, a Next.js dashboard on Vercel and a WXT browser extension. All detection runs on the student’s laptop with ready-made models. Each row below is settled for Phase 0.

| Area | Decision | Why |
| --- | --- | --- |
| Repository | pnpm workspaces and Turborepo, TypeScript strict, Node.js 24 LTS ([release lines](https://nodejs.org/en/about/previous-releases)) | Four apps share one UI kit, one set of contracts and one token file |
| Backend | Supabase Cloud: one project in Central EU (Frankfurt), `eu-central-1`, with Postgres, Auth, Realtime, Storage and Edge Functions; the Supabase CLI for local work ([regions](https://supabase.com/docs/guides/platform/regions)) | Nothing to host or patch; the default backend |
| Hosting | Vercel for the dashboard and the mock portal; desktop installers built on the demo laptops | Push to deploy; no server to run |
| Web dashboard | Next.js 16 App Router, React 19, Tailwind CSS v4, Radix primitives restyled to Üki tokens. One app holds the dashboard, the shared report page and later the landing site ([Next.js 16.4](https://nextjs.org/blog), [Tailwind theme](https://tailwindcss.com/docs/theme)) | Server rendering for the public report and landing; one deployable |
| Desktop app | Electron 44 with electron-vite and React, using the same UI package ([Electron releases](https://releases.electronjs.org/)) | Bundled Chromium runs the same detection code on macOS and Windows; content protection and kiosk mode; a Node main process for process checks and the pairing socket. Tauri is out: system web views differ per OS |
| Browser extension | WXT 0.21, Manifest V3, React popup; builds for Chrome, Edge, Yandex Browser and Opera ([WXT](https://wxt.dev/)) | One codebase for every Chromium browser the design promises |
| Pairing | A WebSocket server on 127.0.0.1 inside the Electron main process; the extension’s service worker connects and confirms a 6-digit code ([WebSockets in service workers](https://developer.chrome.com/docs/extensions/how-to/web-platform/websockets)) | No native host, no manifests, no registry; from Chrome 116, WebSocket messages keep the worker alive |
| Gaze and faces | MediaPipe Face Landmarker in the desktop renderer: 478 landmarks with iris, up to 2 faces, blendshapes and the head transform ([Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker)) | Iris position plus head pose gives on and off screen; the second face comes free |
| Phones | MediaPipe Object Detector, EfficientDet-Lite0, trained on COCO’s 80 labels, filtered to cell phone ([Object Detector](https://developers.google.com/edge/mediapipe/solutions/vision/object_detector)) | About 30 ms a frame on CPU in Google’s table; Apache 2.0. Ultralytics YOLO is out: its AGPL-3.0 licence needs a paid licence for closed products ([licence](https://www.ultralytics.com/license)) |
| Identity | Human (`@vladmandic/human`, MIT) compares the live face with the photo on the student card, on the laptop; Tesseract.js 7 (Apache 2.0) reads the student ID digits ([Human](https://github.com/vladmandic/human), [Tesseract.js](https://raw.githubusercontent.com/naptha/tesseract.js/master/README.md)) | Ready-made models; no enrolment photos and no stored face data |
| Student sign-in | Supabase anonymous sign-in, then the `join_exam` function binds that user to one session after checking code and student ID ([anonymous sign-ins](https://supabase.com/docs/guides/auth/auth-anonymous)) | Students never make an account; row-level security keys on `auth.uid()` |
| Staff sign-in | Supabase Auth email and password; staff accounts made by a seed script | Matches A.0 |
| Realtime | The app posts events to the `ingest` Edge Function; a database trigger broadcasts each stored event with `realtime.send` to the private channel `exam:{exam_id}`; proctor commands go to `session:{session_id}` ([broadcast](https://supabase.com/docs/guides/realtime/broadcast), [authorization](https://supabase.com/docs/guides/realtime/authorization)) | An event reaches the wall only after it is stored; channel access is checked by RLS on `realtime.messages` |
| Offline | Dexie outbox in IndexedDB on the laptop; UUIDv7 ids; idempotent upserts | Answers and events survive a crash or a network drop and never duplicate |
| Flagged stills | JPEG, 640 × 360, quality 0.7, up to 3 per flag, uploaded to the private `frames` bucket through a signed upload URL | The only images that leave the laptop, as A.5 promises |
| Localization | ICU messages in `packages/i18n`; next-intl on the web, use-intl in the desktop app and extension. Students: Kazakh, Russian, English from the catalog. Dashboard: English source in Phase 0, Russian added in Phase 1 | Plural rules in Kazakh and Russian; one message format everywhere |
| Fonts and icons | Geist and Geist Mono 1.800, OFL ([Fontsource](https://fontsource.org/fonts/geist/about)); icons from lucide-react only | Matches Figma; Lucide matches the Figma icon grid of 24 px with a 2 px stroke |
| Testing | Vitest for logic, pgTAP for RLS, a Playwright smoke test for the dashboard; the desktop app and the Lock by hand on the two demo laptops | Enough for a hackathon; the risky logic still has tests |
| Delivery | GitHub Actions for checks and Supabase deploys; Vercel deploys `main`; desktop builds unsigned | Signing waits for a pilot |
| Telemetry | Logs to stdout and Supabase logs only; no third-party analytics | Nothing extra to set up |

### What the browser can and cannot enforce

E.1 lists six browser rules; Phase 0 enforces three, and the desktop app covers a fourth by detection.

| E.1 rule | Phase 0 | How |
| --- | --- | --- |
| Block copy and paste | Enforced | Content script in the exam tab |
| Block printing | Enforced | Content script and a blank print style |
| Keep full screen | Enforced | `windows` API, requested again after every exit |
| Pause other extensions | Phase 2 | Needs the `management` permission, which adds an install warning ([management API](https://developer.chrome.com/docs/extensions/reference/api/management)) |
| Block developer tools | University-managed computers only | Administrator policy ([DeveloperToolsAvailability](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-policies/developertoolsavailability)); it cannot be detected reliably |
| Block screen sharing | Detected, not blocked | The desktop app’s process scan; blocking needs administrator policy |

Closing other tabs at the start and keeping the exam the only tab use the tabs and windows APIs. Phase 1 relabels the last two rows in E.1 as “detected” and “university-managed computers only”.

### Assumptions behind these decisions

- Demo Day is a live demo on your own laptops: one MacBook and one Windows laptop as students, one laptop for the dashboard.
- Exams that run in the Üki app use single-choice questions seeded in the database until the question bank ships.
- Demo students are you and friends holding mock student cards with your own photos; no real KRU student data is used.
- Supabase’s default limit of 30 anonymous sign-ins per hour per IP is enough for a stage demo with two laptops.

## Architecture

&#91;embedded content: Phase 0 architecture · student laptop, Supabase in Frankfurt, Vercel, staff browser\]

Everything that leaves a laptop goes to one Supabase project in Frankfurt over HTTPS, and Üki Lock reaches it only through the app.

| Line | Direction | What crosses | How |
| --- | --- | --- | --- |
| Üki app to Supabase | Up | Answers through PostgREST; events and status through `ingest` at least every 10 s; up to 3 flagged stills per flag through signed upload URLs | HTTPS |
| Supabase to Üki app | Down | Exam, questions and roster check from `join_exam`; proctor commands on `session:{session_id}`; server time | HTTPS, WSS |
| Dashboard to Supabase | Up | Staff sign-in, `start_exam`, proctor commands through `command` | HTTPS |
| Supabase to dashboard | Down | Sessions and events under RLS; live events, tile states and still notices on `exam:{exam_id}`; stills through 5-minute URLs from the `stills` function | HTTPS, WSS |
| Vercel to staff browser | Down | Dashboard pages, rendered on the server under the staff session | HTTPS |
| Üki Lock and Üki app | Both | Pairing, exam state, lock events | WebSocket on 127.0.0.1, origin-checked; never the network |
| Student browser and exam portal | Both | The exam itself in browser exams: the university LMS, or the mock portal on Vercel in Phase 0 | HTTPS, outside Üki’s data path |

## Repository

One repository named `uki`, four apps, seven packages, one Supabase project. Shared code lives in `packages/`; an app never imports from another app.

```text
uki/
├─ apps/
│  ├─ web/              Next.js 16: exam office and proctor dashboard, shared report; landing in Phase 1
│  ├─ desktop/          Electron 44 + electron-vite + React: the Üki student app
│  ├─ lock/             WXT, Manifest V3: Üki Lock
│  └─ lms-mock/         Vite static site: mock KRU exam portal for browser exams
├─ packages/
│  ├─ tokens/           tokens.css (Light, Dark), Tailwind v4 theme, text styles; built from figma-variables.json
│  ├─ ui/               React components on Radix + class-variance-authority; lucide-react icons
│  ├─ contracts/        Zod schemas: events, commands, Edge Function payloads, Lock messages, IPC
│  ├─ detection/        camera loop, Face Landmarker, Object Detector, card match, event rules
│  ├─ i18n/             catalog.json, messages/en.json, kk.json, ru.json; ICU helpers
│  ├─ db/               typed Supabase client factory and generated database types
│  └─ config/           shared tsconfig, Biome, Vitest and Tailwind presets
├─ supabase/
│  ├─ config.toml
│  ├─ migrations/       tables, row-level security, triggers, the cron job
│  ├─ functions/        Edge Functions: ingest, frames, command, stills
│  └─ seed.sql          KRU demo data
├─ scripts/             seed-staff.ts, demo-reset.ts, demo-simulate.ts
├─ e2e/                 Playwright smoke test for the dashboard
├─ docs/                phase-0-plan.md, design-handoff.md, decisions.md, phase-0-exit.md, runbooks/
├─ .github/workflows/   ci.yml, deploy-supabase.yml, desktop-dist.yml
├─ CLAUDE.md
├─ package.json, pnpm-workspace.yaml, turbo.json
```

### Tooling

| Tool | Use |
| --- | --- |
| pnpm 10 and Turborepo 2 | Workspaces, task graph, caching |
| TypeScript 5, strict, `noUncheckedIndexedAccess` | Every package |
| Biome 2 | Lint and format in one pass |
| Vitest | Unit and integration tests in every package |
| Playwright | One smoke test for the dashboard |
| electron-builder | macOS `.dmg` and Windows `.exe` installers |
| Supabase CLI | Local stack, migrations, type generation, deploys to the cloud project |
| lefthook | Pre-commit: Biome and type check on staged packages |

### Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Starts the local Supabase if it is not running, then web on port 3000, the mock portal on 5180, the desktop app and the extension in watch mode |
| `pnpm db:reset` | Re-applies migrations and `seed.sql` to the local database |
| `pnpm db:types` | Regenerates `packages/db/src/database.types.ts` from the local schema |
| `pnpm tokens` | Rebuilds `packages/tokens` from `packages/tokens/figma-variables.json` |
| `pnpm i18n:build` | Builds the kk, ru and en message files from the catalog and checks every message |
| `pnpm check` | Biome, type check and unit tests across the repo; CI runs the same |
| `supabase test db` | pgTAP tests for RLS and the database functions |
| `pnpm e2e` | The Playwright smoke test against the local stack |
| `pnpm supabase:deploy` | `supabase db push`, then `supabase functions deploy`, against the linked cloud project |
| `pnpm --filter desktop dist` | Installers for the current OS |
| `pnpm --filter lock zip` | Zips for Chrome and Edge |
| `pnpm demo:reset`, `pnpm demo:simulate` | Demo data on the cloud project, as in Demo script and seed data |

### Conventions

- No colour, size or radius literals in components: Tailwind classes generated from the tokens only.
- No user-facing string in code: every string is an i18n key.
- Zod validates every boundary: Edge Function input and output, events, proctor commands, Lock messages, Electron IPC.
- Electron renderers run with `contextIsolation`, `sandbox` and no Node integration; the preload exposes one typed `window.uki` object.
- Client-generated ids are UUIDv7. Timestamps are `timestamptz` in UTC; screens show the workspace time zone, `Asia/Almaty` for KRU.
- Files and folders are kebab-case; React components are PascalCase, one per file.
- One branch per work package, named like `wp/0.5-detection`; Conventional Commit messages, for example `feat(desktop): join screen`.
- Commits are authored as `k4ssymzhomart` and carry no co-author trailer.

## Design system in code

The 72 Figma variables become CSS variables in `packages/tokens`, Tailwind v4 maps them to utility classes, and every component in `packages/ui` uses only those classes. The values below are the Figma file as of 7 Oct; `pnpm tokens` regenerates them from figma-variables.json, exported from Figma on 7 October and shipped with this plan.

### tokens.css

```css
/* packages/tokens/src/tokens.css · generated from Figma variables, do not edit by hand */
:root {
  /* Primitives */
  --uki-lime-200: #E6F5A8; --uki-lime-300: #D3EE78; --uki-lime-400: #BCE33C; --uki-lime-500: #A6CF2A;
  --uki-moss-600: #8AB71A; --uki-moss-700: #6B9112; --uki-moss-800: #4A650C;
  --uki-ink-950: #0E0E0D; --uki-ink-900: #121310; --uki-ink-800: #1C1D19; --uki-ink-700: #2A2B26; --uki-ink-600: #34352F;
  --uki-paper-50: #F6F5F1; --uki-paper-100: #ECEAE3; --uki-paper-200: #E3E0D7; --uki-white: #FFFFFF;
  --uki-warn: #F5C945; --uki-flag: #EA4E3D; --uki-coral-600: #D2412F; --uki-coral-700: #B23526;

  /* Layout */
  --uki-space-4: 4px; --uki-space-8: 8px; --uki-space-12: 12px; --uki-space-16: 16px; --uki-space-20: 20px;
  --uki-space-24: 24px; --uki-space-32: 32px; --uki-space-48: 48px; --uki-space-64: 64px; --uki-space-96: 96px;
  --uki-space-120: 120px; --uki-space-128: 128px; --uki-space-160: 160px;
  --uki-radius-sm: 12px; --uki-radius-md: 16px; --uki-radius-card: 24px; --uki-radius-xl: 32px; --uki-radius-pill: 999px;

  /* Effects */
  --uki-shadow-float: 0 14px 36px -6px rgb(13 15 8 / 0.14), 0 2px 6px 0 rgb(13 15 8 / 0.08);
  --uki-focus-ring: 0 0 0 4px var(--uki-border-focus-ring);

  /* Colour · Light */
  --uki-bg-canvas: var(--uki-paper-50); --uki-bg-surface: var(--uki-white); --uki-bg-subtle: var(--uki-paper-100);
  --uki-bg-brand: var(--uki-lime-400); --uki-bg-brand-subtle: var(--uki-lime-200); --uki-bg-inverse: var(--uki-ink-900);
  --uki-bg-hover: var(--uki-paper-100); --uki-bg-pressed: var(--uki-paper-200);
  --uki-bg-inverse-hover: var(--uki-ink-700); --uki-bg-inverse-pressed: var(--uki-ink-950);
  --uki-bg-brand-hover: var(--uki-lime-300); --uki-bg-brand-pressed: var(--uki-lime-500);
  --uki-bg-danger: var(--uki-flag); --uki-bg-danger-hover: var(--uki-coral-600); --uki-bg-danger-pressed: var(--uki-coral-700);
  --uki-bg-glass: rgb(255 255 255 / 0.08);
  --uki-text-primary: var(--uki-ink-950); --uki-text-on-brand: var(--uki-ink-950); --uki-text-accent: var(--uki-moss-800);
  --uki-text-inverse: var(--uki-paper-50); --uki-text-danger: var(--uki-coral-700);
  --uki-border-default: var(--uki-paper-100); --uki-border-strong: var(--uki-ink-950);
  --uki-border-focus: var(--uki-moss-700); --uki-border-focus-ring: var(--uki-lime-300); --uki-border-glass: rgb(255 255 255 / 0.18);
  --uki-icon-primary: var(--uki-ink-950); --uki-icon-accent: var(--uki-moss-800);
  --uki-status-ok: var(--uki-moss-600); --uki-status-warn: var(--uki-warn); --uki-status-flag: var(--uki-flag);
  --uki-status-ok-subtle: #E3EACA; --uki-status-warn-subtle: #F6EDD2; --uki-status-flag-subtle: #F4DED8;
}

[data-theme="dark"] {
  --uki-bg-canvas: var(--uki-ink-900); --uki-bg-surface: var(--uki-ink-800); --uki-bg-subtle: var(--uki-ink-700);
  --uki-bg-brand-subtle: var(--uki-moss-800); --uki-bg-inverse: var(--uki-paper-50);
  --uki-bg-hover: var(--uki-ink-700); --uki-bg-pressed: var(--uki-ink-600);
  --uki-bg-inverse-hover: var(--uki-paper-100); --uki-bg-inverse-pressed: var(--uki-paper-200);
  --uki-text-primary: var(--uki-paper-50); --uki-text-accent: var(--uki-lime-400);
  --uki-text-inverse: var(--uki-ink-950); --uki-text-danger: var(--uki-flag);
  --uki-border-default: var(--uki-ink-700); --uki-border-strong: var(--uki-paper-50);
  --uki-border-focus: var(--uki-lime-400); --uki-border-focus-ring: var(--uki-moss-800);
  --uki-icon-primary: var(--uki-paper-50); --uki-icon-accent: var(--uki-lime-400);
  --uki-status-ok-subtle: #303919; --uki-status-warn-subtle: #433C21; --uki-status-flag-subtle: #39241E;
}
```

### Tailwind theme

Utility names follow the token groups: `bg-canvas`, `text-fg-primary`, `border-line-default`, `text-icon-accent`, `bg-flag-subtle`, `rounded-card`, `shadow-float`. Spacing uses Tailwind’s 4 px scale, so `p-5` is space/20, `p-30` is space/120 and `p-40` is space/160.

```css
/* packages/tokens/src/theme.css */
@import "tailwindcss";
@import "./tokens.css";
@import "./type.css";
@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));

@theme inline {
  --color-*: initial;
  --color-canvas: var(--uki-bg-canvas); --color-surface: var(--uki-bg-surface); --color-subtle: var(--uki-bg-subtle);
  --color-brand: var(--uki-bg-brand); --color-brand-subtle: var(--uki-bg-brand-subtle); --color-inverse: var(--uki-bg-inverse);
  --color-hover: var(--uki-bg-hover); --color-pressed: var(--uki-bg-pressed);
  --color-inverse-hover: var(--uki-bg-inverse-hover); --color-inverse-pressed: var(--uki-bg-inverse-pressed);
  --color-brand-hover: var(--uki-bg-brand-hover); --color-brand-pressed: var(--uki-bg-brand-pressed);
  --color-danger: var(--uki-bg-danger); --color-danger-hover: var(--uki-bg-danger-hover); --color-danger-pressed: var(--uki-bg-danger-pressed);
  --color-glass: var(--uki-bg-glass);
  --color-fg-primary: var(--uki-text-primary); --color-fg-on-brand: var(--uki-text-on-brand); --color-fg-accent: var(--uki-text-accent);
  --color-fg-inverse: var(--uki-text-inverse); --color-fg-danger: var(--uki-text-danger);
  --color-line-default: var(--uki-border-default); --color-line-strong: var(--uki-border-strong);
  --color-line-focus: var(--uki-border-focus); --color-line-focus-ring: var(--uki-border-focus-ring); --color-line-glass: var(--uki-border-glass);
  --color-icon-primary: var(--uki-icon-primary); --color-icon-accent: var(--uki-icon-accent);
  --color-ok: var(--uki-status-ok); --color-warn: var(--uki-status-warn); --color-flag: var(--uki-status-flag);
  --color-ok-subtle: var(--uki-status-ok-subtle); --color-warn-subtle: var(--uki-status-warn-subtle); --color-flag-subtle: var(--uki-status-flag-subtle);
  --color-white: var(--uki-white); --color-transparent: transparent;
  --radius-sm: var(--uki-radius-sm); --radius-md: var(--uki-radius-md); --radius-card: var(--uki-radius-card);
  --radius-xl: var(--uki-radius-xl); --radius-pill: var(--uki-radius-pill);
  --shadow-float: var(--uki-shadow-float); --shadow-focus: var(--uki-focus-ring);
  --font-sans: "Geist Variable", "Inter Variable", system-ui, sans-serif;
  --font-mono: "Geist Mono Variable", ui-monospace, monospace;
}
```

### Text styles

Each Figma text style is one utility class named after it: Display/XL becomes `type-display-xl`, UI/Caption becomes `type-ui-caption`. Percent line heights become unitless numbers; tracking in percent becomes `em`.

```css
/* packages/tokens/src/type.css */
@utility type-display-xl { font: 700 120px/1 var(--font-sans); letter-spacing: -0.04em; }
@utility type-display-l { font: 700 96px/1 var(--font-sans); letter-spacing: -0.04em; }
@utility type-display-m { font: 700 80px/0.96 var(--font-sans); letter-spacing: -0.045em; }
@utility type-h1 { font: 700 64px/1.05 var(--font-sans); letter-spacing: -0.035em; }
@utility type-h2 { font: 700 48px/1.1 var(--font-sans); letter-spacing: -0.03em; }
@utility type-h3 { font: 600 32px/1.2 var(--font-sans); letter-spacing: -0.02em; }
@utility type-body-l { font: 400 24px/1.5 var(--font-sans); letter-spacing: -0.005em; }
@utility type-body-m { font: 400 18px/1.5 var(--font-sans); }
@utility type-body-s { font: 400 15px/1.5 var(--font-sans); }
@utility type-label-m { font: 500 15px/1.3 var(--font-sans); }
@utility type-label-m-strong { font: 600 15px/1.3 var(--font-sans); letter-spacing: -0.005em; }
@utility type-card-title { font: 600 17px/1.3 var(--font-sans); letter-spacing: -0.005em; }
@utility type-card-caption { font: 400 14px/1.45 var(--font-sans); }
@utility type-ui-title { font: 600 26px/1.2 var(--font-sans); letter-spacing: -0.015em; }
@utility type-ui-label { font: 500 13px/1.3 var(--font-sans); }
@utility type-ui-caption { font: 400 12px/1.4 var(--font-sans); }
@utility type-ui-mono { font: 400 12px/1.4 var(--font-mono); }
@utility type-mono-m { font: 400 18px/1.6 var(--font-mono); }
@utility type-mono-s { font: 400 13px/1.4 var(--font-mono); }
@utility type-mono-overline { font: 500 13px/1.3 var(--font-mono); letter-spacing: 0.06em; text-transform: uppercase; }
@utility type-mono-tag { font: 500 11px/1.2 var(--font-mono); letter-spacing: 0.06em; text-transform: uppercase; }
@utility type-mono-display-l { font: 400 44px/1 var(--font-mono); letter-spacing: -0.03em; }
@utility type-mono-display-m { font: 500 36px/normal var(--font-mono); }
@utility type-mono-code { font: 500 34px/normal var(--font-mono); letter-spacing: 0.08em; }
```

### Fonts, icons and art

- Load Geist and Geist Mono from `@fontsource-variable/geist` and `@fontsource-variable/geist-mono`, bundled with each app; no font CDN. On day 1, render “ӘҒҚҢӨҰҮҺІ әғқңөұүһі” in both fonts; if any letter falls back, add Inter Variable for that range.
- Icons come only from `lucide-react`, at 24 px with a 2 px stroke, coloured by `text-icon-primary`. `packages/ui/src/icons.ts` maps each of the 93 Figma icon names to a Lucide component, for example gaze to `ScanEye`, face-scan to `ScanFace`, id-card to `IdCard`, phone to `Smartphone`, browser-lock to `GlobeLock`, offline to `WifiOff`. Where Lucide has no exact match, pick the closest and note it in that file.
- The Faces component set (Figma 4:123) and the mascot poses (3:24) are art, not icons: export them as SVG through the Figma MCP into `packages/ui/src/art/`, keep their own colours, and never recolour them with tokens.

### Components

Build each component from its Figma node with the Figma MCP (`get_design_context` on the node ID). Variants become props; Figma states such as Hover, Pressed and Focus become CSS states, not props. Phase 0 needs these:

| Group | Components (Figma node) |
| --- | --- |
| Controls | Button 8:37, Icon button 45:2059, Input 142:13172, Text area 143:13134, Checkbox 49:2176, Radio option 49:2188, Toggle 15:1314, Select 79:2410 |
| Data | Chip 8:26, Badge 89:2454, Count 39:2054, Avatar 39:2045, Stat tile 40:2061, Check row 46:2089, Event row 46:2165, Evidence card 46:2166, Row/Lobby 50:2214, Row/Exam 50:2153, Table/Header cell 149:2763, Table/Empty state 149:2792, Table/Skeleton row 149:2847 |
| Shell | App/Sidebar 47:2070, App/Top bar 47:2201, App/Title bar 150:13352, Browser/Top bar 150:13406, Nav item 40:2055, Tab 40:2060, Step 46:2106 |
| Proctoring | Student tile 15:1372, Camera tile 15:1373, Timer 15:1304, Widget/Live 15:1264, HUD 15:1303, Menu/Tile actions 75:2198, Menu/Quick message 75:2259, Popover/Extend time 83:2462, Popover/Student 77:2318 |
| Feedback | Dialog 144:2725, Toast 145:2732, Banner 145:2770, Spinner 145:2771, Tooltip 79:2411, Menu item 71:2207 |
| Üki Lock | Ext/Toolbar icon 89:2491, Ext/Popup header 92:2533, Ext/Popup footer 92:2546, Ext/Popup · Pair 92:2552, Ready 92:2592, Locked 93:2626, Released 93:2688, Ext/Lock bar 90:2549, Ext/Toast 89:2492, Ext/Check 92:9352 |

The live wall (2.4) and timeline drawer (2.5) render under `data-theme="dark"`, as in Figma; every other Phase 0 screen is Light.

## Data model

Phase 0 creates 17 tables in the `public` schema, all with row-level security on. Events are append-only and keyed by a client UUIDv7, so a resent batch never duplicates. No face data is stored: the card match runs on the laptop, and only its result and score reach `sessions`.

```sql
-- supabase/migrations/0001_core.sql (Phase 0)
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
```

### Database functions and triggers

| Name | Kind | What it does |
| --- | --- | --- |
| `join_exam(code, student_number, locale, device)` | RPC, security definer | Open from `lobby_opens_at` until `starts_at + duration_min`. Checks the code and the roster, then creates the session bound to `auth.uid()` or returns it to the same user. Returns exam, student, proctor name, and the questions only once the exam has started. Errors: `invalid_code`, also for a student not on the roster; `already_joined`; `lobby_closed`; `rate_limited` |
| `start_exam(exam_id)` | RPC, security definer | Lead proctor or exam office, only before the scheduled `starts_at`; sets `starts_at` to now and `status` to `live`; inserts a `start` command for every session in `rules` or `ready` |
| `submit_session(session_id)` | RPC, security definer | Session owner only. Sets `time_up` past the end, otherwise `submitted`, and keeps `ended`; sets `submitted_at` and `time_used_s`; issues `receipt_id` like `UKI-204-0942-MT`; idempotent |
| `session_ends_at(sessions)` | SQL function | `starts_at + make_interval(mins => duration_min + extra_min, secs => paused_s)`, read by RLS, `submit_session` and `session_tick` |
| `exam_overview` | View, `security_invoker = on` | Counts per exam for 0.1, under the caller’s RLS |
| `events_broadcast` | Trigger, after insert on `events` | `realtime.send` of the compact event to `exam:{exam_id}`; applies the state changes and pause time below |
| `commands_broadcast` | Trigger, after insert on `session_commands` | `realtime.send` of the command to `session:{session_id}` |
| `sessions_broadcast` | Trigger, after update of `state`, `status`, `last_seen_at`, `extra_min` or `paused_s`, when a value changed | Sends those fields to `exam:{exam_id}`; the dashboard derives each tile with `wall.ts` |
| `answers_keep_latest` | Trigger, before update on `answers` | Keeps the row with the later `saved_at` |
| `session_tick` | `pg_cron`, every minute | Sets exams `live` at `starts_at`; sets sessions `time_up` 2 minutes past their end; sets exams `to_review` once every session is final |

### Session states

`sessions.state` changes only on the server, by these rules. A state never moves back, except between `writing` and `paused`.

| Cause | New state | Also sets |
| --- | --- | --- |
| `join_exam` | `joined` | `joined_at`, `locale`, `device` |
| `ingest` with `status.step` set to checking, identity, rules or ready | That step | Forward only; never out of `paused` or a final state |
| `exam.started`, sent when 2.1 opens or when Üki Lock reports `lock.started` | `writing` | `started_at` |
| `session.paused` or `proctor.paused` | `paused` | Nothing |
| `session.resumed` or `proctor.resumed` | `writing` | Adds the pause to `paused_s` |
| `proctor.ended` | `ended` | `ended_at`, `end_reason` |
| `submit_session` or `session_tick` after the end | `time_up` | `submitted_at` when submitted |
| `submit_session` before the end | `submitted` | `submitted_at`, `time_used_s`, `receipt_id` |

A pause lasts from the pause event’s `at` to the resume event’s `at`, capped by the gap between their `received_at` times, so a forged or replayed event cannot add time. Self-pauses give back at most 5 minutes per session; proctor pauses give back all their time. `ingest` writes `last_seen_at` on every call, and `net.offline` changes no state: the wall shows No signal from `last_seen_at`.

### Row-level security

| Who | Can read | Can write |
| --- | --- | --- |
| Exam office and admin | Every table of their workspace | Exams, rosters, proctor assignments, staff |
| Proctor | Exams it is assigned to, with their `exam_students`, `students`, `sessions`, `answers`, `events` and `frames` | Nothing directly; commands go through `command` |
| Student (anonymous user) | Its own session; its exam; the exam’s questions once it has started; its own `answers` and `session_commands` | Its own `answers` saved before the session’s end, accepted until 10 minutes after it; `acked_at` on its own commands; events only through `ingest` |
| Service role (secret key) | All | All; used only by Edge Functions through `@supabase/server`, the cron job, and the seed and demo scripts |

Helpers keep policies short: `is_staff_of(workspace_id)` is true only for exam office and admin staff, and `is_proctor_of(exam_id)` needs a `proctor_assignments` row, so a proctor never sees another exam. RLS cannot limit columns, so the command acknowledgement uses `revoke update on session_commands from authenticated; grant update (acked_at) on session_commands to authenticated;` plus a policy on the student’s own session. Staff open stills only through the `stills` function, which writes one `audit_log` row per still for A.6 in Phase 1.

Tables for later phases stay out of Phase 0: review decisions and reports (Phase 1), data requests and notifications (Phase 1 and 3), question bank import, SSO connections, webhooks and deliveries (Phase 2 and 3).

## API and realtime

The student app calls two Edge Functions and two database functions. The dashboard reads through PostgREST under row-level security, starts exams with `start_exam`, writes proctor commands through `command`, and opens stills through `stills`. Realtime uses two private Broadcast channels; every payload has a Zod schema in `packages/contracts`, shared by sender and receiver.

### Endpoints

| Call | Caller | Input | Output | Rules |
| --- | --- | --- | --- | --- |
| `rpc join_exam` | Student app | `code`, `student_number`, `locale`, `device` | `session`, `exam`, `student`, `proctor_name`, `questions` once started | Join window and errors in Database functions; 1.1a shows `invalid_code` |
| `POST /functions/v1/ingest` | Student app, Üki Lock through the app | `session_id`, `events[]` (0 to 50), optional `status`: step, detail, question | `accepted`, `duplicates`, `uploads[]`, `server_time` | Session owner; `insert … on conflict (id) do nothing`; sets `review` from the type, never from the client, and flags the third `lock.fullscreen_exit`; writes `last_seen_at` and `status`; returns upload URLs for every flag event in the batch, new or duplicate, whose stills are not all confirmed; 10 calls a second per session at most |
| `POST /functions/v1/frames` | Student app | `event_id`, `paths[]` (up to 3) | `frame_ids[]` | Session owner; checks each object exists under `frames/{exam_id}/{session_id}/`, inserts rows, broadcasts `frame` |
| `rpc submit_session` | Student app | `session_id` | `receipt_id`, `time_used_s`, `state` | Idempotent; see Session states |
| `rpc start_exam` | Dashboard | `exam_id` | `starts_at` | Lead proctor or exam office, before the scheduled start |
| answers upsert | Student app | `session_id`, `question_id`, `choice_id`, `saved_at` | Nothing | PostgREST under RLS; the later `saved_at` wins |
| `POST /functions/v1/command` | Dashboard | `session_id` or `exam_id`, `type`, `payload` | `command_id` | Proctor of that exam or exam office; message up to 280 characters; added time 1 to 60 minutes, added to `extra_min`; end reason up to 200 characters; writes the matching `proctor.*` event and an audit row |
| `POST /functions/v1/stills` | Dashboard | `event_id` | `urls[]` | Proctor of that exam or exam office; signs 5-minute URLs with `ctx.supabaseAdmin`; one `audit_log` row per still |

`ingest` answers each flag event that has stills with signed upload URLs from `createSignedUploadUrl`, valid for 2 hours ([createSignedUploadUrl](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl)); a resent event gets fresh ones. The app uploads the JPEGs straight to Storage, then calls `frames` to confirm. It calls `ingest` at least every 10 seconds, with an empty batch if needed; the wall marks a tile as No signal after 30 seconds without a call.

`command` also takes `exam_id` with `scope: group` in place of `session_id`; it then inserts one command per session in `rules`, `ready`, `writing` or `paused`. Every command broadcast carries `by_name`.

Each Edge Function wraps its handler in `withSupabase({ auth: 'user' })` from `@supabase/server`, which verifies the caller’s token and hands back `ctx.supabase` under RLS and `ctx.supabaseAdmin` for privileged writes ([Supabase server SDK](https://supabase.com/blog/introducing-supabase-server)). Each function then checks the caller itself: `ingest` and `frames` the session owner, `command` and `stills` staff of the exam.

### Realtime channels

| Channel | Who joins | Messages |
| --- | --- | --- |
| `exam:{exam_id}`, private | Proctors of the exam and the exam office | `event` (compact event), `session` (new state of one tile), `frame` (a still is ready) |
| `session:{session_id}`, private | The student app of that session | `command`: pause, resume, end, message, add\_time, start |

Students never join an exam channel, so no student receives another student’s events. RLS on `realtime.messages` checks `realtime.topic()` against `is_proctor_of`, `is_staff_of` or the session’s `auth_uid`. Its policies allow select only: clients listen, and only database triggers send.

### Event envelope

```ts
// packages/contracts/src/events.ts
import { z } from "zod";

export const EVENT_TYPES = [
  "gaze.on_screen", "gaze.off_screen", "gaze.down", "phone.detected",
  "face.missing", "face.second", "camera.lost", "tab.blocked", "copy.blocked",
  "site.closed", "net.offline", "identity.matched", "exam.started", "browser.locked",
  "answer.saved", "session.paused", "session.resumed", "exam.submitted", "exam.time_up", "proctor.paused", "proctor.resumed",
  "proctor.ended", "proctor.time_added", "proctor.message", "student.help_requested",
  "lock.app_disconnected", "lock.fullscreen_exit",
] as const;
export const EventType = z.enum(EVENT_TYPES);

export const EventEnvelope = z.object({
  id: z.string().uuid(),                 // UUIDv7, made on the laptop
  session_id: z.string().uuid(),
  type: EventType,
  source: z.enum(["app", "lock", "proctor", "server"]),
  at: z.string().datetime(),             // laptop clock, UTC; server also stores received_at
  seq: z.number().int().nonnegative(),   // per session, increments by 1; server-written events have none
  data: z.record(z.string(), z.unknown()),
  frame_count: z.number().int().min(0).max(3).default(0),
  app_version: z.string(),
});

// Review is set on the server from this map, never trusted from the client.
export const REVIEW: Record<(typeof EVENT_TYPES)[number], "flag" | "log" | "none"> = {
  "gaze.on_screen": "none", "gaze.off_screen": "flag", "gaze.down": "flag", "phone.detected": "flag",
  "face.missing": "flag", "face.second": "flag", "camera.lost": "flag", "tab.blocked": "flag",
  "copy.blocked": "log", "site.closed": "log", "net.offline": "log", "identity.matched": "none",
  "exam.started": "none", "browser.locked": "none", "answer.saved": "none", "session.paused": "log", "session.resumed": "none",
  "exam.submitted": "none", "exam.time_up": "none", "proctor.paused": "log", "proctor.resumed": "log", "proctor.ended": "flag",
  "proctor.time_added": "log", "proctor.message": "log", "student.help_requested": "log",
  "lock.app_disconnected": "flag", "lock.fullscreen_exit": "log", // the third exit in a session is a flag
};
```

### Event data

| Event | `data` fields |
| --- | --- |
| gaze.off\_screen | `duration_ms`, `direction`: left, right or up |
| gaze.down | `duration_ms` |
| phone.detected | `score` from 0 to 1, `held_ms` |
| face.missing, face.second | `duration_ms`; `faces` for face.second |
| camera.lost | `reason`: ended, muted or error |
| tab.blocked, site.closed | `host` only, never the full URL; from the desktop app, tab.blocked carries app instead, null when focus left |
| copy.blocked | `kind`: copy, cut, paste or print |
| net.offline | `offline_ms`, `queued`; sent after reconnect |
| identity.matched | `score`, `tries` |
| answer.saved | `question_id`; the choice stays in `answers` |
| session.paused | `reason`: face\_missing, camera\_lost or proctor |
| session.resumed | `paused_ms`, `by`: student; a proctor resume writes proctor.resumed instead |
| exam.submitted | `time_used_s` |
| proctor.paused, proctor.resumed, proctor.ended | `staff_id`; `reason` for ended |
| proctor.time\_added | `minutes`, `scope`: student or group |
| proctor.message | `text`, `scope` |
| student.help\_requested | `topic`: identity, question or technical; optional `text` |
| lock.fullscreen\_exit | `count` in this session |

The other events carry an empty `data`. Each type’s face, review label and screens are in the Event names card of 08 Handoff.

## On-device detection

Detection runs in a Web Worker inside the desktop app: face tracking at 15 frames per second, phone checks at 2 to 3 per second, identity once at check-in. Only events and up to 3 stills per flag leave the laptop. This is the riskiest package, so its spike runs on day 2, before any screen polish.

### Pipeline

1. **Camera.** `getUserMedia` at 640 × 480, 30 fps. The exam window shows the preview. A `MediaStreamTrackProcessor` reads the frames, so a hidden window keeps its rate; every second frame becomes an `ImageBitmap` transferred to `detection.worker.ts`.
2. **Face tracking.** MediaPipe Face Landmarker, `runningMode: "VIDEO"`, `numFaces: 2`, blendshapes and transformation matrices on, GPU delegate with a CPU fallback. Per frame it yields: face count, head yaw and pitch from the matrix, and the blendshapes `eyeLookOut*`, `eyeLookIn*`, `eyeLookDown*`.
3. **Phone check.** MediaPipe Object Detector with EfficientDet-Lite0, `categoryAllowlist: ["cell phone"]`, `scoreThreshold: 0.5`, on one frame every 400 ms.
4. **Rules.** A pure state machine in `packages/detection/rules.ts` turns per-frame signals into events, using the thresholds in `exams.checks` (table below). It has no clock of its own: it receives timestamps, so tests replay recorded signals.
5. **Stills.** A flag captures up to 3 JPEG stills at quality 0.7, 640 × 360 centre-cropped from 640 × 480: when the threshold is crossed (2 s into a look, the second phone hit, 1 s of two faces), then 1 s and 2 s later. They attach to the event when it is created, wait in IndexedDB until uploaded, then are deleted from the laptop.
6. **Outbox.** Events and stills go to the Dexie outbox; the sync loop sends them through `ingest` and `frames` (API section). A flag event flushes the outbox at once.

### Starting thresholds

| Signal | Event | Rule |
| --- | --- | --- |
| Head yaw beyond ±25°, or pitch above +20°, or side look (mean of `eyeLookOut` on one eye and `eyeLookIn` on the other) above 0.55 | gaze.off\_screen | Held for `gaze_s` (2 s); the event is sent when the look ends, with its duration; 300 ms on screen ends it |
| Pitch below −15° or `eyeLookDown` mean above 0.6 | gaze.down | Held for 2 s |
| Return to the screen after an off-screen event | gaze.on\_screen | Log only, shown in the session log on 2.1 |
| No face | face.missing, then session.paused | After `face_missing_s` (10 s) the timer stops and 2.3 shows; “I’m here” resumes once a face is back |
| Two faces | face.second | Held for 1 s |
| Phone score of 0.85 or more (`phone_score`) | phone.detected | Two checks in a row, so at least 400 ms; the 2.2 warning shows at once |
| Camera track ends or mutes | camera.lost, then session.paused | Immediately |

These numbers are starting points; tuning on the two demo laptops changes them, and every change goes into `exams.checks` defaults, not into code.

### Identity check on 1.3

1. **Face.** Human, with only its face detector and description models loaded, turns the live face into a 1024-number descriptor.
2. **Card.** The student holds the card inside the lime frame. Human finds the photo on the card in that crop and makes its descriptor; `human.match.similarity` of 0.5 or more is a match, the threshold Human’s documentation suggests, tuned on the demo cards. Tesseract.js reads the same crop with a digits-only whitelist set through `setParameters`; the student number must equal the one used to join.
3. **One person.** Exactly one live face outside the card frame for the whole check.
4. After 3 failed tries the app shows 1.3a and sends `student.help_requested` with topic identity. No card image, face image or descriptor is stored or sent; `identity.matched` carries only the score and the tries.

Human runs in the renderer with its models under `resources/models/human/` and `modelBasePath` pointing there. It loads when 1.3 opens and is disposed after the match, so it costs nothing during the exam ([Human](https://github.com/vladmandic/human), [embedding guide](https://github.com/vladmandic/human/wiki/Embedding)).

### Performance budget

| Measure | Target on an M1 MacBook Air and an 8th-gen Core i5 laptop |
| --- | --- |
| Face tracking | 15 fps or more |
| Phone checks | 2 per second or more |
| App CPU | Under 40% averaged over 1 minute |
| App memory | Under 700 MB |
| Event to live wall | Under 1 s at the 95th percentile on a 4G connection |
| Face tracking with the window hidden in a browser exam | 15 fps or more |

If face tracking stays under 10 fps for 5 seconds, the worker drops to 480 × 360 and phone checks to 1 per second, and the developer overlay shows it.

### Privacy guarantees enforced in code

- No `MediaRecorder` anywhere in the repository; a Biome rule or a CI grep fails the build if one appears.
- Image bytes leave the worker only through `stills.capture`, called only by the rules engine on a flag event; a unit test asserts it.
- The Content Security Policy of the desktop app allows network connections to the Supabase URL only.
- Before the exit review, a network log of a 10-minute exam from a development build shows no image upload outside `frames/`.
- Model files ship inside the app under `resources/models/` with a SHA-256 manifest; nothing is fetched from a CDN at run time.

### Tuning

Tune on the two demo laptops with the developer overlay (Ctrl+Shift+D in development builds), which shows fps, head angles, look scores, face count, phone score and the rule state. Run each demo moment 5 times on each laptop: look away for 3 seconds, lift a phone, leave the seat for 10 seconds, a second person behind you.

Phase 0 target: every moment fires 5 times out of 5 on both laptops, and 5 minutes of normal writing raise no flag.

## Desktop app

The Üki app is one Electron window that takes the student from join to receipt, runs detection, locks the laptop during the exam and relays Üki Lock. Phase 0 ships its 14 screens as unsigned builds for macOS and Windows.

### Layout

```text
apps/desktop/
├─ src/main/
│  ├─ index.ts            single-instance lock, app lifecycle
│  ├─ window.ts           the one BrowserWindow, tray, content protection
│  ├─ lockdown.ts         enter and leave exam lockdown
│  ├─ scan.ts             running apps and screen-sharing tools
│  ├─ lock-relay.ts       WebSocket server for Üki Lock on 127.0.0.1, origin check, pairing code
│  └─ ipc.ts              Zod-checked handlers behind window.uki
├─ src/preload/index.ts   contextBridge: window.uki
├─ src/renderer/
│  ├─ flow/               XState 5 machine for the student flow
│  ├─ screens/            one folder per frame: join, system-check, identity, rules, exam, receipt
│  ├─ outbox/             Dexie 4 database and the sync loop
│  └─ detection.worker.ts imports packages/detection
├─ resources/
│  └─ models/             face_landmarker.task, efficientdet_lite0.tflite, human/ (face detector and
│                         description models), eng.traineddata, wasm files, manifest.json with SHA-256 per file
└─ electron-builder.yml
```

### Window states

| State | Screens | Window |
| --- | --- | --- |
| Before the exam | 1.1 to 1.4 | Normal window, 1280 × 800, minimum 1024 × 700; content protection on from launch |
| Exam in the app | 2.1, 2.1a, 2.1c, 2.1e, 2.2, 2.3 | `setKiosk(true)`, `setAlwaysOnTop(true, "screen-saver")`; on macOS also `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`; close and quit blocked |
| Exam in the browser | none in the app | Window hidden; a tray or menu bar icon shows the watch state; detection keeps running |
| After the exam | 3.1, 2.1d | Lockdown off; Close Üki quits |

- **macOS.** Kiosk mode hides the Dock and menu bar and disables app switching, Force Quit and the Apple menu ([native\_window\_mac.mm](https://raw.githubusercontent.com/electron/electron/main/shell/browser/native_window_mac.mm)).
- **Windows.** Kiosk mode is only full screen ([native\_window\_views.cc](https://raw.githubusercontent.com/electron/electron/main/shell/browser/native_window_views.cc)), so Alt+Tab and the Windows key still work. Every `blur` during lockdown calls `show()`, `setAlwaysOnTop(true, "screen-saver")` and `focus()`, and sends `tab.blocked` with `app: null` at most once per 5 seconds, even when Windows refuses the focus.
- **Capture.** Content protection removes the window from captures on Windows 10 2004 and later. On macOS, apps built on ScreenCaptureKit still capture it ([BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window)), so the process scan also looks for screen-sharing tools.
- **Hidden window.** `backgroundThrottling: false` plus `powerSaveBlocker.start("prevent-app-suspension")` keep the camera and the worker at full speed while the window is hidden in browser exams; work package 0.5 measures it.

### Hardening

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`; DevTools only in development builds.
- The renderer and `resources/` load through a privileged `uki://` scheme (`standard`, `secure`, `supportFetchAPI`) served by `protocol.handle`, never `file://`: MediaPipe, Human and Tesseract.js fetch their files, and fetch refuses `file:` URLs.
- `before-input-event` drops reload, DevTools, zoom, close-tab and quit shortcuts during lockdown; `before-quit` is cancelled until submit or end.
- `will-navigate` and `setWindowOpenHandler` deny every URL outside the app; the permission handler allows only video capture for the app’s own pages.
- Content Security Policy: `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self' https://<supabase-host> wss://<supabase-host>; img-src 'self' blob: data:; media-src 'self' blob: mediastream:`.
- MediaPipe, Human and Tesseract.js load their models, wasm, workers and language data from `resources/`; Tesseract’s default CDN paths and Human’s model path are overridden.
- `@electron/fuses` in electron-builder’s `afterPack` turns off RunAsNode, `NODE_OPTIONS` and CLI inspect, and turns on `OnlyLoadAppFromAsar` and ASAR integrity checks.
- Development builds skip content protection when `UKI_ALLOW_CAPTURE=1`, so evidence videos can be recorded; production builds ignore it.

### The window.uki bridge

```ts
// packages/contracts/src/ipc.ts: every call is checked with Zod in the main process
export interface UkiBridge {
  app: { info(): Promise<{ version: string; os: "macos" | "windows"; arch: string }>; quit(): Promise<void> };
  checks: { scan(): Promise<{ apps: BlockedApp[]; screenShare: BlockedApp[]; freeMb: number }> };
  exam: {
    lockdown(on: boolean): Promise<void>;       // kiosk, always on top, close and quit blocked
    hideToTray(on: boolean): Promise<void>;     // browser exams
    onBlur(cb: () => void): () => void;         // focus left the window during lockdown
  };
  lock: {
    status(): Promise<"absent" | "connected" | "paired">;
    send(msg: AppToLock): Promise<void>;
    onMessage(cb: (msg: LockToApp) => void): () => void;
  };
  receipt: { savePdf(): Promise<string | null> }; // printToPDF of the receipt card, then a save dialog
  system: { openCameraSettings(): Promise<void> };
}
```

### System check on 1.2

| Row | How the app checks | Ready when |
| --- | --- | --- |
| Camera | `systemPreferences.askForMediaAccess("camera")` on macOS, then the live preview through Face Landmarker | Exactly one face; mean face brightness 70 of 255 or more; frame not uniform |
| Network | `GET /auth/v1/health` on the Supabase host with the publishable key, round trip shown in ms | Reply under 1,000 ms |
| Üki version | Not checked in Phase 0 | Always ready; the version check and 1.0b ship in Phase 2 |
| Browser lock | Relay status from Üki Lock | Paired, or `checks.lock` is false |
| Other apps | Process list against `packages/contracts/src/blocked-apps.ts`: messengers and AI assistants | None running; the row names the first one found |
| Screen sharing | Same list: remote desktop, meeting and recording tools | None running |
| Storage | `fs.statfs` on the app data folder | 1 GB free or more |

The process list comes from `ps -axo comm=` on macOS, matched on the file name, and from `tasklist /fo csv /nh` on Windows, every 15 seconds during the exam. A blocked app that appears mid-exam sends `tab.blocked` with `app` set to its name. The starting list: Telegram, WhatsApp, Discord, Viber, AnyDesk, TeamViewer, RustDesk, Chrome Remote Desktop, Zoom, Microsoft Teams, OBS Studio, ChatGPT and Claude. Verify each executable name on both systems on day 3; the names live only in that file.

### Student flow

| Frame | Shows | Leaves for |
| --- | --- | --- |
| 1.1 Join | Code and student ID; language switch ҚАЗ, РУС, ENG | 1.2 after `join_exam`; 1.1a on `invalid_code` |
| 1.1a Wrong code | The same form with the code error | 1.2 once a code works |
| 1.2 System check | The seven rows above | 1.3 when every row is ready |
| 1.3 Identity | Face, card and one-person rows | 1.4 after `identity.matched`; 1.3a after 3 failed tries or Ask proctor |
| 1.3a Proctor help | Help requested time and proctor name; the check keeps retrying | 1.4 on a later match |
| 1.4 Rules and lobby | Four rules, an agree box, countdown to start | 2.1 at `starts_at` once the box is ticked, or at once on the start command; browser exams hide the window instead |
| 2.1 Exam | Question, choices, save time, Watching panel, timer, session log | 3.1 on submit or time up |
| 2.2 Phone warning | “Phone in frame” overlay | 2.1 after 2 s with no phone |
| 2.3 Paused | No face; timer stopped | 2.1 on I’m here with a face in view; sends `session.resumed` |
| 2.1a Offline | Banner; answers keep saving; timer runs | 2.1 after the next successful sync |
| 2.1c Paused by proctor | Proctor message; timer stopped | 2.1 on the resume command |
| 2.1e Message and new end time | Message banner; new end time in the timer | 2.1 on Got it |
| 2.1d Ended by proctor | Receipt with the reason | Quit |
| 3.1 Submitted | Receipt, time used, flag count | Quit |

- In Phase 0 the Ask proctor button shows only on 1.3; the other screens hide it until Phase 1.
- At time up the app submits and shows 3.1 with `exam.time_up`; the 2.1b screen ships in Phase 2.
- `join_exam` returns the same session to the same anonymous user after a crash or restart; a different user gets `already_joined`, and moving to another laptop waits for Phase 1.
- `join_exam` also returns the seat’s proctor name for 1.3a; commands carry `by_name` for 2.1c, 2.1d and 2.1e.
- `submit_session` on an `ended` session keeps the state and returns the receipt for 2.1d.

### Exams in the browser

In a browser exam the app window stays hidden, so Phase 0 changes four behaviours:

- The app sends `exam.started` when Üki Lock reports `lock.started`.
- `face.missing` and `camera.lost` are logged and flagged but do not pause, because 2.3 sits in the hidden window.
- Pause, message and end commands bring the window to the front with 2.1c, 2.1e or 2.1d. A phone warning changes the Lock bar’s watch label to “Phone found”.
- When the Lock reports `exam.submitted`, the app calls `submit_session`, sends `lock.release`, and shows 3.1.

### Timer

The server owns time: a session ends at `session_ends_at`, which is `starts_at + duration_min + extra_min + paused_s`. Late joiners get no extra time; self-pauses give back at most 5 minutes; proctor pauses give back all of theirs. The app corrects its clock with `server_time` from every `ingest` reply; the timer stops while paused and keeps running offline.

### Offline queue

| Dexie table | Key | Holds |
| --- | --- | --- |
| `answers` | session and question | Choice, `saved_at`, synced time |
| `events` | event id, UUIDv7 | The envelope and its sent time |
| `stills` | still id | Event id, JPEG blob, upload state |
| `commands` | command id | Applied time, so each command runs once |

1. After each answer and every 2 seconds, the loop upserts unsynced answers, then sends up to 50 events to `ingest`; a flag event flushes at once. The `answers_keep_latest` trigger keeps the row with the later `saved_at`.
2. A failed call retries after 2, 4, 8, 16, then every 30 seconds. With no reply for 5 seconds, 2.1a shows.
3. On reconnect, the app sends answers first, then events in `seq` order, including `net.offline` with `offline_ms` and `queued`; that event changes no state.
4. Stills upload through the signed URLs from `ingest`, then `frames` confirms them; the laptop copy is deleted after the confirm. A still whose URL expired gets a fresh one when its event is sent again.
5. Nothing leaves Dexie before the server confirms it. After the receipt shows and the outbox is empty, the database is cleared.

### Proctor commands

The app joins `session:{session_id}` right after join. Each command applies once by id; on reconnect, the app reads `session_commands` rows with no `acked_at` and applies them in order. It acks by setting `acked_at`; a column grant and a policy on its own session allow exactly that.

- **start** moves the lobby (1.4) to 2.1 at once.
- **pause** opens 2.1c and stops the timer.
- **resume** closes 2.1c; the `command` function has already written `proctor.resumed`, and the server adds the pause to `paused_s`.
- **message** and **add\_time** show 2.1e; add\_time raises `extra_min` and moves the end.
- **end** flushes the outbox, calls `submit_session` and shows 2.1d.

### Builds

- electron-builder: dmg for macOS on arm64 and x64, NSIS for Windows on x64; unsigned in Phase 0.
- `NSCameraUsageDescription` goes in `mac.extendInfo`; without it macOS refuses the camera.
- The demo installers are built on the demo laptops themselves, so macOS adds no quarantine flag. A CI build copied to a Mac needs `xattr -dr com.apple.quarantine`, and Windows SmartScreen needs More info, then Run anyway; both go in `docs/runbooks/demo-laptops.md`.

## Web dashboard

The dashboard is the Next.js app in `apps/web`. Phase 0 builds sign-in, the exams overview, the lobby, and the live wall with its drawer, action menu and three dialogs, all fed by Supabase Realtime.

### Routes

| Route | Frames | Who | Main data |
| --- | --- | --- | --- |
| `/sign-in` | A.0 | Staff | Supabase Auth email and password |
| `/overview` | 0.1 | Exam office; a proctor sees only assigned exams | View `exam_overview` with counts per exam |
| `/exams/[examId]/lobby` | 1.5 | Proctors of the exam, exam office | `exam_students`, `sessions`, `sessions.status` |
| `/exams/[examId]/live` | 2.4, 2.4a, 2.4b, 2.4c, 2.4e | Proctors of the exam, exam office | Sessions, recent events, the `exam:{exam_id}` channel |
| `/exams/[examId]/live?session=[id]` | 2.5 | Same | One session’s events and stills |

`/` sends signed-in staff to `/overview` and everyone else to `/sign-in`. `src/proxy.ts` refreshes the Supabase session cookie on each request; Next.js 16 renamed middleware to proxy ([proxy.ts](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)). Every page and server action also checks the user itself.

```text
apps/web/src/
├─ proxy.ts
├─ app/(auth)/sign-in/page.tsx
├─ app/(app)/layout.tsx            sidebar 256 at 1280 and up, icon rail 72 from 1024 to 1279
├─ app/(app)/overview/page.tsx
├─ app/(app)/exams/[examId]/lobby/page.tsx
├─ app/(app)/exams/[examId]/live/page.tsx
├─ features/wall/                   Zustand store, realtime hook, tiles, drawer, dialogs
└─ lib/supabase/                    server and browser clients from @supabase/ssr
```

### Sign-in (A.0)

- `signInWithPassword`; errors show under the fields.
- “Keep me signed in for 12 hours” checked gives the auth cookies a 12-hour lifetime; unchecked makes them end with the browser.
- Phase 0 hides “Forgot password?” (A.0a ships in Phase 2) and the language switch (Russian arrives in Phase 1).
- `scripts/seed-staff.ts` creates the staff accounts through the Auth admin API; passwords come from `.env`, never from git.

### Overview (0.1)

- The sidebar shows Overview, Exams and Live in Phase 0; Review, Reports, Students, Settings and Privacy stay hidden until their phase.
- Stat cards come from `exam_overview`: next exam, live now, needs review, and video uploaded, which is always 0 MB. The view is created with security\_invoker on, so it obeys the caller’s RLS.
- The exams table lists the seeded exams with groups, proctor count, time, duration, students, checks and status. Filters All, Upcoming and Done run on the client.
- Import CSV and New exam stay hidden until Phase 1. Open lobby goes to the lobby of the next exam.

### Lobby (1.5)

- The header shows the start time, minutes left and the sentence with joined, need-help and not-joined counts.
- Stat cards: Joined, Ready, Need help, Not joined. Filter tabs and search run on the client.
- Each row shows the student, the step and detail from `sessions.status` (for example “Telegram is open”), the OS and version from `sessions.device`, and the status chip. The network type waits for Phase 1.
- Message everyone opens 2.4b for the group. Start exam calls `start_exam`; only the lead proctor and the exam office see it enabled, and only before the scheduled start.
- Phase 0 hides Call on not-joined rows.

### Live wall (2.4)

Each tile gets one state from a pure function in `packages/contracts/src/wall.ts`, unit-tested with recorded events. The first rule that matches wins.

| Order | Tile state | Rule | Status line |
| --- | --- | --- | --- |
| 1 | Done | State `submitted`, `time_up` or `ended` | Final state |
| 2 | Paused | State `paused` | “no face · 00:42” or “camera lost · 00:10”, time since the pause |
| 3 | No signal | `last_seen_at` older than 30 s | Time since the last call |
| 4 | Flagged | An unreviewed `phone.detected` or `face.second` | “phone 0.94 · 10:47”, “second face · 10:45” |
| 5 | Warning | `gaze.off_screen`, `gaze.down` or `tab.blocked` in the last 5 minutes | “looked away 3× · 6 s”, “tab blocked · 10:44” |
| 6 | On screen | Otherwise | “on screen · Q 9” from `status.question` |

- Stat cards count tiles by state: On screen of all writing, Warnings, Flagged, Paused.
- Sort is Flags first by default, or Seat order. The Paused chip filters the wall.
- The Live events column lists flag and log events, newest first, capped at 100.
- Message group opens 2.4b; Extend time opens 2.4c; a tile click opens 2.4a.

Data flow:

1. The page renders on the server with the exam’s sessions and its flag and log events from the last 60 minutes, through RLS.
2. The client joins the private channel `exam:{exam_id}` after `supabase.realtime.setAuth()`. `event`, `session` and `frame` messages update a Zustand store keyed by session id.
3. After a reconnect or when the tab regains focus, the client fetches events received after the last one it saw and drops duplicates by id.
4. One 1-second ticker drives every clock. A tile re-renders only when its own slice of the store changes.

### Actions and dialogs

| Frame | Action | What it sends | Phase 0 |
| --- | --- | --- | --- |
| 2.4a | Open timeline (T) | Opens 2.5 | Yes |
| 2.4a | Watch camera (W) | Nothing | Hidden: live video breaks the on-device promise; see Open questions |
| 2.4a | Message (M) | Opens 2.4b for one student | Yes |
| 2.4a | Pause exam (P) | `pause`; the item becomes Resume exam while paused | Yes; Resume exam uses the key dashboard.wall.action.resume, not in Figma yet |
| 2.4a | Mark reviewed | Nothing | Hidden until the review queue in Phase 1 |
| 2.4a | End session | Opens 2.4e | Yes |
| 2.4b | Quick message | `message` with a preset key, or text up to 280 characters | Yes; presets reach each student in the student’s language |
| 2.4c | Extend time | `add_time` for everyone, 5, 10 or 15 minutes | Yes; shows the new end before sending |
| 2.4e | End session | `end` with a required reason up to 200 characters | Yes; Keep him writing cancels |

Every action calls the `command` function. The proctor event it writes reaches the wall through the same channel, so the wall never updates on its own optimistic guess.

### Timeline drawer (2.5)

- The header shows name, student number, seat and OS, the latest flag, the current state and the question.
- The flag card shows its stills through the `stills` function, which signs 5-minute URLs and audits each one; they load only when the drawer opens.
- The timeline lists every event of the session, newest first, in the wording of the Figma event card.
- Quick message shows the presets in the student’s language with Russian and English beneath. Add note stays hidden until Phase 1.

## Üki Lock

Üki Lock is a Manifest V3 extension that keeps the browser on the exam while a paired exam runs. It never talks to the server: every message and event goes through the Üki app over a local WebSocket, and the app sends events with `source: lock`.

### What it enforces in Phase 0

| Rule | How | Event |
| --- | --- | --- |
| One tab | At the start it saves and closes the other tabs; new tabs and windows close at once unless their host is allowed | `tab.blocked` with `host` |
| Allowed sites only | A `declarativeNetRequest` session rule redirects main-frame loads outside the allowed hosts to the block page, E.7 | `site.closed` with `host` |
| No copy, paste or print | A content script on allowed hosts cancels copy, cut, paste, context menu, drag and drop, and Ctrl or Cmd+P; a print style blanks the page; E.6 shows | `copy.blocked` with `kind`, at most one per kind every 10 s |
| Full screen | `windows.update({ state: "fullscreen" })` at the start; `windows.onBoundsChanged` re-requests it | `lock.fullscreen_exit` with `count` |
| Stay in the browser | Focus leaves every visible browser window for 2 s: another app, or an incognito window the extension cannot see | `tab.blocked` with `host: null`, then the exam window is refocused |
| Link to the app | The WebSocket stays down for 15 s while locked | The app sends `lock.app_disconnected` with `side`: `lock` when the extension or browser went away, `app` after an app crash |

The allowed hosts are the host of `exams.lms_url` plus `exams.allowed_sites`. Exams in the app use only the first two rules, with no allowed host; browser exams use all six. The Calculator tab, Ask proctor in the bar, and the Other extensions row in E.4 stay hidden until their phases.

### Two exam modes

- **Exam in the app.** When 2.1 starts, the app sends `lock.start`. The Lock saves every tab, closes all but one, and points that one at the block page with only its title line, so the browser stays open. 2.1 shows “Browser locked · 3 tabs closed” from the reply.
- **Exam in the browser.** The student presses Lock and start in the E.4 popup. The Lock makes the portal window full screen, closes the other tabs, injects the bar, and tells the app, which hides its window. The mock portal enables Start attempt only when the page carries `data-uki-lock="locked"`.

Release (E.9) comes from the first of: the exam tab reaching `exams.lms_done_path`, the app’s submit, a proctor end, or the Üki end time plus 2 minutes. The Lock then removes its rule and scripts, restores the saved tabs in their windows and order, leaves full screen, and calls `chrome.action.openPopup()` to show E.9; the popup shows E.9 on its next open if that call fails ([action](https://developer.chrome.com/docs/extensions/reference/api/action)).

### Manifest

```ts
// apps/lock/wxt.config.ts
export default defineConfig({
  manifest: {
    name: "Üki Lock",
    minimum_chrome_version: "127",            // action.openPopup for every extension; WebSocket keepalive needs 116
    permissions: ["storage", "tabs", "scripting", "declarativeNetRequestWithHostAccess"],
    host_permissions: ["<all_urls>"],          // the exam host is known only at run time
    web_accessible_resources: [{ resources: ["blocked.html"], matches: ["<all_urls>"] }],
    key: process.env.LOCK_DEV_PUBLIC_KEY,      // fixed extension ID, which the app checks as the origin
  },
});
```

- The redirect rule uses `regexFilter: "^https?://([^/:?#]+)"`, `excludedRequestDomains` set to the allowed hosts, `resourceTypes: ["main_frame"]`, and `regexSubstitution` to `chrome-extension://<id>/blocked.html?host=\\1` ([declarativeNetRequest](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest)). It is set with `updateSessionRules({ removeRuleIds, addRules })`, so a restart never duplicates it.
- Content scripts register at lock time with `chrome.scripting.registerContentScripts` for the allowed hosts at `document_start` and with `persistAcrossSessions: false`; `executeScript` covers the tab already open.
- The bar and the E.6 toast render through WXT’s `createShadowRootUi`, so page styles and Üki styles never mix ([WXT content scripts](https://wxt.dev/guide/essentials/content-scripts)). The bar spans the window and pushes the page down by its Figma height.
- Lock state, saved tabs and the pairing live in `chrome.storage.local`. After a service worker or browser restart the Lock reconnects, re-adds the session rule and re-registers its scripts.
- While locked the toolbar popup is switched off; E.8 arrives in Phase 1.
- `<all_urls>` brings the broadest install warning and a longer store review. Phase 0 accepts it; Phase 2 revisits it before the store release.

### Pairing (E.3)

1. The app runs a WebSocket server in its main process with the `ws` package, on 127.0.0.1 only, at the first free port of 47801, 47802 and 47803. It accepts a connection only when the `Origin` header is `chrome-extension://<Üki Lock ID>`, so no web page can connect.
2. The service worker owns the connection. It tries the three ports at startup and every 2 seconds until one answers; the popup shows “Open the Üki app” until then, and closing the popup never drops the link.
3. Both sides send `ping` every 5 seconds. From Chrome 116, WebSocket messages keep an extension’s service worker alive, so the link survives a quiet exam ([WebSockets in service workers](https://developer.chrome.com/docs/extensions/how-to/web-platform/websockets)).
4. The popup asks the service worker to pair, which sends `pair.request`. The app makes a 6-digit code with `crypto.randomInt`, valid for 2 minutes, shows it on its pairing card, and sends `pair.code`.
5. The popup shows the same code, the device and the student name. Pair sends `pair.confirm`; the app checks code and expiry, stores the pairing, and answers `pair.ok`.

The code shows the student that this browser pairs with this app. The origin check keeps web pages out; a local program could still forge the header, and Risks lists this limit.

### Lock messages

Every message is a Zod schema in `packages/contracts/src/lock.ts`, sent as one JSON text frame.

| From | Type | Fields |
| --- | --- | --- |
| Lock | `hello` | `lock_version`, `browser`, `install_id` |
| App | `hello` | `app_version`, `os`, `paired`, `student_name` |
| Lock | `pair.request`, `pair.confirm` | `code` on confirm |
| App | `pair.code`, `pair.ok`, `pair.fail` | `code`, `expires_at`; `reason` on fail |
| App | `exam.state` | `mode`, `title`, `starts_at`, `ends_at`, `allowed_hosts`, `lms_url`, `done_path`, `phase`, `watch` label, locale; on change and every 5 s |
| App | `lock.start`, `lock.release` | `reason` on release: submitted, time\_up or ended |
| Lock | `lock.started`, `lock.released` | `tabs_closed`; `tabs_restored` |
| Lock | `lock.event` | `type`, `data`, `at` for tab.blocked, site.closed, copy.blocked, lock.fullscreen\_exit, exam.submitted |
| Both | `ping`, `pong` | Every 5 s; three missed answers mean the link is down |

### Mock exam portal

`apps/lms-mock` is a static Vite site that stands in for the KRU exam portal in browser exams. It has three pages built from the portal parts of E.4, E.5 and E.9: the quiz page, the attempt and the review. Vercel serves it as its own project; locally it runs on port 5180, and the seed takes its URL from `SEED_LMS_URL`.

## Localization

Student screens and Üki Lock run in Kazakh, Russian and English from one catalog, with Kazakh as the student default. Phase 0 uses the 135 keys from Figma plus 87 keys this plan adds for screens the sheets do not cover yet: 222 keys in catalog.json, which ships with this plan.

### Files and build

- Copy catalog.json to `packages/i18n/catalog.json`. Each entry holds key, group, source, en, kk, ru and notes. Sheets S.1 (171:15780) and S.2 (172:15868) stay the design reference.
- `pnpm i18n:build` writes `messages/en.json`, `kk.json` and `ru.json` as nested objects. It parses every message with `@formatjs/icu-messageformat-parser`, checks that all three languages use the same placeholders, and fails on a missing or empty message. CI runs it.
- next-intl on the web and use-intl in the desktop app and the extension read the same files.
- Dashboard strings live in the same package under `dashboard.*`: English only in Phase 0, taken from the Figma frames; Russian arrives in Phase 1.

Nested messages cannot hold a key that is both a message and the start of other keys, so the build renames five catalog keys:

| Catalog key | Key in code |
| --- | --- |
| `app.title` | `app.title.default` |
| `event.phone` | `event.phone.title` |
| `done.submitted` | `done.submitted.label` |
| `done.time_used` | `done.time_used.label` |
| `done.flags` | `done.flags.label` |

### Plurals, numbers and dates

Eight messages depend on a count: `check.preview.status`, `exam.camera.faces`, `identity.help.body`, `rules.eyes.body`, `event.browser_locked`, `done.flags.value`, `ended.answered.value` and `lock.done.body`. English uses one and other, Russian one, few, many and other. Kazakh keeps the noun singular after a number, so most Kazakh lines need no plural block.

```json
{
  "en": "{count, plural, one {# face} other {# faces}} · good light",
  "ru": "{count, plural, one {# лицо} few {# лица} many {# лиц} other {# лица}} · свет хороший",
  "kk": "{count} бет · жарық жақсы"
}
```

- Confidence uses `{confidence, number, ::.00}`, which prints 0.94 in English and 0,94 in Kazakh and Russian, as S.2 asks.
- Times and dates use `Intl.DateTimeFormat` in `Asia/Almaty` with the student’s locale; the receipt date follows the catalog note for `done.submitted.value`.
- Geist must draw Ә Ғ Қ Ң Ө Ұ Ү Һ І; the day-1 check and the Inter fallback are in Design system in code.

### Who sees which language

- Students start in Kazakh and switch on 1.1 with ҚАЗ, РУС and ENG. The choice goes into `join_exam` and stays on the laptop.
- Üki Lock follows the app: `exam.state` carries the locale.
- Proctor presets travel as keys (`message.preset.*`), so each student reads them in their own language. Free text arrives as typed.

### What this plan added

| Group | Keys | Frames | Note |
| --- | --- | --- | --- |
| Offline | 8 | 2.1a | English from the frame |
| Paused by proctor | 8 | 2.1c | One line reworded to fit any proctor |
| Ended by proctor | 9 | 2.1d |  |
| Message and new end time | 10 | 2.1e, 2.4b, 2.5 | Includes four message presets |
| Exam | 1 | none yet | Submit on the last question |
| Check failures | 8 | none yet | Failure lines for 1.2 and 1.3 |
| Pairing | 12 | E.3 | Popup and the app’s pairing card |
| Ready to lock | 12 | E.4 | A portal-only note for Phase 0 |
| Copy blocked and site closed | 7 | E.6, E.7 | A portal-only body for Phase 0 |
| Lock released | 11 | E.9 |  |
| Tray | 1 | none yet | Tray menu during browser exams |

Thirteen added keys carry `source: added-not-in-figma`: the ten in the “none yet” rows, the two portal-only lines and the reworded pause line. Design draws or confirms them in Phase 1. Every Kazakh and Russian line, from Figma or added here, is a first pass, and a Kazakh and a Russian speaker read them before Demo Day.

The card match changes two lines: `identity.face.ok`, from Figma, and `identity.face.fail` now name the photo on the card instead of an enrolment photo, in all three languages. Design updates 1.3 in Phase 1.

## Security and privacy

Camera video never leaves the laptop, only flagged stills travel, and row-level security guards every table. This is a hackathon build: no legal review, no consent forms and no data-residency work.

### Data Phase 0 holds

| Data | Where | Who can read it |
| --- | --- | --- |
| Staff name, email, role | `auth.users`, `staff` | Exam office of the workspace |
| Roster: name, student number, email, group | `students` | Exam office; proctors of assigned exams |
| Answers | `answers` | Exam office; proctors of the exam |
| Events, without images | `events` | Exam office; proctors of the exam |
| Identity result and score | `sessions` | Exam office; proctors of the exam |
| Flagged stills, JPEG | Private `frames` bucket | Same, through signed URLs that last 5 minutes |
| Audit log | `audit_log` | Exam office |
| Camera video, the card image, face descriptors | Memory on the laptop only | Nobody |

### Controls in Phase 0

- Row-level security on every table, tested for each role (see Testing).
- The apps carry only the publishable key. The secret key lives only in your local `.env`, for the seed and demo scripts; Edge Functions get theirs through `@supabase/server`. gitleaks runs in CI on every push.
- The `frames` bucket is private, accepts only `image/jpeg` up to 200 KB, and each upload URL is for one path under `frames/{exam_id}/{session_id}/`.
- `join_exam` allows 10 tries a minute per user and answers `invalid_code` both for an unknown code and for a student number not on that roster.
- A session binds to the first anonymous user that joins it. Another user gets `already_joined`, and the card match stops anyone writing with someone else’s card.
- The local WebSocket listens on 127.0.0.1 only and accepts only the Üki Lock origin.
- The desktop app and Üki Lock send no telemetry; the Lock runs no remote code and injects scripts only on allowed exam hosts.
- Üki never decides alone. A flag is a signal for a person; no event ends an exam or labels a student, and only a proctor’s end command ends a session.

## Infrastructure and delivery

Phase 0 runs on your laptop and on one Supabase Cloud project in Frankfurt, with the dashboard and the mock portal on Vercel; the same setup serves Demo Day. GitHub Actions checks every push and deploys migrations and Edge Functions from `main`; Vercel deploys the web apps.

### Environments

| Environment | Supabase | Web and mock portal | Used for |
| --- | --- | --- | --- |
| Local | Supabase CLI, `supabase start` | `pnpm dev`, ports 3000 and 5180 | Building and tests |
| Cloud | One project in Central EU (Frankfurt), `eu-central-1` | Two Vercel projects: `apps/web` and `apps/lms-mock` | Every merge to `main`; Demo Day |

On Thursday 15 October the demo build gets the tag `demo-2026-10-16`, and `main` takes no deploys until Demo Day ends.

### Cloud setup

1. Create the project in the Supabase dashboard with the region Central EU (Frankfurt) ([regions](https://supabase.com/docs/guides/platform/regions)).
2. Switch on anonymous sign-ins in its Auth settings ([anonymous sign-ins](https://supabase.com/docs/guides/auth/auth-anonymous)).
3. Run `supabase link --project-ref <ref>`, then `pnpm supabase:deploy`: the migrations also enable `pg_cron` and schedule `session_tick`, and the four Edge Functions deploy.
4. Load `supabase/seed.sql` once with `psql` and the project’s connection string, then run `scripts/seed-staff.ts`; `pnpm demo:reset` takes it from there.
5. Create two Vercel projects from the repository, with the root directories `apps/web` and `apps/lms-mock`, and set their environment variables.
6. Put the project URL and the publishable key into the desktop app’s build variables.

The project uses the new API keys: publishable (`sb_publishable_…`) in the apps and secret (`sb_secret_…`) in scripts. The legacy `anon` and `service_role` keys are deprecated by the end of 2026, so Phase 0 never uses them ([API keys](https://supabase.com/docs/guides/api/api-keys)).

### Pipelines

| Workflow | Runs on | Steps |
| --- | --- | --- |
| `ci.yml` | Every push and pull request | pnpm install with cache; `pnpm check`; `pnpm i18n:build`; gitleaks; `supabase start` with the database and function tests; the dashboard smoke test; builds of web and the Lock; desktop builds on macOS and Windows runners, unsigned |
| `deploy-supabase.yml` | Push to `main` after CI passes | `supabase link`, `supabase db push`, `supabase functions deploy` |
| Vercel | Every push | Preview deploys for branches, production for `main` |
| `desktop-dist.yml` | Manual | Installers for macOS arm64 and x64 and Windows x64, attached to a draft GitHub release |

### Secrets

| Secret | Lives in | Used by |
| --- | --- | --- |
| Project URL and publishable key | Vercel environment variables; desktop build variables | Web, desktop app |
| Secret key | Your local `.env` only | Seed and demo scripts |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF` | GitHub secrets | `deploy-supabase.yml` |
| `LOCK_DEV_PUBLIC_KEY` and its private key | Repository variable; the private key stays on your laptop | A fixed unpacked extension ID |
| `SEED_STAFF_PASSWORD`, `SEED_LMS_URL` | Local `.env` | Seed scripts |

Edge Functions read no key themselves: `@supabase/server` takes them from the platform ([Edge Function secrets](https://supabase.com/docs/guides/functions/secrets)).

### Later phases

- Code signing, notarization and auto-update arrive in Phase 2, with the installer page 1.0.
- A separate production project and uptime monitoring arrive with the pilot.

## Work plan

Eleven work packages run from Wednesday 7 to Saturday 10 October in the order their Needs column allows; the detection and pairing spikes land on day 2 because they carry the most risk. Each package ends with a check: the Run by column says whether the agent or you run it, and the result goes into `docs/phase-0-exit.md`.

| WP | Day | Builds | Needs | Done when | Run by |
| --- | --- | --- | --- | --- | --- |
| 0.1 Repository | Wed 7 | Monorepo, Biome, Vitest, lefthook, CI skeleton; the starter files in place (CLAUDE.md, `docs/`, `catalog.json`, `figma-variables.json`) and `docs/decisions.md`; `pnpm i18n:build`, next-intl and use-intl wiring; the Kazakh glyph check | Nothing | `pnpm check` passes locally and in CI; a sample screen renders a key in kk, ru and en | Agent |
| 0.2 Design system | Wed 7 to Thu 8 | `packages/tokens` from `figma-variables.json` and the CSS printed in Design system in code; Tailwind theme, text styles, fonts; `packages/ui` primitives from the component table | 0.1 | A gallery route in web and desktop shows every primitive in every state next to its Figma screenshot; `pnpm tokens` reproduces the printed CSS | Agent |
| 0.3 Database | Wed 7 to Thu 8 | Migrations, RLS, functions, triggers, the cron job, `seed.sql`, `seed-staff.ts`, generated types | 0.1 | `pnpm db:reset` and `supabase test db` pass: RLS for each role in Test layers; `join_exam` returns a session, `invalid_code`, `already_joined` and `lobby_closed`; every row of Session states holds | Agent |
| 0.4 API and realtime | Thu 8 | `ingest`, `frames`, `command` and `stills` on `@supabase/server`; `start_exam`; Zod contracts | 0.3 | Integration tests: 50 events stored once with the server’s review value; a staff client gets the broadcast within 1 s; a command reaches the session channel; a still uploads and confirms | Agent |
| 0.5 Detection | Thu 8 | Worker, Face Landmarker, Object Detector, rules engine, the card match with Human and Tesseract.js, stills, developer overlay | 0.1 | The performance budget holds on the M1 Air and the Core i5 laptop, also with the window hidden; every Tuning moment fires 5 times out of 5; the card match accepts your own card and rejects someone else’s | Agent builds; you measure on the laptops |
| 0.6 Desktop app | Thu 8 to Fri 9 | Window and lockdown, the `uki://` protocol, `window.uki`, process scan, XState flow, the 14 screens on i18n keys, outbox, commands | 0.2, 0.4, 0.5 | Join to receipt on macOS and Windows; a 2-minute network cut loses nothing; scripted commands show 2.1c, 2.1d and 2.1e within 1 s | Agent; you run both laptops |
| 0.7 Web dashboard | Fri 9 | Sign-in, overview, lobby, live wall, drawer, actions, dialogs | 0.2, 0.4 | With `pnpm demo:simulate` running 120 sessions, the wall follows events within 1 s; a proctor sees only assigned exams | Agent |
| 0.8 Üki Lock | Thu 8 spike; Fri 9 to Sat 10 | Thursday: the app’s WebSocket server and a service worker that connects, pings and stays alive through 10 quiet minutes, in Chrome on macOS and in Chrome and Edge on Windows. Then the extension, pairing, lock and release, block page, mock portal | 0.1; 0.6 after the spike | Pairing by code; a second tab closed with `tab.blocked` on the wall; a blocked site on E.7 with `site.closed`; copy blocked; tabs restored on release | Agent; you run the real browsers |
| 0.9 Languages | Sat 10 | A Vitest render test that switches every student and Lock screen between kk, ru and en | 0.6, 0.8 | No raw key and no missing message on any screen | Agent |
| 0.10 Cloud deploy | Fri 9 | The linked Supabase project, `pnpm supabase:deploy`, `deploy-supabase.yml`, the two Vercel projects and their environment variables | 0.3, 0.4, the projects you create | The dashboard on Vercel signs in against the cloud project with seed data; a merge to `main` deploys migrations, functions and web | Agent, with the keys from you |
| 0.11 Exit review | Sat 10 | Every exit criterion run against the cloud project, with evidence | All | All 11 exit criteria ticked, with a CI link, a network log and a screen recording; tag `phase-0` | You |

### Your tasks

These need you, not the agent:

- [ ] Create the Supabase project in Frankfurt and the two Vercel projects, and put the keys into GitHub secrets and your local `.env`, on Wednesday 7 October.
- [ ] Print two mock student cards on Thursday 8 October: your photo with 20231187, and the Windows laptop student’s photo with 20231455, both with large digits.
- [ ] Have the Windows laptop with an 8th-gen Core i5 ready on Thursday 8 October.
- [ ] Make the Üki Lock key pair and keep the private key out of the repository.

### Day by day

&#91;embedded content: Phase 0 day by day · Wed 7 to Fri 16 October\]

Thursday carries six packages at once. Anything unfinished on Saturday moves to Sunday morning, before Phase 1 starts.

Phase 1, Sunday 11 to Thursday 15 October, builds the Demo Day screens on top of this skeleton; its own plan follows the Phase 0 exit review.

## Demo script and seed data

The Phase 0 skeleton must run one exam in the app on a MacBook and one browser exam with Üki Lock on a Windows laptop, watched live from the dashboard. The seed rebuilds the KRU world from the Figma frames, and a simulator fills the rest of the wall.

### Seed

`supabase/seed.sql` holds the workspace, groups, exams and roster; `scripts/seed-staff.ts` creates the staff accounts.

| Staff | Email | Role | Assignment |
| --- | --- | --- | --- |
| Dana Akhmetova | dana.akhmetova@kru.test | Exam office | Faculty of Mathematics |
| Aigerim Sadykova | aigerim.sadykova@kru.test | Proctor, lead | Mathematics 2, seats 1 to 64, Kazakh and Russian |
| Nurlan Bekov | nurlan.bekov@kru.test | Proctor | Mathematics 2, seats 65 to 128, Russian and English |
| Gulnara Kassenova | gulnara.kassenova@kru.test | Proctor | Physics 1 · Quiz 3 |

| Exam | Code | Groups | Start, length | Mode | Status |
| --- | --- | --- | --- | --- | --- |
| Mathematics 2 · Midterm | MATH2-204-FRI | 204, 128 students | Demo time, 90 min; lobby 20 min before | App | Scheduled |
| Physics 1 · Quiz 3 | PHYS1-102-FRI | 101 to 103 | Demo time, 40 min | Browser, `lms_url` = mock portal, `lms_done_path` = `/physics-1/quiz-3/review` | Live |
| History of Kazakhstan · Test | none | 110, 140 students | Wed 7 Oct 11:00, 60 min | App | To review, 7 flags |
| Linear Algebra · Final | none | All groups, 212 students | Tue 13 Oct 09:00, 180 min | App | Draft |
| English B2 · Reading | none | 301, 96 students | Sat 3 Oct 15:00, 50 min | App | Reviewed |

- Mathematics 2 seeds 20 single-choice questions in Kazakh, Russian and English, with question 7 as in 2.1.
- The named students from 1.5 and 2.4 keep their numbers: Madina Tulegenova 20231187 at seat 23, Arman Bekzhanov 20230912, Dias Kenzhebekov 20231044, Aruzhan Kassymova 20231219, Zhansaya Omarova 20231302, Yerlan Tokhtarov 20230877. Other students get generated Kazakh names.
- Aliya Seitkali, 20231455, writes Physics 1. Gulnara’s surname and Aliya’s number are seed values; Figma shows neither.
- Two printed mock student cards carry 20231187 and 20231455 with the photos of the people at the two demo laptops, for the card match.

### Demo commands

| Command | What it does |
| --- | --- |
| `pnpm demo:reset` | Clears demo sessions, events and stills on the cloud project; sets Mathematics 2 to start in 15 minutes with the lobby open, and Physics 1 to have started 5 minutes earlier, so it shows as live |
| `pnpm demo:simulate` | Runs 120 simulated Mathematics 2 sessions with the secret key, writing sessions and events on a script that reproduces the states in 1.5 and 2.4 |

Simulated tiles are labelled as simulated in the presenter’s notes, and the presenter says so on stage.

### Script

1. Dashboard: Dana signs in (A.0). The overview (0.1) shows Mathematics 2 next, Physics 1 live, History to review, and 0 MB of video.
2. Aigerim opens the Mathematics 2 lobby (1.5). Simulated students join; Madina’s MacBook joins with MATH2-204-FRI and 20231187.
3. On the MacBook, 1.2 shows Telegram open in red and asks for Üki Lock; Madina closes Telegram, pairs the Lock by its code (E.3) and checks again. 1.3 matches her face to the card photo; 1.4 shows the rules.
4. Aigerim presses Start exam. The MacBook goes to 2.1 within 1 second, browser locked.
5. Madina looks away for 3 seconds: her tile turns to a warning and the event appears in Live events.
6. Madina lifts a phone: 2.2 shows on the laptop, the tile shows “phone 0.94”, and the drawer (2.5) shows the still.
7. Aigerim sends “Phones away, please” (2.4b). The MacBook shows 2.1e in Kazakh.
8. Wi-Fi off for 30 seconds: 2.1a shows and answers keep saving. Wi-Fi back on: the events arrive and nothing is lost.
9. Madina leaves the camera for 10 seconds: 2.3 pauses her and the wall shows it; I’m here resumes.
10. Aigerim adds 10 minutes for everyone (2.4c): the MacBook timer shows +10 min. She pauses and resumes Madina (2.1c), and ends a simulated student with a reason (2.4e).
11. Madina submits and gets her receipt (3.1).
12. Windows laptop: Aliya joins PHYS1-102-FRI in the Üki app, pairs Üki Lock by code (E.3), and presses Lock and start (E.4).
13. In the locked portal (E.5), copy is blocked (E.6) and wikipedia.org lands on the block page (E.7); both appear on Gulnara’s wall.
14. Aliya finishes the attempt: the Lock releases and her tabs come back (E.9).

The run takes about 12 minutes. Rehearse it at the Phase 0 exit review on Saturday 10 October, and twice on the demo laptops before Demo Day, with a phone hotspot as the network fallback.

## Testing and quality gates

Pure logic gets unit tests, the database and functions run against a real local Supabase, and one Playwright smoke test covers the dashboard; the desktop app and Üki Lock are checked by hand on the two demo laptops. A merge to `main` needs CI green; the exit criteria need recorded evidence.

### Test layers

| Layer | Tool | Covers |
| --- | --- | --- |
| Unit | Vitest | Detection rules replayed from recorded signal traces; the tile state function; timer math; outbox order and retries; Zod contracts; the i18n build checks; every student and Lock screen rendered in kk, ru and en |
| Database | pgTAP through `supabase test db` | RLS for exam office, assigned proctor, other proctor, session owner and other student; `join_exam`, `start_exam`, `submit_session`; the broadcast triggers |
| Functions and realtime | Vitest against `supabase start` and `supabase functions serve` | `ingest` idempotency and the review map; `frames` path checks; `command` rights and group scope; a staff client receives a broadcast within 1 s |
| Dashboard | Playwright | Sign-in, the live wall updating from injected events, a pause command reaching `session_commands` |

### Hand checks on the demo laptops

- The whole demo script on both laptops, against the cloud project.
- macOS: Cmd+Tab, Force Quit and the menu bar do nothing during lockdown; a screenshot shows no exam window.
- Windows: Alt+Tab and the Windows key refocus the exam and log `tab.blocked`; a screenshot shows no exam window.
- Üki Lock pairs in Chrome on macOS, and in Chrome and Edge on Windows, and stays paired through 10 quiet minutes.
- A network log of a 10-minute exam from a development build shows no image upload outside `frames/`.
- Every student screen shows the Kazakh letters in Geist, or in the fallback.

### Gates on every merge to main

- `pnpm check`: Biome, `tsc --noEmit` and Vitest.
- The database and function tests, and the dashboard smoke test.
- A Biome GritQL plugin rejects JSX text that is not an i18n key; a CI search rejects colour literals and pixel sizes in component files.

Every exit criterion gets a row in `docs/phase-0-exit.md` with its evidence: a CI run, a network log or a screen recording, and the date.

## Risks and fallbacks

The biggest risks are detection speed and accuracy on ordinary laptops and the link between Üki Lock and the app; each has an early signal and a fallback that keeps Demo Day intact. Sorted by harm to Demo Day.

| Risk | Early signal | Fallback |
| --- | --- | --- |
| Detection under 15 fps on the Core i5 laptop | The day-2 spike | 480 × 360 input; landmarks every second frame with time-based rules; phone checks once a second; CPU delegate if WebGL in the worker misbehaves |
| Phone detection misses or false flags | Tuning on day 2 and 3 | Score 0.9 over 3 checks; the demo holds the phone upright to the camera |
| Gaze fails with glasses, a headscarf or dim light | Tuning with the overlay | Head pose only with wider limits; a four-corner calibration on 1.4 in Phase 1 |
| The card match rejects a real student | Rehearsals | Three tries, then 1.3a; a backup demo exam with `checks.identity` off; cards printed with a large, sharp photo and large digits |
| The service worker loses the WebSocket | The Thursday pairing spike | Reconnect every 2 seconds with the saved pairing; `lock.app_disconnected` only after 15 seconds down |
| Another local program connects to the app’s socket and poses as Üki Lock | Known limit | The origin check stops web pages; Phase 2 checks the connecting process: its code signature on macOS, its executable path on Windows |
| Venue network blocks websockets or drops | A rehearsal at the venue | A phone hotspot; the outbox covers drops of minutes |
| Kostanay to Frankfurt latency pushes events past 1 s | The day-2 realtime test from Kostanay | Flag events flush at once; if the 95th percentile stays above 1 s, the demo promises 2 s |
| Realtime private channels refuse to connect | Function tests on day 2 | `postgres_changes` subscriptions under RLS, enough for two laptops and the simulator |
| Rehearsals hit the limit of 30 anonymous sign-ins an hour | A join that fails with a rate-limit error | Raise the limit in the project’s Auth rate limits |
| macOS screen recorders on ScreenCaptureKit still capture the exam | Known platform limit | The process scan names screen-sharing tools; documented as a limit |
| Gatekeeper or SmartScreen blocks the unsigned app | First install on each demo laptop | Build on the laptop itself; the runbook steps for quarantine and SmartScreen |
| Kazakh or Russian copy errors on stage | Native speakers read the demo screens | A read-through of the demo screens by Thursday 15 October |
| Phase 1 work does not fit before Demo Day | Phase 0 exit slips past Sunday | Cut order: lobby polish, overview stat cards, the browser exam; the app exam and the live wall stay |

## Open questions

Nine questions are open; the plan runs on the assumption in the second column until someone answers. The first blocks work this week.

| Question | This plan assumes | Who answers | Needed by |
| --- | --- | --- | --- |
| Which laptops run Demo Day? | One MacBook (M1 Air or newer), one Windows laptop with an 8th-gen Core i5, one dashboard laptop | You | Oct 8, 2026 |
| Does Watch camera in 2.4a stay? | Hidden: live video contradicts “Video never leaves the laptop” | You | Oct 11, 2026 |
| What does the app show while the exam runs in the browser? | The window hides to the tray after 1.4; no frame exists | You | Oct 11, 2026 |
| Where do Resume exam (2.4a) and Submit (2.1) live? | A menu item and a button on the last question, with new strings | You | Oct 11, 2026 |
| Which wording wins for `identity.help.privacy`? | The catalog line, not the one drawn in 1.3a | You | Oct 11, 2026 |
| Who reviews the 87 added strings and the 13 without frames? | A Kazakh and a Russian speaker you trust | You | Oct 15, 2026 |
| Does the exam start on the clock or on Start exam? | Both: on the clock at `starts_at`, or earlier when the lead proctor presses Start exam | KRU exam office | Before the pilot |
| Do face-missing pauses give time back? | Yes, up to 5 minutes per session; every pause is logged and flagged | KRU exam office | Before the pilot |
| Which LMS does KRU use, and what is its finish page? | A mock portal with a fixed review path | KRU IT | Phase 2 |

## Agent instructions

This file ships as `CLAUDE.md` in the starter files and goes into the repository root in work package 0.1. It points the agent at this plan, the Figma frames and the catalog, and holds the rules every package follows.

```markdown
# Üki

Üki proctors university exams on the student's own laptop. Detection runs on the laptop; only events and flagged stills reach the server, one Supabase Cloud project in Frankfurt (`eu-central-1`). Built for the Qostanai Industry Hackathon; the case customer is KRU, Kostanay.

- `apps/desktop`: Electron 44 student app with on-device detection and exam lockdown
- `apps/web`: Next.js 16 dashboard for the exam office and proctors, on Vercel
- `apps/lock`: Üki Lock, a Manifest V3 extension built with WXT, paired with the app over a local WebSocket
- `apps/lms-mock`: static mock of the KRU exam portal for browser exams, on Vercel
- `supabase/`: migrations, Edge Functions and seed for the cloud project; the Supabase CLI runs the same stack locally

## Sources of truth

1. `docs/phase-0-plan.md`: the plan, exported as Markdown from the Claude Doc "Üki · Phase 0 build plan", next to `docs/design-handoff.md`. The plan's Decisions section is settled. To change a decision, write the reason in `docs/decisions.md` first.
2. Figma file `9RB9aBz6lzS6XHpf5do5Gh`. Pull a frame with the Figma MCP (`get_design_context`, then `get_screenshot`) and rebuild it with `packages/ui` and the tokens. Never invent a colour, size or string.
3. `packages/i18n/catalog.json` for every student and Üki Lock string. Students see Kazakh by default.

## Phase 0 frames

| Surface | Frame and node ID |
|---|---|
| Student app | 1.1 `51:2058`, 1.1a `151:11483`, 1.2 `51:2060`, 1.3 `51:2062`, 1.3a `151:11547`, 1.4 `51:2064`, 2.1 `51:2074`, 2.1a `180:18130`, 2.1c `180:18517`, 2.1d `181:16655`, 2.1e `199:18883`, 2.2 `51:2076`, 2.3 `51:2078`, 3.1 `51:2090` |
| Student app in Kazakh and Russian | Section "Languages · ҚАЗ and РУС" `167:14436` |
| Dashboard | A.0 `177:15946`, 0.1 `51:2046`, 1.5 `51:2066`, 2.4 `51:2080`, 2.4a `85:6504`, 2.4b `85:6635`, 2.4c `85:6750`, 2.4e `181:18746`, 2.5 `51:2082` |
| Üki Lock | E.3 `95:9192`, E.4 `97:9304`, E.5 `97:9529`, E.6 `98:9620`, E.7 `98:9737`, E.9 `98:10081` |
| Reference | Strings S.1 `171:15780` and S.2 `172:15868`; Event names `212:2039`; Windows and breakpoints `212:2521` |

## How to work

- This is a hackathon build: ready-made models, nothing self-hosted, no legal or consent work. Pick the smallest solution the plan allows.
- Work packages 0.1 to 0.11 from the plan, in the order their Needs column allows. One branch per package, for example `wp/0.5-detection`.
- A package is done when its agent checks pass, its hand checks are listed as pending, and you have written the evidence into `docs/phase-0-exit.md`.
- Compare every screen with the screenshot of its frame before you call it done.
- When the plan and Figma disagree, Figma wins for visuals and the plan wins for behaviour. Write the conflict into `docs/decisions.md`.

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
| `pnpm e2e` | The Playwright smoke test for the dashboard against the local stack |
| `pnpm supabase:deploy` | Pushes migrations and deploys Edge Functions to the linked cloud project |
| `pnpm demo:reset`, `pnpm demo:simulate` | Demo data on the cloud project |
| `pnpm --filter desktop dist`, `pnpm --filter lock zip` | Installers and extension zips |

## Rules

- TypeScript strict. Zod checks every boundary: Edge Function input and output, events, commands, Lock messages, Electron IPC.
- Components use Tailwind classes generated from `packages/tokens` only: no colour, size or radius literals.
- No user-facing string in code: every string is an i18n key. No emoji in product copy.
- Icons come from lucide-react only, through `packages/ui/src/icons.ts`.
- Electron renderers run with `contextIsolation`, `sandbox` and no Node integration; the preload exposes one typed `window.uki`.
- Nothing leaves the laptop except events and flagged stills. Never use `MediaRecorder`, never upload an image outside `frames/`, never load models, wasm or fonts from a CDN.
- Apps carry only the Supabase publishable key. The secret key stays in the local `.env` for scripts; Edge Functions use `withSupabase` from `@supabase/server`. Never use the legacy `anon` or `service_role` keys.
- Every table has row-level security; every new table gets pgTAP tests for each role.
- No third-party analytics, crash reporting or tracking.
- Client-made ids are UUIDv7. Timestamps are `timestamptz` in UTC; screens show `Asia/Almaty`.
- The server owns exam time; the app corrects its clock from `server_time`.
- Events are named and typed only in `packages/contracts/src/events.ts`; the server sets `review`.

## Git

- Conventional Commits, for example `feat(desktop): join screen`.
- Commits are authored as `k4ssymzhomart` and carry no co-author trailer.
- One pull request per work package, merged when CI is green.
```

## Sources

Every page below was opened while writing this plan; versions and limits were read on 7 October 2026.

### Stack and tooling

- [Node.js release lines](https://nodejs.org/en/about/previous-releases): Node.js 24 LTS
- [Next.js blog](https://nextjs.org/blog): Next.js 16.4
- [Next.js proxy.ts](https://nextjs.org/docs/app/api-reference/file-conventions/proxy): middleware renamed to proxy in Next.js 16
- [Tailwind CSS theme variables](https://tailwindcss.com/docs/theme): the token mapping
- [Electron releases](https://releases.electronjs.org/): Electron 44
- [Electron BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window): content protection, kiosk, always on top, background throttling
- [Electron native\_window\_mac.mm](https://raw.githubusercontent.com/electron/electron/main/shell/browser/native_window_mac.mm): kiosk presentation options on macOS
- [Electron native\_window\_views.cc](https://raw.githubusercontent.com/electron/electron/main/shell/browser/native_window_views.cc): kiosk is full screen only on Windows
- [Fontsource Geist](https://fontsource.org/fonts/geist/about): Geist 1.800 under OFL

### Detection and identity

- [MediaPipe Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker): landmarks, blendshapes, head transform
- [MediaPipe Object Detector](https://developers.google.com/edge/mediapipe/solutions/vision/object_detector): EfficientDet-Lite0, COCO labels, speed
- [Ultralytics licence](https://www.ultralytics.com/license): why YOLO is out
- [Human](https://github.com/vladmandic/human): MIT licence; face detection and descriptors in the browser
- [Human embedding guide](https://github.com/vladmandic/human/wiki/Embedding): 1024-number descriptors, `human.match.similarity`, 0.5 as a match
- [Tesseract.js README](https://raw.githubusercontent.com/naptha/tesseract.js/master/README.md): version 7, licence, character whitelist

### Browser and extension

- [WXT](https://wxt.dev/): one extension codebase for Chromium browsers
- [WXT content scripts](https://wxt.dev/guide/essentials/content-scripts): `createShadowRootUi`
- [WebSockets in extension service workers](https://developer.chrome.com/docs/extensions/how-to/web-platform/websockets): from Chrome 116, messages keep the worker alive
- [chrome.action](https://developer.chrome.com/docs/extensions/reference/api/action): `openPopup` from Chrome 127
- [chrome.declarativeNetRequest](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest): redirect rules and limits
- [chrome.management](https://developer.chrome.com/docs/extensions/reference/api/management): why pausing extensions waits for Phase 2
- [Edge DeveloperToolsAvailability policy](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-policies/developertoolsavailability): DevTools blocking needs policy

### Backend

- [Supabase regions](https://supabase.com/docs/guides/platform/regions): Central EU (Frankfurt), `eu-central-1`
- [Supabase API keys](https://supabase.com/docs/guides/api/api-keys): publishable and secret keys; `anon` and `service_role` deprecated by the end of 2026
- [Introducing Supabase Server](https://supabase.com/blog/introducing-supabase-server): `withSupabase` for Edge Functions
- [Edge Function secrets](https://supabase.com/docs/guides/functions/secrets): the keys and URLs the platform provides
- [createSignedUploadUrl](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl): signed upload URLs valid for 2 hours
- [Supabase anonymous sign-ins](https://supabase.com/docs/guides/auth/auth-anonymous): student sign-in; 30 an hour per IP by default
- [Supabase Realtime Broadcast](https://supabase.com/docs/guides/realtime/broadcast): `realtime.send` from the database
- [Supabase Realtime authorization](https://supabase.com/docs/guides/realtime/authorization): RLS on `realtime.messages`
