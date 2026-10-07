"""Rules engine: per-frame signals -> events + a status + a risk score.
Each rule maps to the detection-logic table in the war-plan doc.

Vision rules live here. Environment events (focus_lost, forbidden_app, overlay,
remote_or_vm) come from the guard and are emitted in main.py.
"""
import time
from collections import deque

import config
from events import make_event, make_status


class RulesEngine:
    def __init__(self, session_id):
        self.sid = session_id
        self.phone_hist = deque(maxlen=config.PHONE_VOTE[1])
        self.face_hist = deque(maxlen=config.SECOND_PERSON_VOTE[1])
        self.last_input = 0.0
        self.t_gaze_down = None
        self.t_gaze_side = None
        self.t_absent = None
        self.t_photo = None
        self.risk = 0.0
        self.last_tick = time.time()
        self._fired = {}

    def set_input_active(self, ts):
        self.last_input = ts

    def _debounced(self, code, now, cooldown=3.0):
        if now - self._fired.get(code, 0) < cooldown:
            return False
        self._fired[code] = now
        return True

    def _bump(self, code):
        self.risk = min(100.0, self.risk + config.RISK_WEIGHTS.get(code, 5))

    def update(self, detections, face, now=None):
        now = now or time.time()
        self.risk = max(0.0, self.risk - config.RISK_DECAY_PER_SEC * (now - self.last_tick))
        self.last_tick = now
        events = []

        # --- phone ---
        phones = [d for d in detections
                  if d["name"] == "cell phone" and d["area_frac"] >= config.PHONE_MIN_AREA]
        self.phone_hist.append(bool(phones))
        phone_now = sum(self.phone_hist) >= config.PHONE_VOTE[0]
        if phone_now and self._debounced("phone_in_frame", now):
            top = max(phones, key=lambda d: d["conf"])
            events.append(make_event(self.sid, "phone_in_frame", {
                "confidence": round(top["conf"], 2),
                "frames": f"{sum(self.phone_hist)}/{len(self.phone_hist)}",
            }))
            self._bump("phone_in_frame")

        # --- photo attempt: phone high in frame + held steady ---
        high_phone = any(p["cy_frac"] <= (1 - config.PHOTO_FACE_HEIGHT) for p in phones)
        if high_phone:
            self.t_photo = self.t_photo or now
            if now - self.t_photo >= config.PHOTO_STEADY_SECONDS and self._debounced("photo_attempt", now):
                events.append(make_event(self.sid, "photo_attempt", {"held_s": round(now - self.t_photo, 1)}))
                self._bump("photo_attempt")
        else:
            self.t_photo = None

        # --- presence / second person ---
        count = face.get("count", 0)
        self.face_hist.append(count)
        if count == 0:
            self.t_absent = self.t_absent or now
            if now - self.t_absent >= config.ABSENT_SECONDS and self._debounced("absent", now):
                events.append(make_event(self.sid, "absent", {"seconds": round(now - self.t_absent, 1)}))
                self._bump("absent")
        else:
            self.t_absent = None
        if sum(1 for c in self.face_hist if c >= 2) >= config.SECOND_PERSON_VOTE[0] and self._debounced("second_person", now):
            events.append(make_event(self.sid, "second_person", {"faces": max(self.face_hist)}))
            self._bump("second_person")

        # --- gaze (suppressed while typing) ---
        gaze = face.get("gaze", "on_screen")
        typing = (now - self.last_input) < 1.5
        if gaze == "down" and not typing:
            self.t_gaze_down = self.t_gaze_down or now
            if now - self.t_gaze_down >= config.GAZE_DOWN_SECONDS and self._debounced("gaze_down", now):
                events.append(make_event(self.sid, "gaze_down",
                                          {"seconds": round(now - self.t_gaze_down, 1)},
                                          severity="high" if phone_now else "medium"))
                self._bump("gaze_down")
        else:
            self.t_gaze_down = None
        if gaze in ("left", "right"):
            self.t_gaze_side = self.t_gaze_side or now
            if now - self.t_gaze_side >= config.GAZE_SIDE_SECONDS and self._debounced("gaze_side", now):
                events.append(make_event(self.sid, "gaze_side", {"dir": gaze}))
                self._bump("gaze_side")
        else:
            self.t_gaze_side = None

        status = make_status(
            self.sid,
            face=("absent" if count == 0 else "multiple" if count >= 2 else "present"),
            gaze=gaze if face.get("present") else "absent",
            phone=phone_now,
            risk=int(self.risk),
        )
        return status, events
