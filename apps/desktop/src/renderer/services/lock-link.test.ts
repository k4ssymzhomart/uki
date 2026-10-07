import type { AppToLock } from "@uki/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeBridge } from "../test/fakes.ts";
import { LockLink } from "./lock-link.ts";

const HELLO = {
  type: "hello",
  lock_version: "1.0.0",
  browser: "Chrome",
  install_id: "0199a000-0000-7000-8000-0000000000f1",
} as const;

const STATE: Extract<AppToLock, { type: "exam.state" }> = {
  type: "exam.state",
  phase: "writing",
  watch: "watching",
  locale: "kk",
  exam: null,
};

let bridge: FakeBridge;
let link: LockLink;
let started: number[];

function sent(type: AppToLock["type"]): number {
  return bridge.lockSent.filter((message) => message.type === type).length;
}

beforeEach(() => {
  vi.useFakeTimers();
  bridge = new FakeBridge();
  started = [];
  link = new LockLink({
    bridge,
    onStarted: (tabs) => started.push(tabs),
    onSubmitted: () => {},
    onEvent: () => {},
    onDisconnected: () => {},
  });
  link.start();
  link.update(STATE);
});

afterEach(() => {
  link.stop();
  vi.useRealTimers();
});

describe("lock.start in app exams", () => {
  it("is sent again to every paired Lock that connects until lock.started comes back", () => {
    // 2.1 opens with no paired Lock connected: the relay drops lock.start.
    bridge.setLockStatus("absent");
    link.lockStart();
    expect(sent("lock.start")).toBe(1);
    // A Lock that connects but is not paired cannot lock.
    bridge.setLockStatus("connected");
    expect(sent("lock.start")).toBe(1);
    // Chrome comes back with the paired Lock: it learns the exam, then locks.
    bridge.setLockStatus("paired");
    bridge.fromLock(HELLO);
    expect(sent("lock.start")).toBe(3);
    expect(bridge.lockSent.at(-2)).toMatchObject({ type: "exam.state" });
    expect(bridge.lockSent.at(-1)).toEqual({ type: "lock.start" });
    bridge.fromLock({ type: "lock.started", tabs_closed: 2 });
    expect(started).toEqual([2]);
    expect(link.isLocked).toBe(true);
    // Locked: a later reconnect only learns the exam.
    bridge.setLockStatus("absent");
    bridge.setLockStatus("paired");
    bridge.fromLock(HELLO);
    vi.advanceTimersByTime(10_000);
    expect(sent("lock.start")).toBe(3);
  });

  it("is not sent again once the exam released the Lock", () => {
    link.lockStart();
    link.release("submitted");
    bridge.fromLock(HELLO);
    bridge.setLockStatus("paired");
    expect(sent("lock.start")).toBe(1);
  });
});
