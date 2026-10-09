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
    expect(parseIpcArgs(IPC_CHANNELS.checksWatch, [false])).toEqual([false]);
    expect(() => parseIpcArgs(IPC_CHANNELS.checksWatch, [])).toThrow();
    // C2: in-app exams ask for browsers too; without the option, none.
    expect(parseIpcArgs(IPC_CHANNELS.checksWatch, [true, { browsers: true }])).toEqual([
      true,
      { browsers: true },
    ]);
    expect(() => parseIpcArgs(IPC_CHANNELS.checksWatch, [true, { browsers: 1 }])).toThrow();
    expect(parseIpcArgs(IPC_CHANNELS.checksScan, [])).toEqual([]);
    expect(parseIpcArgs(IPC_CHANNELS.checksScan, [{ browsers: false }])).toEqual([{ browsers: false }]);
    expect(() => parseIpcArgs(IPC_CHANNELS.checksScan, [null])).toThrow();
    expect(() => parseIpcArgs(IPC_CHANNELS.checksScan, [{ browsers: true }, 1])).toThrow();
    expect(() => parseIpcArgs(IPC_CHANNELS.checksCameraAccess, ["camera"])).toThrow();
  });

  it("checks results", () => {
    expect(parseIpcResult(IPC_CHANNELS.appInfo, { version: "0.1.0", os: "macos", arch: "arm64" })).toEqual({
      version: "0.1.0",
      os: "macos",
      arch: "arm64",
    });
    expect(
      parseIpcResult(IPC_CHANNELS.checksScan, {
        apps: [
          { id: "telegram", name: "Telegram", kind: "app" },
          { id: "chrome", name: "Google Chrome", kind: "browser" },
        ],
        screenShare: [],
        freeMb: 20480,
      }).apps,
    ).toHaveLength(2);
    expect(parseIpcResult(IPC_CHANNELS.lockStatus, "paired")).toBe("paired");
    expect(() => parseIpcResult(IPC_CHANNELS.lockStatus, "lost")).toThrow();
    expect(parseIpcResult(IPC_CHANNELS.receiptSavePdf, null)).toBeNull();
    expect(parseIpcResult(IPC_CHANNELS.examLockdown, undefined)).toBeUndefined();
    expect(parseIpcResult(IPC_CHANNELS.checksCameraAccess, true)).toBe(true);
    expect(() => parseIpcResult(IPC_CHANNELS.checksCameraAccess, "granted")).toThrow();
  });

  it("checks main-to-renderer events", () => {
    expect(parseIpcEvent(IPC_CHANNELS.examBlur, [])).toEqual([]);
    expect(parseIpcEvent(IPC_CHANNELS.lockMessage, [{ type: "pair.request" }])).toEqual([
      { type: "pair.request" },
    ]);
    expect(() => parseIpcEvent(IPC_CHANNELS.lockMessage, [{ type: "pair.code" }])).toThrow();
    const telegram = { id: "telegram", name: "Telegram", kind: "app" };
    expect(parseIpcEvent(IPC_CHANNELS.checksBlockedApps, [[telegram]])).toEqual([[telegram]]);
    expect(() => parseIpcEvent(IPC_CHANNELS.checksBlockedApps, [[]])).toThrow();
    expect(parseIpcEvent(IPC_CHANNELS.lockStatusChanged, ["paired"])).toEqual(["paired"]);
    expect(() => parseIpcEvent(IPC_CHANNELS.lockStatusChanged, ["lost"])).toThrow();
    const code = { code: "042917", expires_at: "2026-10-07T10:02:00.000Z" };
    expect(parseIpcEvent(IPC_CHANNELS.lockPairCode, [code])).toEqual([code]);
    expect(parseIpcEvent(IPC_CHANNELS.lockPairCode, [null])).toEqual([null]);
    expect(() => parseIpcEvent(IPC_CHANNELS.lockPairCode, [{ ...code, code: "42917" }])).toThrow();
  });
});
