import { describe, expect, it } from "vitest";
import { IPC_CHANNELS, IPC_EVENTS, IPC_INVOKE, parseIpcArgs, parseIpcEvent, parseIpcResult } from "./ipc.ts";

describe("IPC channels", () => {
  it("gives every channel a schema, and names are unique", () => {
    const names = Object.values(IPC_CHANNELS);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      expect(name in IPC_INVOKE || name in IPC_EVENTS, name).toBe(true);
    }
  });

  it("checks invoke arguments", () => {
    expect(parseIpcArgs(IPC_CHANNELS.examLockdown, [true])).toEqual([true]);
    expect(() => parseIpcArgs(IPC_CHANNELS.examLockdown, ["yes"])).toThrow();
    expect(() => parseIpcArgs(IPC_CHANNELS.appInfo, [1])).toThrow();
    expect(parseIpcArgs(IPC_CHANNELS.lockSend, [{ type: "lock.release", reason: "time_up" }])).toEqual([
      { type: "lock.release", reason: "time_up" },
    ]);
    expect(() => parseIpcArgs(IPC_CHANNELS.lockSend, [{ type: "lock.event" }])).toThrow();
  });

  it("checks results", () => {
    expect(parseIpcResult(IPC_CHANNELS.appInfo, { version: "0.1.0", os: "macos", arch: "arm64" })).toEqual({
      version: "0.1.0",
      os: "macos",
      arch: "arm64",
    });
    expect(
      parseIpcResult(IPC_CHANNELS.checksScan, {
        apps: [{ id: "telegram", name: "Telegram", kind: "app" }],
        screenShare: [],
        freeMb: 20480,
      }).apps,
    ).toHaveLength(1);
    expect(parseIpcResult(IPC_CHANNELS.lockStatus, "paired")).toBe("paired");
    expect(() => parseIpcResult(IPC_CHANNELS.lockStatus, "lost")).toThrow();
    expect(parseIpcResult(IPC_CHANNELS.receiptSavePdf, null)).toBeNull();
    expect(parseIpcResult(IPC_CHANNELS.examLockdown, undefined)).toBeUndefined();
  });

  it("checks main-to-renderer events", () => {
    expect(parseIpcEvent(IPC_CHANNELS.examBlur, [])).toEqual([]);
    expect(parseIpcEvent(IPC_CHANNELS.lockMessage, [{ type: "pair.request" }])).toEqual([
      { type: "pair.request" },
    ]);
    expect(() => parseIpcEvent(IPC_CHANNELS.lockMessage, [{ type: "pair.code" }])).toThrow();
  });
});
