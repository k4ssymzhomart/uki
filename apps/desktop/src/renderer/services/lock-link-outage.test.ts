// LockLink's outage watch while the browser is locked: lock.app_disconnected { side: "lock" } after 15 s
// without the Lock that locked ("Link to the app" in What it enforces). An unpaired Lock in another
// browser taking the relay's one slot, or another install paired in its place, is an outage too.
import { LOCK_DISCONNECT_GRACE_MS, type LockToApp, uuidv7 } from "@uki/contracts";
import { afterEach, describe, expect, it } from "vitest";
import { FakeBridge } from "../test/fakes.ts";
import { LockLink } from "./lock-link.ts";

const CHROME = uuidv7();
const EDGE = uuidv7();
const S = 1000;

function hello(installId: string, browser = "chrome"): LockToApp {
  return { type: "hello", lock_version: "0.1.0", browser, install_id: installId };
}

const links: LockLink[] = [];

afterEach(() => {
  for (const link of links.splice(0)) link.stop();
});

/** A LockLink on a fake bridge and a manual clock; `advance` moves the clock and polls like the 2 s timer. */
function watchedLink() {
  let clock = Date.parse("2026-10-09T09:10:00Z");
  const bridge = new FakeBridge();
  const disconnects: number[] = [];
  const link = new LockLink({
    bridge,
    onStarted: () => {},
    onSubmitted: () => {},
    onEvent: () => {},
    onDisconnected: () => disconnects.push(clock),
    now: () => clock,
  });
  links.push(link);
  link.start();
  return {
    bridge,
    link,
    disconnects,
    advance: async (ms: number) => {
      clock += ms;
      await link.poll();
    },
  };
}

/** Chrome's paired Lock holds the browser. */
function lockedByChrome() {
  const watched = watchedLink();
  watched.bridge.setLockStatus("paired");
  watched.bridge.fromLock(hello(CHROME));
  watched.bridge.fromLock({ type: "lock.started", tabs_closed: 3 });
  expect(watched.link.isLocked).toBe(true);
  return watched;
}

describe("LockLink outage watch while locked", () => {
  it("reports lock.app_disconnected once after the link is down for 15 s", async () => {
    const { bridge, disconnects, advance } = lockedByChrome();
    bridge.setLockStatus("absent");
    await advance(LOCK_DISCONNECT_GRACE_MS - S);
    expect(disconnects).toHaveLength(0);
    await advance(S);
    await advance(30 * S);
    expect(disconnects).toHaveLength(1);
  });

  it("keeps quiet when the paired Lock comes back within 15 s", async () => {
    const { bridge, disconnects, advance } = lockedByChrome();
    bridge.setLockStatus("absent");
    await advance(10 * S);
    bridge.setLockStatus("connected");
    bridge.setLockStatus("paired");
    bridge.fromLock(hello(CHROME));
    await advance(60 * S);
    expect(disconnects).toHaveLength(0);
  });

  it("counts an unpaired Lock from another browser as down: it enforces nothing", async () => {
    const { bridge, disconnects, advance } = lockedByChrome();
    // Chrome quits; Edge's Lock, never paired, takes the relay's one slot within 2 s.
    bridge.setLockStatus("absent");
    await advance(2 * S);
    bridge.setLockStatus("connected");
    bridge.fromLock(hello(EDGE, "edge"));
    for (let i = 0; i < 30; i += 1) await advance(2 * S);
    expect(disconnects).toHaveLength(1);
  });

  it("counts another install as down even once it is paired: only the Lock that locked counts", async () => {
    const { bridge, disconnects, advance } = lockedByChrome();
    bridge.setLockStatus("absent");
    bridge.setLockStatus("connected");
    bridge.fromLock(hello(EDGE, "edge"));
    await advance(5 * S);
    // Edge pairs by a code the relay sent it (pair.ok brings no hello).
    bridge.setLockStatus("paired");
    for (let i = 0; i < 30; i += 1) await advance(2 * S);
    expect(disconnects).toHaveLength(1);
    // Chrome's Lock comes back: the link is up again, and a new outage is reported again.
    bridge.setLockStatus("absent");
    bridge.setLockStatus("connected");
    bridge.setLockStatus("paired");
    bridge.fromLock(hello(CHROME));
    await advance(2 * S);
    bridge.setLockStatus("absent");
    await advance(LOCK_DISCONNECT_GRACE_MS);
    expect(disconnects).toHaveLength(2);
  });

  it("after an app restart, with the locking install unknown, counts any paired Lock and no unpaired one", async () => {
    const { bridge, link, disconnects, advance } = watchedLink();
    link.markLocked();
    bridge.lockStatus = "paired";
    await advance(60 * S);
    expect(disconnects).toHaveLength(0);
    bridge.setLockStatus("connected");
    await advance(LOCK_DISCONNECT_GRACE_MS);
    expect(disconnects).toHaveLength(1);
  });

  it("stops watching once released", async () => {
    const { bridge, link, disconnects, advance } = lockedByChrome();
    link.release("submitted");
    bridge.setLockStatus("absent");
    await advance(60 * S);
    expect(disconnects).toHaveLength(0);
    expect(bridge.lockSent.at(-1)).toEqual({ type: "lock.release", reason: "submitted" });
  });
});
