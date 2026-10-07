# Üki — local AI proctoring

**Үкі** is the owl-feather talisman Kazakh families pin to a child to guard them from the evil eye. Üki the product guards the exam the same way: it watches to protect integrity, not to surveil the student.

Üki is a **local, offline** exam-proctoring system for university computer labs. It runs on the lab PC, analyses the webcam **on-device**, and sends only events and short evidence clips to a proctor on the same LAN. No cloud, no per-exam fee, data stays on campus.

Built for the Qostanai Industry Hackathon, Case 3 (KRU × Qostanai Hub).

> **Көреді. Қорғайды. Дәлелдейді.** — Sees. Protects. Proves.

## One app, not two

The product is a single **Windows** desktop app. ~90% of the code is cross-platform and shared; only the lockdown **guard** has an OS-specific backend.

| Part | Tech | Platform |
| --- | --- | --- |
| `engine/` — vision + rules | Python (YOLO11n, MediaPipe, OpenCV) | cross-platform |
| `shell/` — student app (kiosk + exam view + status bar) | Electron | cross-platform |
| `console/` — proctor dashboard | FastAPI + web | cross-platform |
| `guard/win.py` — lockdown | Python + Win32 (ctypes) | **Windows (ship target)** |
| `guard/mac.py` — lockdown | dev shim (no-op) | macOS (dev only) |

**Ship target: Windows.** `guard/mac.py` exists only so the engine + UI can run on a MacBook while building; the lockdown is a no-op there and prints a warning.

## Why not a browser extension

A browser extension runs inside the browser sandbox. It cannot block Alt+Tab, the Win key or PrtScn, cannot kill other apps, and cannot stop other windows opening — those are OS powers the sandbox denies. Section 2.3 of the brief needs all of that, so Üki is a native app, the same reason Safe Exam Browser and Respondus are.

## The three layers

1. **Sees** — `engine/` reads the webcam: phone detection (YOLO11n), gaze and head pose, presence, second face (MediaPipe).
2. **Protects** — `shell/` + `guard/` lock the environment: kiosk window, blocked hotkeys, no tab switching, process watchdog, anti-photo shield.
3. **Proves** — every flag carries a 10 s clip, a plain reason and a human verdict; `console/` is where the proctor decides.

## Run it (dev — Mac or Windows)

Engine:
```bash
cd engine
python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python main.py        # opens the webcam, runs the detectors, serves events on ws://localhost:8765
```

Student shell (new terminal):
```bash
cd shell
npm install
npm start             # kiosk window, connects to the engine, loads the demo exam
```

Proctor console (new terminal):
```bash
cd console
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8000   # open http://localhost:8000
```

## Interface

Every part is built against one contract: **`docs/EVENT_CONTRACT.md`**. Agree it, then the engine, shell and console can be built in parallel.

## Status

Scaffold. The spine runs; each detector, rule and guard call is stubbed with a `TODO` that maps to a user story in the war-plan doc. Build order and the full feature arsenal live there.
