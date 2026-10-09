// @vitest-environment node
import { EventEmitter } from "node:events";
import { IPC_CHANNELS, IPC_EVENTS, IPC_INVOKE, type UkiBridge } from "@uki/contracts";
import { describe, expect, it, vi } from "vitest";

const exposed: Record<string, unknown> = {};
const renderer = Object.assign(new EventEmitter(), {
  invoke: vi.fn(async (..._args: unknown[]) => "ok"),
});

vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld: (key: string, value: unknown) => (exposed[key] = value) },
  ipcRenderer: renderer,
}));

await import("./index.ts");
const uki = exposed.uki as UkiBridge;

describe("preload bridge", () => {
  it("exposes exactly one object, window.uki", () => {
    expect(Object.keys(exposed)).toEqual(["uki"]);
  });

  it("maps every method to its invoke channel", async () => {
    const calls: Array<[string, ...unknown[]]> = [
      [IPC_CHANNELS.appInfo],
      [IPC_CHANNELS.appQuit],
      [IPC_CHANNELS.checksScan],
      [IPC_CHANNELS.checksScan, { browsers: true }],
      [IPC_CHANNELS.checksCameraAccess],
      [IPC_CHANNELS.checksWatch, true],
      [IPC_CHANNELS.checksWatch, true, { browsers: false }],
      [IPC_CHANNELS.examLockdown, true],
      [IPC_CHANNELS.examHideToTray, false],
      [IPC_CHANNELS.lockStatus],
      [IPC_CHANNELS.lockSend, { type: "lock.start" }],
      [IPC_CHANNELS.receiptSavePdf],
      [IPC_CHANNELS.systemOpenCameraSettings],
    ];
    await uki.app.info();
    await uki.app.quit();
    await uki.checks.scan();
    await uki.checks.scan({ browsers: true });
    await uki.checks.cameraAccess();
    await uki.checks.watch(true);
    await uki.checks.watch(true, { browsers: false });
    await uki.exam.lockdown(true);
    await uki.exam.hideToTray(false);
    await uki.lock.status();
    await uki.lock.send({ type: "lock.start" });
    await uki.receipt.savePdf();
    await uki.system.openCameraSettings();
    expect(renderer.invoke.mock.calls).toEqual(calls);
    expect(new Set(calls.map(([channel]) => channel))).toEqual(new Set(Object.keys(IPC_INVOKE)));
  });

  it("subscribes to every event channel, drops payloads that fail the schema, and unsubscribes", () => {
    const blur = vi.fn();
    const apps = vi.fn();
    const status = vi.fn();
    const code = vi.fn();
    const message = vi.fn();
    const offs = [
      uki.exam.onBlur(blur),
      uki.checks.onBlockedApps(apps),
      uki.lock.onStatus(status),
      uki.lock.onPairCode(code),
      uki.lock.onMessage(message),
    ];
    expect(renderer.eventNames().sort()).toEqual(Object.keys(IPC_EVENTS).sort());

    const telegram = { id: "telegram", name: "Telegram", kind: "app" };
    renderer.emit(IPC_CHANNELS.examBlur, {});
    renderer.emit(IPC_CHANNELS.checksBlockedApps, {}, [telegram]);
    renderer.emit(IPC_CHANNELS.checksBlockedApps, {}, [{ id: "telegram" }]);
    renderer.emit(IPC_CHANNELS.lockStatusChanged, {}, "paired");
    renderer.emit(IPC_CHANNELS.lockStatusChanged, {}, "hacked");
    renderer.emit(IPC_CHANNELS.lockPairCode, {}, { code: "042917", expires_at: "2026-10-07T10:02:00.000Z" });
    renderer.emit(IPC_CHANNELS.lockPairCode, {}, { code: "abc" });
    renderer.emit(IPC_CHANNELS.lockMessage, {}, { type: "lock.started", tabs_closed: 3 });
    renderer.emit(IPC_CHANNELS.lockMessage, {}, { type: "lock.started", tabs_closed: -1 });

    expect(blur).toHaveBeenCalledOnce();
    expect(apps).toHaveBeenCalledExactlyOnceWith([telegram]);
    expect(status).toHaveBeenCalledExactlyOnceWith("paired");
    expect(code).toHaveBeenCalledOnce();
    expect(message).toHaveBeenCalledExactlyOnceWith({ type: "lock.started", tabs_closed: 3 });

    for (const off of offs) off();
    expect(renderer.eventNames()).toEqual([]);
  });
});
