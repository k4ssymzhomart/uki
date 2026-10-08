// Üki main process: single-instance lock, app lifecycle and the wiring behind window.uki. One window
// takes the student from join to receipt; closing it quits the app on every OS, except while the exam
// holds the app (lockdown, the tray, or the exam's process scan: quit-guard.ts), when close and quit are
// blocked.
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { IPC_CHANNELS, type IpcEventArgs, type IpcEventChannel } from "@uki/contracts";
import {
  app,
  type BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  powerSaveBlocker,
  session,
  shell,
  systemPreferences,
  Tray,
} from "electron";
import { buildCsp } from "../shared/csp.ts";
import { isAppUrl } from "../shared/origin.ts";
import { requestCameraAccess } from "./camera-access.ts";
import { findDebugSwitch } from "./debug-switches.ts";
import {
  createScreenlessLockdown,
  describeDevFlags,
  hasDevEscape,
  readDevFlags,
  withoutBlockedApps,
} from "./dev-flags.ts";
import { createIpcHandlers, desktopOs, registerIpcHandlers, sendToRenderer } from "./ipc.ts";
import { createKeyboardHook } from "./keyboard-hook.ts";
import { loadWin32KeyboardHook } from "./keyboard-hook-win32.ts";
import { startLockLink } from "./lock-link.ts";
import { createLockdown } from "./lockdown.ts";
import { appMenuTemplate } from "./menu.ts";
import { protocolRoots, registerAppProtocol, registerPrivilegedSchemes } from "./protocol.ts";
import { examHolds, guardClose, guardQuit } from "./quit-guard.ts";
import { saveReceiptPdf } from "./receipt-pdf.ts";
import { createBlockedAppWatcher, findBlockedApps, scanSystem } from "./scan.ts";
import { createTrayMode } from "./tray.ts";
import { trayIcon } from "./tray-icon.ts";
import { asciiUserAgent } from "./user-agent.ts";
import { applySessionSecurity, createMainWindow, hardenWebContents, shouldAllowCapture } from "./window.ts";

// Packaged builds never run under a debugger (debug-switches.ts).
const debugSwitch = app.isPackaged ? findDebugSwitch(app.commandLine, process.argv) : null;

// Before ready: the uki:// scheme's privileges, and the sandbox for every renderer.
registerPrivilegedSchemes();
app.enableSandbox();
app.userAgentFallback = asciiUserAgent(app.userAgentFallback);

const os = desktopOs(process.platform);
const isDevelopmentBuild = !app.isPackaged;
// The lab variant (`pnpm --filter desktop dist:lab`, "Builds" in docs/phase-0-plan.md): a packaged
// production build that keeps the developer overlay and the development escape for a lab session. CI
// builds it as Uki-lab-<version>-x64.zip; it never ships.
const isLabBuild = import.meta.env.MODE === "lab";
if (isLabBuild) {
  console.warn("[desktop] lab build: the developer overlay (Ctrl+Shift+D) and Ctrl+Shift+Q are on");
}
// Development-only switches (dev-flags.ts); a packaged build reads none of them.
const devFlags = readDevFlags(process.env, app.isPackaged);
if (describeDevFlags(devFlags).length > 0) {
  console.warn(`[desktop] development flags on: ${describeDevFlags(devFlags).join(", ")}`);
}
// Before the single-instance lock, which lives in the userData folder.
if (devFlags.userDataDir) app.setPath("userData", devFlags.userDataDir);
const devServerUrl = isDevelopmentBuild ? process.env.ELECTRON_RENDERER_URL : undefined;
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || undefined;
const lockExtensionId = import.meta.env.VITE_LOCK_EXTENSION_ID || undefined;
const preloadPath = fileURLToPath(new URL("../preload/index.cjs", import.meta.url));
/** In userData: the Lock install this app paired with. */
const LOCK_PAIRING_FILE = "lock-pairing.json";

let mainWindow: BrowserWindow | null = null;

function liveWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
}

/** A main-to-renderer event, checked against its schema; dropped when there is no window. */
function notify<C extends IpcEventChannel>(channel: C, ...args: IpcEventArgs<C>): void {
  const window = liveWindow();
  if (window) sendToRenderer(window.webContents, channel, ...args);
}

const watcher = createBlockedAppWatcher({
  findApps: () => (devFlags.ignoreBlockedApps ? Promise.resolve([]) : findBlockedApps(os)),
  onAppeared: (apps) => notify(IPC_CHANNELS.checksBlockedApps, apps),
  onError: (error) => console.error("[desktop] process scan failed:", error),
});

// Windows only: the low-level keyboard hook that lockdown runs (keyboard-hook.ts). Koffi loads on first
// use, never on macOS or Linux; a packaged app takes it from its resources folder.
const keyboardHook =
  os === "windows"
    ? createKeyboardHook({
        load: () => loadWin32KeyboardHook(app.isPackaged ? process.resourcesPath : null),
        log: console,
      })
    : undefined;

const lockdown = devFlags.noKiosk
  ? createScreenlessLockdown((on) =>
      console.warn(`[desktop] lockdown ${on ? "on" : "off"} (UKI_DEV_NO_KIOSK)`),
    )
  : createLockdown({
      os,
      devEscape: hasDevEscape(app.isPackaged, import.meta.env.MODE),
      onBlur: () => notify(IPC_CHANNELS.examBlur),
      keyboardHook,
      onDevEscape: () => {
        // The running scan holds the app too: the escape hatch lets quit through again.
        watcher.stop();
        console.warn("[desktop] development escape hatch: lockdown and the process scan off");
      },
      activateApp: () => app.focus({ steal: true }),
      onKioskFailed: () => console.error("[desktop] lockdown: the window did not go full screen"),
    });

const trayMode = createTrayMode({
  os,
  createTray: () => new Tray(trayIcon(os)),
  buildMenu: (template) => Menu.buildFromTemplate(template),
  powerSaveBlocker,
});

/** Close and quit wait for submit or end while the exam holds the app (quit-guard.ts). */
const examHoldsApp = examHolds({ lockdown, trayMode, watcher });

function openMainWindow(): void {
  const window = createMainWindow({
    preloadPath,
    devServerUrl,
    allowCapture: shouldAllowCapture(app.isPackaged, process.env),
    devTools: isDevelopmentBuild,
  });
  const detach = [lockdown.attach(window), trayMode.attach(window), guardClose(window, examHoldsApp)];
  window.on("closed", () => {
    for (const undo of detach) undo();
    if (mainWindow === window) mainWindow = null;
  });
  mainWindow = window;
}

function focusMainWindow(): void {
  const window = liveWindow();
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

if (debugSwitch !== null) {
  console.error(`[desktop] refusing to start with --${debugSwitch}`);
  app.exit(1);
} else if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", focusMainWindow);
  app.on("web-contents-created", (_event, contents) =>
    hardenWebContents(contents, devServerUrl, isDevelopmentBuild),
  );
  guardQuit(app, examHoldsApp);

  void app.whenReady().then(() => {
    const devServerOrigin = devServerUrl ? new URL(devServerUrl).origin : undefined;
    registerAppProtocol(protocolRoots(devServerUrl !== undefined), {
      csp: buildCsp({ supabaseUrl, dev: devServerUrl !== undefined }),
      devServerOrigin,
    });
    applySessionSecurity(session.defaultSession, {
      devServerUrl,
      devCsp: devServerUrl ? buildCsp({ supabaseUrl, dev: true }) : undefined,
    });

    const menu = appMenuTemplate(os, app.isPackaged);
    if (menu !== undefined) Menu.setApplicationMenu(menu === null ? null : Menu.buildFromTemplate(menu));

    const lock = startLockLink({
      extensionId: lockExtensionId,
      dev: isDevelopmentBuild,
      appVersion: app.getVersion(),
      os,
      pairingFile: join(app.getPath("userData"), LOCK_PAIRING_FILE),
      onMessage: (message) => notify(IPC_CHANNELS.lockMessage, message),
      onStatus: (status) => notify(IPC_CHANNELS.lockStatusChanged, status),
      onPairCode: (code) => notify(IPC_CHANNELS.lockPairCode, code),
    });

    registerIpcHandlers(
      ipcMain,
      createIpcHandlers({
        info: { version: app.getVersion(), os, arch: process.arch },
        quit: () => app.quit(),
        examActive: examHoldsApp,
        scan: devFlags.ignoreBlockedApps
          ? withoutBlockedApps(() => scanSystem({ os, userDataPath: app.getPath("userData") }))
          : () => scanSystem({ os, userDataPath: app.getPath("userData") }),
        cameraAccess: () => requestCameraAccess(os, systemPreferences),
        watcher,
        lockdown,
        trayMode,
        lock,
        savePdf: async () => {
          const window = liveWindow();
          if (!window) return null;
          return saveReceiptPdf({
            window,
            showSaveDialog: (parent, options) => dialog.showSaveDialog(parent, options),
            documentsPath: app.getPath("documents"),
          });
        },
        openExternal: (url) => shell.openExternal(url),
      }),
      (url) => isAppUrl(url, devServerUrl),
    );
    openMainWindow();
    // Koffi and user32 load now, so a packaging fault shows at launch (the CI launch test reads this
    // line), not when the exam starts. Nothing is installed until lockdown.
    keyboardHook?.prepare();

    app.on("activate", () => {
      if (liveWindow()) focusMainWindow();
      else openMainWindow();
    });
    app.on("will-quit", () => {
      keyboardHook?.stop();
      watcher.stop();
      trayMode.dispose();
      void lock.close();
    });
  });

  app.on("window-all-closed", () => app.quit());
  // app.exit() and a crash skip will-quit; Windows also removes the hook with the process.
  process.once("exit", () => keyboardHook?.stop());
}
