// @vitest-environment node
import { EventEmitter } from "node:events";
import { loadMessages } from "@uki/i18n";
import type { Menu, MenuItemConstructorOptions } from "electron";
import { describe, expect, it, vi } from "vitest";
import { createTrayMode, type TrayHandle, type TrayWindow, trayLabels } from "./tray.ts";

function setup(options: { os?: "macos" | "windows"; lang?: unknown } = {}) {
  const calls: string[] = [];
  const window = new EventEmitter();
  Object.assign(window, {
    isDestroyed: () => false,
    isMinimized: () => false,
    restore: () => calls.push("restore"),
    hide: () => calls.push("hide"),
    show: () => calls.push("show"),
    focus: () => calls.push("focus"),
    webContents: { executeJavaScript: vi.fn(async () => options.lang ?? "kk-KZ") },
  });
  const trays: Array<
    TrayHandle & {
      tooltip: string;
      menu: MenuItemConstructorOptions[];
      destroyed: boolean;
      emit(e: string): void;
    }
  > = [];
  const createTray = vi.fn(() => {
    const emitter = new EventEmitter();
    const tray = Object.assign(emitter, {
      tooltip: "",
      menu: [] as MenuItemConstructorOptions[],
      destroyed: false,
      setToolTip(text: string) {
        tray.tooltip = text;
      },
      setContextMenu(menu: Menu | null) {
        tray.menu = menu as unknown as MenuItemConstructorOptions[];
      },
      popUpContextMenu: vi.fn(),
      destroy() {
        tray.destroyed = true;
      },
    });
    trays.push(tray as unknown as (typeof trays)[number]);
    return tray as unknown as TrayHandle;
  });
  let nextId = 7;
  const started = new Set<number>();
  const powerSaveBlocker = {
    start: vi.fn((_type: "prevent-app-suspension" | "prevent-display-sleep") => {
      const id = nextId++;
      started.add(id);
      return id;
    }),
    stop: vi.fn((id: number) => {
      started.delete(id);
      return true;
    }),
    isStarted: (id: number) => started.has(id),
  };
  const trayMode = createTrayMode({
    os: options.os ?? "macos",
    createTray,
    buildMenu: (template) => template as unknown as Menu,
    powerSaveBlocker,
  });
  const detach = trayMode.attach(window as unknown as TrayWindow);
  const close = () => {
    const event = { preventDefault: vi.fn() };
    window.emit("close", event);
    return event.preventDefault.mock.calls.length > 0;
  };
  return { trayMode, calls, trays, createTray, powerSaveBlocker, started, close, detach };
}

describe("trayLabels", () => {
  it("takes the watch labels and the menu item from the catalog", () => {
    const en = loadMessages("en");
    expect(trayLabels("en")).toEqual({
      watching: en.lock.watching,
      phoneFound: en.exam.phone.title,
      open: en.tray.open,
    });
    expect(trayLabels("kk").open).toBe(loadMessages("kk").tray.open);
  });
});

describe("tray mode (exams in the browser)", () => {
  it("hides the window, shows the tray in the student's language and keeps the app awake", async () => {
    const { trayMode, calls, trays, powerSaveBlocker, started } = setup({ lang: "ru-RU" });
    await trayMode.set(true);
    expect(trayMode.active).toBe(true);
    expect(calls).toEqual(["hide"]);
    expect(trays).toHaveLength(1);
    const ru = loadMessages("ru");
    expect(trays[0]?.tooltip).toBe(ru.lock.watching);
    expect(trays[0]?.menu.map((item) => item.label ?? item.type)).toEqual([
      ru.lock.watching,
      "separator",
      ru.tray.open,
    ]);
    expect(trays[0]?.menu[0]?.enabled).toBe(false);
    expect(powerSaveBlocker.start).toHaveBeenCalledWith("prevent-app-suspension");
    expect(started.size).toBe(1);
  });

  it("follows the watch label and locale of exam.state", async () => {
    const { trayMode, trays } = setup();
    await trayMode.set(true);
    expect(trays[0]?.tooltip).toBe(loadMessages("kk").lock.watching);
    trayMode.setExamState({ watch: "phone_found", locale: "en" });
    expect(trays[0]?.tooltip).toBe("Phone found");
    expect(trays[0]?.menu[2]?.label).toBe(loadMessages("en").tray.open);
    trayMode.setExamState({ watch: "watching", locale: "en" });
    expect(trays[0]?.tooltip).toBe(loadMessages("en").lock.watching);
  });

  it("opens the window from the menu without leaving tray mode", async () => {
    const { trayMode, trays, calls } = setup();
    await trayMode.set(true);
    calls.length = 0;
    const open = trays[0]?.menu[2]?.click as unknown as () => void;
    open();
    expect(calls).toEqual(["show", "focus"]);
    expect(trayMode.active).toBe(true);
  });

  it("hides instead of closing while the browser exam runs", async () => {
    const { trayMode, calls, close } = setup();
    expect(close()).toBe(false);
    await trayMode.set(true);
    calls.length = 0;
    expect(close()).toBe(true);
    expect(calls).toEqual(["hide"]);
    await trayMode.set(false);
    expect(close()).toBe(false);
  });

  it("removes the tray, stops the blocker and shows the window when it ends", async () => {
    const { trayMode, trays, calls, started, powerSaveBlocker } = setup();
    await trayMode.set(true);
    calls.length = 0;
    await trayMode.set(false);
    expect(trayMode.active).toBe(false);
    expect(trays[0]?.destroyed).toBe(true);
    expect(started.size).toBe(0);
    expect(powerSaveBlocker.stop).toHaveBeenCalledWith(7);
    expect(calls).toEqual(["show", "focus"]);
  });

  it("makes one tray and one blocker however often it is switched on", async () => {
    const { trayMode, createTray, powerSaveBlocker } = setup();
    await trayMode.set(true);
    await trayMode.set(true);
    expect(createTray).toHaveBeenCalledOnce();
    expect(powerSaveBlocker.start).toHaveBeenCalledOnce();
    await trayMode.set(false);
    await trayMode.set(true);
    expect(createTray).toHaveBeenCalledTimes(2);
  });

  it("opens the menu on a left click on Windows", async () => {
    const { trayMode, trays } = setup({ os: "windows" });
    await trayMode.set(true);
    trays[0]?.emit("click");
    expect(trays[0]?.popUpContextMenu).toHaveBeenCalledOnce();
  });

  it("falls back to Kazakh when the page reports no language", async () => {
    const { trayMode, trays } = setup({ lang: 42 });
    await trayMode.set(true);
    expect(trays[0]?.tooltip).toBe(loadMessages("kk").lock.watching);
  });

  it("dispose clears the tray and the blocker", async () => {
    const { trayMode, trays, started } = setup();
    await trayMode.set(true);
    trayMode.dispose();
    expect(trays[0]?.destroyed).toBe(true);
    expect(started.size).toBe(0);
    expect(trayMode.active).toBe(false);
  });
});
