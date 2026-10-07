// @vitest-environment node
import { EventEmitter } from "node:events";
import type { Menu } from "electron";
import { describe, expect, it, vi } from "vitest";
import { type ClosableWindow, examHolds, guardClose, guardQuit, type QuitEvents } from "./quit-guard.ts";
import { createBlockedAppWatcher } from "./scan.ts";
import { createTrayMode, type TrayHandle } from "./tray.ts";

function cancelled(target: EventEmitter, event: string): boolean {
  const e = { preventDefault: vi.fn() };
  target.emit(event, e);
  return e.preventDefault.mock.calls.length > 0;
}

describe("guardQuit", () => {
  it("cancels before-quit while the exam holds the app", () => {
    const app = new EventEmitter();
    let held = false;
    guardQuit(app as unknown as QuitEvents, () => held);
    const quit = () => {
      const event = { preventDefault: vi.fn() };
      app.emit("before-quit", event);
      return event.preventDefault.mock.calls.length === 0;
    };
    expect(quit()).toBe(true);
    held = true;
    expect(quit()).toBe(false);
    expect(quit()).toBe(false);
    held = false;
    expect(quit()).toBe(true);
  });
});

describe("examHolds", () => {
  it("holds quit and close in a browser exam while its window is out of the tray, until the scan stops", async () => {
    vi.useFakeTimers();
    try {
      const tray = Object.assign(new EventEmitter(), {
        setToolTip: vi.fn(),
        setContextMenu: vi.fn(),
        popUpContextMenu: vi.fn(),
        destroy: vi.fn(),
      });
      let blockers = 0;
      const trayMode = createTrayMode({
        os: "macos",
        createTray: () => tray as unknown as TrayHandle,
        buildMenu: (template) => template as unknown as Menu,
        powerSaveBlocker: {
          start: () => ++blockers,
          stop: () => true,
          isStarted: () => true,
        },
      });
      const watcher = createBlockedAppWatcher({ findApps: async () => [], onAppeared: () => {} });
      const holds = examHolds({ lockdown: { active: false }, trayMode, watcher });
      const app = new EventEmitter();
      const window = new EventEmitter();
      guardQuit(app as unknown as QuitEvents, holds);
      const detach = guardClose(window as unknown as ClosableWindow, holds);

      expect(cancelled(app, "before-quit")).toBe(false);
      // lock.started: the scan runs and the window goes to the tray.
      watcher.start();
      await trayMode.set(true);
      expect(cancelled(app, "before-quit")).toBe(true);
      // 2.1c, 2.1e or a submit waiting for the network brings the window back: still held.
      await trayMode.set(false);
      expect(trayMode.active).toBe(false);
      expect(cancelled(app, "before-quit")).toBe(true);
      expect(cancelled(window, "close")).toBe(true);
      // 3.1 or 2.1d: the scan stops and the app may quit.
      watcher.stop();
      expect(cancelled(app, "before-quit")).toBe(false);
      expect(cancelled(window, "close")).toBe(false);
      detach();
      expect(window.listenerCount("close")).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
