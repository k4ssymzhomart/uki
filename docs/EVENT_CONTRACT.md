# Event contract

The one interface the engine, shell and console are all built against. JSON over WebSocket. Agree this first; build the three parts in parallel against it.

## Transport

- **Engine → shell**, and **engine → console**: the engine runs a WebSocket server on `ws://localhost:8765` (shell, same machine) and, if `PROCTOR_URL` is set, also connects out to the console over the LAN. All three message kinds below are broadcast to every connected client.
- **Shell/console → engine**: `input` and `command` messages (below) flow back on the same socket.

Every message is a JSON object with a `type` field.

## 1. `status` (engine → clients, ~2 Hz)

The live state the shell's status bar and the console grid render.

```json
{
  "type": "status",
  "ts": 1760000000.0,
  "session_id": "seat-14",
  "camera": "ok",            // ok | covered | frozen | missing
  "face": "present",         // present | absent | multiple
  "gaze": "on_screen",       // on_screen | down | left | right | up
  "phone": false,
  "environment": "ok",       // ok | focus_lost | forbidden_app | overlay | remote | vm
  "risk": 12                 // 0..100, decays over time
}
```

## 2. `event` (engine → clients, on trigger)

A discrete flag. Carries everything the proctor needs to judge it.

```json
{
  "type": "event",
  "ts": 1760000000.0,
  "session_id": "seat-14",
  "code": "phone_in_frame",        // see the code list below
  "label_ru": "Телефон в кадре",
  "severity": "high",              // low | medium | high | critical
  "signals": { "confidence": 0.78, "frames": "3/5" },
  "evidence_path": "evidence/seat-14/1760000000_phone.mp4"
}
```

### Event codes (match the detection-logic table in the war-plan doc)

| code | label_ru | severity |
| --- | --- | --- |
| `phone_in_frame` | Телефон в кадре | high |
| `photo_attempt` | Попытка съёмки экрана | critical |
| `gaze_down` | Взгляд вниз | medium |
| `gaze_side` | Взгляд в сторону | medium |
| `absent` | Студент вне кадра | medium |
| `second_person` | Второй человек | high |
| `camera_blocked` | Камера закрыта или замерла | high |
| `hotkey` | Горячая клавиша | low |
| `focus_lost` | Смена окна | high |
| `forbidden_app` | Запрещённое приложение | high |
| `overlay` | Невидимое окно | critical |
| `remote_or_vm` | ВМ или удалённый доступ | critical |

## 3. `input` (shell/guard → engine)

Keyboard/mouse activity, so the rules can suppress "gaze down" while the student is typing (false-alarm guard). No key contents, only that activity happened.

```json
{ "type": "input", "ts": 1760000000.0, "active": true }
```

## 4. `command` (console → shell, via engine)

Proctor actions.

```json
{ "type": "command", "ts": 1760000000.0, "action": "warn", "message": "Положите телефон" }
// action: warn | pause | resume | shield_on | shield_off
```

## Notes

- `session_id` is the seat identifier; one engine per student PC.
- `evidence_path` is relative to the engine's working dir; clips are a ±5 s ring buffer around the event. Never leaves the campus network.
- Timestamps are Unix seconds (float).
