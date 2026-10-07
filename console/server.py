"""Üki proctor console — receives status/events from student engines on the LAN
and serves the live dashboard. In-memory only (scaffold); swap for SQLite later.

Run:  uvicorn server:app --host 0.0.0.0 --port 8000
"""
import json
import os

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="Üki console")

sessions = {}     # session_id -> latest status
events = []        # recent events (capped)
viewers = set()    # connected console UIs

HERE = os.path.dirname(__file__)


async def fanout(msg):
    for v in list(viewers):
        try:
            await v.send_text(json.dumps(msg, ensure_ascii=False))
        except Exception:
            viewers.discard(v)


@app.websocket("/ingest")
async def ingest(ws: WebSocket):
    """Student engines connect here and push status/event messages."""
    await ws.accept()
    try:
        while True:
            msg = json.loads(await ws.receive_text())
            if msg.get("type") == "status":
                sessions[msg["session_id"]] = msg
            elif msg.get("type") == "event":
                events.append(msg)
                del events[:-500]
            await fanout(msg)
    except WebSocketDisconnect:
        pass


@app.websocket("/ws")
async def ws(ws: WebSocket):
    """Console UIs connect here for the live feed."""
    await ws.accept()
    viewers.add(ws)
    await ws.send_text(json.dumps({
        "type": "snapshot",
        "sessions": list(sessions.values()),
        "events": events[-50:],
    }, ensure_ascii=False))
    try:
        while True:
            await ws.receive_text()   # TODO: proctor commands (warn / pause) -> back to engine
    except WebSocketDisconnect:
        viewers.discard(ws)


app.mount("/static", StaticFiles(directory=os.path.join(HERE, "static")), name="static")


@app.get("/")
def index():
    with open(os.path.join(HERE, "static", "index.html"), encoding="utf-8") as f:
        return HTMLResponse(f.read())
