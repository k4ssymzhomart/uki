// Connects to the Üki engine and drives the status bar, toasts and shield.
const WS = "ws://localhost:8765";
const $ = (id) => document.getElementById(id);

function setChip(id, label, state) {
  const el = $(id);
  el.textContent = label;
  el.className = "chip " + (state || "");
}

function toast(ev) {
  const t = document.createElement("div");
  t.className = "toast " + ev.severity;
  t.textContent = ev.label_ru;
  $("toasts").appendChild(t);
  setTimeout(() => t.remove(), 5000);
}

function onStatus(s) {
  setChip("chip-camera", "Камера: " + s.camera, s.camera === "ok" ? "ok" : "bad");
  setChip("chip-gaze", "Взгляд: " + s.gaze, s.gaze === "on_screen" ? "ok" : "warn");
  setChip("chip-phone", s.phone ? "Телефон!" : "Телефон: нет", s.phone ? "bad" : "ok");
  setChip("chip-env", "Окружение: " + s.environment, s.environment === "ok" ? "ok" : "bad");
  $("risk").textContent = s.risk;
  $("risk").style.color = s.risk >= 60 ? "#ff5d5d" : s.risk >= 30 ? "#ffb020" : "#9ad";
  // Fast anti-photo shield: blur the exam whenever a phone is present.
  $("shield").hidden = s.phone !== true;
}

function throttle(fn, ms) {
  let t = 0;
  return () => { const n = Date.now(); if (n - t > ms) { t = n; fn(); } };
}

function connect() {
  const ws = new WebSocket(WS);
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.type === "status") onStatus(msg);
    else if (msg.type === "event") {
      toast(msg);
      if (msg.code === "photo_attempt") {
        $("shield").hidden = false;
        setTimeout(() => ($("shield").hidden = true), 1500);
      }
    } else if (msg.type === "command") {
      // TODO: warn banner / pause overlay from the proctor
    }
  };
  ws.onclose = () => setTimeout(connect, 1000);

  // Report activity so the engine can suppress "gaze down" while typing.
  const ping = () => {
    try { ws.send(JSON.stringify({ type: "input", ts: Date.now() / 1000, active: true })); } catch (e) {}
  };
  document.addEventListener("keydown", ping);
  document.addEventListener("mousemove", throttle(ping, 500));
}

connect();
