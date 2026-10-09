// @vitest-environment node
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BLUR_NOTICE_INTERVAL_MS,
  createLockdown,
  KIOSK_CHECK_MS,
  KIOSK_RETRIES,
  type LockdownWindow,
} from "./lockdown.ts";

afterEach(() => {
  vi.useRealTimers();
});

import type { InputLike } from "./shortcuts.ts";

/** A BrowserWindow stand-in that records every call in order. */
function fakeWindow(options: { kioskWorks?: () => boolean } = {}) {
  const calls: string[] = [];
  const window = new EventEmitter();
  const contents = new EventEmitter();
  let minimized = false;
  let fullScreen = false;
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push(args.length ? `${name}(${args.map((a) => JSON.stringify(a)).join(", ")})` : `${name}()`);
    };
  Object.assign(window, {
    isDestroyed: () => false,
    isMinimized: () => minimized,
    restore: (...args: unknown[]) => {
      minimized = false;
      record("restore")(...args);
    },
    show: record("show"),
    focus: record("focus"),
    isFullScreen: () => fullScreen,
    setKiosk: (on: boolean) => {
      fullScreen = on && (options.kioskWorks?.() ?? true);
      record("setKiosk")(on);
    },
    setAlwaysOnTop: record("setAlwaysOnTop"),
    setVisibleOnAllWorkspaces: record("setVisibleOnAllWorkspaces"),
    setClosable: record("setClosable"),
    setMinimizable: record("setMinimizable"),
    webContents: Object.assign(contents, { setZoomFactor: record("setZoomFactor") }),
  });
  return {
    window: window as unknown as LockdownWindow,
    calls,
    minimize: () => {
      minimized = true;
    },
    close() {
      const event = { preventDefault: vi.fn() };
      window.emit("close", event);
      return event.preventDefault.mock.calls.length > 0;
    },
    blur: () => window.emit("blur"),
    key(input: Partial<InputLike> & { code: string }) {
      const event = { preventDefault: vi.fn() };
      contents.emit("before-input-event", event, {
        type: "keyDown",
        key: "",
        control: false,
        meta: false,
        alt: false,
        shift: false,
        ...input,
      });
      return event.preventDefault.mock.calls.length > 0;
    },
    zoom: () => contents.emit("zoom-changed", {}, "in"),
  };
}

describe("lockdown on macOS", () => {
  it("enters with workspaces, always on top, kiosk, then leaves in reverse", () => {
    const fake = fakeWindow();
    const lockdown = createLockdown({ os: "macos", devEscape: false, onBlur: vi.fn() });
    lockdown.attach(fake.window);
    expect(lockdown.active).toBe(false);

    lockdown.set(true);
    expect(lockdown.active).toBe(true);
    expect(fake.calls).toEqual([
      "show()",
      'setVisibleOnAllWorkspaces(true, {"visibleOnFullScreen":true,"skipTransformProcessType":true})',
      'setAlwaysOnTop(true, "screen-saver")',
      "setKiosk(true)",
      "setClosable(false)",
      "setMinimizable(false)",
      "focus()",
    ]);

    fake.calls.length = 0;
    lockdown.set(false);
    expect(lockdown.active).toBe(false);
    expect(fake.calls).toEqual([
      "setKiosk(false)",
      "setAlwaysOnTop(false)",
      'setVisibleOnAllWorkspaces(false, {"skipTransformProcessType":true})',
      "setClosable(true)",
      "setMinimizable(true)",
    ]);
  });

  it("blocks closing the window only while locked", () => {
    const fake = fakeWindow();
    const lockdown = createLockdown({ os: "macos", devEscape: false, onBlur: vi.fn() });
    lockdown.attach(fake.window);
    expect(fake.close()).toBe(false);
    lockdown.set(true);
    expect(fake.close()).toBe(true);
    lockdown.set(false);
    expect(fake.close()).toBe(false);
  });

  it("drops reload, DevTools, zoom, close-tab and quit only while locked", () => {
    const fake = fakeWindow();
    const lockdown = createLockdown({ os: "macos", devEscape: false, onBlur: vi.fn() });
    lockdown.attach(fake.window);
    expect(fake.key({ code: "KeyR", meta: true })).toBe(false);
    lockdown.set(true);
    expect(fake.key({ code: "KeyR", meta: true })).toBe(true);
    expect(fake.key({ code: "KeyI", meta: true, alt: true })).toBe(true);
    expect(fake.key({ code: "Equal", meta: true })).toBe(true);
    expect(fake.key({ code: "KeyW", meta: true })).toBe(true);
    expect(fake.key({ code: "KeyQ", meta: true })).toBe(true);
    expect(fake.key({ code: "KeyV", meta: true })).toBe(false);
    expect(fake.key({ code: "KeyA" })).toBe(false);
    lockdown.set(false);
    expect(fake.key({ code: "KeyQ", meta: true })).toBe(false);
  });

  it("puts the zoom back when Ctrl+wheel changes it while locked", () => {
    const fake = fakeWindow();
    const lockdown = createLockdown({ os: "macos", devEscape: false, onBlur: vi.fn() });
    lockdown.attach(fake.window);
    fake.zoom();
    expect(fake.calls).not.toContain("setZoomFactor(1)");
    lockdown.set(true);
    fake.zoom();
    expect(fake.calls).toContain("setZoomFactor(1)");
  });

  it("brings the window back on every blur, re-pins it and tells the renderer at most once per 5 s", () => {
    // The MacBook may be the only student machine on Demo Day: Spotlight, Notification Center or the
    // screenshot toolbar taking the focus must not leave the exam behind.
    let now = 1_000_000;
    const fake = fakeWindow();
    const onBlur = vi.fn();
    const activateApp = vi.fn(() => fake.calls.push("activateApp"));
    const lockdown = createLockdown({ os: "macos", devEscape: false, onBlur, activateApp, now: () => now });
    lockdown.attach(fake.window);

    fake.blur();
    expect(fake.calls).toEqual([]);
    expect(onBlur).not.toHaveBeenCalled();

    lockdown.set(true);
    fake.calls.length = 0;
    fake.blur();
    expect(fake.calls).toEqual([
      "activateApp",
      "show()",
      'setVisibleOnAllWorkspaces(true, {"visibleOnFullScreen":true,"skipTransformProcessType":true})',
      'setAlwaysOnTop(true, "screen-saver")',
      "focus()",
    ]);
    expect(onBlur).toHaveBeenCalledTimes(1);

    now += 1000;
    fake.blur();
    now += BLUR_NOTICE_INTERVAL_MS - 1001;
    fake.blur();
    expect(onBlur).toHaveBeenCalledTimes(1);
    expect(fake.calls.filter((call) => call === "focus()")).toHaveLength(3);
    expect(fake.calls.filter((call) => call === "activateApp")).toHaveLength(3);

    now += 1;
    fake.blur();
    expect(onBlur).toHaveBeenCalledTimes(2);

    lockdown.set(false);
    fake.calls.length = 0;
    now += BLUR_NOTICE_INTERVAL_MS;
    fake.blur();
    expect(fake.calls).toEqual([]);
    expect(onBlur).toHaveBeenCalledTimes(2);
  });

  it("restores a minimised window before bringing it back", () => {
    const fake = fakeWindow();
    const lockdown = createLockdown({ os: "macos", devEscape: false, onBlur: vi.fn() });
    lockdown.attach(fake.window);
    lockdown.set(true);
    fake.calls.length = 0;
    fake.minimize();
    fake.blur();
    expect(fake.calls.slice(0, 2)).toEqual(["restore()", "show()"]);
  });

  it("keeps no development escape in a packaged build: Cmd+Shift+Q is dropped and lockdown holds", () => {
    const fake = fakeWindow();
    const lockdown = createLockdown({ os: "macos", devEscape: false, onBlur: vi.fn() });
    lockdown.attach(fake.window);
    lockdown.set(true);
    expect(fake.key({ code: "KeyQ", meta: true, shift: true })).toBe(true);
    expect(fake.key({ code: "KeyQ", meta: true })).toBe(true);
    expect(lockdown.active).toBe(true);
    expect(fake.close()).toBe(true);
  });

  it("applies a lockdown requested before the window existed once it attaches", () => {
    const fake = fakeWindow();
    const lockdown = createLockdown({ os: "macos", devEscape: false, onBlur: vi.fn() });
    lockdown.set(true);
    expect(fake.calls).toEqual([]);
    lockdown.attach(fake.window);
    expect(fake.calls).toContain("setKiosk(true)");
  });

  it("detaches its listeners", () => {
    const fake = fakeWindow();
    const lockdown = createLockdown({ os: "macos", devEscape: false, onBlur: vi.fn() });
    const detach = lockdown.attach(fake.window);
    lockdown.set(true);
    detach();
    expect(fake.close()).toBe(false);
    expect(fake.key({ code: "KeyR", meta: true })).toBe(false);
  });
});

describe("kiosk check", () => {
  it("activates the app before going full screen", () => {
    const fake = fakeWindow();
    const activateApp = vi.fn(() => fake.calls.push("activateApp"));
    const lockdown = createLockdown({ os: "macos", devEscape: false, onBlur: vi.fn(), activateApp });
    lockdown.attach(fake.window);
    lockdown.set(true);
    expect(fake.calls.indexOf("activateApp")).toBeLessThan(fake.calls.indexOf("setKiosk(true)"));
  });

  it("does nothing more when the window reached full screen", () => {
    vi.useFakeTimers();
    const fake = fakeWindow();
    const lockdown = createLockdown({ os: "macos", devEscape: false, onBlur: vi.fn() });
    lockdown.attach(fake.window);
    lockdown.set(true);
    fake.calls.length = 0;
    vi.advanceTimersByTime(KIOSK_CHECK_MS * 5);
    expect(fake.calls).toEqual([]);
  });

  it("enters kiosk again when the window is not full screen, then gives up and reports", () => {
    vi.useFakeTimers();
    let works = false;
    const fake = fakeWindow({ kioskWorks: () => works });
    const onKioskFailed = vi.fn();
    const lockdown = createLockdown({ os: "macos", devEscape: false, onBlur: vi.fn(), onKioskFailed });
    lockdown.attach(fake.window);
    lockdown.set(true);
    fake.calls.length = 0;
    vi.advanceTimersByTime(KIOSK_CHECK_MS);
    expect(fake.calls).toEqual(["show()", "setKiosk(false)", "setKiosk(true)", "focus()"]);
    vi.advanceTimersByTime(KIOSK_CHECK_MS * KIOSK_RETRIES);
    expect(fake.calls.filter((call) => call === "setKiosk(true)")).toHaveLength(KIOSK_RETRIES);
    expect(onKioskFailed).toHaveBeenCalledOnce();

    // A later lockdown that works stops after one check.
    lockdown.set(false);
    works = true;
    fake.calls.length = 0;
    lockdown.set(true);
    vi.advanceTimersByTime(KIOSK_CHECK_MS * 5);
    expect(fake.calls.filter((call) => call === "setKiosk(true)")).toHaveLength(1);
    expect(onKioskFailed).toHaveBeenCalledOnce();
  });

  it("stops checking when lockdown ends first", () => {
    vi.useFakeTimers();
    const fake = fakeWindow({ kioskWorks: () => false });
    const lockdown = createLockdown({ os: "macos", devEscape: false, onBlur: vi.fn() });
    lockdown.attach(fake.window);
    lockdown.set(true);
    lockdown.set(false);
    fake.calls.length = 0;
    vi.advanceTimersByTime(KIOSK_CHECK_MS * 5);
    expect(fake.calls).toEqual([]);
  });
});

describe("lockdown on Windows", () => {
  it("brings the window back on every blur and tells the renderer at most once per 5 s", () => {
    let now = 1_000_000;
    const fake = fakeWindow();
    const onBlur = vi.fn();
    const lockdown = createLockdown({ os: "windows", devEscape: false, onBlur, now: () => now });
    lockdown.attach(fake.window);

    fake.blur();
    expect(onBlur).not.toHaveBeenCalled();
    expect(fake.calls).toEqual([]);

    lockdown.set(true);
    expect(fake.calls.some((call) => call.startsWith("setVisibleOnAllWorkspaces"))).toBe(false);
    fake.calls.length = 0;

    fake.blur();
    expect(fake.calls).toEqual(["show()", 'setAlwaysOnTop(true, "screen-saver")', "focus()"]);
    expect(onBlur).toHaveBeenCalledTimes(1);

    now += 1000;
    fake.blur();
    now += BLUR_NOTICE_INTERVAL_MS - 1001;
    fake.blur();
    expect(onBlur).toHaveBeenCalledTimes(1);
    // Every blur still refocuses, even when Windows refuses the focus.
    expect(fake.calls.filter((call) => call === "focus()")).toHaveLength(3);

    now += 1;
    fake.blur();
    expect(onBlur).toHaveBeenCalledTimes(2);

    lockdown.set(false);
    now += BLUR_NOTICE_INTERVAL_MS;
    fake.blur();
    expect(onBlur).toHaveBeenCalledTimes(2);
  });

  it("runs the keyboard hook from lockdown on until lockdown off", () => {
    const fake = fakeWindow();
    const hook = { start: vi.fn(), stop: vi.fn() };
    const lockdown = createLockdown({ os: "windows", devEscape: false, onBlur: vi.fn(), keyboardHook: hook });
    lockdown.attach(fake.window);
    expect(hook.start).not.toHaveBeenCalled();
    lockdown.set(true);
    expect(hook.start).toHaveBeenCalledOnce();
    expect(hook.stop).not.toHaveBeenCalled();
    lockdown.set(false);
    expect(hook.stop).toHaveBeenCalledOnce();
  });

  it("starts the hook even before the window exists, so no key slips through while it opens", () => {
    const hook = { start: vi.fn(), stop: vi.fn() };
    const lockdown = createLockdown({ os: "windows", devEscape: false, onBlur: vi.fn(), keyboardHook: hook });
    lockdown.set(true);
    expect(hook.start).toHaveBeenCalledOnce();
  });

  it("restores a minimised window (Win+D) before showing it", () => {
    const fake = fakeWindow();
    const lockdown = createLockdown({ os: "windows", devEscape: false, onBlur: vi.fn() });
    lockdown.attach(fake.window);
    lockdown.set(true);
    fake.calls.length = 0;
    fake.minimize();
    fake.blur();
    expect(fake.calls.slice(0, 2)).toEqual(["restore()", "show()"]);
  });
});

describe("the clipboard when lockdown starts (C1)", () => {
  it("empties the clipboard on every OS when lockdown turns on, once per start", () => {
    for (const os of ["macos", "windows"] as const) {
      const fake = fakeWindow();
      const clearClipboard = vi.fn();
      const lockdown = createLockdown({ os, devEscape: false, onBlur: vi.fn(), clearClipboard });
      lockdown.attach(fake.window);
      expect(clearClipboard).not.toHaveBeenCalled();
      lockdown.set(true);
      expect(clearClipboard, os).toHaveBeenCalledOnce();
      // Applied again while on (a restored session): nothing new to clear.
      lockdown.set(true);
      expect(clearClipboard).toHaveBeenCalledOnce();
      lockdown.set(false);
      expect(clearClipboard).toHaveBeenCalledOnce();
      // The next exam's lockdown clears it again.
      lockdown.set(true);
      expect(clearClipboard).toHaveBeenCalledTimes(2);
    }
  });

  it("clears before the hook starts and before the window locks, also with no window yet", () => {
    const order: string[] = [];
    const hook = { start: vi.fn(() => order.push("hook")), stop: vi.fn() };
    const lockdown = createLockdown({
      os: "windows",
      devEscape: false,
      onBlur: vi.fn(),
      keyboardHook: hook,
      clearClipboard: () => order.push("clear"),
    });
    lockdown.set(true);
    expect(order).toEqual(["clear", "hook"]);
  });

  it("goes on into lockdown when the clipboard cannot be cleared, and reports it", () => {
    const fake = fakeWindow();
    const failure = new Error("clipboard busy");
    const onClipboardFailed = vi.fn();
    const hook = { start: vi.fn(), stop: vi.fn() };
    const lockdown = createLockdown({
      os: "windows",
      devEscape: false,
      onBlur: vi.fn(),
      keyboardHook: hook,
      clearClipboard: () => {
        throw failure;
      },
      onClipboardFailed,
    });
    lockdown.attach(fake.window);
    expect(() => lockdown.set(true)).not.toThrow();
    expect(lockdown.active).toBe(true);
    expect(hook.start).toHaveBeenCalledOnce();
    expect(fake.calls).toContain("setKiosk(true)");
    expect(onClipboardFailed).toHaveBeenCalledWith(failure);
  });
});

describe("development escape hatch", () => {
  it("leaves lockdown on Cmd+Shift+Q in development builds", () => {
    const fake = fakeWindow();
    const onDevEscape = vi.fn();
    const lockdown = createLockdown({ os: "macos", devEscape: true, onBlur: vi.fn(), onDevEscape });
    lockdown.attach(fake.window);
    lockdown.set(true);
    expect(fake.key({ code: "KeyQ", meta: true, shift: true })).toBe(true);
    expect(lockdown.active).toBe(false);
    expect(onDevEscape).toHaveBeenCalledOnce();
    expect(fake.calls).toContain("setKiosk(false)");
  });

  it("uses Ctrl+Shift+Q on Windows, which the keyboard hook lets through, and removes the hook", () => {
    const fake = fakeWindow();
    const hook = { start: vi.fn(), stop: vi.fn() };
    const lockdown = createLockdown({ os: "windows", devEscape: true, onBlur: vi.fn(), keyboardHook: hook });
    lockdown.attach(fake.window);
    lockdown.set(true);
    fake.key({ code: "KeyQ", control: true, shift: true });
    expect(lockdown.active).toBe(false);
    expect(hook.stop).toHaveBeenCalledOnce();
  });

  it("does nothing in packaged builds, where the shortcut is simply dropped", () => {
    const fake = fakeWindow();
    const lockdown = createLockdown({ os: "macos", devEscape: false, onBlur: vi.fn() });
    lockdown.attach(fake.window);
    lockdown.set(true);
    expect(fake.key({ code: "KeyQ", meta: true, shift: true })).toBe(true);
    expect(lockdown.active).toBe(true);
  });
});
