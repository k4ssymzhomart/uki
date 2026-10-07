"""Event / status helpers and the WebSocket hub. See docs/EVENT_CONTRACT.md."""
import asyncio
import json
import time

EVENT_META = {
    "phone_in_frame": ("Телефон в кадре", "high"),
    "photo_attempt":  ("Попытка съёмки экрана", "critical"),
    "gaze_down":      ("Взгляд вниз", "medium"),
    "gaze_side":      ("Взгляд в сторону", "medium"),
    "absent":         ("Студент вне кадра", "medium"),
    "second_person":  ("Второй человек", "high"),
    "camera_blocked": ("Камера закрыта или замерла", "high"),
    "hotkey":         ("Горячая клавиша", "low"),
    "focus_lost":     ("Смена окна", "high"),
    "forbidden_app":  ("Запрещённое приложение", "high"),
    "overlay":        ("Невидимое окно", "critical"),
    "remote_or_vm":   ("ВМ или удалённый доступ", "critical"),
}


def make_event(session_id, code, signals=None, evidence_path=None, severity=None):
    label, default_sev = EVENT_META.get(code, (code, "medium"))
    return {
        "type": "event",
        "ts": time.time(),
        "session_id": session_id,
        "code": code,
        "label_ru": label,
        "severity": severity or default_sev,
        "signals": signals or {},
        "evidence_path": evidence_path,
    }


def make_status(session_id, **fields):
    s = {
        "type": "status", "ts": time.time(), "session_id": session_id,
        "camera": "ok", "face": "present", "gaze": "on_screen",
        "phone": False, "environment": "ok", "risk": 0,
    }
    s.update(fields)
    return s


class Hub:
    """Tracks connected WebSocket clients and broadcasts JSON to all of them."""

    def __init__(self):
        self.clients = set()

    async def register(self, ws):
        self.clients.add(ws)

    async def unregister(self, ws):
        self.clients.discard(ws)

    async def broadcast(self, message: dict):
        if not self.clients:
            return
        data = json.dumps(message, ensure_ascii=False)
        await asyncio.gather(
            *[self._safe_send(ws, data) for ws in list(self.clients)],
            return_exceptions=True,
        )

    async def _safe_send(self, ws, data):
        try:
            await ws.send(data)
        except Exception:
            self.clients.discard(ws)
