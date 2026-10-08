// Exam lockdown ("Window states" and "Hardening" in docs/phase-0-plan.md): kiosk, always on top at the
// screen-saver level, on every workspace on macOS; close and quit blocked; reload, DevTools, zoom,
// close-tab and quit shortcuts dropped. On Windows kiosk mode is only full screen, so every blur during
// lockdown brings the window back and tells the renderer (exam.onBlur) at most once per 5 seconds; the
// renderer sends tab.blocked with app null.
import type { DesktopOs } from "@uki/contracts";
import type { BrowserWindow, WebContents } from "electron";
import { isBlockedShortcut, isDevEscape } from "./shortcuts.ts";
import { createGate } from "./throttle.ts";

/** The renderer hears about focus leaving the window at most this often. */
export const BLUR_NOTICE_INTERVAL_MS = 5000;
/** Kiosk mode should be full screen by then; otherwise lockdown tries again. */
export const KIOSK_CHECK_MS = 1500;
/** Tries after the first, if the window still is not full screen. */
export const KIOSK_RETRIES = 2;

export const MAC_ALL_WORKSPACES = { visibleOnFullScreen: true, skipTransformProcessType: true } as const;

/** The parts of the BrowserWindow that lockdown drives, so tests can pass a fake. */
export type LockdownWindow = Pick<
  BrowserWindow,
  | "isDestroyed"
  | "isMinimized"
  | "isFullScreen"
  | "restore"
  | "show"
  | "focus"
  | "setKiosk"
  | "setAlwaysOnTop"
  | "setVisibleOnAllWorkspaces"
  | "setClosable"
  | "setMinimizable"
  | "on"
  | "removeListener"
> & { readonly webContents: Pick<WebContents, "on" | "removeListener" | "setZoomFactor"> };

export type LockdownOptions = {
  os: DesktopOs;
  /** Development (unpackaged) and lab builds only: Cmd/Ctrl+Shift+Q leaves lockdown. */
  devEscape: boolean;
  /** Focus left the window during lockdown (Windows); at most once per BLUR_NOTICE_INTERVAL_MS. */
  onBlur: () => void;
  /** After the development escape hatch turned lockdown off. */
  onDevEscape?: () => void;
  /**
   * Makes Üki the active app before the window goes full screen: app.focus({ steal: true }). On macOS a
   * background app cannot take focus on its own, and kiosk mode fails for a window that is not in front
   * (for example when the exam starts on the clock while the student looks at another app).
   */
  activateApp?: () => void;
  /** The window still was not full screen after the retries. */
  onKioskFailed?: () => void;
  now?: () => number;
};

export interface Lockdown {
  /** True from exam.lockdown(true) until exam.lockdown(false). Close and quit are blocked meanwhile. */
  readonly active: boolean;
  set(on: boolean): void;
  /** Adds the close, blur and keyboard listeners to the window; returns a detach. */
  attach(window: LockdownWindow): () => void;
}

type Cancellable = { preventDefault(): void };

export function createLockdown(options: LockdownOptions): Lockdown {
  const { os } = options;
  const blurGate = createGate(BLUR_NOTICE_INTERVAL_MS, options.now);
  let active = false;
  let current: LockdownWindow | null = null;
  let kioskCheck: ReturnType<typeof setTimeout> | null = null;

  const usable = (window: LockdownWindow | null): window is LockdownWindow =>
    window !== null && !window.isDestroyed();

  function enter(window: LockdownWindow): void {
    if (window.isMinimized()) window.restore();
    options.activateApp?.();
    window.show();
    // macOS: on every Space and above full-screen windows. Set before kiosk, which goes full screen.
    // skipTransformProcessType: Electron otherwise turns the app into a UI element and back, which
    // deactivates it, and kiosk mode then fails for the inactive window.
    if (os === "macos") window.setVisibleOnAllWorkspaces(true, MAC_ALL_WORKSPACES);
    window.setAlwaysOnTop(true, "screen-saver");
    window.setKiosk(true);
    window.setClosable(false);
    window.setMinimizable(false);
    window.focus();
    scheduleKioskCheck(window, KIOSK_RETRIES);
  }

  /** A window that did not reach full screen (another app in front, a Space switch) gets kiosk again. */
  function scheduleKioskCheck(window: LockdownWindow, retriesLeft: number): void {
    cancelKioskCheck();
    kioskCheck = setTimeout(() => {
      kioskCheck = null;
      if (!active || current !== window || window.isDestroyed() || window.isFullScreen()) return;
      if (retriesLeft <= 0) {
        options.onKioskFailed?.();
        return;
      }
      options.activateApp?.();
      window.show();
      window.setKiosk(false);
      window.setKiosk(true);
      window.focus();
      scheduleKioskCheck(window, retriesLeft - 1);
    }, KIOSK_CHECK_MS);
  }

  function cancelKioskCheck(): void {
    if (kioskCheck !== null) clearTimeout(kioskCheck);
    kioskCheck = null;
  }

  function leave(window: LockdownWindow): void {
    cancelKioskCheck();
    window.setKiosk(false);
    window.setAlwaysOnTop(false);
    if (os === "macos") window.setVisibleOnAllWorkspaces(false, { skipTransformProcessType: true });
    window.setClosable(true);
    window.setMinimizable(true);
  }

  function set(on: boolean): void {
    active = on;
    if (!usable(current)) return;
    if (on) enter(current);
    else leave(current);
  }

  function attach(window: LockdownWindow): () => void {
    current = window;
    if (active) enter(window);

    const onClose = (event: Cancellable) => {
      if (active) event.preventDefault();
    };
    const onBlur = () => {
      if (!active || os !== "windows" || window.isDestroyed()) return;
      if (window.isMinimized()) window.restore();
      window.show();
      window.setAlwaysOnTop(true, "screen-saver");
      window.focus();
      if (blurGate.pass()) options.onBlur();
    };
    const onInput = (event: Cancellable, input: Parameters<typeof isBlockedShortcut>[0]) => {
      if (!active) return;
      if (options.devEscape && isDevEscape(input, os)) {
        event.preventDefault();
        set(false);
        options.onDevEscape?.();
        return;
      }
      if (isBlockedShortcut(input, os)) event.preventDefault();
    };
    // Ctrl+wheel zoom is not a key: put the zoom back while locked.
    const onZoom = () => {
      if (active) window.webContents.setZoomFactor(1);
    };

    window.on("close", onClose);
    window.on("blur", onBlur);
    window.webContents.on("before-input-event", onInput);
    window.webContents.on("zoom-changed", onZoom);
    return () => {
      window.removeListener("close", onClose);
      window.removeListener("blur", onBlur);
      if (!window.isDestroyed()) {
        window.webContents.removeListener("before-input-event", onInput);
        window.webContents.removeListener("zoom-changed", onZoom);
      }
      if (current === window) {
        current = null;
        cancelKioskCheck();
      }
    };
  }

  return {
    get active() {
      return active;
    },
    set,
    attach,
  };
}
