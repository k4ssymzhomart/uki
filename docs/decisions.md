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

## 2026-10-08 · P.4 Lockdown guard (WP 0.13)

**The keys the Windows hook swallows.** The plan lists the Windows keys, Alt+Tab, Alt+Esc and Ctrl+Esc. `apps/desktop/src/main/key-filter.ts` reads each of these as follows:

- **The Windows keys.** Left and right, down and up alike, with or without other keys. This also stops the Win+ shortcuts that a hook can stop, such as Win+D, Win+Tab, Win+R and Win+Shift+S. Win+L stays with Windows.
- **Alt+Tab.** Tab while Alt is held, with or without Shift or Ctrl, because all of these open one task switcher.
- **Alt+Esc.** Esc while Alt is held.
- **Ctrl+Esc.** Esc while Ctrl is held and Shift is not.

Everything else passes, in particular:

- **Ctrl+Shift+Esc** opens Task Manager, which Ctrl+Alt+Del also reaches. The plan leaves Ctrl+Alt+Del to Windows, so this stays with Windows too. The blur rule catches both, and the lab checklist step says so.
- **Ctrl+Shift+Q** is the lab zip's development escape. `lockdown.ts` reads it in the window.
- **Alt+F4** is not a hook key. The window refuses it: close is blocked and `before-input-event` drops it, as decided on 2026-10-07.

**The hook procedure.** It reads only `vkCode` (offset 0) and `flags` (offset 8) of `KBDLLHOOKSTRUCT`, and it asks `GetAsyncKeyState` about Ctrl and Shift only for Esc. Then it returns 1 or calls `CallNextHookEx`. It logs state changes only (ready, on, off, failures) and never a key.

**The hook's life.**

- `lockdown.set(true)` starts the hook and `set(false)` stops it. The development escape goes through `set(false)`, so it stops the hook too.
- While lockdown is on, the hook is reinstalled every 10 s. The new hook goes in before the old one comes out, so no key slips through in between and no swallowed Windows key goes up unseen.
- A failed install is retried on the same 10 s timer.
- `will-quit` and `process.on("exit")` remove the hook, and Windows removes it if the process dies.
- **Known limit.** If the renderer crashes during lockdown, the window stays in kiosk with the hook on, as it did before this change. The way out is End session, or Ctrl+Alt+Del and Task Manager.

**Koffi loads at launch on Windows, not at Start exam.** `keyboardHook.prepare()` runs after the window opens. It loads Koffi, user32 and kernel32 and installs nothing. This way a packaging fault shows in the CI launch test, which now requires `[desktop] keyboard hook ready` in the main process log, and not in the middle of an exam. macOS and Linux never load Koffi. If Koffi fails to load, the app logs it once and lockdown goes on with the blur rule alone, as the plan's fallback says.

**Packaging Koffi 3.** Koffi 3 split its binaries into per-platform packages (`@koromix/koffi-<os>-<arch>`, optional dependencies). Three facts shaped the packaging:

- electron-builder's pnpm collector bundles a transitive platform package only if the app lists it.
- `electron-builder.yml` keeps `node_modules` out of the asar.
- Windows cannot load a native file from inside an asar.

So:

- `koffi` is a dependency and `@koromix/koffi-win32-x64` an optional dependency of `apps/desktop`, both pinned to 3.3.2. Koffi refuses a binary of another version, and a test checks that the two pins match.
- `win.extraResources` copies five loader files, with the MIT licence, and the binary to `resources/koffi/node_modules`. The app requires Koffi from there with `createRequire`. Development builds and the tests use the app's own `node_modules`.
- No asarUnpack is needed, and the main bundle never contains Koffi.
- `build/after-pack.cjs` fails a Windows build in which either file is missing. So the zip, the lab zip and the installer are all checked before they are made. CI also lists the files in each of them.
- The dmg carries neither file.

**The blur rule on macOS.** Phase 0 ran it on Windows only, because macOS kiosk mode already stops app switching. The MacBook may be the only student machine on Demo Day, and Spotlight, Notification Center and the screenshot toolbar can still take the focus. So on both systems, every blur during lockdown now:

1. restores a minimised window;
2. on macOS, activates the app with `app.focus({ steal: true })`, without which a background app cannot take the focus back;
3. shows the window;
4. pins it again, with `setVisibleOnAllWorkspaces` on macOS and `setAlwaysOnTop(true, "screen-saver")` on both;
5. focuses it;
6. tells the renderer at most once every 5 s, and the renderer sends `tab.blocked` with `app: null`.

The packaged build has no development escape. `hasDevEscape(isPackaged, mode)` keeps one only in development builds and the lab zip.

**`demo-laptops.md` became `lab-session.md`.** The plan puts `docs/runbooks/lab-session.md` in place of `demo-laptops.md`, so the new runbook takes over all of the old one's content:

- the MacBook build and install;
- Üki Lock;
- the rehearsal steps;
- the network fallback.

It adds the lab session:

- the CI artifacts to download;
- the lab zip's Ctrl+Shift+D and Ctrl+Shift+Q;
- SmartScreen and the antivirus notes about the hook;
- the USB webcam;
- the checklist with its steps;
- where the results go.

The links in `README.md`, `cloud-setup.md`, `electron-builder.yml` and `desktop-dist.yml` point to it.

## 2026-10-08 · 1.6 Ask proctor

Choices WP 1.6 made where the plan leaves room, or where a frame and the plan disagree. The plan decides behaviour and Figma decides visuals.

- **Four topics, not three.** The plan's `student.help_requested` topics are identity, question and technical. E.5a's sheet (152:11597, catalog `lock.ask.reason.*`) offers four reasons: Question is unclear, Technical problem, I need a break and Something else. `HelpTopic` gains `break` and `other` (`HELP_TOPICS`, `ASK_REASONS` in `packages/contracts/src/events.ts`), and `20261010060000_help_topics.sql` replaces `help_from_event` so it stores them instead of filing both under technical. An unknown topic is still stored as technical. pgTAP `15_ask_proctor`.
- **"The sheet from 1.3a" is E.5a's panel.** 1.3a (151:11547) has no sheet: it shows the "Help requested at 09:52" banner and "Waiting for Aigerim S.". The app's Ask proctor on 2.1 to 2.3 opens E.5a's panel (`AskProctorPanel` in `@uki/ui`, the same component and catalog keys as the Lock bar), the only frame with a topic and a note. After Send, 1.3a's banner confirms: `identity.help.requested` ("Help requested at 10:47") with E.5a's line `lock.ask.body` and Got it (`message.ack`). No frame draws that state, and no catalog key was added.
- **The note is 200 characters.** E.5a's counter reads "32/200" (`HELP_NOTE_MAX`); the server still accepts up to 280 (`MessageText`), as WP 1.1 built it.
- **2.3 keeps Ask proctor usable.** Figma draws the button under 2.3's veil. A student with no face in view may have a camera problem, which is when asking matters, so the button sits above the veil (not dimmed) while everything else under it stays inert. On 2.1c the button is under the veil and off: the proctor is already there.
- **The sheet's place in the app.** No frame places it over 2.1; it opens over the question column, above the footer's right edge (`right-14 bottom-26`), like E.5a under the Lock bar.
- **The reply answers the request.** A proctor's `message` while a request is open replaces the help banner with 2.1e. The app does not hear Mark done (no command), so the banner stays until Got it.
- **2.1e over 1.3 and 1.3a.** A message that arrives on 1.3 or 1.3a (a reply, or a 1.5b hint) shows as 2.1e's banner above the help banner, and Got it clears it there. Added time is still shown only from 2.1, as Phase 0 decided.
- **The Lock confirms through the bar's storage.** The service worker files the sheet's request in its outbox like every Lock event, keeps `help` (id, time, queued) in the bar state, and marks it queued when the app answers `help.queued` with that id. The app answers after the event is in its outbox, also when a resent event was already there, so a sheet whose link dropped still confirms. The Lock bar's Ask proctor shows lime while the sheet is open (E.5a), through `LockBar.askProctorActive`.
- **2.4d's Requests button** (Button Brand, "Requests · 2") shows only while requests are open; 2.4 draws no button, so with none open the toolbar is 2.4's. The popover opens under it. Requests are newest first, as the frame lists them (Kamila's 10:46 above Saule's 10:44); WP 1.1's `sortHelpRequests` (oldest first) is not used by the dashboard.
- **Reply** opens a dialog like 2.4b's Write a message (the UI kit's Dialog with a text area) and sends `close_help_request` with the text, which the server sends as a `message` command. Figma's footer "Replies go to one student, in their language." is kept: the reply arrives in 2.1e's banner in the student's language, while the proctor's own words are sent as typed, which the dialog says (`dashboard.wall.message.dialogBody`).
- **Who answers.** Reply and Mark done are for the exam's proctors (`close_help_request` refuses the exam office). The page reads the caller's `proctor_assignments` row, and the exam office sees the requests without the two buttons.
- **The reason pill's colour.** 2.4d draws Question is unclear on brand-subtle and Technical problem on warn-subtle. Identity is warn-subtle (a problem, like technical); I need a break and Something else are brand-subtle (a question for the proctor). The labels are the student's reasons (`dashboard.wall.help.topic`), and the timeline and Live events use the same label; the Phase 0 key `dashboard.wall.event.student_help_requested.detail` is gone.
- **Raised hand on the tile.** 2.4d draws "raised hand · Q 8" on an on-screen tile whose student asked. The line follows the request while it is open and the tile is On screen; flagged, warning and paused tiles keep their own line. Figma's "raised hand · camera" has nothing behind it, so the line always names the question (or just "raised hand").
- **Audit.** Reading the students' requests is a read of student data: the live page writes one `help.read` audit row (`audit_read`, object the exam) when it renders with requests open. Requests that arrive by broadcast later are not audited one by one, as Phase 0 treats the wall's events.
- **The rules language.** The agree box sends `ready` with `rules_locale`, the language on screen; `ingest_batch` keeps the first one (WP 1.1). Switching the language afterwards sends it again, and the stamp does not move.
- **1.4a** was built in Phase 0; the comparison moved the disclosure's gap to 10 px and the answer's opacity to 70 %, as 87:8156 draws them.

## 2026-10-08 · P.10 Realtime restart

- **The heartbeat is never a tick late.** The sync loop called ingest at least every 10 s, but it checked that only on its 2 s ticks. Each tick counts from the end of the run before it, so slow runs on a loaded laptop pushed the ticks later. A tick could then land at 9.95 s and the call wait until 11.95 s. The next run is now scheduled no later than 10 s after the last ingest reply. This holds the plan's "Ingest is called at least every 10 s", and with it the command fallback's "within about 10 s" ("Session commands and status detail" above). It costs at most one extra local run per heartbeat, with no extra call. Seen live once in 38 rounds, as the load rose to 11, as 2.1c after 12,007 ms; `sync.test.ts` reproduces it at 11,950 ms.
- **"Within about 10 s" counts the app's part.** The restart test subtracts the server's time from each trip, and the rest must stay under 11 s: the 10 s heartbeat, the loop's tick and the apply. The server's time is the command function, what was left of an ingest call in flight when the command was stored, and the round trip of the call that carried it. On a quiet host that is about 100 ms. On the loaded shared laptop the command function alone took up to 4.9 s, which is not the fallback's doing. The full trip is in the evidence for every round.
- **The restart test is local and on its own.** `pnpm --filter desktop e2e:realtime` stops Realtime for everyone on the stack, so `pnpm --filter desktop e2e` does not run it, and neither does CI, which has no desktop e2e. It runs only on a stack nobody else needs at that moment. Realtime is started again after every round, in `afterAll` and in a global teardown.
- **The lead proctor is the fixture's,** a copy of the seed's Aigerim Sadykova in the fixture's own workspace, as in the desktop e2e. The seeded Mathematics 2 exam stays as the dashboard's tests and the demo expect it.
- **The path is read from the window's network, and the app is not changed for the test.** The path that applied a command is the first of the window's Realtime frames, ingest replies and catch-up reads to carry its id. Playwright stamps these a little after the window gets them, so the first arrival may be stamped up to 2 s after the frame. The three paths arrive seconds apart, so the order stays clear.

## 2026-10-08 · 1.8 Review

Choices WP 1.8 makes for 3.2, 3.2a, 3.2b, 3.3, Mark reviewed (2.4a) and Add note (2.5) where the plan leaves room or a frame and the plan differ. No migration: WP 1.1's `decide_session`, `add_session_note`, `review_queue` and `audit_read` cover the package, and `11_help_review` already tests the queue rule.

**3.2 Review queue**
- **Which exams.** To review lists every session with a flag newer than its decision, whatever the exam's age (the `review_queue` view). Reviewed and All also need the decided sessions, so the page shows the exams with a session in the queue plus the flagged exams that started in the last 7 days. Exams without a single flag are left out.
- **Grouped by exam, in one Sessions card.** Figma draws one exam, named in the breadcrumb (“Review / Mathematics 2 · Midterm · finished 11:30”). With one exam the page does the same. With more, the breadcrumb reads “Review / 2 exams” and each exam's rows start with a header row naming the exam, which no frame draws. Exams with a session in the queue come first, then the newest.
- **Order and the top flag.** The flag ranks are phone, second face, ended by the proctor, app closed, looked away, looked down, tab blocked, no face, camera lost and left full screen. A row shows its highest-ranked open flag, or of all its flags once reviewed. Rows sort by that rank, then by more flags, then by name, which gives Figma's order. The Count is coral with 2 flags or more or a coral top flag (phone, second face, ended, app closed), otherwise yellow, as Figma's six rows. Look-aways add up (“Looked away · 6 s in total”). `camera.lost` carries no duration, so the row reads “Camera lost” without Figma's “· 10 s”.
- **Stat cards.**
  - To review counts the sessions in the queue; its caption counts their open flags.
  - Reviewed counts sessions with a decision and no newer flag. Its caption reads “today, by 2 proctors” only when every one of those decisions was made today in Asia/Almaty, and “no decisions yet” when there are none (a new key).
  - No flags counts the shown exams' sessions without a flag.
  - Median review uses A.1's rule (`term_review_time`): from the exam's scheduled end to the decision, never negative. It shows the two largest units (“1 min 40 s”, “3 h 5 min”, “2 d 4 h”) and “—” without decisions. Opening a session is not timed, as WP 1.1 decided.
- **Tabs and search** run on the client and are not in the URL. The search matches the name or the student number.
- **3.2a, the flag filter.** Its rows are the flag types that have a flag among the sessions of the current tab, in the rank order above. They include Looked down, Ended by the proctor, App closed and Left full screen, which Figma's six rows leave out. Counts are flags of that type: open flags on To review, all flags on the other tabs. Ticking a row changes nothing until “Show N flags”, where N counts the ticked types (every type when none is ticked). The choice goes into `?flag=` (comma-separated event types) through `history.replaceState`, so it needs no server round trip and writes no second audit row. The pill's Count shows how many types the applied filter has, and is hidden without a filter. Figma draws “4” on 3.2 and 3.2b too.
- **3.2b, the flag preview.** It is a Radix HoverCard on the row's flags cell, which is also a link to 3.3. It opens on hover and on keyboard focus. The still comes from Phase 0's `stills` function only when the card opens: a 5-minute URL and one audit row per still. The detail is 2.5's flag-card detail (“Held for 6 s” for a phone). Figma's “Put away after the warning.” has no data behind it, as decided for 2.5.

**3.3 Session review**
- **One evidence card per flag**, three to a row, by rank and then by time. A card selects which flag the large frame shows. Clicking the frame steps through that flag's stills, and the stamp counts them (“frame 1 of 3”, or “no frame kept”: seed v1's flags have no stills; seed v2 adds them). The time chip is left out when the time written is unknown. The identity chip reads “identity matched” when `identity_result` is `matched` or the session has an `identity.matched` event, and otherwise “identity not checked”, a new key that no frame shows.
- **The timeline** lists every event of the session, newest first, notes included, in the wall's wording. It scrolls after 480 px, so the decision form stays in view.
- **The decision form** opens with the saved decision and note; a new one replaces them, as `decide_session` does. Save and next stays disabled until a choice is made.
  - Skip and Save and next open the next session of the exam's queue, wrapping round, and return to `/review` when none is left.
  - The breadcrumb's “1 of 7” counts the exam's queue. A session out of the queue shows “Review / <exam>”.
- **Option details.**
  - Talk to the student reads “Ask about the phone in frame at 10:47.”: the top flag in the wall's words, where Figma writes “the phone”.
  - Send to the exam committee reads “Attach this report and the 3 frames.”, with the number as a digit, where Figma writes “three”.

**Audit rows**
- 3.2 writes one `review.queue_viewed` row per exam it shows (object `exam`), and 3.3 one `review.session_viewed` row (object `session`). Both go through `audit_read` before any data reaches the page. When the audit write fails twice, the page fails rather than show unaudited student data.
- Stills are audited by the `stills` function, decisions by `decide_session` (`review.decide`) and notes by `add_session_note` (`session.note`).
- The sidebar's Review count reads no student data and writes no row.

**The live wall**
- **Mark reviewed (2.4a)** sits after Pause exam, as Figma draws it, and calls `decide_session` with `no_issue` through a server action.
  - It is enabled while the wall holds a flag with no newer decision. The wall holds the last 60 minutes and every phone and second-face flag, so a session whose only flags are older is decided on 3.3.
  - The flags up to `decided_at` then count as reviewed (`reviewedEventIds` in `wall.ts`), so a Flagged tile turns back to its other state. A live exam stays live.
  - The wall loads the exam's decisions with the page and reads them again on every catch-up (a reconnect, focus, or the 20 s reconcile). Decisions have no broadcast, so another proctor's Mark reviewed or a 3.3 decision reaches this wall within about 20 s.
- **Add note (2.5)** is the ghost button beside Send, as Figma draws it. It swaps the quick message for a Note field (up to 500 characters) with Cancel and Add note, which no frame draws; the label is 3.3's “Note”. The `proctor.note` event reaches the timeline through the exam channel like any other event.
- **The sidebar's Review item** carries a coral Count of the sessions in the queue under the caller's RLS (Figma 3.2: “7”).

**UI kit**
- `FlagPreview` is Popover/Flag preview (71:2212), and `DropdownFilter` is Dropdown/Filter (76:2284).
- `RowSession` gains `renderFlags`, so the flags cell can be the preview's trigger.
- EvidenceCard's chip row wraps, so a long Russian chip (“взгляд 4,2 с”) moves the time to the next line instead of cutting it off.

## 2026-10-08 · 1.7 Lock additions

Choices WP 1.7 made for E.5b (153:11724), E.8 (98:9927) and E.1's rules in Üki Lock, where the plan leaves room or a frame and the plan disagree. The plan decides behaviour and Figma decides visuals.

- **E.5b is a page under the bar.** The frame replaces the portal's page with "Page · calculator": a header ("Calculator · built into Üki Lock", the student, a Paper avatar) and the card centred 40 px under it, with the bar's Calculator tab active. The content script draws it in the bar's shadow root over the portal, from the bar to the bottom of the window. Exam portal closes it, and closing unmounts it, so nothing is left: no history, no storage, no network. The block page (E.7) has the same tab and opens the same page in place.
- **The header's name** is the student's full name from the app's `hello`, kept while the link is down. Before the app's first `hello` after a worker restart the header leaves the name and avatar out.
- **Arithmetic.** The display shows the whole expression ("2 × 25 ÷ 2"), so × and ÷ go before + and −. `%` is x/100, and after + or − it is that share of what comes before (200 + 10 % is 220). `±` on an empty entry starts a negative number. One entry holds 12 digits, and results keep 12 significant digits, so 0.1 + 0.2 shows 0.3. The point is "." in every language, as the keypad draws it. A division by zero shows `lock.calc.error`; no frame draws it. A value of 11 or more characters steps down from Heading/H2 to Heading/H3, because the frame has no size for long numbers. The keyboard works while the page is open (digits, . or ,, + − * / x, %, Enter or =, Escape or C to clear, Backspace), and those keys never reach the exam page.
- **The popup stays on while locked.** Phase 0 switched it off (`setPopup("")`); from Phase 1 it shows E.8.
- **E.8 lists the latest three attempts.** "NOTED · n" counts every `tab.blocked`, `site.closed` and `copy.blocked` the Lock sent in this lock, the same count E.9 shows. The rows are the latest three, oldest first. The Lock keeps the latest 20 in its lock record (`noted`).
- **E.8's details are what the Lock knows.** The frame's "Ctrl+T pressed" and "Question 4" are not known to the Lock. A tab or a site shows its host. A `tab.blocked` without a host (focus left the browser, or a browser page opened) shows `lock.noted.outside`, "Outside the exam window". A copy attempt shows its kind: Copy, Cut, Paste or Print. The title is "Copy blocked" for all four, because they are all `copy.blocked` and E.6's toast already says "Copy is off" for each.
- **E.8's Ask proctor** opens E.5a's sheet in the exam tab's bar. The popup sends `popup.ask`, and the service worker brings the exam tab and window back and stamps `ask_at` in the bar state. The content script opens the sheet when `ask_at` changes after the page loaded, so an old stamp never reopens it. Exams in the app hide the button (the app has Ask proctor on 2.1 to 2.3), and they have no site list, because the Lock allows no site in them.
- **E.8's time** stands still while the app reports the exam paused, as the bar's does. "ends 14:40" is the end on the laptop's clock, like the countdown. The footer is `lock.app.watching` ("Üki app · watching · camera on") while paired, and "Open the Üki app" with the amber dot while the link is down.
- **The rules travel in `exam.state`.** The app puts `join_exam`'s `browser_rules` into `exam.state` (null from a server that sends none). The Lock applies `effectiveBrowserRules`, which turns every rule on when there are none. The bar state carries the rules in force, and the content script reads them at every event, so a change during the exam applies at once. The rules apply to exams in the browser; exams in the app keep Phase 0's one tab and blocked sites.
- **What each switch turns off.**
  - Copy and paste off: the whole copy guard is off, so copy, cut, paste, the context menu and drag and drop all reach the page. Phase 0 built the context menu and drag and drop into that guard.
  - Print off: Ctrl or Cmd+P, the print style and the `beforeprint` note are all off.
  - Full screen off: no full-screen request at the start, when the portal is reopened, or after a restart, and no exit is counted. The release leaves the window as it is.
  - Calculator off: no Calculator tab, no Calculator row in E.8, and E.4's note and E.7's text name only the portal (`lock.ready.note.portal_only`, `lock.blocked.body.portal_only`). With it on they name the calculator too (`*.full`, the Phase 0 keys kept for this).
  - The service worker also refuses a `content.blocked` whose rule is off, so no event goes out even if a page sends one.
- **E.1's "Leaving it pauses the exam."** E.1's detail for Require full screen says the exam pauses. The Lock keeps Phase 0's behaviour: each exit is `lock.fullscreen_exit`, and the third one is a flag. Nothing pauses. The plan decides behaviour; the wording is WP 1.3's to settle on E.1.
- **Catalog.** WP 1.7 adds 15 Üki Lock keys after `lock.calc.note`. Nine are from the frames: `lock.app.watching`, `lock.calc.clear`, `lock.noted.copy`, `lock.noted.site`, `lock.noted.tab` and `lock.status.built_in`, `.ends`, `.noted` and `.open`. Six are for lines no frame draws (`added-not-in-figma`): `lock.calc.error`, `lock.noted.kind.copy`, `.cut`, `.paste` and `.print`, and `lock.noted.outside`. Kazakh and Russian are first-pass translations for P.18.
- **The Lock smoke reads the real toolbar popup.** Playwright does not attach to an action popup. The smoke opens it with `chrome.action.openPopup()` and reads it through Chrome's DevTools endpoint (`--remote-debugging-port=0`). Headless Chrome's screen is 800 × 600, which cut E.8 to the room under the toolbar, so the smoke sets `--screen-info={1440x960}`.

## 2026-10-08 · 1.4 Invites

Choices WP 1.4 made for `send-invites` and the invite email 0.8 (161:13438), where the plan leaves room or where the frame and the plan disagree. The plan decides behaviour and Figma decides visuals.

**Who gets an invite, and when**
- `{ exam_id }` sends the invites that have not gone out: `pending` and `failed`. A `sent` invite is never sent twice, and a `bounced` one waits until 0.3b fixes the address (a changed address puts the invite back to `pending`).
- `{ exam_id, student_ids }` sends those students' invites again, whatever their state (0.3's Resend, 0.3b after a fix). A student id with no invite on the exam comes back in `failed` with "no invite for this student on the exam".
- Real invites go out for `scheduled` and `live` exams only: a draft has no code yet. Any other exam answers `conflict`.
- Only the exam office of the exam's workspace may call (`exam_office` or `admin`, through `is_office_of_exam` as the caller). Every read and write runs under the caller's row-level security; the secret key is used only for the staff member's sign-in address and the audit row.
- One `audit_log` row per call, `invites.send` or `invites.test` on the exam, with the counts: the call reads the students' names and addresses.

**The test invite (0.5)**
- It goes to the signed-in staff member's sign-in address, in the first of their languages that is kk, ru or en, and is written for the first student of the roster by seat, so it shows exactly what students get. Its subject starts with "Test invite ·" (`email.invite.test_subject`, a new key). Nothing is written to `invites`.
- It also works on a draft: the code is the one `buildExamCode` predicts, without a clash digit. An empty roster answers `conflict`.

**UKI_EMAIL_SINK**
- When it is set, every email goes to that inbox, the test invite included: the demo's staff addresses are not real inboxes, and Resend's test domain sends only to the account owner.
- The content stays the student's: their language, code, student number and name. 0.8 shows no name, so the footer now starts "Sent to {name}" (below).

**Copy that differs from 0.8**
- The date joins the hero's second line: "Mathematics 2 · Midterm · 9 October · lobby opens 09:40". An invite can arrive more than a week early, and the title names only the weekday, as the frame does.
- The footer is "Sent to {name} by the {office} exam office with Üki. You get this because you are in Group {group}." The frame's "· exams@kru.test" is left out: no workspace has a contact address, and the sender is Resend's test address until a domain is verified. A student without a group gets "…because you are on the exam roster." (`email.invite.footer_roster`, a new key).
- "Қазақша · Русский · English" stays as the frame draws it, as text: each email is in one language, and the line says Üki speaks all three. It is not a switch.
- The subject is the frame's mail header, "Mathematics 2 · Midterm: your exam code". A hidden preview line ("Exam code MATH2-204-FRI. The lobby opens at 09:40.") is added, so inboxes do not show the language line as the snippet.

**Strings**
- The 16 `email.invite.*` keys are catalog keys (group "0.8 Invite email") in en, kk and ru. `pnpm functions:sync` copies them into the functions as `email-messages.ts`, next to the contracts and as ignored by git as they are, and a small formatter in `send-invites/messages.ts` fills `{arg}` and `select`. A unit test checks it against use-intl for every key, language, weekday and month.
- **The weekday and the month are catalog selects, not Intl names.** The Edge Runtime (supabase-edge-runtime 1.74.1, V8 11.6) has no Kazakh locale data: `kk-KZ` formats 9 October as "October 9". The selects also give each language its grammatical form: "в пятницу", "до пятницы", "жұма күніне дейін". Intl gives only the numbers, in the workspace's time zone. The runtime's time-zone data already has Asia/Almaty at UTC+5: 05:00 UTC prints as 10:00.
- No-break spaces keep "at 10:00" and "9 October" on one line on a phone.

**Look**
- Inboxes take inline styles only, so the email cannot use the Tailwind classes. The colours, radii and spacing come from `packages/tokens` (`email-tokens.ts`, copied by `functions:sync`), and the sizes from 0.8's text styles. The frame dims some text with opacity, which not every inbox applies, so the email paints the blended colour instead (`over` in `theme.ts`).
- The fonts are the system's: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif`, and a system monospace for the two labels. Inboxes load no web font, and the plan forbids fonts from a CDN. Each of these fonts draws the Kazakh letters, which the plan's risk table asks for. Geist's look is lost, as in every email.
- `color-scheme: light only`: Apple Mail keeps the email light. The Gmail apps may still darken it in dark mode.
- No frame draws the email on a phone. At 480 px or less, a media query narrows the card padding to 20 × 16, the hero to 16, the mascot to 64 px, the title to 21 px and the code and student ID to 19 px, so 390 px fits without a sideways scroll.

**Images and links**
- The wordmark, the waving mascot and icon/lock are Figma's 2x PNG exports of their nodes in 0.8 (161:13451, 161:13459, 161:13515), with the background each one sits on. They are served by the dashboard from `/email/` (`apps/web/public/email`), at `UKI_WEB_URL/email/…`. Without `UKI_WEB_URL` the email goes without images, and the wordmark is the text "Üki".
- **No tracking.** Every recipient's email has the same three image addresses, with no query string, and one link, the download button. Loading the images cannot tell anyone who opened the email. Resend tracks opens and clicks only on a verified domain that turns tracking on; leave it off when a domain is added.
- The button links to `UKI_DOWNLOAD_URL`. Without it, the link is the repository's latest release, `https://github.com/k4ssymzhomart/uki/releases/latest`. `desktop-dist.yml` makes a draft release, so publish it or set the secret before invites go to real students.

**Sending**
- Batches of at most 100, one after another, through Resend's batch endpoint, with each batch's outcomes written before the next is sent. Resend accepts or refuses a batch as a whole, so a refused batch marks all its invites `failed`, with Resend's message (cut to 500 characters) in `invites.error`.
- A 429 is tried once more after Retry-After, at most 2 s, since nothing was sent. Nothing else is retried, so no student gets the email twice. A 2xx reply without one id per email counts as failed.
- The function writes only `invites`; the `invites_sync_status` trigger (WP 1.1) copies the state into `exam_students.invite_status`.
- Each update also matches the address, so an address that 0.3b changes during the send stays `pending` for the new one.
- Each language is rendered once per call, with markers that each student's name, number and group replace (`fillInvite`, HTML-escaped as React escapes). A function gets 2 s of CPU per request, and rendering 100 emails one by one would spend it. A unit test checks the filled template against a direct render, and an integration test checks Deno's render against Node's.
- A missing `RESEND_API_KEY` or a malformed setting answers `internal` before anything is sent.

**No real email from a local run**
- `pnpm functions:serve`, `pnpm dev` and CI's stack job serve the functions with `supabase/functions/local.env`. That file points `RESEND_BASE_URL` at `http://host.docker.internal:25790` (54790 until “The Resend stub's port” below), where the integration tests run a Resend stub (`test/integration/resend-stub.ts`). With nothing listening there, a local send marks its invites `failed`. The file holds no secret.
- The integration tests read the served env file (`UKI_FUNCTIONS_ENV_FILE`, or `local.env`) to find the stub's port and the sink. CI runs `send-invites.test.ts` a second time with `UKI_EMAIL_SINK` set.
- Biome skips `__snapshots__/`, where the email's HTML and text snapshots live.

## 2026-10-08 · 1.5 Proctor home and lobby

Choices WP 1.5 made where the plan leaves room, or where a frame and the plan disagree. The plan decides behaviour and Figma decides visuals.

**Proctor landing.** `PROCTORS_LAND_ON_MY_EXAMS` is on: sign-in, `/` and the proctor's Overview item lead to `/my-exams` (0.9 marks Overview). `/overview` still works for a proctor and lists only their exams. The exam office and admins have no seats to confirm, so `/my-exams` sends them to `/overview`. The e2e sign-in helper accepts either home.

**0.9 My exams**
- **Which rows.** Live and scheduled assignments: live first, then by start. Drafts can still change, and finished exams are on 0.1's Done tab, so neither is listed. A row leads to the exam's lobby, or to its live wall once it has started.
- **The stat cards.**
  - NEXT EXAM is the live exam, or else the soonest scheduled one. It reads "Today 14:00" today, "Fri 10:00" within six days, and the date after that.
  - ASSIGNED and YOUR STUDENTS count the listed exams that start this Monday-to-Sunday week or next, in Asia/Almaty. The students are the roster rows in the assignment's seats, counted with a head request so that no student row is read. An assignment without seats (Physics 1's only proctor) counts the whole roster.
  - TO CONFIRM counts the scheduled assignments that are neither confirmed nor questioned.
  - Conflict: the frame's caption "Mathematics 2 · Thu" sits beside an exam on Fri 9 Oct. The plan has no confirm-by day, so the caption is the course and the exam's own weekday.
- **The banner** shows the soonest assignment to confirm.
  - "Dana Akhmetova assigned you…" names the exam's `created_by`, the exam office member who made it, because no table records who assigned the seats. Without one it reads "The exam office".
  - "on Fri 9 Oct" is the exam's date.
  - An assignment without seats gets its own sentence ("assigned you to this exam").
  - The search field and the bell stay hidden, as Phase 0 decided.
- **The sidebar's user line** reads "Proctor · Group 204" (WP 1.2's shell), where 0.9 writes "Proctor · 3 exams". Reports and Students stay hidden until 1.10 and 1.11 build them.

**0.9a Confirm seats**
- Confirm seats calls `confirm_seats` without text, through a server action that checks its input with `ConfirmSeatsInput`.
- **Ask for a change has no frame.** It turns the same dialog into a note for the exam office in the Dialog's field slot, as 2.4b's Write a message does. Back returns to 0.9a, and Send request calls `confirm_seats` with the note (1 to 500 characters). For this, the kit's Dialog gains `onCancel`, a Secondary action that keeps the dialog open.
- While an assignment is not confirmed, its chip stays a button. A proctor who asked for a change can still confirm, which clears the request, as `confirm_seats` does.
- The toasts, the field, Back and Send request are new keys, added-not-in-figma.
- 0.9a is centred over the page beside the sidebar, as the frame places it (left 628 px). The kit's other dialogs (2.4e) stay centred in the window.

**The change request reaches the exam office.** 0.5 and the wizard's proctor table are WP 1.3 (#16, not merged; its 0.3 proctor table already marks "Change requested"). Until then the exam office sees a request in two places:
- 0.1's exam row: the status chip of an upcoming exam with an open request reads "Change requested" (warn) in place of Scheduled.
- The lobby: a warn Banner per request above the start banner, with the proctor, the seats and the note in quotes. It shows for the exam office and admins only.

Neither frame draws these, so both use new keys, added-not-in-figma.

**1.5a Student card**
- **Opening and closing.** Popover/Student (`StudentPopover` in `@uki/ui`) opens when the pointer rests on a lobby row for 300 ms. It closes 200 ms after the pointer leaves the row and the card. A click, Enter or Space on the student's name also opens it, so the keyboard reaches its buttons. A card opened by the pointer neither takes the focus when it opens nor gives the focus back when it closes; otherwise the next row's card would close at once.
- **Placement.** The card sits where the frame draws it: 21 px right of the row's edge and 5 px under the avatar.
- **Not joined.** A student who has not joined has no session, so their row has no card.
- **The bar.** The four steps are System, Identity, Rules and Ready, from `sessions.state`. Steps before the current one are done. The current step is warn while something holds the student there, done once ready, and to do otherwise.
- **The chip** reads "help" for Needs help, as the frame does, and the row's chip otherwise.
- **The facts** are Problem (the lobby's detail, or "Card unreadable" for the card) and Device. Figma's Camera fact ("On · 1 face") is left out: the server only learns of a camera problem at the system check, not that the camera is on.
- **Verify by hand** would confirm a student's identity by hand, and the plan builds no identity override, so it is hidden. For a student held by the card check, Identity help (opening 1.5b) takes its place. Other students get only Message, which opens 2.4b's Write a message for that student.

**1.5b Identity help**
- **The drawer** is the kit's new `Drawer`: 460 px on the right over the scrim, with a close icon, a scrolling body and the footer. 1.5a's Identity help opens it, and it gives the focus back to the opener when it closes.
- **The header.** The device line is "macOS · Üki 1.4.2"; see the network type below. The tries pill comes from `status.detail`.
- **The tries log.** The server has no record of each try. The app reports only the latest count in `status.detail` (`card:retry:n`, then `card:help:n`), and sends `student.help_requested` with topic identity when it moves to 1.3a. So the log lists the session's identity help requests and the proctors' messages to it, with their times, in Phase 0's event wording. Figma's per-try rows ("Try 2 · glare on the card") need a per-try event, which waits for Phase 2.
- **Audit.** Opening the drawer reads the student's events, so it writes one `identity_help.read` audit row on the session.
- **What happens next is hidden.** "Start now, check later" would need an identity override and "Remove from this exam" a removal, and the plan builds neither. With only "Give one more try" left there is nothing to choose, so Send hint is the action. The other two options go to Phase 2.
- **Send hint** sends the proctor's own words (up to 200 characters, the frame's counter) through the `command` function as a `message` command with `scope: "student"`. The student's app shows it as 2.1e over 1.3a (WP 1.6). The helper names the student's app language from `sessions.locale`; the text is not translated. The frame's example hint is the field's placeholder. A toast confirms the send.
- **The lobby row of `card:help:n`** now reads "Card unreadable · 3 of 3 tries", as 1.5b draws it. This replaces Phase 0's reuse of "retry 3 of 3".

**The network type is missing.** The lobby polish asks for the network type on the lobby row "if the data exists"; it does not.
- `sessions.device` holds `os`, `app_version`, `browser` and `lock_version`.
- `status.detail` carries only network problems at the system check (`network:slow`, `network:offline`).
- The app collects neither the network type nor the OS version (Figma: "macOS 14 · Wi-Fi"), as Phase 0 noted for 1.5.

Showing them needs the app to report both (`Device` in the contracts and `join_exam`), so the rows, 1.5a and 1.5b keep "macOS · Üki 1.4.2". Call stays hidden.

**Russian layout notes for P.18**
- "Сегодня 22:00" is kept on one line in the NEXT EXAM tile.
- The drawer title is "Помощь с личностью", and the card's button is "Помочь", so that both fit.
- The kit's drawer title now wraps rather than cutting a long translation.

**The UI kit**
- `Drawer`
- `Dialog`'s `onCancel`
- `RowExam`'s `onStatusClick`: the chip becomes a button above the row's link
- `StudentPopover`'s `sideOffset`, `alignOffset`, `onOpenAutoFocus` and `onCloseAutoFocus`

**The e2e on a long-running stack.** The seeded Mathematics 2 starts 15 minutes after a reset, so on the shared local stack it has usually started. `e2e/proctor.spec.ts` then moves it back to scheduled for its run and restores the row, Nurlan's assignment and the audit rows it wrote. On a fresh stack, as in CI, it changes nothing.

## 2026-10-08 · 1.11 Students and settings

Choices WP 1.11 made for A.2 (104:10579), A.3 (105:10746) and A.4 (106:10905) where the plan leaves room, or where a frame and the plan disagree. The plan decides behaviour and Figma decides visuals.

**Who and what is audited**
- **The exam office only.** The plan's route table gives `/students`, `/students/[studentId]` and `/settings` to the exam office; 0.9 draws Students in a proctor's sidebar too. The plan wins: `NAV.students` and `NAV.settings` are on for the exam office and admins, a proctor's sidebar has no Students item, and the three pages give a proctor a 404. RLS would show a proctor the students of assigned exams, so a later package can open A.2 to proctors with a role check and nothing else.
- **Audit rows.** A.2 writes one `students.list` row (object `student`, no id) per page view and A.3 one `student.read` row with the student's id, both through `audit_read` and before the read. A failed audit write fails the page, so student data is never shown without its row. Search, filters and paging run in the browser on the rows already read and add no rows. A.4's changes are audited by WP 1.1's `workspaces_settings_audit` trigger (`settings.update` with before and after).
- **Faculty scope.** A.2 lists the faculty chosen in the workspace menu (0.1c), as the overview does, and its breadcrumb reads "Students / <faculty>" or "Students / All faculties".

**A.2 Students**
- **READY and NEED SETUP are not drawn.** "App and extension paired" and "not paired or old version" have nothing behind them: the app reports its system and version only inside an exam session (`sessions.device`), never a pairing, and setting up the app and the Lock is the Phase 2 install flow (1.0, 1.0a, 1.0b). The tile row keeps STUDENTS ("in N faculties") and FLAGGED THIS TERM, two tiles across.
- **Flagged this term** counts the students with a flag in an exam of the current term, from `term_sessions` with A.1's term rule (1 September to 31 January, 1 February to 31 August, by the Almaty date). The Flagged tab shows the same students.
- **Filters.** The plan filters by group, programme and year; the frame draws no filter and a "Group 204 · 128" tab. The tab became the Group filter, and Group, Programme and Year are pill menus drawn as the header's Search field (45:2054) with a chevron, before the search field. Each lists the values the students have with their counts, then "All …"; a chosen filter fills its pill with the brand wash the menus use for a chosen row. Import CSV is hidden: students arrive only with an exam's roster (0.3).
- **The header row** keeps the frame's search at 300 px when there is room. The search starts at 160 px and grows to 300, so it gives way before the filters, and below that the row wraps with the search on the right (Russian at 1280, both languages at 1024).
- **Search** matches every word of the query in the name, in any order and case, or digits within the student number. The search, the filters and the tab are kept in the address (`?q=`, `?group=`, `?programme=`, `?year=`, `?tab=flagged`), so Back from a profile returns to the same list and a link opens it; values that do not parse are dropped.
- **Rows** follow the frame's order: the most recent exam first, then by name. 25 rows per page with the footer's "1–25 of 448" and the two icon buttons.
- **Status chip:** "in review" while a session has a flag newer than its decision (WP 1.1's queue rule), else the latest decision: "follow-up" (talk to the student), "no issue", or "committee", which the frame does not show and which takes the flag colour; "clear" without flags. The flags Count is neutral at 0, yellow at 1 and 2 and coral from 3, as the frame's rows are.
- The group cell's second line ("Mathematics, year 2") comes from `students.programme` and `year`. The seed has neither until seed v2 (WP 1.14), so the line is empty locally.

**A.3 Student profile**
- **Message, Export data and the readiness badge are hidden.** Messaging a student outside an exam has no Phase 1 behaviour, Export data is A.5b's copy request (WP 1.12), and "APP + LOCK READY" has nothing behind it (see A.2). The language badge is the student's `locale` (ҚАЗ, РУС, ENG).
- **Devices** has one row per app (system and version) and per Üki Lock (browser and version) that the student's sessions reported in `sessions.device`, each "seen" on its last `last_seen_at` (or `joined_at` before the first ingest call). The app reports neither the laptop's model ("MacBook Air") nor the system version ("macOS 14"), so the row's title is the system; a Lock's pairing time is not recorded, so "Paired 18 Sep" reads "Üki Lock 0.1.0 · seen 18 Sep". A Lock row appears only when a session reported `lock_version`.
- **Consent** shows the latest acceptance from `rules_accepted_at` and `rules_locale` (plan, Decisions: Consent record): "Exam rules · Қазақша", "Accepted 9 Oct, 09:58", the language in its own name. With none yet it says "Not accepted yet". "Camera on device" is hidden: the camera permission is not recorded.
- **Data kept:** "Flagged frames · N" counts the student's `frames`, and "Deleted on" is the newest still plus the workspace's `retention_days`, when retention removes the last of them (9 Oct + 90 days = 7 Jan 2027, as the frame reads). Conflict: the frame dates the event log's deletion too, but the plan's retention deletes stills only and keeps events until a delete request, so the event log reads "Kept until a delete request". "Video · 0 MB, Never uploaded" is always true. Delete on request appears once WP 1.12 turns `NAV.privacy.built` on, and leads to the privacy centre.
- **Stat captions:** "since <first exam's date>", "<n> in <the course with the most flags>", "<latest decision> · <n> to committee"; a tile without data has no caption.
- **Exam history** rows read "87 of 90 min · 3 flags" from `time_used_s` and the exam's duration; before the student submits they read "90 min · 1 flag".

**A.4 Settings**
- **Each change saves at once:** the frame has no Save button. A server action updates `workspaces.settings` through PostgREST as the signed-in staff member (the column grant, the exam-office policy and the CHECK constraint of WP 1.1 apply), a toast confirms, and a refused save puts the control back and says why. `save_exam_draft` reads the new defaults when it makes the next exam.
- **The plan's four settings and the frame's fields.** Keep flagged frames is `retention_days`, Gaze threshold and Phone confidence are `default_checks.gaze_s` and `phone_score`, and Browser lock and Identity check are `default_checks.lock` and `identity`. The plan's lobby minutes and default duration are not in the frame; they join as a third row of the same selects, "Default duration" and "Lobby opens · 20 min before the start". The choices are 0.4's durations, 0.2's gaze (1, 2, 3 s) and phone (0.75 to 0.95) values, 30 to 365 days and 10 to 60 minutes, plus the current value when it is not one of them. `face_missing_s` keeps its value.
- **Fixed rows.** Rules language is drawn fixed on Қазақша (the select disabled): `settings` has no rules language, students start in Kazakh and switch on 1.1, and the app reads no exam-level rules language. Gaze control, Phone detection and Second person always run on the laptop, so their switches are on and disabled, as on 0.2 (WP 1.3); the disabled switch is lighter than the frame's.
- **Phase 3 stays hidden:** the right column's Integrations and Team (A.4a to A.4d: single sign-on, roster import, webhooks, team and Invite a proctor) are not drawn, and their column stays empty so the left column keeps the frame's width. The top bar's search and notifications stay hidden, as on every page (A.8, A.7).

**Dates and strings**
- Dates are in Asia/Almaty: "9 Oct" and "9 окт" without the full stop Intl puts after a Russian short month, "7 янв 2027" without "г.", and September as the frame's "Sep" where current ICU data writes "Sept".
- 112 keys in `packages/i18n/dashboard-students.json` (`dashboard.students.*`, `dashboard.settings.*`), first-pass Russian for P.18. Added, not in Figma: the filters and their values, the empty lines, the paging buttons' names, the Lock row without a browser, "Not accepted yet", "None kept", "Kept until a delete request", the two new selects, the save messages and "committee".

## 2026-10-08 · 1.13 Landing site

Where the Landing frames (114:2039, 192:3586, 194:4014, 195:4090, 196:4125, 197:4144) and the plan disagree or leave a gap. Figma decides visuals, the plan decides behaviour.

- **Product shots are images.** The live wall in the hero bezel and the three feature panels (live wall, Üki Lock, review) are exported from Figma at 2x as WebP, with the generated backdrop baked in. Their demo data stays English in Russian too; the alt text is translated. The floating cards around the hero bezel (Watching, the Lock toast, the integrity report) are built from `@uki/ui` with dashboard keys.
- **Sign in is in the header.** The plan puts it there ("Sign in in the header opens /sign-in"); the frames have no Sign in. It sits before the language switch in the header's link style, and in the 390 menu.
- **ҚАЗ is hidden in the public language switch.** The public pages have English and Russian strings only (`dashboard-landing.json`), so the switch shows РУС and ENG. It writes the `uki_locale` cookie that the dashboard reads (WP 1.2's `src/i18n/locale.ts`, with the options of 3.4a's cookie), through its own server action, because the account menu's action needs a staff session. The current language is drawn at full strength; the frame draws all three at 60 %. Kazakh landing copy is a question for you.
- **The 390 menu has no open frame.** The menu button opens the header's links, Sign in and Book a pilot in a floating surface; Escape and any link close it.
- **Book a pilot sends the frame's three extra fields too.** Students in one exam, When and the Demo Day invite go to `request_pilot` as `exam_size` ("from100"), `pilot_month` ("2026-11") and `demo_invite`, the columns WP 1.1's migration added beside the plan's five; the action checks them with the `PilotRequestInput` contract. Sent shows the Request row only when the server returns a reference; `request_pilot` answers `{ status: ok | rate_limited }`, so PIL-2026-0142 does not show. A refusal shows on the form's error line, with copy drafted for it.
- **Drafted copy, for your read-through on Monday 12:** FAQ answers 2 to 6 (the frames show only the first one open; the answers reuse the other frames' wording), the Your role and Students in one exam options other than the frames' values, the form's error lines, and the alt text. When lists the next six months from today, formatted per language.
- **Link targets.** The frames draw links without targets. See the demo goes to the product section; See the live wall, See Üki Lock, See a report, Write to the team and Contact go to `/pilot`; Data map to the privacy section; Audit log to `/privacy#access`; Security to `/terms`; Case 3 to the universities section; Team to the FAQ.
- **The CTA sticker is the component's vector.** Exporting the sticker instance (118:3547) or the component (Mascot Sticker 3:39) as PNG brings the showcase's background with it, so the celebrating sticker's vector was exported and rasterised to a transparent WebP at 2x.
- **Between 1024 and 1440** the pages keep the 1440 arrangement, with these changes so nothing is cut off (there is no frame between the two widths): below 1280 the header's gaps tighten, Flag ≠ fail and Universities stack, the privacy cards and footer columns narrow, and the hero shows only the Watching widget on its bezel, as at 390; from 1280 the bezel narrows until its floating cards fit the window and reaches the frame's 1057 at 1440. Book a pilot goes to two columns from 1280. Below 1024 the 390 layout applies. 1440 and 390 are as the frames.
- **Long Russian words.** On the public pages, Russian words of 12 letters or more may hyphenate (`hyphens: auto` with `hyphenate-limit-chars: 12 5 4` under `:lang(ru)`), and a word that still does not fit breaks: «экзаменационная» and «конфиденциальности» ran out of the 390 window in the /pilot and /privacy headings. English never hyphenates. The /pilot band is at least the frame's 520 from 1280 and grows with the longer Russian pitch.
- **The evidence cards' time.** The kit's Evidence card cut the time after a long chip: the Russian chips on Flag ≠ fail, and in English the cards between 1280 and 1440 and the third card at 1440, which the frame itself draws cut off (`10:45:5`). WP 1.8 changed the card to wrap the time under the chip, and the landing takes that change rather than a second edit of the same kit file. At 1440 the third English card is therefore one line taller than in the frame.
- **Where `/` sends staff.** Through WP 1.2's `staffHomePath`, as sign-in does: the exam office to the overview, proctors to `/my-exams` (WP 1.5).
- **Server components and the kit.** `@uki/ui`'s barrel pulls in Radix and React contexts, which server components cannot import, so the public pages take Button, Badge, EvidenceCard, LiveWidget, LockToast and StatusDot through one client boundary (`features/landing/kit.tsx`).
- **pilot-notify** emails the team one plain-text English message per request through Resend's HTTP API: to `UKI_EMAIL_SINK`, from `UKI_EMAIL_FROM` or Resend's `onboarding@resend.dev` until a domain is verified, with the visitor as Reply-To. It runs with `auth: "secret"` (the trigger's pg_net call carries the secret key from Vault), so without the Vault secrets, as on a fresh local stack or in CI, the trigger sends nothing and the request is still stored. `RESEND_BASE_URL` points it at a stub in tests, and `RESEND_*` passes through Turborepo like `UKI_*`.
- **No real email from a local stack or CI.** pilot-notify uses WP 1.4's arrangement: `pnpm functions:serve` and `pnpm dev` serve the functions with `supabase/functions/local.env`, whose `RESEND_BASE_URL` is a stub on the host (`host.docker.internal:25790`, 54790 until “The Resend stub's port” below), so nothing leaves the machine. `UKI_EMAIL_SINK` is left out of that file, and pilot-notify sends only to it, so its sending tests skip in a plain `pnpm test:integration` (one test checks that nothing is sent without it). CI's stack job serves the functions again with `UKI_EMAIL_SINK=sink@uki.test` and runs `test/integration/pilot-notify.test.ts` there beside `send-invites.test.ts`. WP 1.4's stub serves Resend's batch endpoint; pilot-notify's tests use their own stub for the single-email endpoint (`test/integration/resend-email-stub.ts`) on the same port, one file at a time. A second stack points the tests at its own env file with `UKI_FUNCTIONS_ENV_FILE`.
- **The trigger path in tests.** `test/integration/pilot-notify.test.ts` creates the two Vault secrets for the run (`uki_project_url` is `http://kong:8000`, the API gateway as the database container sees it on the stack's Docker network; `uki_secret_key` the stack's secret key), sends requests through `request_pilot`, waits for the stub's emails and pg_net's responses, and deletes the secrets again. A stack that already has its own Vault secrets is left alone and the test is skipped.

## 2026-10-08 · The Resend stub's port

- **What failed.** CI's stack job failed once, in run 37795069254 (the push run of PR #21), when the second `send-invites.test.ts` run, the one with `UKI_EMAIL_SINK`, could not start the stub: `listen EADDRINUSE 0.0.0.0:54790`. The pull-request run of the same commit passed. No stub was left listening: the first run's stub had closed with its run 2.5 minutes earlier, and nothing else starts one.
- **Why.** 54790 is in Linux's ephemeral range, 32768 to 60999, and the step starts seconds after the demo scripts' traffic. Linux refuses a listener on a port that an outgoing connection holds as its local port, open or for the 60 s of TIME_WAIT, even with the `SO_REUSEADDR` Node sets. A Linux container with the range narrowed to 54790 reproduces the error with one connection. In CI run 37798756353, as the sink step started, 131 ports in that range were held, 138 sockets in TIME_WAIT among them, and 130 of the ports were even, the parity Linux prefers for `connect()`. So 54790 had about a 1 in 110 chance of being held at that moment.
- **The fix.** The stub listens on 25790 (`supabase/functions/local.env`). Linux starts its ephemeral range at 32768, and macOS and Windows at 49152, so no connection is ever given that port. `readFunctionsEnv` refuses a port of 32768 or more, and so does pilot-notify's stub (`resendStubSettings`), which listens on the same port in the same step. An env file for a second stack cannot bring the problem back.

## 2026-10-08 · 1.9 Report and sharing

Choices WP 1.9 makes for 3.4, 3.5, the share link, the `shared-report` function and `/verify/[code]` where the plan leaves room or a frame and the plan differ. No migration: WP 1.1's `get_report`, `create_share`, `open_shared_report` and `verify_report` carry the package, and `12_reports` tests them (its audit-row counts now count only the test's own rows, as "pgTAP tests count only their own rows" asks).

**The verify code: open, waiting for you**
- WP 1.1 prints the 12-character code as `UKI-RPT-XXXX-XXXX-XXXX`; frames 3.4 and 3.5 print `UKI-RPT-0917-MT`, a short number plus the student's initials. You have not chosen yet, so 1.1's format stays.
- Every printed code on 3.4, 3.5, `/verify` and the CSV's file name goes through one function, `printedVerifyCode` in `apps/web/src/features/report/report-model.ts`, which calls `formatVerifyCode` in `packages/contracts/src/review.ts`. A new printed form is a change there. A shorter code itself (fewer characters) would also change `make_verify_code` in a new migration and `verifyCodeFromDigest`.

**3.4 Integrity report**
- **Where it lives.** `/review/[sessionId]/report`, as the plan says. 3.3 draws no way to it, so a ghost "Integrity report" link (the report icon and 3.4's title) ends 3.3's chip row; a frame gap. Reports (A.1) stays hidden in the sidebar until WP 1.10, so Review is the active item and the breadcrumb reads "Review / exam / student" where 3.4 writes "Reports / …". The search field and the bell stay hidden (Phase 0).
- **Stills.** Each flag shows its first still at 72 × 48, as 3.4 draws one per flag. They come from Phase 0's `stills` function in the browser, like 3.3's: one audit row per still and 5-minute URLs asked for again before they expire, so a page left open still prints its stills.
- **Rows.** Identity reads "Matched on device · 09:40:55" from the session's `identity.matched` event, "Matched on device" when the result is matched without that event, and "Not checked" otherwise. Time used rounds `time_used_s` to minutes, out of the duration plus any added time. Proctor is the seat's proctor from `get_report`; an exam without one reads "Not assigned". Reviewed is the first name and the last name's initial with the time, as Figma writes "Aigerim S. · 11:52". Without a decision the Decision row reads "Not reviewed yet" and Note and Reviewed are left out.
- **Flag details** use 2.5's wording ("2.3 s, to the left"). The phone line is "Confidence 0.94 · held 6 s": Figma's "put away after the warning" and "at the lap" have no data behind them, as 1.8 decided for 2.5 and 3.3.
- **Notes.** The plan says the report shows proctors' notes, and `get_report` returns them; 3.4 draws none. A "Notes · N" list follows the flags, each "10:50:12  Note" with "“text” · name", only when the session has notes. A frame gap.
- **Data kept** (THIS EXAM): video 0 MB, the exam's frames and events, and the workspace's `retention_days`.
- **Download PDF** prints the page: `report-print.css` sets `@page` to A4 portrait with 40 pt margins (Figma's "Windows and breakpoints", PDF exports) and prints only the report page (`data-print-root`); the shell, the side column and 3.5's banner stay off the paper. The e2e prints through Chromium and checks one A4 page.
- **Export CSV** builds the session's events in the browser from what the page read: one row per event, oldest first, with RFC 4180 quoting, CRLF line ends and a leading apostrophe on a field a spreadsheet would run as a formula. The columns are the database's own field names (`at_utc`, `at_almaty`, `type`, `source`, `review`, `frame_count`, `received_at_utc`, `data`), not translated headings, so the file reads the same in both dashboard languages. The file is `uki-report-<printed code>-events.csv`. It writes no audit row of its own: `get_report` audited the read.
- **Share with the committee.** The field is a button. The first click calls `create_share` through a server action, shows the whole link in the field once (a read-only input), copies it with a "Link copied" toast and says under the field that it is shown only once. Reloading the page brings the field back, and the next click makes a new share. These three lines are new keys. Revoking is still by hand (`revoked_at`), as the open question about 3.4 has no answer yet. The Russian field text is shortened to «Ссылка для чтения · 7 дней» so it fits the 380 px column.

**3.5 and the share link**
- **Public and on the server.** `/r/[token]` sits outside the `(app)` group: no shell, never `requireStaff`, and `proxy.ts` already passes a request without an auth cookie straight through. The page calls `shared-report` from the Next.js server with the publishable key; a token that is not 43 base64url characters never leaves the server. A 404 or 400 from the function is Next.js's `notFound()`; any other failure is an error, not a not-found.
- **Headers.** `next.config.ts` sends `Referrer-Policy: no-referrer`, `Cache-Control: no-store` and `X-Robots-Tag: noindex, nofollow` on `/r/*` and `/verify/*`; the pages also carry the robots and referrer meta tags, and the stills `referrerpolicy="no-referrer"`, so the token in the address never reaches the storage host. A production build (`next build`, `next start`) keeps all three headers, the 404 included.
- **One refusal.** `shared-report` answers an unknown, revoked or expired token with the same 404 `no such share` and writes no audit row; `open_shared_report`'s reason stays inside the function.
- **Stills** are signed for 5 minutes on every view (`STILL_VIEW_URL_TTL_S`); a 3.5 tab left open longer prints without them until it is reloaded, which is another audited view.
- **The banner** reads "Read-only. Shared by Dana Akhmetova, KRU · Kostanay. Link expires …" where Figma writes "KRU exam office": a proctor may share too, and the payload carries the workspace's name, not a short name. The footer likewise reads "recorded in the KRU · Kostanay audit log".
- **The decision note.** Figma writes it for "Talk to the student" only; "No issue" and "Send to the exam committee" get one each (new keys), and a session without a decision gets none.
- **Issued** is `reports.issued_at`, when the current code was made (WP 1.1).
- **Language.** A visitor has no staff member, so 3.5 is English unless the `uki_locale` cookie says Russian.
- **On a phone.** The exit criterion opens 3.5 on a phone, though Figma has no 390 frame of it and "Windows and breakpoints" gives the dashboard a 1024 minimum. Below 1024 px the report page and This copy stack in one column with 16 px margins and the banner wraps; below 640 px the row labels narrow from 150 to 112 px. The e2e checks that nothing is wider than 390 px.
- **Not found.** No frame draws it. `app/r/[token]/not-found.tsx` shows the wordmark, "This link is not available" and "It may have expired or been withdrawn. Ask the exam office for a new link." (two new keys), with HTTP 404.

**/verify/[code]**
- 3.5's banner carries the answer, and This copy's Report ID row shows the code. The two result lines are new keys (a frame gap, as the plan expects): "This code belongs to an Üki integrity report that has not changed since it was issued." and "This code does not match a current Üki integrity report. The printout may be of an older version." A changed report and an unknown code read the same, and only an unchanged one adds the exam, its date, the student's initials and when the code was issued.
- The code is accepted with or without the prefix, spaces or hyphens (`normalize_verify_code`). Neither 3.4 nor 3.5 prints where to verify, since no frame has that string.

**Strings.** 59 keys in `packages/i18n/dashboard-report.json`, English from 3.4 and 3.5. Keys without a Figma source: `doc.identity` (matchedNoTime and other arms), `doc.noProctor`, `doc.noFlags`, `doc.still` (alt text), `doc.notes`, `doc.noteDetail`, `doc.decision` (other arm), `share.copy`, `share.copied`, `share.once`, `share.failed`, `shared.banner` (no-name arm), `shared.decisionNote` (no_issue and committee arms), `verify.*`, `notFound.*`, `breadcrumb` (Review in place of Reports). The Russian is a first pass for P.18.

## 2026-10-08 · 1.3 Exam wizard

Decided by the WP 1.3 agent while building 0.4, 0.2, 0.2a, E.1, 0.3, 0.3a, 0.3b and 0.5. Where the plan and a frame disagree, the plan decides behaviour and the frame decides visuals.

**Flow and saving**
- `/exams/new` makes the draft with `save_exam_draft` and redirects to `/exams/[examId]/edit/details`, as the plan says. 0.1's New exam (exam office and admin only) is a button that calls the same server action, not a link, so no prefetch ever makes a draft. Import CSV stays hidden: no Phase 1 frame imports exams. A draft's row on 0.1 opens its wizard for the exam office; a proctor's still opens the lobby.
- Every change saves into the draft after a 500 ms pause; Next and Back wait for the save, and leaving the page sends what is left. A refresh or a second tab therefore loses nothing (e2e: a check changed on 0.2 survives a reload; the title survives Back).
- The stepper has the frames' four items. E.1 is part of Checks: Next on 0.2 goes to E.1 for a browser exam, as the plan says, and E.1's top bar reads "Browser rules" as the frame does. From 0.2 on, the breadcrumb is "Exams / <exam title>", as 0.2, E.1, 0.3 and 0.5 draw it.
- A scheduled exam opens only its roster page (0.3b fixes a bounced address after the invites went out); its other wizard pages lead there. A live or finished exam's wizard leads to its lobby.
- 0.5's Save draft returns to 0.1 (everything is saved already). Schedule exam returns to 0.1 with `?scheduled=<code>`, and 0.1 shows the code in a toast once; a schedule_exam problem shows on 0.5 with a link to the step that fixes it.

**0.4 Details**
- Course is a text field with the workspace's earlier courses offered while typing, drawn like the frame's select: there is no course table. Type offers Midterm, Final, Quiz and Test and stores the English word, as the seed does, so the app's `exam.type.<kind>` keys still apply.
- Popover/Date picker (147:2727) is built in `features/wizard/date-picker.tsx`; the kit has no date picker. The frame has no control for the start time, so its footer line holds a 24-hour HH:MM field (a native time field showed AM and PM in Chromium).
- At a glance shows the exam's `rules_locale` (Kazakh when unset) as "Қазақша, then РУС, ENG"; no frame lets the exam office change it, so the wizard does not.

**0.2 and 0.2a Checks**
- `exams.checks` switches only the Browser lock (`lock`) and the Identity check (`identity`). Gaze control, phone detection and second person always run on the laptop, and the microphone is never used, so those four rows are fixed (the switch is drawn disabled, which is lighter than the frame's switches).
- The thresholds offer 0.2a's three gaze values (1, 2 and 3 s) and phone confidence 0.75 to 0.95.
- 0.2a's "How gaze control works" is hidden: there is no page for it.
- The Student preview shows the student app's own 1.4 lines from the catalog (`rules.window.body`, `rules.eyes.body` with this exam's seconds, `rules.phone.body`, `identity.title`, `rules.video.title`) in ҚАЗ, РУС or ENG, so the preview is what the student will read. The frame's wording differs a little, and its Kazakh text does not exist; no catalog key was added.
- The 3D laptop shield is the desktop app's `uki-3d-laptop-shield.png`, byte for byte the Figma export of the frame's asset.

**E.1 Browser rules**
- Block developer tools and Block screen sharing are fixed by Phase 0 and carry its labels, "University-managed computers only" and "Detected" (Phase 1 plan, Scope). Pause other extensions is Phase 2, so its row is hidden.
- The calculator is the "Calculator · built in" chip: its close button turns `browser_rules.calculator` off, and an "Add the calculator" chip turns it back on. The exam's own host comes from the exam link and cannot be removed.
- The preview is the kit's Lock popup with the catalog's Lock strings, as the Lock shows it in Phase 0 (no Other extensions row); "3 open" is a sample. "Test as a student" and its note are hidden: nothing in Phase 1 opens an exam in a locked window from the dashboard.

**0.3, 0.3a and 0.3b Roster**
- The header row is matched by name (English, Russian and Kazakh spellings); without one, the plan's column order applies. The plan's columns stand (Open questions): the empty drop zone's caption names the language column too, and a file with no language column gives every student Kazakh, so Figma's four-column export also works.
- "Row 17" counts data rows, the first after the header being 1.
- The frame's error list has no action, while the plan says Edit opens 0.3b: each bad row gets an Edit that opens a panel in 0.3b's layout for the row's first problem (the old value struck through, the new value; a select for the group and the language). Its titles beyond "Fix <name>’s email" are new keys. The valid rows' Edit changes the address.
- Nothing is written while a row has a problem. The file is imported as soon as its last problem is fixed, or when the exam office presses the frame's "Skip N rows", which imports only the valid rows. "Download error report" writes a CSV in the browser. "Upload fixed file" and "Replace file" pick a new file; `import_roster` replaces the roster, so a second import adds nobody.
- The file's name and counts are kept in the browser (local storage, per viewer) for the card and 0.5; without them the card reads "Roster".
- 0.3's third tab is "Needs a fix" (0.3a and 0.3b draw it) instead of "Not opened": opens are not tracked. After the import it counts bounced and failed invites; before it, the file's bad rows.
- The proctors card has no editing frame: Add proctor and a click on a proctor open a dialog with the proctor, the seats and the languages, suggesting the seats after the last range. A gap or an overlap is refused before and by `assign_proctors`, with new messages naming the seats. Each proctor's chip is Confirmed, Not confirmed or Change requested from `confirmed_at` and `change_request` (0.9a), where the frame shows Confirmed for both. Languages are listed Kazakh, Russian, English.
- 0.3b names the student by the first name, as the frame does ("Fix Yerlan’s email"). Save upserts the invite (the Phase 0 seed has no `invites` rows), back to `pending`; "Also fix it in the roster for later exams" also writes `students.email`.
- Reading the roster writes one `audit_log` row (`roster.view` on the exam) through `audit_read`.

**send-invites (WP 1.4)**
- The wizard calls WP 1.4's `send-invites` as the signed-in exam office member, with `SendInvitesInput` and `SendInvitesOutput` from `@uki/contracts`. `SEND_INVITES_READY` and the wizard's own copy of those schemas (`features/wizard/send-invites.ts`) are gone, so nothing can switch the invites off again by mistake. 0.3b's input and the Resend input are contracts too (`FixInviteEmailInput`, `ResendInviteInput` in `wizard.ts`). The PostgREST row shapes the wizard reads (`RosterEntry`, `WizardGroup`, `WizardProctor`) stay next to their queries, as every other dashboard feature keeps its rows.
- Send a test invite (0.5) sends `{ exam_id, test: true }`. send-invites writes it for the roster's first student and answers 409 on an empty roster, so the button is disabled until the roster has a student, with "The test invite is written for the first student, so it waits for the roster." (`review.testInviteNeedsRoster`, a new key in place of `review.invitesUnavailable`). The toast says sent only when the reply has one email sent and nothing failed.
- Schedule exam runs `schedule_exam`, then `send-invites` with `{ exam_id }`, then returns to 0.1. The exam stays scheduled whatever the send does. The action then counts the exam's invites that are not `sent` (under RLS, so a call that failed as a whole counts every invite) and, when there are any, 0.1's address carries `&exam=<id>&unsent=<n>`: a second toast says "N invites did not go out. The roster says why." with Open roster, which opens 0.3 for that exam, where each such row reads Not sent · error or Email bounced and has Fix email. New keys: `overview.unsent`, `overview.openRoster`. The query string is checked (`parseScheduledNotice`): the code with the contracts' `ExamCode`, the exam with `Uuid`, the count as a whole number up to the roster limit.
- 0.3's Resend sends `{ exam_id, student_ids: [id] }` (`resendInvite`) and says the outcome in a toast (`roster.resent`, `roster.resendFailed`, new keys); the row's chip follows after the refresh.
- 0.3b's Save puts the invite back to `pending` with the new address (as before), and on a scheduled exam then calls send-invites with that student's id, so the fixed address gets its invite at once; the row then reads Sent · not opened, or Not sent · error with the reason. A draft's invite waits for Schedule exam.
- **0.1 links a bounced invite to its roster.** A scheduled exam opens only its roster page in the wizard, but no frame leads there, so the exit criterion's "the seeded bounced address is fixed through 0.3b and resent" had no way in except the address bar. 0.1's readiness card already counts the next exam's bounced invites ("Roster 127 of 128"); for the exam office it now ends with "Fix 1 address →" to that exam's roster, drawn like the next-exam card's Open lobby, only while an invite has bounced (`wizard.overview.fixRoster`, a new key; added, not in Figma). Proctors do not get it: the wizard is the exam office's.

**0.5 and a proctor's change request (with WP 1.5)**
- The plan has the exam office see a change request "on 0.5 and in the exam's proctor table"; WP 1.5 left both to this package. 0.3's proctor card already reads Change requested. On 0.5 the proctor's row now ends with "change requested: “<the proctor's words>”" in place of "waiting for confirmation" (`review.people.changeRequested`, a new key; 0.5's frame draws only confirmed and waiting). The footer still names them as not confirmed, which a request is.

**0.5's footer and the reminder**
- **The reminder promise is hidden.** 0.5's footer for an unconfirmed proctor read "…You can schedule now; they get a reminder." No reminder email exists in Phase 1 (send-invites mails students only, and WP 1.5's 0.9a has no reminder), so the line now ends at "You can schedule now." (`review.footerWaiting`, in English and Russian). The frame's ", he gets a reminder" returns when a reminder is built, in Phase 2 at the earliest.

**Untitled drafts on 0.1**
- New exam makes the draft before 0.4 has a title, so a draft the exam office leaves at once would be a row on 0.1 with no name, no course and no groups, linking to a wizard nobody remembers. 0.1 leaves a draft with an empty title out of the table and the Upcoming count (`shownOnOverview`, applied where the rows are parsed, so the sidebar's counts agree). A draft shows again once it has a title. The empty drafts stay in the database; seed v2's `pnpm demo:reset` (WP 1.14) is to delete the exams the wizard made, these included.

**Database**
- `assign_proctors` emptied its scratch table with a bare `DELETE`, which PostgREST's pg-safeupdate refuses, so the dashboard could never save a proctor; pgTAP did not see it because it runs outside PostgREST. `20261011090000_assign_proctors_safeupdate.sql` replaces the function with `where true` on that statement and nothing else. `16_wizard_1_3` checks that no function in `public` deletes without a WHERE clause.
- The migration was written as `20261010010000_…` and renamed before the merge to `20261011090000_…`, so it sorts after every migration on main (`20261010060000_help_topics.sql` landed meanwhile) and `supabase db push` accepts it; its pgTAP file became `16_wizard_1_3`, since main has `15_ask_proctor`. It was never on main under the old name.

## 2026-10-08 · Dashboard string files and the strings review sheets

Decided by the agent that built the review sheets for P.18.

- **Dashboard strings live in `packages/i18n/dashboard.json` and one `dashboard-<area>.json` per dashboard area**, for example `dashboard-wall.json`, `dashboard-wizard.json`, `dashboard-review.json` and `dashboard-landing.json`. `pnpm i18n:build` merges every file matching `dashboard-<area>.json` into `messages/en.json` and `messages/ru.json`, and fails on a key that two files define. CLAUDE.md (Sources of truth, item 3) and `docs/phase-1-plan.md` (Screens: "Dashboard strings stay in `dashboard.json` and `dashboard-wall.json`") name only the first two files. One file per area lets parallel branches add strings without editing the same file, and the build has merged them this way since WP 1.2. CLAUDE.md and the plans are not edited; read their two names as "`dashboard.json` and the `dashboard-<area>.json` files".
- **`pnpm i18n:export`** writes `docs/i18n/strings-review.csv` (every string), `strings-review-kk.csv` (the strings with Kazakh) and `strings-review.xlsx` (the same two tables as sheets). The where column is derived, since no file stores it: catalog keys under `email.` are the email, keys under `lock.` and `os.` (E.3's operating system names) are Üki Lock, every other catalog key is the student app, `dashboard-landing.json` is the landing site, and the other dashboard files are the dashboard. The catalog's `source` is kept; dashboard rows have none, because the dashboard files keep no source per key, and their notes name the file instead. Rows use the catalog's own keys; where the apps use a renamed key, the note says so.
- **`pnpm i18n:import`** writes only Russian and Kazakh. English comes from Figma, so an edited English cell is reported and left as it is. Before anything is written, the edited strings go through the build's own checks (`buildMessages`), so one broken placeholder refuses the whole sheet rather than half of it.
- **The .xlsx is written without a library.** Python's openpyxl is not installed on this Mac, and a JavaScript spreadsheet library would be a large dependency for two sheets. `packages/i18n/scripts/lib/xlsx.ts` writes the SpreadsheetML parts and zips them with `node:zlib`: shared strings, every cell formatted as text so `+{minutes} min` is never read as a formula, wrapped text, a frozen and filterable header, and a fixed zip timestamp so the same strings give the same file. macOS Quick Look renders it.

## 2026-10-08 · 0.15 Release

Choices WP 0.15 made in making "Download" real. The Phase 0 plan's Pipelines has `desktop-dist.yml` attach the installers to a draft release; a draft has no public address, while the invite email's download button (1.4) and the README point at the latest release.

- **A published release, not a draft.** With `publish` on, `desktop-dist.yml` publishes `v0.1.<run number>`, neither a draft nor a pre-release, with `--latest`, so `https://github.com/k4ssymzhomart/uki/releases/latest` and `.../releases/latest/download/<file>` serve it. Only a run on `main` may publish; with `publish` off the run builds everything and keeps the files and the notes as its `release` artifact for 14 days. This replaces 1.4's note that the workflow "makes a draft release": the default `UKI_DOWNLOAD_URL` now works without a secret.
- **Six files with stable names, no version in them:** `Uki-mac-arm64.dmg`, `Uki-mac-x64.dmg`, `Uki-Setup-win-x64.exe`, `Uki-win-x64.zip`, `Uki-Lock-chrome.zip`, `Uki-Lock-edge.zip`. electron-builder and WXT keep their versioned names in the build folders; `pnpm release:assets stage` copies each build's one matching file under its release name, refuses none or two matches (an old build left behind never ships), and the release job refuses a folder that is not exactly these six. The lab zip is never among them: `dist:lab` does not run in the workflow, and its name cannot match the Windows zip's pattern.
- **The version is the run's.** The apps and the Lock are stamped `0.1.<run number>` at build time (`npm pkg set version` on the runner); `package.json` in git stays `0.0.0`. The tag is `v0.1.<run number>`, so a re-run of the release job replaces the same release's files and notes.
- **No release without the Lock key pair.** Now that `LOCK_DEV_PUBLIC_KEY` and `VITE_LOCK_EXTENSION_ID` are repository variables, a release must carry both, or the packaged app would refuse every Lock. Preflight stops the run unless both are set and the key gives the id (Chromium's derivation, `apps/lock/src/lib/extension-id.ts`, as `make-key.ts` prints it). After the builds, the lock job and the release job read `manifest.json` inside each Lock zip and check that its key gives `VITE_LOCK_EXTENSION_ID` at the release's version (`pnpm release:assets lock-id`); the mac and Windows jobs check that the built app carries the cloud URL and the id. The Chrome and Edge zips share the key, so the Lock has the same id in both browsers. Today they are the same bytes (WXT builds the Edge target like Chrome's); both names stay, so each browser's users find theirs and an Edge-only change later needs no new link.
- **The release notes are English only.** GitHub's release page is not a product screen, so its text lives in `scripts/lib/release.ts`, not in the catalog. It lists each file with its stable link, what it is, its size and SHA-256, and the first launch of an unsigned build: on macOS right-click Open (on macOS 15 and later, System Settings, Privacy & Security, Open Anyway, since Control-click Open no longer passes Gatekeeper there) or `xattr -dr com.apple.quarantine /Applications/Uki.app`; on Windows SmartScreen's More info, then Run anyway; for the Lock, unzip, Developer mode, Load unpacked. Dropping the zip onto the extensions page is not offered, since not every Chrome and Edge version accepts a zip.
- **CI's `uki-lock` artifact.** It never appeared on `main`: WXT writes to `apps/lock/.output`, and `actions/upload-artifact@v4` leaves out hidden files and folders, so the step found nothing and only warned. The build job now stages the zips under the release names in the runner's temp folder and uploads them with `if-no-files-found: error`. The other CI artifacts stay as they are for the lab session, where the lab zip comes from.

## 2026-10-09 · 1.9 Report and sharing: decided by the user, 8 Oct

Decided by the user on 8 October, answering the verify code question left open under “1.9 Report and sharing” above and the plan's open question “Does 3.4 get a Revoke action for shares?”. Built on `wp/1.9-verify-revoke`: `20261012160000_verify_codes_share_revoke.sql`, pgTAP `19_verify_revoke`. Where this entry and the plan differ (the plan's Decisions row “Share link”, `create_share` in its function table, the exit criterion for 3.4 and the risk “A share link leaks”, all of which say 7 days, and the 3.4 and 3.5 rows of `docs/design-handoff.md`), this entry wins. Those files are exports and are not edited.

**Verify code `UKI-XXXX-XXXX`**
- A code is 8 random characters of Crockford base32 (`0123456789ABCDEFGHJKMNPQRSTVWXYZ`: no I, L, O or U), 40 bits from `gen_random_bytes`. 3.4, 3.5, `/verify` and the CSV's file name print it as `UKI-` and two groups of four, through `formatVerifyCode`. The 12-character code cut from the content hash is gone, with `make_verify_code` and `verifyCodeFromDigest`.
- Every new report draws a code no other report holds (`unused_verify_code`, up to 20 draws, then `conflict`); `report_sync` draws again if a concurrent insert took the same code. `reports.verify_code` gets a format check and, as its default, an unused code, so a row written by hand (a seed, a test) needs no code. A row written with a code must use the new form.
- The content-hash check stays as WP 1.1 built it: a report whose content changed verifies as not intact, and its next view issues a new code (and `issued_at`), after which the old one is not found. `/verify` answers both the same way, as before: “does not match a current Üki integrity report”.
- A code is read case-insensitively, with or without `UKI-`, spaces or hyphens; O reads as 0 and I or L as 1; U is refused. `normalize_verify_code` and `normalizeVerifyCode` agree.
- The migration gives every existing `reports` row a new code (`convert_verify_codes`), keeping its content hash and `issued_at`. A printout made before the change carries a 12-character code, which is now not found.

**`/verify` lookups: 10 a minute per client**
- `verify_report(code, client_hash)` replaces `verify_report(code)`, which is dropped so the limit cannot be stepped around. The Next.js server passes the SHA-256 (hex) of the visitor's address: the first `x-forwarded-for` entry, which Vercel sets itself, else `x-real-ip`, else “unknown”.
- `verify_lookups` keeps one row per answered lookup for one minute, with the hash and the time and never the address. The 11th lookup within the minute raises `rate_limited` with SQLSTATE `PT429` (PostgREST answers HTTP 429) and is not counted. The table has row-level security and no policy: anonymous visitors, students and staff can neither read nor write it; `verify_report` (security definer) and the secret key can.
- The try-again state: 3.5's banner reads “Too many checks from this connection. Wait a minute, then try again.” with a Try again button that loads the page again (`dashboard.report.verify.limited`, `verify.tryAgain`, new keys; no frame draws it, a frame gap).
- Everyone behind one address, such as a campus network, shares the 10 lookups. That is enough for checking printouts.

**Share links: Revoke, and 30 days**
- `revoke_share(share_id)` is for staff of the exam: its proctors, and the exam office of its workspace. It sets `revoked_at` and writes a `report.share_revoke` audit row with the share's id. Revoking a revoked link changes nothing and writes no second row. Anyone else gets `forbidden`, an unknown share gets `not_found`, and staff still cannot update `report_shares` directly. A revoked link gets the same 404 from `shared-report` as an unknown one, so `/r/[token]` shows the not-found page.
- `create_share` and `revoke_share` also ask `staff_may_share()`: the caller's staff role must be `exam_office`, `admin` or `proctor`. Judge mode adds a read-only role (`observer`) assigned to DEMO-LIVE; being assigned to an exam makes it pass `is_exam_staff`, and this check keeps it from making or withdrawing links. The role is compared as text, so the function holds before and after the enum gains the value.
- On 3.4, Revoke sits at the end of the “Share with the committee” label row, in danger text. It shows only while the report has a link that still opens, and a line under the field counts those links (“1 active link”). The token is shown only once, so links cannot be told apart afterwards: Revoke withdraws every open link of the report, with one `revoke_share` and one audit row each, and a toast says how many. A new link is one click on the field. No frame draws Revoke (a frame gap). New keys: `share.revoke`, `share.revokeLabel`, `share.active`, `share.revoked`, `share.revokeFailed`.
- `create_share` makes links that expire 30 days ahead instead of 7 (`SHARE_TTL_DAYS`). 3.4's field reads “Read-only link · expires in 30 days” («Ссылка для чтения · 30 дней»). Links made before the change keep their 7 days.

## 2026-10-09 · `pnpm dev` runs against the cloud; the local stack is opt-in

Step 0 of the user's VPS plan: the MacBook runs no Docker for this repository, so `pnpm dev` no longer starts a local Supabase. Branch `chore/dev-defaults-to-cloud`; the how-to is `docs/runbooks/development.md`.

- **`pnpm dev` uses the cloud demo project.** `scripts/dev.ts` reads the repository root's `.env.cloud` line by line and keeps only `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `NEXT_PUBLIC_*`, `VITE_*` and `LOCK_*` lines; every other line, and the body of any multi-line value, is skipped before its value is parsed, so none of that file's secrets enters the process. It starts no Docker, no `supabase start`, no `functions serve` and no `functions:sync`, and prints one line saying it uses the cloud demo backend, the shared live demo data. It prints no value. A missing `.env.cloud` stops it with the two lines to write.
- **One backend for every app.** The six Supabase names (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and their `NEXT_PUBLIC_` and `VITE_` copies) come from `.env.cloud` only, over the shell and `.env`; the copies are derived from the first two unless `.env.cloud` sets them. Otherwise a local `VITE_SUPABASE_URL` from `.env` (Vite reads the root `.env` itself) or from the shell would point the desktop app at the local stack while the dashboard used the cloud. The other build values (`VITE_LOCK_EXTENSION_ID`, `LOCK_DEV_PUBLIC_KEY`, `VITE_EXAM_OFFICE_EMAIL`, `UKI_ALLOW_CAPTURE`) come from the shell, then `.env.cloud`, then `.env`, so the Lock pairs as before. The address must be `https` and not local, and the key `sb_publishable_`; any public line holding an `sb_secret_` value stops `pnpm dev`, naming the variable only.
- **No secret reaches an app process in either mode.** `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_PASSWORD`, `SUPABASE_ACCESS_TOKEN`, `RESEND_API_KEY`, every `SEED_*` name and any name containing SECRET, PASSWORD, PRIVATE, TOKEN, SERVICE_ROLE or API_KEY are removed from the environment handed to turbo and so to Next.js, Vite, Electron, WXT and the CLI, even when the shell exports them. `scripts/dev.mjs` passed `process.env` on whole, so an exported secret key reached every app; turbo's `globalPassThroughEnv` would have let it through.
- **`pnpm dev:local` is the old behaviour on a slimmer stack.** It starts the stack when nothing answers on its ports, runs `functions:sync` and `supabase functions serve --env-file supabase/functions/local.env`, then the same apps with `.env`'s public values. The stack leaves out `studio`, `postgres-meta`, `imgproxy`, `mailpit`, `logflare`, `vector`, `supavisor` and `edge-runtime` (`STACK_EXCLUDE` in `scripts/lib/local-stack.ts`, which gives the reason for each; the CLI matches image names). New against the old list: `studio` (CI already left it out), `postgres-meta` (`supabase gen types --local` runs its own one-off container), `mailpit` (no auth email: password sign-in, confirmations off, invites through the Resend stub) and `supavisor` (the pooler is off in `config.toml`). `pnpm db:start`, which was a bare `supabase start`, now starts this stack, and CI's stack job starts with `pnpm db:start` and runs pgTAP through `pnpm db:test`, so CI proves the slim stack: the MacBook cannot.
- **The scripts that need the local database fail fast.** `db:reset`, `db:types`, `db:test`, `functions:serve`, `test:integration`, `test:integration:desktop`, `e2e` and `e2e:load`, and the desktop app's `e2e`, `e2e:realtime` and `e2e:cleanup`, run `node scripts/lib/local-stack.ts <name>` first. It opens a TCP connection to the API and database ports of `supabase/config.toml` (of `SUPABASE_WORKDIR` when set, as the CLI reads it) and, when nothing answers, prints one line ending "needs pnpm dev:local, or runs in CI" and exits 1 within a second. A TCP probe needs neither Docker nor the CLI, unlike `supabase status`. Before, `test:integration` and the e2e global setups waited up to three minutes for functions, and `db:types` emptied `database.types.ts` when the stack was down. The check also keeps these scripts off the cloud: `test/integration/stack.ts` falls back to `.env`'s address when the CLI finds no stack, and the desktop's `e2e:cleanup` deletes users. The desktop scripts are beyond the task's list; they need the stack in the same way.
- **`pnpm test:functions`** runs the Edge Functions' unit project alone. `pnpm test:integration --project functions-unit` stops at the stack check now, because the check runs before Vitest sees the flag. `pnpm check` keeps calling Vitest directly.
- **`scripts/dev.mjs` became `scripts/dev.ts`**, run with Node 24's built-in type stripping (`node scripts/dev.ts`, no tsx), so the filtering is typed, type-checked with the scripts and unit-tested (`scripts/lib/dev-env.test.ts`, `scripts/lib/local-stack.test.ts`). `--only web,lock` runs a subset of the four apps; it helps when another Vite server holds the desktop renderer's port 5173.
- **CLAUDE.md is the user's file and is not edited.** Its Commands row for `pnpm dev` ("Local Supabase if needed, then web on 3000, the mock portal on 5180, the desktop app and the extension in watch mode") now describes `pnpm dev:local`, and its `supabase test db` row is `pnpm db:test`. Suggested rows for the user: `pnpm dev`: "web on 3000, the mock portal on 5180, the desktop app and the extension in watch mode against the cloud demo project (public values of `.env.cloud`); no Docker"; `pnpm dev:local`: "the same against the local stack, started if needed, with the Edge Functions served locally"; and "needs the local stack, runs in CI" after `db:reset`, `db:types`, `db:test`, `test:integration`, `e2e` and `e2e:load`.

## 2026-10-09 · 1.10 Reports page

Choices WP 1.10 made for A.1 (102:10454) where the plan leaves room, or where the frame and the plan disagree. The plan decides behaviour and Figma decides visuals.

**Who and what is audited**
- **The exam office only.** The plan's route table gives `/reports` to the exam office; 0.9 draws Reports in a proctor's sidebar too. The plan wins: `NAV.reports` is on for the exam office and admins, a proctor has no Reports item, and `/reports` gives a proctor a 404. The views run under the caller's RLS, so opening A.1 to proctors later needs only the role check.
- **One audit row per view of the page.** The term views hold counts, not a student's data, but they are built from students' sessions, so each render writes one `reports.read` row through `audit_read` (object `workspace`, id `<term>` or `<term>:<faculty id>`) before any view is read; a failed audit write fails the page with nothing read. Listing the terms reads `term_exams` only, which holds no session.

**Pickers and the hidden entry points**
- **Term picker:** the terms that ran exams (`term_exams`), newest first, kept in the address (`?term=2026-autumn`). Without one, A.1 opens on the current term when it has run exams, else the newest that has; with none at all, the current term with empty cards. A term in the address that ran no exam falls back the same way.
- **Faculty picker** is the workspace menu's choice (0.1c): picking a faculty sets the same `uki_faculty` cookie, so the overview, the sidebar's workspace card and A.2 follow it. Every view has one row per faculty and one for all faculties (WP 1.1), so the page reads exactly one row set either way.
- **Not drawn:** the frame's "All exams" pill (the plan's views are per term and faculty, with no exam filter), and the top bar's search and bell, as on every page (A.8, A.7).

**The numbers**
- **Exams run** counts the term's exams that are live, to review or reviewed (`term_exams`); the caption is the term's first day ("since 1 Sep", "since 1 Feb"). **Sessions** is every session of those exams ("students × exams").
- **Flags per 100** is the latest week's rate. Its caption compares it with the term's first four weeks taken together, flags over sessions ("down from 10.5 in Sep", "up from …", "same as in Sep"; February for the spring term). While the latest week is still one of those four, the caption reads "week of 6 Oct".
- **To committee** is committee decisions over all the term's sessions, as the frame's "23 of 4,912 sessions" reads, to one decimal ("0.5%"). Without sessions the tiles read "–".
- **Weekly bars:** one bar per term week (7-day buckets from the term's first day, WP 1.1) from the first week with sessions to the last; a week between them without sessions is an empty slot, so the bars keep the calendar's spacing. The latest week is lime. The headline goes from the first week's rate to the latest's: down, up, steady, a single week, or no exams yet.
- **What gets flagged** groups the flag event types into the frame's six rows: `gaze.off_screen` and `gaze.down` are "Looked away", then phone, tab or site (`tab.blocked`), no face, second face and camera lost; any other flagged type is "Other", which the frame does not draw. Shares are whole percentages that add up to 100 (largest remainder), so a list never reads 99 % or 101 %. The headline's size: more than half, half, "almost half" from 40 to 49 %, else "is flagged most".
- **Decisions:** the overline counts the term's flagged sessions (`flagged_sessions`); the bar and legend split them into no issue, talk and committee, and the flagged sessions with no decision yet are a fourth part, "Not decided yet" (grey), drawn only when there are any, so the parts always add up to the overline. The headline names the most common decision.
- **Median review time** keeps WP 1.1's rule (from the exam's scheduled end to the decision) and the frame's "2:30 → 1:40", read as hours and minutes and rounded to the minute: by that rule reviews take hours. WP 1.8's 3.2 shows the same median as "1 min 40 s", "3 h 5 min"; A.1 keeps the frame's format. The headline goes from the first week's median to the latest ("faster", "slower", or "Reviews take 1:40" when equal to the minute).
- Headlines and captions for data unlike the frame's (up, flat, a single week, no data), the Other type, "Not decided yet", the pickers' names and the tooltips are added strings, in `dashboard-reports.json`.

**Charts**
- **SVG components, no chart library,** in a new `charts` group of `@uki/ui`: Chart/Line (150:2809), Chart/Bars (150:2833), Chart/Donut (150:2868), Chart/Legend item (150:2864) and Chart/Tooltip (150:2889), each beside its Figma screenshot in the development gallery. A.1's plots are built from them: the weekly bars use Chart/Line's axis and labels; What gets flagged is Chart/Bars in a `quiet` variant (no track, other bars at 14 % ink, as 102:10709 draws); the decisions are a stacked bar (`ChartStack`) with stacked legend items, as 102:10741 draws, so A.1 does not use the donut; the review time is Chart/Line's `spark` variant. The geometry is plain functions with unit tests, exported as `@uki/ui/charts/geometry`.
- **Tooltips are for a pointer only** and never printed: every value is also written on the chart.

**Export PDF**
- Export PDF calls the browser's print. A print stylesheet puts the reports page alone on A4 portrait with 40 pt margins, as "Windows and breakpoints" (212:2521) sets for PDF exports and as 3.4's Download PDF does. The printout starts with the workspace and faculty and "Reports / Autumn term 2026" (the sidebar and top bar are not printed), the weekly bars and the decisions take full rows, and What gets flagged and the review time share one; the page fits one sheet in English and Russian.

**Database**
- **The term views check access once per exam** (`20261012180000_term_views_per_exam.sql`). Under WP 1.1's views, `is_exam_staff()` ran for every session and event row through the tables' policies; on a term of 5,142 sessions `term_kpis` took 8.6 s for the exam office on a loaded local stack, past the 8 s statement timeout. `term_sessions` and `term_flag_types` now read each exam's rows through `term_exam_sessions` and `term_exam_flag_types` (security definer), which check `is_exam_staff()` once for the exam; the exams still come from `term_exams` under the caller's RLS. Measured on 8 October, before the no-Docker rule, on the same stack: 0.16 s. Every role sees the same rows as before, and a caller that skips RLS (the secret key, psql) still reads every row (`invoker_bypasses_rls()`); `18_term_views` checks the office, a proctor, another workspace, a student, anon and the secret key. The views keep their names, columns and grants. PostgREST no longer infers foreign keys for `term_sessions`, which nothing embeds.

**Strings**
- 38 keys in `packages/i18n/dashboard-reports.json`, first-pass Russian for P.18. «Вкладка или сайт» is the Russian Tab or site blocked row: «Вкладка или сайт заблокированы» was cut off in the bars' 140 px label column; the headline keeps «Заблокированные вкладки и сайты».

**Comparing without a database**
- `/reports/frame` renders A.1 inside the shell with the frame's numbers (`test-fixtures.ts`) in development only (production answers 404), with no session and no database: since 9 October nothing that needs a local stack runs on this Mac, so the Figma comparisons use it. It sits under `/reports` so the sidebar marks Reports.

## 2026-10-09 · Windows smoke build

Step 6 of the coordinator's VPS plan, the code side. The coordinator runs the Windows zip on a Windows Server 2022 VPS over Remote Desktop. The VPS has no webcam, and the app has no virtual-machine or remote-session check (the process scan names AnyDesk, TeamViewer, RustDesk, Chrome Remote Desktop, Zoom, Teams and OBS, but not Remote Desktop itself). A third packaged variant joins the shipped build and the lab zip ("Builds" in `docs/phase-0-plan.md`). Built on `feat/windows-smoke-build`.

- **`electron-vite build --mode smoke` with `electron-builder.smoke.yml`**, as the lab zip is built. The config extends `electron-builder.yml` and changes only the name, `Uki-smoke-<version>-x64.zip`, and the folder, `release/smoke`. `pnpm --filter desktop dist:smoke` limits the targets to the x64 zip. Only the CI Windows job runs it, and it uploads the zip as `uki-windows-x64-smoke-zip` for 14 days. `desktop-dist.yml` never runs it. The release's file patterns cannot match the name, as with the lab zip (`scripts/lib/release.ts`).
- **The existing synthetic camera, not a recorded clip.** `integration/synthetic-camera.ts` already feeds detection in the desktop end-to-end test: a 640 × 480 canvas stream drawn from the brand kit's evidence pictures, with the joined student's card during 1.3. A clip would be a new asset, and the art rules allow only generated assets. The smoke build opens the synthetic camera by default, like the e2e build. **Ctrl+Shift+S** changes the picture (student, student holding a phone, empty seat), so the box can raise a phone or no-face event. The keyboard hook and the lockdown shortcut filter both let Ctrl+Shift+S through.
- **What the smoke build keeps from the lab zip:** the developer overlay (Ctrl+Shift+D) and the development escape (Ctrl+Shift+Q).
- **What it adds:** a red "SMOKE BUILD" label on every screen (`overlay/smoke-marker.dev.tsx`; developer text like the overlay's, so it is not a catalog key), the window title "Üki · SMOKE BUILD", and the log line `[desktop] smoke build`. The CI launch test checks the title and the line.
- **Content protection is off in the smoke build.** Not in the brief. With protection on, a capture of the screen leaves the window out. In CI run 37839916033 the same launch script captured the shipped zip as only Üki's taskbar button, and the smoke zip as the whole window. It is also unclear whether a protected window shows over Remote Desktop. A smoke box that the coordinator cannot see or photograph is no use. The shipped and lab builds keep protection on from launch. `shouldAllowCapture` now takes the build mode, a constant.
- **Compile-time only.** Every smoke branch tests `import.meta.env.MODE === "smoke"`, which Vite replaces with a constant. The lazy imports of the overlay, the marker and the synthetic camera are written out where they are used, so a production build drops the modules and their pictures. No runtime flag, environment variable or localStorage value can turn any of it on in a shipped build.
- **`.github/scripts/desktop-variant-check.sh` checks it.** It replaces the inline check that the shipped renderer has no `phone/s`. For each variant it asserts exactly that variant's extras:
  - the overlay (`phone/s`);
  - the synthetic camera (its error text and its `uki-evidence-*` pictures);
  - the marker (`SMOKE BUILD` in the renderer and in the main process).

  CI runs it after the shipped Windows build, the lab build, the smoke build and the macOS dmg build. `desktop-dist.yml` runs it after both of its builds.
- **The cloud project, through the release's variables.** The smoke step takes `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and `VITE_LOCK_EXTENSION_ID` from the repository variables with no local fallback. It fails unless the URL is https and the key is a publishable key. The check after it finds the URL in the renderer and the Lock id in the main process, as the release does.
- **The same app id, product name and userData folder as the shipped app.** One machine cannot run both at once: the single-instance lock closes the second. The VPS runs only the smoke zip.

## 2026-10-09 · 1.12 Privacy

Choices WP 1.12 made for A.5 (107:11102), A.5a (165:14035), A.5b (165:16241), A.6 (108:11296), the `data-request` and `retention` Edge Functions, and where the frames and the plan disagree. The plan decides behaviour and Figma decides visuals.

**Data requests**
- **Due in 7 days, not 30.** A.5a and A.5b draw "asked 7 Oct, due 14 Oct" and "asked 9 Oct, due 16 Oct"; the plan calls its 30 days a starting value that a frame overrides. `20261012190000_privacy_requests.sql` sets the default of `data_requests.due_at` to `now() + 7 days`; existing rows keep their dates. `13_privacy` now expects 7 days.
- **What Delete removes, checked against A.5a's list.** The plan's split stands: Delete removes the student's stills from Storage (every object in their sessions' `<exam_id>/<session_id>` folders, so a still uploaded but never confirmed goes too), then in one transaction their `frames` and `events` rows (help requests go with their event), `sessions.identity_score` and `sessions.device`. It keeps the answers, `receipt_id`, the sessions, the identity result (matched or not), the consent record (`rules_accepted_at`, `rules_locale`), review decisions and integrity reports, because they are the exam result or the record that the rules were accepted. A.5a draws three rows (Flagged frames, Event log, Integrity report kept "until the committee closes the case"); the list adds "Identity scores and devices" (Delete) and "Answers and receipts" (Keep), so everything the plan names is on it, and shows the Integrity report row (Keep, with its printed verify code) only when the student has a report. The button counts the Delete rows: "Delete 3 items". The report row stays, but its content is built from the session's flags, so a printout made before the delete no longer verifies as unchanged.
- **The boxes show what happens and cannot be changed.** A.5a draws checkboxes, but the plan's Delete is one action with a fixed split, and A.5b's four rows are all included. The boxes are drawn checked for every Delete or Include row and unchecked at 40 % for every Keep row, without focus or clicks.
- **Delete waits while the student writes a live exam.** The app would keep sending events and stills into what is being deleted. The function answers `conflict` (`in_exam`) and the drawer says "<name> is writing an exam now. Delete the data once it ends." A request runs once: a second Delete answers `conflict`.
- **Copy is one JSON file, so A.5b's Format choice is not drawn.** The plan settles "one JSON file in the private `exports` bucket and a 7-day link"; A.5b's "ZIP with JSON data and a PDF summary" and "PDF summary only" would need a PDF and a zip on the server. The file (`uki.data-copy.v1`) holds who the student is, every exam with its times, state, receipt, identity result and score and the decision, every flag with its stills as base64 images, the rule acceptances and the device records. A still that is gone or would take the file past 10 MB is listed without its image. It is written to `exports/<workspace_id>/<request_id>.json` (upsert) and signed for 7 days with a download name of `uki-data-<student number>.json`.
- **"Create secure link", not "Send secure link".** Phase 1 sends no email to a student about a data request (Resend in Phase 1 is the invite and the pilot notice), so A.5b's banner "Zhansaya gets a link by email…" and A.5a's "Yerlan gets an email in Kazakh when you confirm" are left out. The exam office gets the link once, in the drawer, with Copy link, and sends it to the student itself; the banner says so. A done copy request offers "Create a new link", which writes a fresh file and link (and a second `data_request.copy` row); a link is never shown twice.
- **Reply with a reason** (A.5a's ghost button) stores the reason on the request (`reply`, status `replied`, up to 2,000 characters); the audit row records its length, not its text. A.5b's ghost button is the frame's Cancel, so a copy request is not answered with a reason. Nothing is emailed.
- **"Asked on 7 Oct", without "through the Üki app".** `data_requests` has no channel: the exam office enters every request (plan), so the line names the date only.
- **New requests come from A.3.** A.3's "Delete on request" and "Export data" open A.5a and A.5b for that student (`/privacy-centre?new=delete|copy&student=<id>`). Nothing is saved until the exam office acts: the action inserts the `data_requests` row under RLS (its trigger writes `data_request.received`), then calls the function. A.5 has no "New request" button of its own; the frame draws none.
- **Who may act.** The function checks that the request is visible to the caller under RLS (only the exam office and admins of the workspace see `data_requests`), then calls `privacy_delete_plan`, `privacy_delete_student`, `privacy_export`, `privacy_export_done` or `privacy_reply` with the secret key, passing the caller as the actor; each checks the actor's role again and writes its audit row in the same transaction. Staff cannot call these functions directly: a direct delete would leave the stills in Storage. `data-request` has `verify_jwt = false` in `config.toml`, like every function the dashboard calls (`send-invites`): the gateway's legacy check cannot read the new keys, and `withSupabase` verifies the token itself.

**A.5 Privacy centre**
- **Data map, truthful where the frame is not.** Flagged frames and Event log are kept on "Üki server · Frankfurt", not "Kazakhstan": the one cloud project is in `eu-central-1`. Flagged frames are kept for the workspace's `retention_days`. The event log reads "Until a delete request" instead of "90 days" and integrity reports "With the exam result" instead of "1 year", because retention deletes stills only and nothing deletes reports (as A.3's Data kept, WP 1.11).
- **Retention has one select.** The frame draws "Frames and events · 90 days" and "Integrity reports · 1 year"; only the stills have a rule, so the card has "Flagged frames" with A.4's choices (30 to 365 days), saved at once through A.4's settings action, and the line "Next cleanup tonight, 03:00 · N frames": the next 22:00 UTC run and how many stills it would delete under the current rule. Changing the rule refreshes the count.
- **Processing record (PDF) is hidden:** it is A.5c, Phase 2. The banner's "N sessions checked on device" is this term's sessions from `term_kpis` (all faculties).
- **Recent access** is the newest three entries of the workspace's audit log, without the privacy centre's own reads (`privacy_centre.read`, `data_request.read`, `audit.read`), which A.6 lists.
- **Requests** lists the open requests, the one due soonest first, then those answered in the last 30 days ("done 12 Oct", "replied 12 Oct"); the brand count is the open ones.

**A.6 Audit log**
- **Tabs and range.** All, Frames viewed (`still.viewed`), Exports (`data_request.copy`, `report.share`, `report.share_view`, `audit.export`), Settings (`settings.update`) and Deletions (`data_request.delete`, `retention.run`). The range menu offers the last 24 hours, 7 days (the frame's default), 30 days and 90 days. Tab and range are read on the server; the search runs in the browser on the who, action and object words, and all three stay in the address. At most the newest 500 rows of a range and tab are read; a line says so when there are more. 25 rows per page.
- **Share revokes.** WP 1.9's `report.share_revoke`, merged while this package was open, reads "Revoked a share link" with the link icon and sits in the Exports tab with the shares and their views.
- **One entry per row, except stills.** Each share view is its own line (plan). The stills function writes one row per still, all at the same instant; the stills one staff member opened at once for one session fold into one line, "Viewed 3 flagged frames", as the frame draws it.
- **Who** is the staff member's name (lime avatar for the signed-in one), the student for rows a student's sign-in wrote, "Share link" for share views, and "System" with the Face for rows the secret key wrote (retention, the seed). The actions Üki wrote when this package was built have their own words and icon; an action added later shows its stored name until it gets a message.
- **"Kept for 1 year." is left out of the footer:** nothing removes audit rows yet, so the page does not promise a period.
- **Export CSV** writes an `audit.export` row first and then saves the entries shown (the current tab, range and search) as `uki-audit-log-<date>.csv`, with UTC and Almaty times; a failed audit write saves nothing.

**Audit rows**
- A.5 writes `privacy_centre.read`, an open drawer `data_request.read` with the student's id (before the student's data is counted), and A.6 `audit.read`, each before its read; a failed audit write fails the page. The function writes `data_request.delete` (with the counts), `data_request.copy` (size and link expiry) and `data_request.reply`; WP 1.1's trigger writes `data_request.received`.

**Retention**
- **`retention` deletes stills only, oldest first.** `retention_due` picks up to 500 stills past their workspace's `retention_days` at a time; the function removes the objects from the frames bucket, then the `frames` rows, for at most 20 batches a run (the next night carries on). Storage goes first, so a failure in between leaves rows whose objects are gone, which the next run removes harmlessly. The flag events stay.
- **"Audit row per run" is one row per workspace that lost stills:** `retention.run` with the count, the rule and the oldest and newest capture time, written as the system. A run that deletes nothing writes no row, because an audit row belongs to a workspace and A.6 would fill with empty runs. `retention` is `withSupabase({ auth: 'secret' })` with `verify_jwt = false`; WP 1.1's `retention_nightly` calls it at 22:00 UTC through `pg_net` with the key from Vault.

**Migration name**
- The migration was written as `20261012120000_privacy_requests.sql` and renamed before the merge to `20261012190000_privacy_requests.sql`, so it sorts after WP 1.9's `20261012160000_verify_codes_share_revoke.sql`, which landed meanwhile, and after WP 1.10's `20261012180000_term_views_per_exam.sql`, which landed after it; `supabase db push` refuses a migration older than the newest applied one. It was never on main under the old name. Its pgTAP file stays `17_privacy_requests` (main has 16 and 19).

**Sidebar and links**
- `NAV.privacy.built` is on, for the exam office and admins; a proctor's sidebar has no Privacy item and both pages give a proctor a 404. 0.1b's "Open privacy centre" (left out by 1.2 until this page existed) and A.3's two buttons now show.

**Strings**
- 195 keys in `packages/i18n/dashboard-privacy.json` (`dashboard.privacy.*`), English from the frames where they have it, first-pass Russian for P.18. Added, not in Figma: the Data map's two new periods, the delete list's identity, answers and reports rows, the copy and reply states, the errors, the range choices, the who and object words, the action names Figma does not draw, paging, and the empty and truncated lines.

## 2026-10-08 · 1.13 Landing: user decisions 8 Oct

A user request, not a frame: on 8 October the user decided where the landing's main buttons go and asked for a guide that shows the jury what to see, with the mascot. No Figma frame draws the download block or the guide, so both are built from `@uki/ui`, the tokens and the brand kit's mascot poses, and every section of Landing `114:2039` and Mobile 390 `192:3586` keeps its place and size.

- **Sign in** opens `/sign-in`, as before; it now has its own e2e test at 1440 and 390.
- **Book a pilot** keeps opening the form at `/pilot`. The user does not want a personal contact link, so there is no contact variable (an earlier, uncommitted draft read `NEXT_PUBLIC_PILOT_CONTACT_URL`; it was dropped).
- **Download goes to the latest published GitHub release.** A download block (`/#download`) sits between the CTA band and the footer: macOS Apple silicon, macOS Intel, the Windows installer, the Windows zip that runs without an install, and Üki Lock with one button each for Chrome and Edge. Each links `https://github.com/k4ssymzhomart/uki/releases/latest/download/<file>` with the stable names of WP 0.15's release workflow (`scripts/lib/release.ts` on `wp/0.15-release`): `Uki-mac-arm64.dmg`, `Uki-mac-x64.dmg`, `Uki-Setup-win-x64.exe`, `Uki-win-x64.zip`, `Uki-Lock-chrome.zip`, `Uki-Lock-edge.zip`. Under the cards: the first-launch notes for the unsigned builds, shortened from the release notes, and a link to the release page for the checksums. The Üki Lock note follows the release notes (unzip into a folder you keep, Developer mode, Load unpacked); the first draft said to drag the zip onto the extensions page, which Chrome and Edge do not install, and was corrected on 9 October. The footer's Üki app and Üki Lock links lead to the block (they went to How it works and the Lock feature row); the header stays as the frames draw it. Until the first release is published, the file links answer 404; since v0.1.2 (8 October) each one redirects to its file. `download-model.test.ts` reads the names from `scripts/lib/release.ts` on `main`, so a renamed release file fails the unit tests before the landing links a name the release no longer has.
- **The jury guide** is a small floating button in the bottom corner of `/` only (16 px in at 390, 24 px at 1440): the waving mascot and "Jury guide" on a surface pill with Shadow/Float. It opens the kit's Drawer (1.5b's side panel: scrim, focus kept inside, Escape, the scrim and the close icon close it, focus goes back to the button), full width at 390. Inside, Üki says hello in a lime speech bubble and walks through five numbered steps, each a pose beside a bubble (bg/subtle at Radius/card, with the corner nearest the mascot at Radius/sm; no drawn tail): what Üki is (shield), sign in to the live dashboard (pointing; Sign in opens `/sign-in`), download and open the student app (laptop; to the download block), install Üki Lock for browser exams (lock; to the download block), and what to look at (magnifier: the live wall, Ask proctor, a flagged moment, the integrity report, 0 MB of video). The demo login is given by the team in person and never appears on the page. On 9 October the second step became the Live demo and the guide gained a link to `/demo` (next block).
- **Motion is fades only.** The button and the panel fade in through `@starting-style`; nothing slides or scales, so reduced motion needs no other variant. The Drawer closes without a fade (Radix unmounts it at once).
- **Copy:** `dashboard.landing.download.*` and `dashboard.landing.guide.*` in `dashboard-landing.json`, English and Russian, drafted by the agent for the landing read-through on Monday 12.

## 2026-10-09 · 1.13 Landing: the judge path

User requests, not frames: the jury guide (8 October, above), the landing's Live demo button, the public jury page `/demo` and the `/demo/live` route (9 October). No Figma frame draws any of them, so they are built from `@uki/ui`, the tokens and art already exported (the moss-night band of the legal pages; the mascot's hello, sleeping and oops poses from `packages/ui/src/art`). The judge mode constants are the coordinator's: DEMO-LIVE in the KRU workspace, `judge@kru.test` as a read-only `observer` of it. The observer role, its RLS and the DEMO-LIVE seed come from other branches; this one only links to them.

- **Live demo** links `/sign-in?email=judge%40kru.test&next=/demo/live`, exactly as the user gave it (`LIVE_DEMO_HREF` in `features/demo/demo-model.ts`). It is a third button in the hero beside See the demo, secondary with a green status dot, a link in the 390 menu after Sign in, and the guide's second step (it was "Sign in", to `/sign-in`). The 1440 header stays as the frame draws it: Russian has no room there from 1024. At 1440 the hero row keeps its height (the page is still 8,819 px without the download block); at 390 the stacked buttons add 54 px.
- **`?email=` on sign-in** fills in the email field only when it is an email address (Zod, at most 254 characters); anything else leaves it empty.
- **`?next=` on sign-in** is followed only when it is a path on this site: one "/" first, never "//" or "/\" (a browser reads both as another host), no backslash, whitespace or control character anywhere (browsers drop tabs and newlines, so "/\t/x" would become "//x"), at most 512 characters, still on the same origin with no "//" at the start of the path once dot segments are resolved ("/..//x" and "/%2e%2e//x"), and not `/sign-in` itself. A repeated parameter counts as absent. The path is passed on as given, never re-serialised. The page checks it before putting it in a hidden field, and the action checks the submitted field again (`features/sign-in/sign-in-query.ts`). Anything else goes to the role landing as before. Signed-in staff who open `/sign-in` with a safe next go straight there, so Live demo works when the judge is signed in already.
- **`/demo/live`** sits in the `(marketing)` group beside `/demo`, so it has the public footer. It does not use `requireStaff`, which would lose the way back. A visitor without a staff session goes to `/sign-in?next=/demo/live`. A signed-in staff member's own client reads `exams.id` where `code = 'DEMO-LIVE'` under their RLS and is sent to `/exams/<id>/live`. That read is the exam's id only, not student data, so it writes no audit row; the live wall writes its own as before. When no row is visible (the exam does not exist yet, or this account may not see it), the page calls `notFound()`: a 404 with "The live demo is not running yet", the code, Try again and Open your dashboard (through `/`, which sends staff home). A failed staff lookup or a failed read says "Could not reach Üki" with Try again instead. It is a redirect, not a dashboard page, so it has no sidebar item and no NAV flag. Until `observer` is in `STAFF_ROLES`, the judge's staff row does not parse, and sign-in refuses the account as not staff rather than looping.
- **`/demo`** is public: no session and no staff lookup. It joins the public pages of CLAUDE.md's Rules; CLAUDE.md is not edited, so read that list as including `/demo`. It has the header band on the moss-night art, then:
  - the live dashboard: Live demo and Open the dashboard (`/sign-in`), the jury's email `judge@kru.test`, and "On the one-pager you received" where the password would be;
  - the demo video's slot;
  - three things to try: the wall's flags and the drawer's stills, Ask proctor and the reply (2.4d), a report with its share link and `/verify`, worded so they hold for a read-only account;
  - the in-browser detection demo at `/try`, which branch `wp/judge-try` builds; until that merges, the link answers 404;
  - the student app and Üki Lock files: the landing block's own cards, notes and release link (`DownloadFiles`, shared with `/#download`).

  The exam code and the demo students' numbers are left to the one-pager like the password, because the page is public and the code would let anyone join DEMO-LIVE. `/demo` and `/demo/live` ask search engines not to index them.
- **The demo video** comes from the public `NEXT_PUBLIC_DEMO_VIDEO_URL`. Zod accepts only an https address; anything else leaves the labelled placeholder ("The demo video goes here"). Once the address is set, the slot links to it in a new tab with `rel="noreferrer"`. No third-party player is embedded, since CLAUDE.md allows no tracking. Next.js inlines `NEXT_PUBLIC_*` values at build time, so the user sets the variable in the Vercel project and redeploys. `.env.example` lists it, commented out.
- **The guide never shows a login.** It names no address and no password; it says only that the password is on the one-pager. It ends with "Every link for the jury on one page", a link to `/demo`.
- **Copy:** `dashboard.landing.demo.*`, `dashboard.landing.demoLive.*`, `dashboard.landing.meta.demo.*`, `dashboard.landing.meta.demoLive.title`, `hero.liveDemo`, `nav.liveDemo` and `guide.all`, with `guide.signIn.*` rewritten, in `dashboard-landing.json`. All of it is in English and Russian («Живое демо»), drafted by the agent for the landing read-through on Monday 12.
