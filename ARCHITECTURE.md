# Architecture

## Process model (one student PC)

```
┌───────────────────────── Student PC (Windows) ─────────────────────────┐
│                                                                         │
│   Electron shell (shell/)            Python engine (engine/)            │
│   ┌──────────────────────┐           ┌───────────────────────────┐     │
│   │ kiosk BrowserWindow  │  ws://     │ capture loop (OpenCV)     │     │
│   │ exam webview         │ localhost  │  → phone detector (YOLO)  │     │
│   │ status bar + toasts  │◀─ :8765 ──▶│  → face detector (MP)     │     │
│   │ spawns guard         │  status /  │  → rules + risk score     │     │
│   └─────────┬────────────┘  event /   │  → event WS server        │     │
│             │ invokes       input /   │  → clip ring buffer       │     │
│             ▼               command   └────────────┬──────────────┘     │
│   guard/ (win.py | mac.py)                         │ events + clips     │
│   hotkey hook, process watchdog,                   │ (LAN, if set)      │
│   remote/VM/overlay checks                         │                    │
└────────────────────────────────────────────────────┼────────────────────┘
                                                      ▼
                                   Proctor laptop (console/) — FastAPI + web
                                   live grid, alerts, clip review, verdicts, PDF
```

- The **engine** owns the webcam. Nothing else opens it (Windows allows only one owner on most lab builds). The shell shows the engine's preview if it needs one.
- **Shell ↔ engine** is a localhost WebSocket. **Engine → console** is a LAN WebSocket, only events and clips, never the video stream.
- The **guard** is invoked by the shell (or run by the engine) and is the only OS-specific code. See below.

## The only platform split: `guard/`

`guard/__init__.py` defines one interface; `get_guard()` returns the right backend.

| method | Windows (`win.py`) | macOS (`mac.py`, dev shim) |
| --- | --- | --- |
| `start_hotkey_block()` | `WH_KEYBOARD_LL` hook (ctypes) swallowing Alt+Tab, Win, PrtScn, Ctrl+C/V, Alt+Esc, Ctrl+Esc | no-op + warning |
| `scan_forbidden()` | `psutil` process scan | no-op |
| `is_remote_session()` | `GetSystemMetrics(SM_REMOTESESSION)` | `False` |
| `list_virtual_cameras()` | device enumeration | `[]` |
| `find_overlays()` | `GetWindowDisplayAffinity` over top-level windows | `[]` |

Win+L and Win+G cannot be blocked by a hook — they are closed by a lab Group Policy pack (see `docs/`, TODO). The hook runs on its own dedicated thread doing near-zero work, because Windows silently removes a hook whose callback is slow (`LowLevelHooksTimeout`, max 1000 ms). On managed labs the guard runs elevated so the hook also covers admin windows and `psutil` can close processes.

## Build order

Follow the phases and user stories in the war-plan doc. Phase 0 is: agree `docs/EVENT_CONTRACT.md`, spike the Windows hook, spike YOLO + MediaPipe on the weakest laptop, confirm the engine owns the camera.
