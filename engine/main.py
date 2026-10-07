"""Üki engine entry point: capture -> detectors -> rules -> WebSocket.
Run from engine/:  python main.py   (serves ws://localhost:8765)
"""
import asyncio
import functools
import json
import os
import sys
import time

import cv2
import websockets

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))  # make guard/ importable

import config
from events import Hub, make_event
from rules import RulesEngine
from detectors.phone import PhoneDetector
from detectors.face import FaceDetector
from guard import get_guard

hub = Hub()
rules = RulesEngine(config.SESSION_ID)
guard = get_guard()
_guard_fired = {}


def _guard_debounced(code, now, cd=5.0):
    if now - _guard_fired.get(code, 0) < cd:
        return False
    _guard_fired[code] = now
    return True


async def ws_handler(ws):
    await hub.register(ws)
    try:
        async for raw in ws:
            try:
                msg = json.loads(raw)
            except ValueError:
                continue
            if msg.get("type") == "input":
                rules.set_input_active(msg.get("ts", time.time()))
            # TODO: handle "command" (warn / pause / shield) and relay to the shell
    finally:
        await hub.unregister(ws)


async def check_guard(now):
    events = []
    if guard.is_remote_session() and _guard_debounced("remote_or_vm", now):
        events.append(make_event(config.SESSION_ID, "remote_or_vm", {"source": "remote_session"}))
    forbidden = guard.scan_forbidden()
    if forbidden and _guard_debounced("forbidden_app", now):
        events.append(make_event(config.SESSION_ID, "forbidden_app", {"apps": forbidden[:5]}))
    return events


async def capture_loop():
    loop = asyncio.get_running_loop()
    cap = cv2.VideoCapture(config.CAMERA_INDEX)
    if not cap.isOpened():
        print("[engine] ERROR: cannot open camera", config.CAMERA_INDEX)
        return
    phone_det = await loop.run_in_executor(None, PhoneDetector)
    face_det = await loop.run_in_executor(None, FaceDetector)
    guard.start_hotkey_block()   # no-op on the macOS dev shim
    print(f"[engine] running. ws://{config.WS_HOST}:{config.WS_PORT}  session={config.SESSION_ID}")

    frame_i = 0
    last_status = last_guard = 0.0
    detections = []
    period = 1.0 / config.TARGET_FPS

    while True:
        t0 = time.time()
        ok, frame = await loop.run_in_executor(None, cap.read)
        if not ok:
            await asyncio.sleep(0.1)
            continue
        frame_i += 1
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        if frame_i % config.YOLO_EVERY == 0:
            detections = await loop.run_in_executor(None, phone_det.detect, frame)
        face = await loop.run_in_executor(
            None, functools.partial(face_det.process, rgb, int(t0 * 1000)))

        status, events = rules.update(detections, face, now=t0)
        if t0 - last_guard >= 2.0:
            events += await check_guard(t0)
            last_guard = t0

        for ev in events:
            # TODO: write a +/-5 s clip to ev["evidence_path"] from a frame ring buffer
            await hub.broadcast(ev)
        if t0 - last_status >= 1.0 / config.STATUS_HZ:
            await hub.broadcast(status)
            last_status = t0

        dt = time.time() - t0
        if dt < period:
            await asyncio.sleep(period - dt)


async def main():
    async with websockets.serve(ws_handler, config.WS_HOST, config.WS_PORT):
        await capture_loop()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[engine] stopped")
