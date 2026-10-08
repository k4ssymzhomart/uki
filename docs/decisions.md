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

## 2026-10-07 · Desktop main process and packaging

Decided by the WP 0.6 agents and the hardening run.

- The `window.uki` bridge, which the plan prints word for word, has five more members: `checks.cameraAccess()`, `checks.watch(on)`, `checks.onBlockedApps(cb)`, `lock.onStatus(cb)` and `lock.onPairCode(cb)`. The plan's bridge had no way to ask for the camera, start or stop the 15 s exam-time scan, push newly opened blocked apps, or show the relay's status and pairing code on the app's card. Zod still checks every call at the IPC boundary.
- The packaged app is named "Uki" in ASCII: bundle, executable, helpers, `/Applications/Uki.app` and installers `Uki-<version>-<arch>.<ext>`. With `productName: Üki` the macOS app died at launch with SIGTRAP ("Unable to find helper app"): the helper bundles were written with a decomposed Ü, while Electron looks them up with the precomposed `CFBundleName`. An ASCII rebuild runs. People still see Üki: `CFBundleDisplayName`, the NSIS `shortcutName` and `uninstallDisplayName`, and `app.name` (from `package.json`), which keeps the userData folder named Üki.
- macOS lockdown calls `app.focus({ steal: true })` first and passes `skipTransformProcessType: true` to `setVisibleOnAllWorkspaces`. If the window is not full screen 1.5 s later, it enters kiosk again, at most twice. Before this, kiosk failed in 1 of 3 live rounds; after it, 4 of 4 passed.
- Close and quit are refused in lockdown, in tray mode, and while the exam's process scan runs, so 2.1c, 2.1e and an offline submit are covered too. In tray mode, closing the window hides it. Tray mode alone was not enough: it turns off on those screens, and the review found a student could quit mid-exam. The development escape (Cmd/Ctrl+Shift+Q) also stops the scan.
- Lockdown blocks more shortcuts than the plan lists: hide, minimise, new window, the full-screen toggle, Cmd/Ctrl+Shift+Q, Ctrl+F4 and Alt+F4. It also resets Ctrl+wheel zoom.
- Packaged builds refuse to start with `--remote-debugging-*`, `--inspect*`, `--use-fake-device-for-media-stream` or `--use-file-for-fake-video-capture`. A debug port would let another program call `exam.lockdown(false)`, and a fake camera would feed recorded video to detection. No fuse covers these switches.
- Packaged builds have their own menus: on macOS only the app, Edit and Window menus (no reload, DevTools or zoom), and on Windows none.
- The main process inserts the receipt's print style around `printToPDF`. The renderer only marks the card with `data-uki-print="receipt"` and `data-uki-receipt-id` (used for the file name).
- Development-only switches for a shared Mac: `UKI_USER_DATA_DIR`, `UKI_DEV_IGNORE_APPS` (skips the blocked-app scan) and `UKI_DEV_NO_KIOSK` (quit stays blocked, the screen stays free). Packaged builds ignore them.
- Fuses stay in the `afterPack` hook, not in electron-builder's `electronFuses` option. In app-builder-lib 26.15.3 both run at the same point and give the same fuse wire on Electron 44. The hook uses the app's own `@electron/fuses` 2.1.3 and resets the ad hoc signature on macOS only.
- The built CSP stays exactly the plan's, with no `style-src`. A production build logged no style violations on any of the 14 frames in kk, ru or en. Only the UI kit's Dialog, Select and modal menus need inline styles, and `src/shared/csp.test.ts` fails if the student window imports one of them before the policy changes.

## 2026-10-07 · Desktop flow

Decided by the WP 0.6 agents and the review repairs.

- The app never sends `exam.submitted` or `exam.time_up`; the server writes both (see Database). When the Lock reports `exam.submitted`, the app calls `submit_session` and `lock.release`. It accepts that event only for its own session, only while a browser-mode lock is held, and only once per event id.
- Three fixed numbers moved into `THRESHOLDS` in contracts, so detection and the app share them: `phone.warningClearMs` 2000, `performance.lowFpsInput` 480 × 360 and `systemCheck.uniformMaxStd` 6.
- Pauses:
  - Detection goes idle during a proctor pause (2.1c), so a self-pause cannot end the proctor's.
  - A pause command that arrives during 2.3 opens 2.1c, and the self-pause ends there.
  - After a restart into a paused session, the app first reads the server's unacked commands and shows 2.3 only if none of them is a pause.
  - `session.resumed` is sent only from 2.3.
- Commands come over `session:{id}`, with the ingest reply as a fallback (see "Session commands and status detail"). Each is applied once by id and acked.
- Added minutes are counted per command id. The end uses whichever is larger: the server's `extra_min`, or the join's value plus the applied commands. So a late reply cannot take minutes back.
- A message or add_time that arrives before 2.1 is kept and shown as 2.1e when 2.1 opens.
- The language switch works on every frame, as Figma draws it in every title bar. The choice is kept in localStorage and in the saved join.
- 2.1a shows 5 s after the first failed or unanswered call. The window's offline event starts a probe at once, so 2.1a appears after about 5.3 s instead of at the next 10 s heartbeat, and `net.offline.offline_ms` covers the whole cut.
- Outbox rules the plan left open:
  - When the server refuses a batch of answers, they are resent one at a time and only the refused ones are set aside.
  - A 400 on an event batch narrows to one event and sets that one aside.
  - A still that was never captured is given up 20 s after its time.
  - Submit waits at most 10 s for the outbox, then calls `submit_session` with the 2/4/8/16/30 s backoff.
- Üki Lock link:
  - On 1.4 the Lock is told `lobby` until the exam can really start, so Lock and start stays off until the box is ticked.
  - `lock.start` is resent on every Lock hello, and whenever a Lock becomes paired, until `lock.started` comes back.
  - Lock event ids are remembered per session (outbox meta `lock-ids:<session>`), so a resent event is neither queued nor counted twice.
  - While the browser is locked, the link counts as up only when the paired install that sent `lock.started` is connected. An unpaired Lock counts as down. After an app restart, when the app does not know which install locked the browser, any paired Lock counts.
- The 15 s process scan runs in both exam modes, from the start until 3.1 or 2.1d; in browser exams the start is `lock.started`. Lost focus (`tab.blocked {app: null}`) is still reported in app exams only.
- Question loading backs off 2, 4, 8 and 16 s, then retries every 30 s. A permanent failure (`invalid_code`, `lobby_closed`, `already_joined`, other 4xx) keeps the spinner up and retries every 30 s, because no frame or key exists for that error.
- A detection worker that fails to start (for example, missing models) shows as a failed 1.2 camera row. The catalog has no line for it.

## 2026-10-07 · Desktop screens

Decided by the WP 0.6 screens agent and the hardening run. Design to draw the three states without a frame (last bullet).

- The catalog wins over frame text in five places: the 1.3 face row (`identity.face.ok`), the 1.3a hint pill (`identity.help.hint`), the 1.3a banner body (`identity.help.privacy`), the 2.1c log detail (`event.proctor_paused.detail`) and the 3.1 flags line (`done.flags.value`).
- Ask proctor shows on 1.3 only, as the plan says for Phase 0; Figma draws it in every exam footer.
- 1.3 Continue stays disabled until the card matches. Figma draws it enabled while the card row still says Checking.
- The 1.2 and 1.3 face frame is eight placed lime dashes, because a CSS dashed border cannot draw Figma's long gaps.
- Under 1280 px the camera preview shrinks to 400 × 323 (no frame shows that size). At 1024 × 700 the right column of 1.2 to 1.4 scrolls when Kazakh or Russian copy wraps.
- The question bar fills n / total, and the timer bar fills time left / exam length. Figma's fixed bar lengths match no field.
- The proctor appears as first name and initial ("Aigerim S.") on 2.1c, 2.1d and 2.1e, as Figma writes it. `shortName` in `@uki/ui` makes the short form and keeps digraphs such as "Zh".
- The E.3 pairing card floats over the lower left of 1.1 to 1.4 rather than opening a second window, so it has no title bar. Its radius is the 16 px token, because Figma's 14 px has no token.
- 1.1's title bar reads "Üki" (`app.name`), and the 1.4 FAQ shows its own answer (`rules.faq.video.answer`).
- No frame exists for three states: join errors (`already_joined` under the student ID; `lobby_closed`, `rate_limited` and `network` under the exam code, as in 1.1a), the offline title for exams without the Lock (`app.title.offline_unlocked`; "browser locked" only when the Lock has locked it), and the pairing card for an exam on another day (`pair.card.when.date`).

## 2026-10-07 · Üki Lock

Decided by the WP 0.8 agent and the review repairs.

- The redirect rule's `regexFilter` is `^https?://([^/:?#]+).*$`. Chrome replaces only the matched part of the address, so the plan's filter produced `blocked.html?host=127.0.0.1:5181/physics-1/...`; the smoke test caught it.
- The manifest adds an `icons` key. The toolbar icon switches between off, ready and locked images drawn from Figma 89:2491.
- Content-script fonts are inlined, so `blocked.html` stays the only web-accessible resource.
- Popup states with no frame reuse existing keys:
  - the app is absent (`lock.pair.open_app.*`);
  - paired and idle, which is also the view for app exams, because E.4 is for browser exams;
  - locked: time left and the allowed host. E.8's list is Phase 1.
- The popup header is `lock.name`. The device line is `lock.pair.device` with `os.macos` or `os.windows`; it has no OS version, because the app's hello carries none.
- E.4: the Üki app row and the Screen sharing row always pass, because the Lock cannot see either and the app's 1.2 already checked them. Other extensions is hidden (Phase 2).
- Copy guard:
  - E.6 shows on every cancelled attempt; the event goes out once per kind per 10 s.
  - A context-menu attempt shows the toast but sends no event, because CopyKind has no context-menu kind.
  - `window.print()` cannot be cancelled from the isolated world, so a print style blanks the page and the beforeprint event is logged as print.
- Rules 3 to 5 (copy guard, full screen, focus) apply to browser exams only. A full-screen exit counts only after the window has been seen in full screen. A browser that never grants full screen is asked 3 times, and nothing is logged.
- During a browser lock:
  - file://, chrome:// and data: pages in any tab go to the block page and are logged as `tab.blocked {host: null}`. The redirect rule cannot see these pages.
  - Lock and start also closes tabs in popup, app and incognito windows. Popup and app tabs come back as normal windows at release; incognito addresses are never saved.
  - Focus on another window whose page is not allowed counts as leaving the browser.
- The release at end + 2 min is now only a fallback for when the app is gone:
  - It runs on server time: the app sends `clock_offset_ms` with every `exam.state`.
  - It is skipped while the paired app reports the locked session as ready, writing or paused.
  - `lock.released` carries a `trigger` (done_path, app, exam_done or deadline).
  - A deadline release while the app still holds the lock is logged as `lock.app_disconnected {side: "lock"}`.
  - The bar and popup receive times converted to the laptop clock, so their countdowns are right.
- The Lock's outbox is scoped to the locked exam. `lock.event` carries `session_id`. Events go only to an app whose `exam.state` names that exam, and other exams' events are dropped. Before this, exam A's stored `exam.submitted` could submit exam B.
- Relay:
  - One Lock at a time, with one exception: while the connected Lock has said hello and is not paired, a second may connect and wait. If the second is the paired install, it takes the slot.
  - While an exam holds the browser, pairing requests get `pair.fail "no_code"`.
  - A wrong code is used up.
  - `extension://<id>` is also accepted for the same id, in case Edge reports that origin.
- New optional fields in the Lock messages: `exam.state.clock_offset_ms`, `lock.event.session_id` and `lock.released.trigger`.
- The mock portal has 5 questions; Figma draws 10. Its English and Russian copy lives in its own messages file and is rendered through `t(key)`, outside the Üki catalog, so the GritQL i18n rule still covers it.
- Local only: allowed hosts ignore ports, as declarativeNetRequest domains do. Allowing localhost:5180 in a local browser exam also allows the dashboard on localhost:3000.

## 2026-10-07 · Dashboard shell: sign-in, overview and lobby

Decided by the WP 0.7 agent and the review repairs.

- "Keep me signed in for 12 hours" is checked by default, as Figma draws it. @supabase/ssr always writes a 400-day cookie, so the server client, the proxy and the browser client rewrite every auth cookie's lifetime from a non-secret `uki-auth-lifetime` cookie: 12 hours from sign-in when checked, a session cookie otherwise.
- Only staff can sign in. The action looks for a `staff` row under RLS and signs anyone else out again.
- 0.1 has a Live filter tab: Figma draws All, Upcoming, Live and Done, while the plan lists three. The search field and the bell are hidden on every page, because nothing backs them.
- About 40 dashboard keys have no Figma source: sign-in errors, labels, empty tables, lobby steps and chips, and start errors. A few generalise Figma strings, for example "Card unreadable · retry {attempt} of {max}".
- Lobby:
  - Ready means state rules or ready.
  - Need help means a check-in state (joined, checking or identity) with a `status.detail`; `student.help_requested` is not counted.
  - Details without a Figma string (Lock, network, storage, other camera problems) show Need help with no detail line, and raw detail text is never shown.
  - `card:help:<n>` reuses the "retry 3 of 3" string, where 1.5b draws "3 of 3 tries".
- The 1.5 device column shows "<OS> · Üki <version>". The app collects neither the OS version nor the network type (Figma: "macOS 14 · Wi-Fi").
- The lobby's minutes-left line and the Start exam gate use server-corrected time (see "Live wall").
- The A.0 background is WebP q96 at 1536 × 1024 (1.92 MB to 168 KB). It keeps the film grain, which the Next.js optimizer's q75 output had turned into visible blocks.
- The i18n build's emoji check allows ©, ® and ™. Before, `\p{Extended_Pictographic}` matched ©, so Figma's footer failed the build.

## 2026-10-07 · Live wall and timeline drawer

Decided by the WP 0.7 agents, the hardening run and the review repairs.

- 2.4a: a click anywhere on the tile opens the menu. The ⋯ button replaces the status dot on hover, focus and while the menu is open, and the menu opens 12 px in from the tile, as Figma draws it. Watch camera and Mark reviewed stay hidden.
- 2.4c adds time for everyone only, because add_time is a group command, so Figma's single-student option is left out. The new end is the exam end plus the smallest `extra_min` among sessions that a group command reaches (rules, ready, writing, paused). A student still checking in no longer hides the extension.
- 2.5:
  - The student's three presets are tabs in the student's language, with Russian and English below; Figma shows one preset in three languages.
  - "Q 7 of 20" works for proctors too, through `exam_question_count`.
  - The evidence card says "Held for 6 s". Figma's "put away after the warning" has no data behind it.
- Event wording follows 2.4 and 2.5 where they show the event, and the Event names card (212:2039) otherwise.
- Gendered copy ("Keep him writing", "sent in her language") is an ICU select on a pronoun guessed from the surname ending: -ova, -eva, -ina and -kyzy give she; -ov, -ev, -in and -uly give he. Any other surname gets them/their, which Figma does not show; Design to confirm.
- A Done tile uses the ok look with the final state in its line. No signal uses the paused look.
- A group command writes one proctor event per student. The feed shows it once, grouped by `data.group_id`, so a group command cannot push flags out of the 100-row cap.
- The drawer is a custom `role=dialog`, because apps/web has no Radix dependency. Stills use `<img>`, so their signed 5-minute URLs never pass through the Next.js image cache.
- Loading:
  - The first render loads 60 minutes of flags and log events, plus every older `phone.detected` and `face.second`, so an old flag still marks its tile Flagged.
  - The cap of 300 events per session never drops phone, second-face or pause events.
  - Besides the catch-up on subscribe and focus, the wall re-reads events and sessions every 20 s, looking back 60 s. Realtime lost broadcasts while its replication restarted, and the channel stayed SUBSCRIBED, so no catch-up ran.
  - A catch-up read does not overwrite a session that a `session` message changed while the read was in flight; the lobby does the same.
- Clock:
  - The dashboard reads the `Date` header of two HEAD requests to `<supabase>/rest/v1/` with the publishable key. It keeps the faster reply and drops round trips over 2 s.
  - It applies the offset only when the gap is over 2 s. Without a usable reply it keeps the browser's clock.
  - This replaces the page's render time, which counted page-load time as clock skew.

## 2026-10-07 · Scripts and CI

Decided by the infra agent and the hardening run.

- `demo:simulate` creates no auth users. It inserts sessions with the secret key, each bound to a random `auth_uid`, and drives them through the service-only `ingest_batch`. Submit copies `submit_session` in two writes. Reasons: the cloud allows 30 anonymous sign-ins an hour per IP, and this leaves nothing to clean up.
- Simulated flags carry no stills, because fake images would be fake evidence. Every simulated session has `device.simulated = true`.
- `demo:reset` also restores the two demo durations (90 and 40 minutes) and, when `SEED_LMS_URL` is set, Physics 1's `lms_url`. It keeps audit rows and anonymous users.
- Root scripts beyond the plan: `guards`, `typecheck:scripts`, `test:scripts`, `typecheck:e2e`, `env:local`, `models`, `models:verify`, `e2e:load` and `test:integration:desktop`. `pnpm check` also runs the guards, the scripts and e2e type checks, and the scripts tests.
- The desktop stack test is a separate script. Appended to `test:integration`, it would receive the `--project functions-unit` argument meant for Vitest.
- Guards and Biome:
  - The colour guard ignores `sizes=` and `media=` values (responsive-image hints).
  - The GritQL plugin uses absolute-path globs (`**/apps/*/src/**/*.tsx`), because Biome 2.5 matches plugin includes against absolute paths.
  - The plugin's messages are plain ASCII, because Grit garbles text after an escape or a non-ASCII character.
  - `biome.json` now uses `preset: "recommended"`.
- CI:
  - The stack job starts Supabase without vector, logflare, imgproxy, edge-runtime and studio. The CLI matches image names, so "analytics" would exclude nothing.
  - It then runs `functions serve`, `seed:staff`, the integration tests, the desktop stack test and `pnpm e2e`.
  - The build job also builds Üki Lock and runs its smoke test headless.
  - `deploy-supabase.yml` runs in a GitHub environment named `cloud`, reads `UKI_ALLOWED_ORIGINS` from a repository variable and honours `DEPLOY_FREEZE`.
  - `desktop-dist.yml` builds both macOS architectures in one job.
  - gitleaks-action needs `GITLEAKS_LICENSE` on an organisation account.
- Both Vercel projects install with a filter (`web...` and `lms-mock...`), so Electron and WXT are never downloaded.
- The i18n build's turbo inputs are `dashboard*.json`, so editing `dashboard-wall.json` is not served from the cache.
- The README clone steps drop `cp .env.example` and `db:reset`: `pnpm env:local` writes `.env`, and the first `supabase start` loads the seed.
- `scripts/lib/perf/ingest-load.ts` is a load tool for the local stack only. It sends N students through the function or straight to the RPC and reports p50, p95 and p99, event-to-broadcast time, worker retirements and Server-Timing phases.

## 2026-10-07 · End-to-end tests

Decided by the e2e and desktop agents.

- `pnpm e2e` covers more than the plan's list. It also checks who sees which exam: the exam office sees all of them, a proctor sees only assigned ones, and another exam's proctor is refused by the pages, by RLS on 9 tables and by Realtime.
- The wall-under-load run has its own config (`pnpm e2e:load`, with `UKI_E2E_LOAD_SECONDS` and `UKI_E2E_START=1`). It runs for minutes and writes 120 sessions to Mathematics 2. Its 1 s budgets are soft, so a single run reports every leg that misses.
- Latency is measured on the host clock: the event's `at`, Realtime frames stamped in the page, and DOM changes. The Docker VM clock ran 0.3 to 1.9 s behind the host, so `received_at` is not used for timing.
- The desktop e2e (`pnpm --filter desktop e2e`):
  - It makes its own fixture exam in a `desktop-e2e-*` workspace, copying Mathematics 2's title, its 20 questions and Madina at seat 23. The seeded exam was already live, so `start_exam` would refuse it.
  - Its camera is a canvas stream drawn from the brand evidence pictures, with a student card on 1.3. This code is compiled only into development and `--mode e2e` builds; the production build was checked and contains none of it.
  - A stand-in Lock pairs on the app's socket.
  - `UKI_E2E_OFFLINE_S` sets the length of the network cut (default 20 s; criterion 8 needs 120), and `UKI_E2E_KIOSK=1` runs real kiosk mode.
- On the loaded shared stack the tests retry the way a person would: Check again on 1.2, Continue after a network error, a command re-sent after a 5xx, sign-in again after an Auth 504, and a new Realtime join. Each retry is recorded, and latency is timed from the attempt that worked.

## 2026-10-07 · Catalog: 13 keys added (225 to 238), six renames

Added by the hardening run; a Kazakh and a Russian speaker must review them (native review needed).

- New keys:
  - `app.name` ("Üki") and `lock.name` ("Üki Lock");
  - `os.macos`, `os.windows` and `lock.pair.device`;
  - `app.title.offline_unlocked`;
  - `pair.card.when.today` and `pair.card.when.date`;
  - `join.error.already_joined`, `join.error.lobby_closed`, `join.error.rate_limited` and `join.error.network`;
  - `rules.faq.video.answer`.
- Source `added` means a frame shows the text, and `added-not-in-figma` means it does not. The seven keys with source `added` are `app.name` (1.1, E.3 95:9379), `lock.name` (popup header 92:2533), `os.macos`, `os.windows` and `lock.pair.device` (E.3 95:9192), `pair.card.when.today` (E.3 95:9394) and `rules.faq.video.answer` (1.4a 87:8156). The other six are `added-not-in-figma`.
- Kazakh and Russian are first-pass translations, and every note says a native speaker must review them.
- `rules.faq.video` becomes `rules.faq.video.question` in code, so the answer can be `rules.faq.video.answer`. That makes six renames; the plan's Localization section says five, and 222 keys.
- Still without keys:
  - a label for an "Open camera settings" button on 1.2;
  - 2.3 copy for a lost camera;
  - 1.2 camera failure details per problem;
  - a 1.3 line for models that failed to load;
  - "Your timer is stopped." on its own;
  - a generic proctor noun for when no name is known.

## 2026-10-07 · Kazakh number and date formatting

Decided by the hardening run.

- Electron 44 (Chrome 152, ICU 78.2) and Chromium accept `kk-KZ` but format with root data: 0.94 stays "0.94", and a date reads "M10 9, Fri". Node has full ICU, so the unit tests did not see this.
- `@uki/i18n/polyfill` is the first import in the desktop renderer and in every Lock entry (popup, block page, content script).
  - It tests what the runtime actually prints: a decimal comma, a Kazakh month name and the Kazakh plural "one". Checking `resolvedOptions().locale` is not enough.
  - Where a test fails, Kazakh number and date formatting, `toLocale*String` included, goes to FormatJS with Kazakh-only data and Asia/Almaty.
  - Russian and English stay native, and Node is untouched. Plurals are already right natively, so the plural polyfill loads only if its test fails.
- A generator writes the data (`pnpm --filter @uki/i18n kk-intl-data`), and a unit test fails when the data falls out of date.
- The data is trimmed to save about 100 KB: time-zone names for Asia/Almaty and UTC only, and only the fallback pattern for date ranges. A Kazakh date in any other zone stays native: the time is right, but the names are not Kazakh.
- The bundle is 243,669 bytes, of which 75 KB is Kazakh data, against a 280 KB budget. `@formatjs/intl-getcanonicallocales`, `@formatjs/intl-locale` and `@formatjs/intl-relativetimeformat` are not added: Electron 44 and Chrome 127+ have the first two natively, and nothing uses relative time.

## 2026-10-07 · Session commands and status detail

Decided by the hardening run (migration `20261007200000_command_followups.sql`).

- `session_commands` gains `by_name`, `group_id` and `request_id` (unique per session). `issue_command` fills `by_name`, and a trigger fills it for `start_exam`'s rows. Students cannot read staff names, so 2.1c, 2.1d and 2.1e can now name the proctor after a reconnect.
- `issue_command` takes `p_request_id`, a UUIDv7; the command function makes one when the dashboard sends none.
  - A repeated id returns the first call's ids and writes nothing.
  - Reuse by another staff member, or for another command type, is 409.
  - This makes a single retry after 502, 503 or 504 safe. It replaces "`issue_command` is not retried" in the Edge Functions entry.
- One group call shares one `group_id` across its rows, the data of every `proctor.time_added` and `proctor.message` event, and the audit row.
- Command fallback in ingest: every reply carries up to 20 unacked commands (`pending_commands`, oldest first, in the CommandBroadcast shape). A command whose Realtime broadcast was lost therefore reaches the app with the next heartbeat, within about 10 s. A row that fails the schema is dropped and logged and never fails the reply.
- `exam_question_count(exam_id)` is security definer: exam staff get the count and everyone else gets null. `exam_overview` gains `question_count`.
- `sessions.status.detail` has one vocabulary, in `packages/contracts/src/status-detail.ts`:
  - `app:<name>` for blocked and screen-sharing apps;
  - `camera:busy`, `camera:no_face`, `camera:many_faces`, `camera:dark` and `camera:covered`;
  - `card:retry:<n>` and `card:help:<n>`;
  - `lock:not_paired`, `network:slow`, `network:offline` and `storage:low`.
  Ingest answers 400 to any other text; reads stay lenient. The app sends `camera:busy` when there is no camera picture, and `card:retry:<n>` after each failed card try, so the lobby shows Need help from the first failed try, as 1.5 draws it. The simulator writes the same strings.

## 2026-10-07 · Ingest performance

Decided by the hardening run (migrations `20261007210000_ingest_performance.sql` and `20261007221100_ingest_last_seen_every_call.sql`).

- `ingest_batch` takes `p_owner` and checks the session owner itself (not_found, or 42501 forbidden). So one ingest call is one PostgREST request and one transaction. `frames` keeps its own owner check.
- A quiet call writes nothing: no lock, no WAL, no `session` broadcast. Quiet means no events, the same status, no step forward, and a stored `last_seen_at` less than 10 s old. Every other call writes `last_seen_at`, while the plan says every call does.
  - The desktop app sends empty calls 10 s or more after its last reply, so all of its calls write.
  - Only the simulator and the load tool (calls 8 to 12 s apart) skip writes. Their `last_seen_at` lags by up to 10 s, so their No signal can show up to 10 s early.
- On the local stack, a quiet heartbeat went from 1 row version, 1 broadcast row, 2 transaction ids and about 0.75 KB of WAL to none of these. A 3-event batch went from about 5.4 to 4.2 KB of WAL.
- The session row is locked `FOR NO KEY UPDATE`, so answer and event inserts no longer wait behind heartbeats.
- The ingest limit of 10 calls a second is kept per session and caller, so a stranger cannot use up the owner's allowance.
- Every Edge Function reply has a `Server-Timing` header. It holds durations only: auth, body, handle and the handler's own calls, reply, total, and boot on a fresh isolate.
- `retryOnGateway` no longer retries PostgREST's PGRST003 pool timeout (504). A second try only doubled the wait; the caller now gets a 500, and the app's outbox backs off.
- The 1 s wall budget is still missed on this shared laptop (see the exit evidence). The long tails come from the local edge runtime (worker retirements, cold boots, out-of-memory kills) and the overloaded host. Judge the budget on a quiet machine or on the cloud project.

## 2026-10-07 · Review fixes: pause credit, answers after the end, still uploads

Decided by the review repairs (migrations `20261007213000_pause_credit_server_only.sql` and `20261007221000_answers_until_real_end.sql`).

- Pause credit:
  - A client's `session.paused` accepts only `face_missing` or `camera_lost` (`ClientPauseReason`), and ingest answers 400 to `proctor`.
  - Only the server's `proctor.paused` counts as a proctor pause in `events_broadcast` and `pending_pause_s`. Every other pause is capped as a self-pause.
  - The plan's Event data lists `proctor` as a `session.paused` reason, but its Session states section says a forged event cannot add time, and that wins. Before the fix, a client pause with reason `proctor` gave back a whole hour.
- Answers RLS: for a session a proctor ended, or the student submitted, an answer must be saved before `ended_at` or `submitted_at` and must arrive within 10 minutes after it. Writing, paused and time_up sessions keep the scheduled end plus 10 minutes.
- Still uploads:
  - Upload URLs are signed without upsert, so a URL cannot replace a confirmed still.
  - Storage also refuses to sign a path that already holds an object (400 with statusCode "409"), so ingest confirms such a still itself and offers no URL for it.
  - The plan says ingest returns URLs for every flag event whose stills are not all confirmed. Now it returns URLs only for stills not yet in Storage.
  - The app treats "already exists" as uploaded. Ship the desktop build and the ingest function together, or an older app keeps resending the event to get a URL.

## 2026-10-07 · UI kit polish

Decided by the hardening run. Design to sign off the three icon changes.

- The Dialog scrim is `bg-inverse/40` in both themes, because Figma 2.4e draws a light paper wash over the dark wall.
- StudentTile has a `trailing` slot for the ⋯ button, and ActionMenu passes `sideOffset` and `alignOffset` through.
- TabGroup has two variants: `outlined` (the default, used by the title-bar language switch) and `plain`. Plain is used on 0.1, 1.5, the 2.4 toolbar, the 2.5 presets and SegmentChoice, where Figma draws no stroke.
- A TableHeaderCell is now 38 px tall (component 149:2763). 0.1 and 1.5 keep the 36 px and 33 px rows their frames draw.
- LiveWidget has an `offline` state (2.1a). The gap between its text and dot is Figma's 36 px, so every widget is 14 px wider than before. Its text wraps when space is short, where Figma clips a single line.
- Icons:
  - `phone-off` is Lucide VibrateOff, the only Lucide phone with Figma's top-left to bottom-right slash; it adds vibration marks.
  - `gaze` is Disc at 0.85; this replaces CircleDot in the UI kit entry.
  - `square` and `stop` are Square scaled to 14/24 and 12/24 by a new `inset()` helper, which keeps the stroke at 2 px.
- The 1.1 desk scene is WebP q92 at 1040 × 693, twice its display width (1.29 MB to 45 KB).

## 2026-10-07 · Detection thresholds: evidence so far

Recorded by the hardening run; you tune both on the MacBook Pro and, in the lab session, on a Windows 11 lab PC.

- Phone: EfficientDet-Lite0 int8 scored a clearly held phone (the brand kit's evidence picture through the e2e's synthetic camera) at 0.77 on every check, below the 0.85 default. With the defaults, no `phone.detected` fires. The desktop e2e lowers its exam's `phone_score` to 0.7 so that the 2.2 path runs.
  - Tune on real phones on the MacBook and a lab PC.
  - Put the chosen value into the `exams.checks` defaults: `DEFAULT_EXAM_CHECKS.phone_score` in contracts, plus the column default in a new migration. Code constants stay unchanged.
  - Record the value here.
- Identity: in the e2e, a card made from the student's own enrolment photo matched at 0.93 on the first try. Earlier, a different person's low-resolution photo passed the 0.5 threshold at 0.53. Neither run used a real camera and a printed card.
  - Tune `THRESHOLDS.identity.minSimilarity` on the two printed cards; about 0.6 may be needed.
  - Record the value here.

## 2026-10-08 · Review follow-ups

- **Only the proctor ends a proctor pause.** The plan's Session states table lets `session.resumed` or `proctor.resumed` move a paused session back to writing. A student's app sends `session.resumed` through ingest, so a modified app could end a proctor's pause at once. While the open pause was started by `proctor.paused`, the server now stores and broadcasts a `session.resumed` (the wall's timeline shows the attempt) but changes no state and credits no time; only `proctor.resumed` ends it. Self pauses are unchanged. Migration `20261008090000_proctor_pause_ends_by_proctor.sql`; `nextState` mirrors it with a `pause: "self" | "proctor"` field on the cause.
- **pgTAP tests count only their own rows**, so leftover demo or simulator data no longer fails them.
- **Zod runs jitless in the desktop renderer and the detection worker.** Zod 4 probes `new Function("")`, which the plan's CSP (no `'unsafe-eval'`) reports as a violation; `z.config({ jitless: true })` is the first import of both entries.
- **One more fuse:** `GrantFileProtocolExtraPrivileges` is off, beside the plan's five, because the app never loads from `file://`.
- **HTTP 546 (the edge runtime's WORKER_LIMIT) is retryable** like 502, 503 and 504, in the outbox, Edge Function calls and still uploads.
- **2.1 has an error state for questions that fail to load for good:** after tries at 0, 2, 6, 14 and 30 s, `exam.questions.failed` shows in Figma's error Banner (145:2753) with Check again, and the app retries every 30 s. New catalog key (239 keys), first-pass Kazakh and Russian for native review.
- **The dashboard tells "no session" from "lookup failed".** A network error, a 5xx or a failed staff-row read is retried once, then the page shows `dashboard.shell.lookupFailed.*` with Try again, instead of sending a signed-in proctor to sign-in. Sign-in reports "unavailable" rather than "not staff" in that case.
- The Lock smoke and icon scripts use Playwright's `chromium.executablePath()` by default (`PW_CHROMIUM` still overrides).

## 2026-10-08 · Phase 1 schema and contracts (WP 1.1)

Choices that `20261009000000_phase1.sql` and the Phase 1 contracts make where the plan leaves room, or where a frame and the plan disagree. Where they conflict, the plan decides behaviour and Figma decides visuals.

**Tables**
- `help_requests`, `review_decisions` and `reports` are deleted with their session (`on delete cascade`). `help_requests` also goes with its event. Without this, `demo:reset`, `demo:simulate --cleanup` and the data-request delete would fail on the new foreign keys.
- `reports.issued_at` records when the current verify code was made, for "Issued" on 3.5.
- `pilot_requests` adds `exam_size`, `pilot_month` and `demo_invite`. Book a pilot (194:4014) asks for these three fields; the plan's DDL has none of them.
- Every table gets the plan's read rights. Writes go through the functions, so each write leaves an audit row and the exam status stays correct:
  - `review_decisions` only through `decide_session`.
  - `reports` and `report_shares` only through `get_report` and `create_share`.
  - `help_requests` only through the trigger and `close_help_request`.
  - `invites` (exam office) and `data_requests` (exam office: insert and update, never delete) are also written directly under RLS.
  - Revoking a share means setting `revoked_at` by hand, until the open question about 3.4 is answered.
- `workspaces.settings` and `exams.browser_rules` have CHECK constraints with the same rules as `WorkspaceSettings` and `BrowserRules` in the contracts. A.4 updates `settings` through PostgREST; a column grant and an exam-office policy limit it to that column.
- `exports` is the second bucket: private, JSON only, 10 MiB. The storage guard (`scripts/guards/storage-buckets.ts`) now allows it next to `frames`. Images still go only to `frames`.

**Exam wizard**
- `save_exam_draft` with no `id` creates the draft that `/exams/new` redirects to:
  - Title, course and kind are empty, since those columns are `not null`. `schedule_exam` refuses to schedule them empty.
  - The start is tomorrow at 09:00 in the workspace's time zone. Duration and checks come from `settings`; the faculty is the staff member's.
  - `checks` and `browser_rules` merge into the stored values, `group_ids` replaces the exam's groups, and any other key is refused.
  - Only drafts can be edited.
- `import_roster` replaces the roster with the file:
  - A student left out of the file leaves the exam, together with their invite.
  - Seats follow the file order.
  - An invite whose address changed goes back to `pending`.
  - It works for draft and scheduled exams.
  - The function checks again what the browser already checked. The first bad row is refused with `bad_request` and a detail such as `row 7: email`.
- `assign_proctors` replaces the proctor table:
  - Ranges start at seat 1 and follow each other. The error is `gap` or `overlap`, with the seats in the detail.
  - When no lead is chosen, the proctor with seat 1 leads.
  - A changed range clears `confirmed_at` and `change_request`.
- `invites_sync_status` copies each invite state into `exam_students.invite_status`, so `send-invites` writes only `invites`.
- How the exam code is built (shared by `exam_code_base` and `buildExamCode`):
  - Kazakh and Russian letters are transliterated to Latin. Kazakh Қ becomes Q, as in the 2021 Latin alphabet.
  - The course part is the first four letters of the first word, then any trailing digits, then every later word that contains a digit, at most 10 characters.
  - The group part is the first group code in sort order. The seed's PHYS1-102-FRI is hand-written; the rule would give PHYS1-101-FRI.
  - The day is the weekday in the workspace's time zone.
  - On a clash, the digits 2 to 99 are added to the end: MATH2-204-FRI2.
- Each `schedule_exam` error puts the problem in `message` and the step that fixes it in `detail`. `SCHEDULE_PROBLEMS` and `parseScheduleError` in `wizard.ts` map the 14 problems to their steps.

**Help, review and notes**
- `close_help_request` is for the exam's proctors, as the plan's RLS table says; the exam office can read but not close.
  - A reply goes out through `issue_command` as a `message` command and its `proctor.message` event.
  - No reply is sent when the session has already ended.
  - Closing a request twice returns it unchanged.
- An unknown help topic is stored as `technical`, and the text is cut to 280 characters. A bad payload never fails an ingest call.
- `decide_session` moves only a `to_review` exam to `reviewed`. A live exam stays live after Mark reviewed.
  - The queue rule: a session is open while it has a flag newer than its decision, compared on server receive time.
  - The `review_queue` view applies the rule for 3.2. It is an addition to the plan.
- Notes are limited to 500 characters, decision notes to 1000 and replies to 280. A seat change request is limited to 500 characters.
- `proctor.note` uses two new keys that no frame shows: `dashboard.wall.event.proctor_note.title` ("Note") and `.detail`. Notes appear on the timeline and never in Live events.

**Reports, verify codes and shares**
- The verify code has 12 Crockford base32 characters, taken from the first 60 bits of SHA-256 of `<report id>:<content hash>`.
  - The content hash covers the student, the exam, the result, the flags, the notes and the decision. It leaves out exam-wide counts.
  - When the content changes, `get_report` makes a new code. An old printout first shows "found, not intact", then "not found" once a newer version is opened.
- Conflict with 3.4 and 3.5: the frames print `UKI-RPT-0917-MT`, a short number plus initials. The plan's rule makes a 12-character code from the content.
  - The code is printed as `UKI-RPT-XXXX-XXXX-XXXX`, keeping the frame's prefix (`formatVerifyCode`).
  - `/verify` accepts the code with or without the prefix, spaces or hyphens.
- 3.5's address bar shows `/r/UKI-RPT-0917-MT`. The real link is `/r/<43-character token>`, as the plan's sharing rules require.
- The shared-report function calls `open_shared_report(token_hash)` with the secret key. That function:
  - refreshes the verify code,
  - returns the report with who shared it,
  - writes one audit row per view (`actor_kind` `share`, no actor),
  - refuses an unknown, revoked or expired token as `not_found`, with the reason in `detail`.

**Views for A.1 and A.2**
- A term runs from 1 September to 31 January (autumn) or from 1 February to 31 August (spring), by the exam's local date. Weeks are 7-day buckets from the first day of the term.
- Every `term_*` view has one row per faculty and one row for all faculties (`all_faculties`), so the faculty picker needs no client-side totals.
- "Median review time" (A.1) is measured from the exam's end to the decision. Opening a session is not recorded, so time spent looking at a session cannot be measured.
- `student_overview` gives the counts and the last exam and decision. A.2 derives the status chip in its model.

**Privacy and the cloud**
- `audit_read(action, object_type, object_id)` lets the dashboard record a read of student data that no function records, such as A.2's list, A.3's profile or 3.3's session. Inserting new data requests and changing settings write their own audit rows.
- The consent record: the first ingest call whose status step is `ready` stamps `rules_accepted_at` and `rules_locale`, even when the session has already moved past `ready`. The language comes from `status.rules_locale`; when an older app leaves it out, the session's locale is used.
- `retention_nightly` and the pilot-request trigger call `call_edge_function`. It reads `uki_project_url` and `uki_secret_key` from Vault and sends the secret key in the `apikey` header. If either secret is missing, nothing is sent, so a fresh local stack never calls out. The two secrets are created by hand on the cloud project; see `docs/runbooks/cloud-setup.md`.
- `serveApi({ auth: "secret" })` becomes `withSupabase({ auth: "secret:*" })`. The bare `"secret"` matches only the key named `default`, so rotating the secret key (P.17) would lock out retention and pilot-notify.
- `retention`, `pilot-notify` and `shared-report` need `verify_jwt = false` in `config.toml` when they are added (1.9, 1.12, 1.13).
- `request_pilot` adds a cap of 30 requests an hour across all addresses, on top of the plan's 3 per address a day, because each request sends you an email.

## 2026-10-08 · 1.2 Shell and Russian: dashboard string format

- **Dashboard strings are now `key → { "en": "...", "ru": "..." }`** in `packages/i18n/dashboard.json`, `dashboard-wall.json` and every other `dashboard-<part>.json`. `pnpm i18n:build` merges them into `messages/en.json` and `messages/ru.json` and fails on a missing or empty English or Russian message, on arguments that differ between the two, and on a Russian plural arm Russian does not have; every Phase 0 check stays. This replaces the Phase 0 line “English only, merged into `messages/en.json` only”. Kazakh has no dashboard namespace and falls back to English.
- Each file may start with a `"$comment"` string. Phase 0's two files carry “native review needed, P.18”: the Russian for all 289 keys (Phase 0's 287 and WP 1.1's two proctor-note keys) is a first pass by the agent.
- Russian terms follow the catalog: flag is «отметка», flagged frames are «отмеченные кадры», the exam office is «экзаменационный отдел», the live wall is «экран наблюдения».

## 2026-10-08 · 1.2 Shell and Russian: the shell

- **Language without a cookie.** The plan gives a staff member their first language (`staff.languages[0]`: ru unless it is en). A request with no staff member, such as sign-in or the public pages, has no first language, so it gets English, the language of the frames. Seed staff are all `{ru}` or `{kk, ru}` first, so they open the dashboard in Russian. The Demo Day script starts in English: pick ENG once in 3.4a and the cookie keeps it, or seed v2 (1.14) puts `en` first for Dana. The Phase 0 e2e sets `uki_locale=en` before it signs in.
- **The cookies** `uki_locale` (en or ru) and `uki_faculty` (a faculty id) are httpOnly, `SameSite=Lax`, path `/`, and last a year, so the choice survives a sign-out and a new browser session. A value the server does not recognise is ignored.
- **3.4a shows name, role · workspace, Language and Log out.** Profile has no Phase 1 page, and Notifications is A.7 (Phase 3), so both stay hidden. Language shows the current language (ENG or РУС) and switches to the other one; with two languages the row is the switch, and no submenu is added to the frame. The Phase 0 key `dashboard.shell.signOut` now reads “Log out”, as 3.4a writes it.
- **The sidebar per role follows the frames:** 0.1 for the exam office (Workspace: Overview, Exams, Live, Review, Reports, Students; Admin: Settings, Privacy) and 0.9 for proctors (Workspace only, with Review, Reports and Students). Privacy goes to `/privacy-centre`. Each item has a `built` flag in `apps/web/src/features/shell/shell-model.ts`, and the item stays hidden until its package turns the flag on with its page: Review 1.8, Reports 1.10, Students and Settings 1.11, Privacy 1.12. Plan conflict for 1.10 and 1.11: 0.9 shows Reports and Students to proctors, while the plan's route table lists `/reports` and `/students` for the exam office only. Those packages decide what a proctor gets there; until then the items are hidden for everyone.
- **Phase 2 and 3 entry points stay hidden:** Search and the notifications bell in App/Top bar (A.8, A.7), Profile and Notifications in 3.4a, team, SSO and integrations (A.4a to A.4d), and Add faculty in 0.1c. None of them is a sidebar item or a link.
- **0.1c filters by faculty for the exam office and admins only.** The frame is “Admin · Overview · Faculty switcher”, and proctors only see their assigned exams anyway. Without a choice the overview shows all faculties, as in Phase 0. The demo opens on exams of three faculties, and frame 0.1 lists exams of other faculties under “Faculty of Mathematics”, so that label cannot be a filter. The workspace card and the breadcrumb then read “All faculties”. The chosen faculty also scopes the sidebar's Exams and Live counts and the Live link. The number per faculty counts exams this Monday-to-Sunday week in Asia/Almaty, without cancelled ones (Menu/Workspace 83:2391: “The number is exams this week”). Faculties are listed by name.
- **0.1b counts but does not weigh.** The plan says 0.1b “counts the stills in frames”. Staff cannot read object sizes: the frames bucket has no `storage.objects` policies by design, and events have no size. So the rows show “Video 0 MB”, “Flagged frames 38” and “Events 9,870”, without the frame's “· 2.6 MB” and “· 0.7 MB”. If the sizes are wanted, a size RPC can come with 1.12, which owns the frames bucket's data. “Open privacy centre” shows once 1.12 turns `NAV.privacy.built` on. Both counts run under RLS, for the exams the overview shows, when the popover opens. Popover/Info (76:2333) is `PopoverInfo` in `@uki/ui`.
- **Proctor landing:** sign-in, `/`, the signed-in `/sign-in` and the proctor's Overview item all go through `staffHomePath(role)`. Proctors stay on `/overview` until WP 1.5 sets `PROCTORS_LAND_ON_MY_EXAMS = true` together with `/my-exams` (0.9).
- **Russian layout notes for P.18:** “Экзаменационный отдел” fills the sidebar's role label and is clipped in the user block; “взгляд в сторону 2× · 4,5 с” is cut on a 1440 wall tile. Both are in the dashboard's own truncation, and P.18 may want shorter words.
