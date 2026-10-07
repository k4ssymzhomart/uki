// @vitest-environment node
import { type AppToLock, IPC_CHANNELS, IPC_INVOKE } from "@uki/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  cameraSettingsUrl,
  createIpcHandlers,
  desktopOs,
  type HandlerDeps,
  type IpcHandlers,
  registerIpcHandlers,
  sendToRenderer,
} from "./ipc.ts";

type Listener = (event: { senderFrame: { url: string } | null }, ...args: unknown[]) => unknown;

function fakeIpc() {
  const listeners = new Map<string, Listener>();
  return {
    listeners,
    handle: (channel: string, listener: Listener) => listeners.set(channel, listener),
    removeHandler: (channel: string) => listeners.delete(channel),
    call: (channel: string, url: string | null, ...args: unknown[]) => {
      const listener = listeners.get(channel);
      if (!listener) throw new Error(`no handler for ${channel}`);
      return listener({ senderFrame: url === null ? null : { url } }, ...args);
    },
  };
}

const handlers: IpcHandlers = {
  [IPC_CHANNELS.appInfo]: () => ({ version: "0.0.0", os: "macos", arch: "arm64" }),
  [IPC_CHANNELS.appQuit]: () => {},
  [IPC_CHANNELS.checksScan]: () => ({ apps: [], screenShare: [], freeMb: 2048 }),
  [IPC_CHANNELS.checksCameraAccess]: () => true,
  // A broken handler: the result fails the schema and must not reach the renderer.
  [IPC_CHANNELS.checksWatch]: () => "watching" as unknown as undefined,
  [IPC_CHANNELS.examLockdown]: vi.fn(),
  [IPC_CHANNELS.examHideToTray]: () => {},
  // Another broken one.
  [IPC_CHANNELS.lockStatus]: () => "lost" as "absent",
  [IPC_CHANNELS.lockSend]: () => {},
  [IPC_CHANNELS.receiptSavePdf]: () => null,
  [IPC_CHANNELS.systemOpenCameraSettings]: () => {},
};
const trusted = (url: string) => url.startsWith("uki://app/");
const APP = "uki://app/index.html";

describe("registerIpcHandlers", () => {
  it("registers every invoke channel of the contract and can unregister them", () => {
    const ipc = fakeIpc();
    const unregister = registerIpcHandlers(ipc, handlers, trusted);
    expect([...ipc.listeners.keys()].sort()).toEqual(Object.keys(IPC_INVOKE).sort());
    unregister();
    expect(ipc.listeners.size).toBe(0);
  });

  it("passes parsed arguments and returns parsed results to the app's pages", async () => {
    const ipc = fakeIpc();
    registerIpcHandlers(ipc, handlers, trusted);
    await expect(ipc.call(IPC_CHANNELS.appInfo, APP)).resolves.toEqual({
      version: "0.0.0",
      os: "macos",
      arch: "arm64",
    });
    await ipc.call(IPC_CHANNELS.examLockdown, APP, true);
    expect(handlers[IPC_CHANNELS.examLockdown]).toHaveBeenCalledWith(true);
    await expect(ipc.call(IPC_CHANNELS.checksCameraAccess, APP)).resolves.toBe(true);
  });

  it("refuses other senders", async () => {
    const ipc = fakeIpc();
    registerIpcHandlers(ipc, handlers, trusted);
    await expect(ipc.call(IPC_CHANNELS.appInfo, "https://example.com/")).rejects.toThrow(/sender/);
    await expect(ipc.call(IPC_CHANNELS.appInfo, null)).rejects.toThrow(/sender/);
    await expect(ipc.call(IPC_CHANNELS.examLockdown, "file:///etc/passwd", true)).rejects.toThrow(/sender/);
    expect(handlers[IPC_CHANNELS.examLockdown]).not.toHaveBeenCalledWith(false);
  });

  it("refuses bad arguments before the handler runs", async () => {
    const ipc = fakeIpc();
    const lockdown = vi.fn();
    registerIpcHandlers(ipc, { ...handlers, [IPC_CHANNELS.examLockdown]: lockdown }, trusted);
    await expect(ipc.call(IPC_CHANNELS.examLockdown, APP, "yes")).rejects.toThrow();
    await expect(ipc.call(IPC_CHANNELS.examLockdown, APP)).rejects.toThrow();
    await expect(ipc.call(IPC_CHANNELS.examLockdown, APP, true, "extra")).rejects.toThrow();
    await expect(ipc.call(IPC_CHANNELS.appInfo, APP, 1)).rejects.toThrow();
    await expect(ipc.call(IPC_CHANNELS.checksWatch, APP, 1)).rejects.toThrow();
    await expect(
      ipc.call(IPC_CHANNELS.lockSend, APP, { type: "lock.release", reason: "bored" }),
    ).rejects.toThrow();
    await expect(
      ipc.call(IPC_CHANNELS.lockSend, APP, { type: "pair.code", code: "12345" }),
    ).rejects.toThrow();
    await expect(ipc.call(IPC_CHANNELS.lockSend, APP, "lock.start")).rejects.toThrow();
    expect(lockdown).not.toHaveBeenCalled();
  });

  it("refuses results that fail the schema", async () => {
    const ipc = fakeIpc();
    registerIpcHandlers(ipc, handlers, trusted);
    await expect(ipc.call(IPC_CHANNELS.lockStatus, APP)).rejects.toThrow();
    await expect(ipc.call(IPC_CHANNELS.checksWatch, APP, true)).rejects.toThrow();
  });
});

describe("sendToRenderer", () => {
  it("checks event payloads before sending", () => {
    const send = vi.fn();
    sendToRenderer({ send }, IPC_CHANNELS.examBlur);
    expect(send).toHaveBeenCalledWith(IPC_CHANNELS.examBlur);
    const telegram = { id: "telegram", name: "Telegram", kind: "app" } as const;
    sendToRenderer({ send }, IPC_CHANNELS.checksBlockedApps, [telegram]);
    expect(send).toHaveBeenLastCalledWith(IPC_CHANNELS.checksBlockedApps, [telegram]);
    sendToRenderer({ send }, IPC_CHANNELS.lockPairCode, null);
    expect(send).toHaveBeenLastCalledWith(IPC_CHANNELS.lockPairCode, null);
    expect(() => sendToRenderer({ send }, IPC_CHANNELS.lockMessage, { type: "nonsense" } as never)).toThrow();
    expect(() => sendToRenderer({ send }, IPC_CHANNELS.checksBlockedApps, [])).toThrow();
    expect(send).toHaveBeenCalledTimes(3);
  });
});

function deps() {
  return {
    info: { version: "0.1.0", os: "windows" as const, arch: "x64" },
    quit: vi.fn(),
    examActive: vi.fn<() => boolean>(() => false),
    scan: vi.fn(async () => ({ apps: [], screenShare: [], freeMb: 4096 })),
    cameraAccess: vi.fn(async () => true),
    watcher: { start: vi.fn(), stop: vi.fn() },
    lockdown: { set: vi.fn() },
    trayMode: { set: vi.fn(async () => {}), setExamState: vi.fn() },
    lock: { status: vi.fn(() => "paired" as const), send: vi.fn() },
    savePdf: vi.fn(async () => "/Users/aliya/Documents/UKI-204-0942-AS.pdf"),
    openExternal: vi.fn(async () => {}),
  } satisfies HandlerDeps;
}

describe("createIpcHandlers", () => {
  it("refuses app.quit while the exam holds the app, and quits after", async () => {
    const d = deps();
    const h = createIpcHandlers(d);
    d.examActive.mockReturnValue(true);
    expect(() => h[IPC_CHANNELS.appQuit]()).toThrow(/refused/);
    expect(d.quit).not.toHaveBeenCalled();
    d.examActive.mockReturnValue(false);
    h[IPC_CHANNELS.appQuit]();
    expect(d.quit).toHaveBeenCalledOnce();
  });

  it("maps lockdown, the tray, the watch and the camera to their modules", async () => {
    const d = deps();
    const h = createIpcHandlers(d);
    h[IPC_CHANNELS.examLockdown](true);
    h[IPC_CHANNELS.examLockdown](false);
    expect(d.lockdown.set.mock.calls).toEqual([[true], [false]]);
    await h[IPC_CHANNELS.examHideToTray](true);
    expect(d.trayMode.set).toHaveBeenCalledWith(true);
    h[IPC_CHANNELS.checksWatch](true);
    h[IPC_CHANNELS.checksWatch](false);
    expect(d.watcher.start).toHaveBeenCalledOnce();
    expect(d.watcher.stop).toHaveBeenCalledOnce();
    await expect(h[IPC_CHANNELS.checksCameraAccess]()).resolves.toBe(true);
    await expect(h[IPC_CHANNELS.receiptSavePdf]()).resolves.toMatch(/\.pdf$/);
    expect(h[IPC_CHANNELS.appInfo]()).toEqual({ version: "0.1.0", os: "windows", arch: "x64" });
  });

  it("opens the camera privacy page of the OS", async () => {
    const d = deps();
    await createIpcHandlers(d)[IPC_CHANNELS.systemOpenCameraSettings]();
    expect(d.openExternal).toHaveBeenCalledWith("ms-settings:privacy-webcam");
  });

  it("relays Lock messages and feeds exam.state to the tray", () => {
    const d = deps();
    const h = createIpcHandlers(d);
    const state: AppToLock = {
      type: "exam.state",
      phase: "writing",
      watch: "phone_found",
      locale: "ru",
      exam: null,
    };
    h[IPC_CHANNELS.lockSend](state);
    expect(d.trayMode.setExamState).toHaveBeenCalledWith({ watch: "phone_found", locale: "ru" });
    expect(d.lock.send).toHaveBeenCalledWith(state);
    h[IPC_CHANNELS.lockSend]({ type: "lock.start" });
    expect(d.trayMode.setExamState).toHaveBeenCalledOnce();
    expect(h[IPC_CHANNELS.lockStatus]()).toBe("paired");
  });
});

describe("platform helpers", () => {
  it("maps platforms and camera settings", () => {
    expect(desktopOs("darwin")).toBe("macos");
    expect(desktopOs("win32")).toBe("windows");
    expect(() => desktopOs("linux")).toThrow();
    expect(cameraSettingsUrl("macos")).toBe(
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Camera",
    );
    expect(cameraSettingsUrl("windows")).toBe("ms-settings:privacy-webcam");
  });
});
