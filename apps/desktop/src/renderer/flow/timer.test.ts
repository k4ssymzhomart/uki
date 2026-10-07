import { describe, expect, it } from "vitest";
import {
  addTime,
  effectiveEndsAt,
  endPause,
  initialTimer,
  isTimeUp,
  remainingMs,
  startPause,
  syncTimer,
  totalMs,
} from "./timer.ts";

const START = Date.parse("2026-10-09T10:00:00.000Z");
const MIN = 60_000;

function timer() {
  return initialTimer({
    startsAt: START,
    durationMin: 90,
    extraMin: 0,
    pausedS: 0,
    serverTime: START - 5 * MIN,
  });
}

function reply(extraMin: number, pausedS: number) {
  return {
    state: "writing" as const,
    ends_at: new Date(START + (90 + extraMin) * MIN + pausedS * 1000).toISOString(),
    extra_min: extraMin,
    paused_s: pausedS,
  };
}

describe("timer", () => {
  it("counts down from starts_at + duration and stops at zero", () => {
    const t = timer();
    expect(remainingMs(t, START)).toBe(90 * MIN);
    expect(remainingMs(t, START + 47 * MIN + 43_000)).toBe(42 * MIN + 17_000);
    expect(remainingMs(t, START + 91 * MIN)).toBe(0);
    expect(isTimeUp(t, START + 90 * MIN)).toBe(true);
    expect(totalMs(t)).toBe(90 * MIN);
  });

  it("stands still while paused and keeps the self-pause credit until the server reports it", () => {
    let t = startPause(timer(), START + 10 * MIN, "self");
    expect(remainingMs(t, START + 11 * MIN)).toBe(80 * MIN);
    expect(isTimeUp(t, START + 200 * MIN)).toBe(false);
    t = endPause(t, START + 10 * MIN + 42_500);
    // 42 whole seconds come back, so the timer does not jump.
    expect(remainingMs(t, START + 10 * MIN + 42_500)).toBe(80 * MIN - 500);
    expect(effectiveEndsAt(t)).toBe(START + 90 * MIN + 42_000);
    // The server's reply carries the credit in paused_s: the estimate is dropped, nothing doubles.
    t = syncTimer(t, reply(0, 42), START + 11 * MIN);
    expect(t.pendingCredit).toBeNull();
    expect(effectiveEndsAt(t)).toBe(START + 90 * MIN + 42_000);
  });

  it("gives back at most 5 minutes of self-pauses but all of a proctor pause", () => {
    let t = startPause(timer(), START, "self");
    t = endPause(t, START + 4 * MIN);
    t = syncTimer(t, reply(0, 240), START + 4 * MIN + 1000);
    t = startPause(t, START + 20 * MIN, "self");
    t = endPause(t, START + 23 * MIN);
    expect(t.pendingCredit?.ms).toBe(60_000);
    t = syncTimer(t, reply(0, 300), START + 24 * MIN);
    t = startPause(t, START + 30 * MIN, "proctor");
    t = endPause(t, START + 40 * MIN);
    expect(t.pendingCredit?.ms).toBe(10 * MIN);
    t = syncTimer(t, reply(0, 900), START + 41 * MIN);
    expect(effectiveEndsAt(t)).toBe(START + 90 * MIN + 900_000);
  });

  it("adds proctor time at once and never twice", () => {
    let t = syncTimer(timer(), reply(0, 0), START + 30 * MIN);
    t = addTime(t, 10, START + 31 * MIN + 5000);
    expect(remainingMs(t, START + 31 * MIN + 5000)).toBe(69 * MIN - 5000);
    expect(totalMs(t)).toBe(100 * MIN);
    // The next reply already includes the 10 minutes.
    t = syncTimer(t, reply(10, 0), START + 31 * MIN + 7000);
    expect(effectiveEndsAt(t)).toBe(START + 100 * MIN);
    // A catch-up read of the same command after the reply must not add it again.
    t = addTime(t, 10, START + 31 * MIN + 5000);
    expect(effectiveEndsAt(t)).toBe(START + 100 * MIN);
  });

  it("moves the start earlier when the proctor starts the exam before the schedule", () => {
    const early = START - 4 * MIN;
    const t = syncTimer(
      timer(),
      { ...reply(0, 0), ends_at: new Date(early + 90 * MIN).toISOString() },
      START - 4 * MIN + 1000,
    );
    expect(t.startsAt).toBe(early);
    expect(remainingMs(t, early)).toBe(90 * MIN);
  });

  it("keeps running offline: no reply, the local clock goes on", () => {
    const t = syncTimer(timer(), reply(0, 0), START + 50 * MIN);
    expect(remainingMs(t, START + 52 * MIN)).toBe(38 * MIN);
  });
});
