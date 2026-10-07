// What the renderer takes from Üki Lock's events: exam.submitted only for the browser exam the Lock holds,
// once per id; nothing the Lock filed under another exam; a release on the Lock's own clock is flagged.
// And exam.state carries the app's clock offset so the Lock reads server time.
import { type AppToLock, type LockExam, type LockToApp, uuidv7 } from "@uki/contracts";
import { afterEach, describe, expect, it } from "vitest";
import { FakeBridge } from "../test/fakes.ts";
import { LockLink } from "./lock-link.ts";

const exam: LockExam = {
  session_id: "0192f3a0-0000-7000-8000-00000000000b",
  mode: "browser",
  title: "Physics 1 · Quiz 3",
  starts_at: "2026-10-07T12:00:00.000Z",
  ends_at: "2026-10-07T12:40:00.000Z",
  allowed_hosts: ["localhost:5180"],
  lms_url: "http://localhost:5180/physics-1/quiz-3",
  done_path: "/physics-1/quiz-3/review",
};
const OTHER_SESSION = "0192f3a0-0000-7000-8000-00000000000a";

function state(over: Partial<LockExam> = {}): Extract<AppToLock, { type: "exam.state" }> {
  return {
    type: "exam.state",
    phase: "writing",
    watch: "watching",
    locale: "kk",
    exam: { ...exam, ...over },
  };
}

function submitted(sessionId?: string, at = "2026-10-07T12:20:00.000Z"): LockToApp {
  return {
    type: "lock.event",
    ...(sessionId ? { session_id: sessionId } : {}),
    event: { id: uuidv7(), at, type: "exam.submitted", data: {} },
  };
}

const links: LockLink[] = [];
afterEach(() => {
  for (const link of links.splice(0)) link.stop();
});

function setup(offsetMs?: number) {
  const bridge = new FakeBridge();
  const seen = { submitted: 0, events: [] as string[], disconnects: 0 };
  const link = new LockLink({
    bridge,
    onStarted: () => {},
    onSubmitted: () => {
      seen.submitted += 1;
    },
    onEvent: (event) => seen.events.push(event.type),
    onDisconnected: () => {
      seen.disconnects += 1;
    },
    ...(offsetMs === undefined ? {} : { clockOffsetMs: () => offsetMs }),
  });
  links.push(link);
  link.start();
  return { bridge, link, seen };
}

describe("LockLink and the Lock's events", () => {
  it("submits only a browser exam the Lock holds, once per event, and never for another exam", () => {
    const { bridge, link, seen } = setup();
    link.update(state());
    // Exam A's exam.submitted, resent after a reconnect before this exam's lock started.
    bridge.fromLock(submitted(OTHER_SESSION, "2026-10-07T09:10:00.000Z"));
    bridge.fromLock(submitted());
    expect(seen.submitted).toBe(0);

    bridge.fromLock({ type: "lock.started", tabs_closed: 2 });
    bridge.fromLock(submitted(OTHER_SESSION, "2026-10-07T09:10:00.000Z"));
    expect(seen.submitted).toBe(0);
    const done = submitted(exam.session_id);
    bridge.fromLock(done);
    bridge.fromLock(done);
    expect(seen.submitted).toBe(1);
  });

  it("never submits an exam in the app on the Lock's exam.submitted", () => {
    const { bridge, link, seen } = setup();
    link.update(state({ mode: "app", allowed_hosts: [], lms_url: null, done_path: null }));
    bridge.fromLock({ type: "lock.started", tabs_closed: 3 });
    bridge.fromLock(submitted());
    bridge.fromLock(submitted(exam.session_id));
    expect(seen.submitted).toBe(0);
  });

  it("drops events the Lock filed under another exam and keeps this exam's", () => {
    const { bridge, link, seen } = setup();
    link.update(state());
    const blocked = (session_id?: string): LockToApp => ({
      type: "lock.event",
      ...(session_id ? { session_id } : {}),
      event: { id: uuidv7(), at: "2026-10-07T12:05:00.000Z", type: "tab.blocked", data: { host: null } },
    });
    bridge.fromLock(blocked(OTHER_SESSION));
    bridge.fromLock(blocked(exam.session_id));
    bridge.fromLock(blocked());
    expect(seen.events).toEqual(["tab.blocked", "tab.blocked"]);
  });

  it("flags a release on the Lock's own clock while the exam still holds it, and no other release", () => {
    const { bridge, link, seen } = setup();
    link.update(state());
    bridge.fromLock({ type: "lock.started", tabs_closed: 1 });
    bridge.fromLock({ type: "lock.released", tabs_restored: 1, trigger: "deadline" });
    expect(seen.disconnects).toBe(1);
    expect(link.isLocked).toBe(false);
    bridge.fromLock({ type: "lock.released", tabs_restored: 1, trigger: "deadline" });
    expect(seen.disconnects).toBe(1);

    bridge.fromLock({ type: "lock.started", tabs_closed: 0 });
    bridge.fromLock({ type: "lock.released", tabs_restored: 0, trigger: "done_path" });
    expect(seen.disconnects).toBe(1);
  });

  it("sends exam.state with the app's clock offset", () => {
    const { bridge, link } = setup(-2_400_000);
    link.update(state());
    expect(bridge.lockSent.at(-1)).toEqual({ ...state(), clock_offset_ms: -2_400_000 });
    const plain = setup();
    plain.link.update(state());
    expect(plain.bridge.lockSent.at(-1)).toEqual(state());
  });
});
