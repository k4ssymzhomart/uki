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
