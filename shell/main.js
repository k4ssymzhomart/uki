// Üki student shell — Electron kiosk.
// Locks the window and loads the exam. OS-level lockdown (Alt+Tab, Win, PrtScn)
// is enforced by guard/ via the engine on Windows; the globalShortcut blocks
// here are only a web-layer backup.
const { app, BrowserWindow, globalShortcut } = require("electron");
const path = require("path");

const EXAM_URL =
  process.env.UKI_EXAM_URL ||
  `file://${path.join(__dirname, "renderer", "index.html")}`;

let win;

function createWindow() {
  win = new BrowserWindow({
    kiosk: true,
    fullscreen: true,
    frame: false,
    closable: false,
    minimizable: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      devTools: false, // students get no DevTools
    },
  });

  // Windows: the exam window is excluded from screen capture (screenshots and
  // recordings come out black). No-op on macOS 15+ (see ARCHITECTURE.md).
  win.setContentProtection(true);
  win.setAlwaysOnTop(true, "screen-saver");

  win.loadURL(EXAM_URL);
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" })); // no popups
  win.on("blur", () => {
    if (win && !win.isDestroyed()) win.focus(); // refocus if the kiosk loses focus
  });
}

function registerBlocks() {
  [
    "CommandOrControl+C", "CommandOrControl+V", "CommandOrControl+X",
    "Alt+Tab", "CommandOrControl+T", "CommandOrControl+N",
    "CommandOrControl+W", "F11", "Escape",
  ].forEach((acc) => {
    try { globalShortcut.register(acc, () => {}); } catch (e) {}
  });
}

app.whenReady().then(() => {
  createWindow();
  registerBlocks();
  // TODO: spawn the Python engine (child_process) or require it already running.
  // The renderer connects to ws://localhost:8765 for status/events and applies
  // shield_on / shield_off / pause commands.
});

app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => app.quit());
