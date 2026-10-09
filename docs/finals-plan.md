# Üki · Final build before Demo Day — prompt for the coding agent

From the brain, after a live test on 9 October. This is the last build round before the finals. Read all of it before you start, then work the items in order. Items marked **start now** do not wait for design; items marked **needs frame F…** wait for the designer's Figma frames (expected Sunday 11 October).

## 0. Dates and ground rules

| When | What |
|---|---|
| Fri 9 – Sun 11 Oct | Sections A, B, C (no design needed). Owner captures phone frames for A6/A7 |
| Sun 11 Oct | Designer delivers frames F1–F5 |
| Mon 12 Oct | Windows lab session (section E). Build D items |
| Tue 13 Oct 18:00 | Decision on the phone model (A6). Any frame not merged by Tue 23:59 is out |
| Wed 14 Oct 18:00 | Everything merged through PRs with green CI. Full rehearsal on the Windows stage laptop that evening |
| Thu 15 Oct | `main` frozen at tag `demo-2026-10-16`; only demo-blocking fixes |
| Fri 16 Oct | Demo Day, Kostanay |

- Everything in `CLAUDE.md` still applies: Zod at every boundary, tokens only, every string an i18n key in en/ru/kk, nothing leaves the laptop except events and flagged stills, no `MediaRecorder`, no CDN, publishable key only, RLS and pgTAP for every table, new migrations only (after `20261013130100_judge_mode.sql`), one branch per item, PR plus green CI, Conventional Commits authored as `k4ssymzhomart` with no co-author trailer.
- Build only what is in this prompt. No Phase 2 or Phase 3 frames.
- Where an item changes a settled decision, write the reason in `docs/decisions.md` first (A1, A6, C1, D4 do).
- Evidence for every item goes into `docs/phase-1-exit.md` under a new heading **"Phase F · Finals"**.
- If you are blocked, write the question in your report and move to the next item. Do not stop.

## 1. What the live test on 9 October showed

Put this table into `docs/phase-1-exit.md` ("Live test, 9 October") as the baseline.

| What | Result |
|---|---|
| `/try` in Chrome, MacBook Pro M4 | 13 fps (target 15); Face Landmarker 24 ms on GPU; Object Detector 51–60 ms on CPU; 2.5 phone checks/s; frames from `MediaStreamTrackProcessor`, 640 × 480 |
| Phone at face height, back to the webcam (the "photographing the screen" pose) | scores 0.50–0.74 |
| Phone at chest height while reading it | 0.52–0.79 |
| Phone cut by the frame edge, or seen edge-on | 0 (missed) |
| `phone_score` 0.85 (current default) | 0 detections |
| False positives above 0.5 in ~3 min of sitting, eating, hand on face | none; phone-like objects not yet measured |
| Packaged macOS app v0.1.2 against the cloud, `DEMO-LIVE` seat 20249025, `phone_score` 0.55 | `phone.detected` 0.738 and 0.656 with 3 stills each; `gaze.down` 7.7 s; `gaze.off_screen` right 2.4 s; `net.offline` 5.8 s with 1 event queued and delivered; event to server 0.9 s online; 20 answers, Ask proctor, submit, receipt `UKI-DEMO-3783-MA` |
| 1.2 system check | caught Telegram, then Claude (the Claude Code CLI matches the same name) |
| Content protection on macOS | the window comes out blank in screen captures |

Changed by hand in the cloud database, with the owner's OK: `DEMO-LIVE` checks are now `lock: false`, `identity: false`, `phone_score: 0.55`. Item B1 makes this permanent.

Problems found:

1. `DEMO-LIVE` had 0 sessions in the current run: the simulator is not running on the VPS, so a judge opening the Live demo sees an empty wall.
2. `apps/desktop/src/main/key-filter.ts` swallows only Win, Alt+Tab, Alt+Esc and Ctrl+Esc. The case (section 2.3) names Ctrl+C/V and PrtScn too.
3. In `packages/detection/src/rules.ts`, when `faces === 0` the open look closes after `gapMs` (300 ms). A full side turn loses the face, so a 3–9 s look at a neighbour is never flagged; only `face.missing` fires, after 10 s.
4. There is no event for "phone raised to photograph the screen" (case section 2.1). The simulator fakes it as `phone.detected` 0.95–0.99.
5. `/verify/[code]` does not accept a receipt ID: `UKI-DEMO-3783-MA` shows "This code does not match a current Üki integrity report".
6. The wizard can schedule an in-app exam with no questions; nothing adds rows to `exam_questions` except seed scripts.
7. Sign-in (A.0): the white headline sits on the light canvas until `uki-bg-moss-night.webp` arrives.
8. The static guide on 1.2 (`FaceFrame`) never moves. The owner wants a live, moving detection overlay that looks like real CV.

## 2. The case checklist (Кейс 3, КРУ)

Every line must work live on Windows on Demo Day. Keep this table in `docs/phase-1-exit.md` and tick it with evidence.

| Case requirement | Today | Item |
|---|---|---|
| 2.1 Phone in hand or in front of the screen | Works only at 0.55; misses some angles | A1, A2, A6 |
| 2.1 Moment the phone is raised to photograph the monitor | Missing | A4 |
| 2.1 Phone camera aimed at the screen | Missing | A4 (A6 stretch: `phone_back` class) |
| 2.2 Gaze direction; long look down; left and right | Works | A5 closes the side-turn gap |
| 2.2 Presence in frame; second person | Works (second person not tested live) | E1 |
| 2.3 Alt+Tab, Win | Hook built, untested on real Windows | E1 |
| 2.3 Ctrl+C/V, PrtScn | Missing in the app | C1 |
| 2.3 No tab switching | Kiosk (app) and Üki Lock (browser) | E1 |
| 2.3 Block other windows and browsers during the test | Partial: blur rule and blocked-apps scan; browsers not checked | C2 |
| Stack: YOLOv8n/YOLO11n for phone, MediaPipe Face Mesh for gaze | MediaPipe for both | A6 adds a YOLO11n backend |

## 3. Work items

### A. Detection (start now)

**A1 · `fix/phone-threshold` — default `phone_score` 0.55**
- New migration that sets the default of `exams.checks` to `phone_score: 0.55`. `DEFAULT_EXAM_CHECKS.phone_score = 0.55` in `packages/contracts/src/checks.ts`.
- `PHONE_OPTIONS` in `apps/web/src/features/wizard/wizard-model.ts` and `apps/web/src/features/settings/settings-model.ts`: `[0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.85]`.
- `demo:reset`, the seed and `judge:setup` use 0.55. Update tests and fixtures that assume 0.85.
- `docs/decisions.md`, "Detection thresholds": the section 1 data.
- Done when `pnpm check` and `supabase test db` are green and a new draft shows 0.55.

**A2 · `feat/phone-rule-2of3` — recall across angles**
- `phone.detected` fires on 2 hits within the last 3 checks, not 2 in a row.
- `THRESHOLDS.phone.intervalMs` 250; the fallback stays at 1000.
- Trace fixtures: intermittent phone (hit, miss, hit), and a phone that drops out at the frame edge.
- Done when detection tests are green and `/try` shows ≥ 3.5 phone checks/s on the M4. CPU on the lab PC is measured in E1; if the app goes over the 40% CPU budget there, go back to 400 ms on Windows and keep 2-of-3.

**A3 · `feat/detection-boxes` — geometry out of the worker (no pixels)**
- The worker posts face boxes (min/max of the landmarks, normalised 0–1), yaw/pitch/roll, and up to 3 phone detections `{ box, score }` at the tracking rate, as new Zod-checked messages in `packages/detection/src/protocol.ts`.
- Events carry boxes: `phone.detected { score, held_ms, box }`, `face.second { boxes }`, `gaze.* { face_box }`. Change `packages/contracts/src/events.ts`, run `pnpm functions:sync`, and make ingest validate the new fields.
- Done when contract and ingest integration tests are green and boxes are stored in `events.data`.

**A4 · `feat/phone-raised` — case 2.1, "raised to photograph the screen"**
- New event `phone.raised`, defined only in `events.ts`; the server sets `review = flag`.
- Fires when a phone box is at face height (centre above the face box's lower edge, or overlapping the face box), its area is ≥ 3% of the frame, and it is held ≥ 400 ms. 3 stills.
- Independent of `phone.detected`, with its own cue in the app.
- Simulator: the `phone_raised` episode emits `phone.raised`.
- Done when trace tests are green and raising the phone as if photographing the screen fires 5 of 5 on `/try`.

**A5 · `fix/side-turn` — the profile-turn gap**
- In `rules.ts`, when the face is lost while an away-look is open, or within 500 ms after |yaw| > 25°, keep the look open with the last direction and fire `gaze.off_screen` at `gaze_s`. `face.missing` stays at `face_missing_s`.
- Trace test "profile turn 5 s" must give exactly one `gaze.off_screen`.
- Done when the trace test passes and a 5 s side turn fires 5 of 5 on `/try`.

**A6 · `feat/yolo-phone` — the ML track (time-boxed; decide Tue 13 Oct 18:00)**
- Add a second phone backend: YOLO11n, which is the case's suggested stack. Export it to ONNX and run it in the detection worker with `onnxruntime-web`.
  - Wasm files self-hosted under `resources/models` (desktop) and `public/models` (web), listed with SHA-256 in `manifest.json`. No CDN.
  - Single-threaded wasm unless the page is cross-origin isolated; WebGPU where available.
  - Letterbox to 320 or 416, NMS in JS. Class "cell phone" (COCO index 67), or the fine-tuned classes.
- The backend is picked by config; the default stays MediaPipe until the bench (A7) says otherwise.
- Fine-tuning: write `ml/phone/train.ipynb` for Colab.
  - Data: COCO 2017 "cell phone" plus Open Images V7 "Mobile phone".
  - Plus the owner's frames in `ml/phone/data/` (git-ignored): 300–500 webcam frames covering phone in hand at several angles, back to the camera, partly out of frame, held low and raised; negatives such as calculator, remote, wallet, cup.
  - Optional second class `phone_back`: camera lenses facing the webcam, meaning aimed at the screen.
  - Train with `yolo train model=yolo11n.pt imgsz=416 epochs=60`, export ONNX.
  - Write `ml/phone/README.md` for the owner: how to capture frames with Photo Booth, how to label them (pre-label with a big pretrained YOLO, correct in Label Studio or CVAT), how to run the notebook.
- Licence: Ultralytics is AGPL-3.0. Put this in `docs/decisions.md`: fine for the public hackathon repo; commercial use needs an Ultralytics licence or an Apache-2.0 model.

**A7 · `feat/detection-bench` — numbers for the decision and the pitch**
- `pnpm detection:bench <folder>` runs every phone backend over labelled frames in headless Chromium (Playwright).
- It prints recall at the configured threshold, false positives on the negatives, and mean ms per check. It writes `docs/evidence/detection-bench.md`.
- **Decision rule, Tue 18:00:** ship the backend with the higher recall at no more false positives on the owner's held-out frames; otherwise keep MediaPipe at 0.55 with the 2-of-3 rule.

### B. Judge and demo path (start now)

**B1 · `fix/judge-demo-live`**
- `judge:setup` creates or updates `DEMO-LIVE` with checks `{ lock: false, identity: false, phone_score: 0.55 }`, idempotently; this matches the database today.
- Add to the one-pager: "Try the real app: download Üki, code DEMO-LIVE, student ID 20249026–20249030."
- New `pnpm judge:free-seat <number>`: deletes that student's session in the current run, deletes its stills through `demo-live-purge`, and writes an `audit_log` row. This lets the stage laptop rejoin between rehearsals. Seat 20249025 was used today.

**B2 · simulator realism**
- Phone scores 0.6–0.85 instead of 0.86–0.99.
- `phone_raised` emits `phone.raised`.
- Hand-placed normalised boxes for the five brand-kit stills, so the wall shows boxes as well.

**B3 · simulator on the VPS**
- Build `judge-sim` and give the owner the zip plus the exact PowerShell lines from `docs/runbooks/judge-mode.md`.
- After the owner runs `install.ps1`, check from the cloud that `DEMO-LIVE` has 24 sessions within 5 minutes and the wall says "Simulator: live". Record it in phase-1-exit.

**B4 · `feat/verify-receipt` (needs frame F3)**
- `/verify/[code]` also accepts receipt IDs. It shows exam, course, submitted time, time used, flag count, review status and the student's initials only.
- Public, no staff session; every read writes an `audit_log` row.

**B5 · `docs/runbooks/demo-day.md`** — add:
- The stage laptop runs no Claude, Claude Code, Telegram, WhatsApp, Zoom or Teams (1.2 blocks them).
- Show the student laptop over HDMI, never by screen sharing: content protection blacks the window in captures, and Zoom and Teams are blocked apps.
- Use a phone hotspot as backup network, and keep a backup video.
- The demo video must be recorded with a camera filming the screen, or with the lab or smoke build that allows capture.
- Seat plan, plus the reset and free-seat commands.

### C. Environment protection, case 2.3 (start now)

**C1 · `feat/hotkeys-copy-prtscn`**
- Windows, in `key-filter.ts`, during lockdown only, swallow:
  - Ctrl+C, Ctrl+X, Ctrl+V, Ctrl+Insert, Shift+Insert;
  - PrtScn (`VK_SNAPSHOT` 0x2C), alone and with Alt.

  Win+Shift+S is already covered by the Win key.
- In the exam renderer on every OS: `preventDefault` on `copy`, `cut`, `paste`, `contextmenu` and `drop`.
- Clear the clipboard when lockdown starts.
- The hook still never records or sends a keystroke.
- `docs/decisions.md`: the key list grows.
- Unit tests for the filter, a test in the Windows CI job, and lines in `docs/runbooks/lab-session.md`.

**C2 · `feat/block-browsers-app-mode` (strings from frame F5)**
- For in-app exams only, 1.2 asks the student to close other browsers: Chrome, Edge, Firefox, Opera, Yandex Browser, Safari. Add a new `BlockedAppKind` "browser" in `packages/contracts/src/blocked-apps.ts`.
- The exam-time scan sends `tab.blocked { app }` when one of them starts.
- Verify the macOS process names now and the Windows names in E1.

### D. Visual items (needs frames F1–F5)

- **D1 · Live detection overlay (F1).**
  - What it draws: a face box that follows the face, the landmark mesh, a head-pose or gaze indicator, a phone box with label and score, the hit counter, and a heads-up display (HUD) with fps and model timings.
  - Where: 1.2 preview, `/try`, a subtle version on the 2.1 mini preview, and the lab overlay.
  - The 1.2 guide becomes a target zone that turns ok when the face is inside.
  - Boxes move with an 80 ms ease so 15 fps looks smooth.
- **D2 · Boxes on evidence stills (F2).** In review 3.2 and 3.3, the wall tile still and report 3.4, with a "Show detections" toggle.
- **D3 · Receipt redesign (F3).** The 3.1 screen, "Save receipt" PDF, and the `/verify` receipt page.
- **D4 · Brand marks (F4).** Official logos from the `simple-icons` package (CC0), exported through `packages/ui/src/brand-icons.ts`. Add a `docs/decisions.md` exception to "icons from lucide only". Never generated logos.
- **D5 · Small fixes (F5).**
  - A.0: a dark fallback colour behind the background image.
  - `schedule_exam` refuses an in-app exam with 0 questions (`no_questions`), with an inline error on 0.5.
  - The `phone.raised` label and icon everywhere events are listed.

### E. Windows lab session — Monday 12 October (owner runs it, agent prepares)

**E1** Lab zip from CI (overlay on), plus a checklist in `docs/runbooks/lab-session.md`:
- Install through SmartScreen.
- Camera: bring a USB webcam if the PC has none.
- 1.2 including the Windows names of blocked apps (the "verify on day 3" items).
- Lockdown keys: Win, Alt+Tab, Ctrl+C/V, PrtScn.
- PrtScn and Snipping Tool capture a black window.
- The five demo moments, 5 of 5 each.
- Phone at 4 angles; phone raised; 5 s side turn; second person.
- fps and CPU from the overlay.

Numbers go into phase-1-exit.

## 4. The Demo Day flow that must work end to end

Rehearse it Wednesday evening on the Windows stage laptop.

| Step | What happens |
|---|---|
| Setup | Projector shows the `DEMO-LIVE` wall (24 simulated students); a teammate's laptop opens `/try` with the full overlay |
| Join | Student laptop over HDMI: code `DEMO-LIVE`, seat 20249026. On 1.2 a live face box; open Telegram, the row turns red; close it |
| Lockdown | Rules, then the exam. Win, Alt+Tab, Ctrl+C/V and PrtScn do nothing |
| Phone | Phone in hand gives `phone.detected`; phone raised as if photographing the screen gives `phone.raised`. Both reach the wall within 1 s with stills and boxes |
| Gaze and presence | Look down 3 s; look left 3 s; profile turn 5 s; teammate leans in (`face.second`); leave for 10 s (2.3 pause), come back, "I'm here" |
| Proctor | Message and added time from the wall reach the laptop |
| Finish | Submit; the receipt's QR opens `/verify` on a judge's phone; review shows the flags with boxes; a decision; the report |

## 5. Reporting

After each item, report: branch and PR, what changed, the evidence row, and anything the owner must do by hand. At the end, give one table of the section 2 checklist with live status.
