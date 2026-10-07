import { describe, expect, it } from "vitest";
import { pgTime, T0 } from "../test/fixtures.ts";
import { ClockOffset, clockSample, pauseCredit, remainingMs, sessionEndsAt, splitDuration } from "./timer.ts";

const S = 1000;
const MIN = 60 * S;

describe("sessionEndsAt", () => {
  it("is starts_at + duration_min + extra_min + paused_s", () => {
    const end = sessionEndsAt({ starts_at: pgTime(T0), duration_min: 90 }, { extra_min: 10, paused_s: 42 });
    expect(end.getTime()).toBe(T0 + 100 * MIN + 42 * S);
  });

  it("takes Date and millisecond inputs", () => {
    expect(
      sessionEndsAt({ starts_at: new Date(T0), duration_min: 40 }, { extra_min: 0, paused_s: 0 }).getTime(),
    ).toBe(T0 + 40 * MIN);
    expect(sessionEndsAt({ starts_at: T0, duration_min: 40 }, { extra_min: 5, paused_s: 0 }).getTime()).toBe(
      T0 + 45 * MIN,
    );
  });
});

describe("remainingMs", () => {
  it("counts down and never goes negative", () => {
    const end = T0 + 90 * MIN;
    expect(remainingMs(end, T0)).toBe(90 * MIN);
    expect(remainingMs(pgTime(end), end - 1500)).toBe(1500);
    expect(remainingMs(end, end + 5000)).toBe(0);
  });

  it("splits a duration for a clock face, rounding up", () => {
    expect(splitDuration(90 * MIN)).toEqual({ hours: 1, minutes: 30, seconds: 0 });
    expect(splitDuration(42_001)).toEqual({ hours: 0, minutes: 0, seconds: 43 });
    expect(splitDuration(-5)).toEqual({ hours: 0, minutes: 0, seconds: 0 });
  });
});

describe("ClockOffset", () => {
  it("is zero before any sample", () => {
    const clock = new ClockOffset();
    expect(clock.offsetMs).toBe(0);
    expect(clock.hasSample).toBe(false);
    expect(clock.now(T0)).toBe(T0);
  });

  it("takes the midpoint of the round trip", () => {
    // The laptop is 3 s behind: it sends at T0, the server reads its clock 100 ms later (T0 + 3.1 s),
    // the reply lands at T0 + 200 ms.
    expect(clockSample(pgTime(T0 + 3100), T0, T0 + 200)).toEqual({ offsetMs: 3000, rttMs: 200 });
  });

  it("trusts the sample with the shortest round trip", () => {
    const clock = new ClockOffset();
    clock.update(pgTime(T0 + 3100), T0, T0 + 200); // offset 3000, rtt 200
    clock.update(pgTime(T0 + 10_000 + 4500), T0 + 10_000, T0 + 11_800); // slow, noisy reply: offset 3600, rtt 1800
    clock.update(pgTime(T0 + 20_000 + 3020), T0 + 20_000, T0 + 20_040); // offset 3000, rtt 40
    expect(clock.offsetMs).toBe(3000);
    expect(clock.now(T0 + 30_000)).toBe(T0 + 33_000);
  });

  it("forgets samples outside its window", () => {
    const clock = new ClockOffset(2);
    clock.update(pgTime(T0 + 5), T0, T0 + 10); // offset 0, rtt 10
    clock.update(pgTime(T0 + 1000 + 2050), T0 + 1000, T0 + 1100); // offset 2000, rtt 100
    clock.update(pgTime(T0 + 2000 + 2050), T0 + 2000, T0 + 2100); // offset 2000, rtt 100
    expect(clock.offsetMs).toBe(2000);
  });

  it("ignores an unreadable server time", () => {
    const clock = new ClockOffset();
    clock.update("not a time", T0, T0 + 100);
    expect(clock.hasSample).toBe(false);
  });
});

describe("pauseCredit", () => {
  const base = {
    pauseAt: pgTime(T0),
    resumeAt: pgTime(T0 + 42 * S),
    pauseReceivedAt: pgTime(T0 + 300),
    resumeReceivedAt: pgTime(T0 + 42 * S + 250),
    kind: "self" as const,
    selfCreditSoFarS: 0,
  };

  it("gives back the pause from pause.at to resume.at", () => {
    expect(pauseCredit(base)).toBe(41); // 42 s by the laptop, 41.95 s by the server; partial seconds drop
  });

  it("caps the pause by the gap between received_at times", () => {
    // A forged resume claims a 20-minute pause, but both events reached the server 30 s apart.
    expect(
      pauseCredit({
        ...base,
        kind: "proctor",
        resumeAt: pgTime(T0 + 20 * MIN),
        resumeReceivedAt: pgTime(T0 + 300 + 30 * S),
      }),
    ).toBe(30);
  });

  it("gives back nothing for a resume before the pause", () => {
    expect(pauseCredit({ ...base, resumeAt: pgTime(T0 - 5 * S) })).toBe(0);
    expect(pauseCredit({ ...base, resumeReceivedAt: pgTime(T0) })).toBe(0);
  });

  it("caps self-pauses at 300 s per session in total", () => {
    const tenMinutes = {
      ...base,
      resumeAt: pgTime(T0 + 10 * MIN),
      resumeReceivedAt: pgTime(T0 + 10 * MIN + 300),
    };
    expect(pauseCredit(tenMinutes)).toBe(300);
    expect(pauseCredit({ ...tenMinutes, selfCreditSoFarS: 250 })).toBe(50);
    expect(pauseCredit({ ...tenMinutes, selfCreditSoFarS: 300 })).toBe(0);
    expect(pauseCredit({ ...tenMinutes, selfCreditSoFarS: 400 })).toBe(0);
  });

  it("gives back all of a proctor pause, whatever the self credit", () => {
    const tenMinutes = {
      ...base,
      kind: "proctor" as const,
      selfCreditSoFarS: 300,
      resumeAt: pgTime(T0 + 10 * MIN),
      resumeReceivedAt: pgTime(T0 + 10 * MIN + 300),
    };
    expect(pauseCredit(tenMinutes)).toBe(600);
  });
});
