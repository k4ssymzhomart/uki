# Decisions log

Changes to, and clarifications of, the Decisions section of `docs/phase-0-plan.md`. Newest last. Each entry says what changed, why, and who decided.

## 2026-10-07 · TypeScript 5.9, not 7

The plan says TypeScript 5. npm's `latest` is now 7.x (the native compiler). We pin `typescript@~5.9.3` so Next.js, electron-vite and WXT type checking behave as documented. Revisit after Demo Day.

## 2026-10-07 · Local Supabase on ports 547xx

This laptop already runs other local Supabase stacks on 543xx, 544xx, 555xx and 563xx. `supabase/config.toml` moves Üki to API 54721, DB 54722, Studio 54723, Mailpit 54724, pooler 54729. The local anonymous sign-in limit is raised to 1000 an hour so tests are not throttled; the cloud project keeps Supabase's default of 30 (see Risks).

## 2026-10-07 · Internal packages ship TypeScript source

`packages/*` export their `src/*.ts` directly; Next.js (`transpilePackages`), electron-vite, WXT and Vite compile them. No package build step except `tokens` and `i18n`, which generate files.

## 2026-10-07 · Contracts reach Edge Functions by copy

Edge Functions run on Deno and cannot import a pnpm workspace package. `pnpm functions:sync` (`scripts/sync-contracts.ts`) copies `packages/contracts/src` into `supabase/functions/_shared/contracts/` (gitignored) before `functions serve` and `functions deploy`. So the same files run in both places, relative imports inside `packages/contracts` carry explicit `.ts` extensions and the only external import is `zod`, mapped in `supabase/functions/deno.json`.

## 2026-10-07 · One working tree, one branch per work package

Agents build several work packages side by side in one working tree. Each package is committed on its own `wp/0.x-name` branch and merged into `main` with `--no-ff`. There is no remote yet, so there are no pull requests until the GitHub repository exists.

## 2026-10-07 · Catalog: three language-switch keys added (222 to 225)

The title bar's ҚАЗ, РУС and ENG switch (frame 2.1, App/Title bar 150:13352) had no catalog keys, and CLAUDE.md forbids strings in code. `language.kk`, `language.ru` and `language.en` were added to `packages/i18n/catalog.json` (group Shared, source figma), each with the same label in all three languages. The baseline commit keeps the catalog as shipped, so the addition is its own diff.

## 2026-10-07 · i18n build details

- `rules.eyes.body` needs a plural block only in Russian: the English "Look away for more than {seconds} s" uses a unit symbol that does not inflect, and its catalog note says "ICU plural (Russian)". The other seven count messages need plural blocks in English and Russian.
- The receipt date (`done.submitted.value`) is assembled from `Intl` parts into the catalog note's pattern, because plain `Intl` output differs from it in Kazakh and Russian.
- The build also rejects emoji, plural arms that are not categories of the language, plurals without `other`, duplicate keys and broken renames.
- Dashboard strings live in `packages/i18n/dashboard*.json` (English only in Phase 0) and are merged into `messages/en.json` only.

## 2026-10-07 · Tokens

- The dark block also redeclares `--uki-focus-ring`, so the focus ring follows the theme inside `[data-theme="dark"]` (a custom property resolves `var()` where it is declared). Every other declaration equals the plan's printed CSS; the generated files follow Biome's formatting.
- Geist and Geist Mono cover all 18 Kazakh letters (`pnpm --filter @uki/tokens glyphs`), so no Inter fallback is installed. "Inter Variable" stays in `--font-sans` as printed and is never loaded.

## 2026-10-07 · Contracts: shapes the plan left open

- `IngestStatus.step` is optional: calls during the exam send only `{ question }`.
- `IngestResponse` adds `session { state, ends_at, extra_min, paused_s }`, so the app's timer always follows the server and add_time is never applied twice after a restart.
- `PausePayload` takes an optional `text` (2.1c shows the proctor's message when there is one). `proctor.message` data is `{ text, scope }` or `{ preset, scope }`; presets travel as catalog keys.
- `lock.app_disconnected` data is `{ side: "lock" | "app" }` (from the Üki Lock section).
- The third and every later `lock.fullscreen_exit` of a session is a flag (count ≥ 3), so concurrent ingest calls cannot skip it.
- Lock messages: `lock.event` nests `{ id, at, type, data }` with a Lock-made UUIDv7 id so resends never duplicate; `exam.state` groups the exam under `exam` and adds `session_id`; phases are idle, lobby, ready, writing, paused, done; watch labels are watching and phone_found (keys `lock.watching`, `exam.phone.title`).
- `CommandRequest` refuses `start` (only `start_exam` issues it); the command function replies `command_ids: uuid[]`, not the table's `command_id`.
- Zod 4's `z.uuid()` and `z.iso.datetime()` replace the deprecated forms in the plan's snippet; server timestamps also accept Postgres's `+00:00`.
- `pauseCredit` drops partial seconds (`paused_s` is an integer), so a pause never adds time.
- Machine codes the plan did not name (`PairFailReason`, `ApiErrorCode`, start and submit error codes) are not user-facing.
- Receipt ids: `UKI-<group code>-<4 digits>-<2 initials>`, for example `UKI-204-0942-MT`.

## 2026-10-07 · Database

- `join_exam` returns its four errors as PostgREST error responses (HTTP 400, 409, 429) rather than raising, so the `audit_log` row that counts tries for `rate_limited` is not rolled back. supabase-js still sees `error.message` equal to the code.
- Columns beyond the plan's 0001_core: `sessions.pause_event_id` and `sessions.self_paused_s` (pause credit and the 300 s self cap), `events.app_version`, and a unique `(event_id, storage_path)` on `frames`.
- RLS is wider than the plan's table where the screens need it: staff read their own workspace, faculties, groups and staff rows; exam staff read `exam_groups`, `proctor_assignments` and `session_commands` of their exams; the exam office also writes students and groups. Students may only answer questions of their own exam.
- `submit_session` writes `exam.submitted` or `exam.time_up` (source server) and `session_tick` writes `exam.time_up`; the app does not send these through ingest. When an exam starts on the clock, no `start` command is sent: the app moves from 1.4 to 2.1 at `starts_at`.
- `session_tick` moves a paused session's end by its running pause, and sends an exam to review only after its join window has closed.
- `sessions_broadcast` also fires on insert (a new join appears in the lobby).
- `issue_command` accepts only message and add_time with group scope; pause needs writing, resume needs paused; a final session is a conflict. `start_exam` on a draft or cancelled exam is `not_found`.
- Seed: "110, 140 students" is read as group 110 with 140 students; Linear Algebra's 212 students are groups 204 and 101 to 103. The workspace is named "KRU · Kostanay" as in the 2.4 sidebar; unnamed wall students got generated names. `seed.sql` runs in one DO block because the CLI prepares seed statements up front.

## 2026-10-07 · Edge Functions

- `@supabase/server` 1.9.1 matches the plan (`withSupabase({ auth: "user" })`, `ctx.supabase`, `ctx.supabaseAdmin`). It rejects tokens signed with the legacy HS256 secret, so the cloud project must sign with an asymmetric key (ES256 or RS256); the local CLI already does.
- The gateway's `verify_jwt` is off for the four functions in `config.toml`: `withSupabase` verifies every token against JWKS itself.
- Each function has its own `deno.json` with exact versions (zod 4.6.5, @supabase/server 1.9.1, @supabase/supabase-js 2.117.2) because `supabase functions deploy` bundles without Deno's upward config lookup. Each bundle is about 15.9 MB of the 20 MB limit.
- The ingest limit of 10 calls a second per session is kept in memory per function instance (best effort).
- Idempotent internal calls retry once on 502, 503 or 504 (local Kong reuses closed keep-alive connections). `issue_command` is not retried.
- Locally, signed Storage URLs are rewritten from the Docker-internal `http://kong:8000` to the forwarded host; https cloud URLs are never rewritten.

## 2026-10-07 · Local stack runs without the edge runtime container

`supabase start` failed its health check while the edge runtime fetched Deno modules over this laptop's slow link, so `pnpm dev` starts Supabase with `-x vector,logflare,imgproxy,edge-runtime` and runs `supabase functions serve` itself.

## 2026-10-07 · UI kit: Figma visuals that need token-scale choices

- Figma's 1.5 px strokes are drawn as 2 px inset rings (Tailwind has no 1.5 step); inside strokes are inset rings so sizes match Figma in every state.
- Radii without a token are computed from token variables (checkbox 6 px, tooltip 8 px), never px literals. Other off-scale sizes use Tailwind's quarter steps of the 4 px scale.
- Where Figma draws no hover, focus or disabled state, components reuse the Button tokens.
- Icons follow Figma's drawings over the plan's example list: gaze is CircleDot (Figma draws an eyeball), check is CircleCheck (icon/check 7:90 is a circled tick), and 13 more mappings changed; see `packages/ui/src/icons.ts`.
- The Chip idle dot is solid ink, as every screen instance draws it (1.2, 1.5, 0.1), not the component set's muted 35 %.
- Art comes from the brand kit (`qostanai/brand`), which matches Figma's Faces 4:123 and mascot 3:24; SVG roots carry `aria-hidden`.
- StudentTile has Figma's ok, warn, flag and paused states only; the wall maps Done and No signal onto them until Design draws those.
- The macOS traffic lights have no tokens; components reserve their box and take a `windowControls` slot so Electron draws the native ones.

## 2026-10-07 · Detection

- MediaPipe tasks-vision loads in a module worker through `vision.ts` (the loader's `importScripts` is unavailable there).
- `face.missing` also gets up to 3 stills (it is a flag; the handoff has an empty-seat still). `gaze.down` is sent when the look ends, like `gaze.off_screen`. An event's `at` is the threshold-crossing time, so `captured_at = at + offset` matches the stills.
- One `phone.detected` per phone episode; it re-arms after the 2.2 warning clears (2 s without a phone).
- The phone model is EfficientDet-Lite0 int8 on CPU (the plan's "about 30 ms on CPU"); Face Landmarker tries GPU first. Human runs on WebGL (no extra wasm files).
- The identity similarity threshold 0.5 let a different person's low-resolution photo through at 0.53 in a smoke test: tune it on the printed demo cards (about 0.6 may be needed) and record the value here.
- Model binaries are gitignored; `pnpm --filter @uki/detection models` fetches them and writes a SHA-256 manifest, and `models:verify` checks it. Packaging must run both first.

## 2026-10-07 · App skeletons

- The renderer root is `apps/desktop/src/renderer/app.tsx` (kebab-case file, component `App`).
- Electron's default user agent contains "Üki", which `protocol.handle` cannot carry, so the app sends an ASCII user agent ("Uki/x.y.z").
- The CSP takes its scheme from `VITE_SUPABASE_URL` (http and ws for the local stack); only the electron-vite dev server adds `'unsafe-inline'` and localhost websockets for hot reload. Built pages get the plan's policy exactly.
- `extraResources` puts the models at `<resources>/resources/models`, so `uki://app/resources/models/...` is the same URL in development and packaged builds.
- macOS uses `titleBarStyle: "hiddenInset"` with the UI kit's title bar; Windows keeps the native frame until the Windows frame (2.1w, Phase 2) is decided.
- `NSCameraUsageDescription` uses the catalog's `join.privacy` English text; a test keeps them equal.
- WXT's dev server runs on 5183 (3000 is the dashboard); `pnpm dev` opens no browser.
- Next.js telemetry is disabled (`NEXT_TELEMETRY_DISABLED=1`), as CLAUDE.md allows no third-party analytics.
