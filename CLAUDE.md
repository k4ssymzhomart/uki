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
