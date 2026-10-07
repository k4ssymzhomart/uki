import { THRESHOLDS } from "@uki/contracts";
import { describe, expect, it } from "vitest";
import { createPerfMonitor, DEGRADED_INPUT, FULL_INPUT } from "../src/perf.ts";
import { createStillSchedule } from "../src/still-schedule.ts";

function feed(monitor: ReturnType<typeof createPerfMonitor>, from: number, to: number, stepMs: number) {
  const samples = [];
  for (let at = from; at < to; at += stepMs) samples.push({ at, ...monitor.frame(at) });
  return samples;
}

describe("the fps meter and the fallback", () => {
  it("counts frames over the last second, unknown before a full second", () => {
    const monitor = createPerfMonitor();
    expect(monitor.frame(0).fps).toBeNull();
    const samples = feed(monitor, 67, 3000, 1000 / 15);
    expect(samples.at(-1)?.fps).toBeGreaterThanOrEqual(15);
    expect(samples.at(-1)?.fps).toBeLessThanOrEqual(16);
    expect(monitor.degraded).toBe(false);
    expect(monitor.input).toEqual(FULL_INPUT);
    expect(monitor.phoneIntervalMs).toBe(THRESHOLDS.phone.intervalMs);
  });

  it("15 fps never degrades; 8 fps degrades after 5 s, once, and stays", () => {
    const fast = createPerfMonitor();
    expect(feed(fast, 0, 60_000, 1000 / 15).some((s) => s.degraded)).toBe(false);

    const slow = createPerfMonitor();
    const samples = feed(slow, 0, 12_000, 125);
    const switched = samples.filter((s) => s.changed);
    expect(switched).toHaveLength(1);
    // fps is known from 1 s on and is 8 from then; 5 s later the fallback switches on.
    expect(switched[0]?.at).toBeGreaterThanOrEqual(1000 + THRESHOLDS.performance.lowFpsWindowMs);
    expect(switched[0]?.at).toBeLessThan(1000 + THRESHOLDS.performance.lowFpsWindowMs + 250);
    expect(slow.input).toEqual(DEGRADED_INPUT);
    expect(slow.phoneIntervalMs).toBe(THRESHOLDS.performance.lowFpsPhoneIntervalMs);
    feed(slow, 12_000, 20_000, 1000 / 30);
    expect(slow.degraded).toBe(true);
  });

  it("a slow spell shorter than 5 s does not degrade", () => {
    const monitor = createPerfMonitor();
    feed(monitor, 0, 5_000, 1000 / 15);
    feed(monitor, 5_000, 9_000, 200);
    feed(monitor, 9_000, 20_000, 1000 / 15);
    expect(monitor.degraded).toBe(false);
  });
});

describe("the still schedule", () => {
  it("hands out each still once its time has come, oldest first", () => {
    const schedule = createStillSchedule();
    schedule.request({ kind: "stills", eventId: "a", at: 1000, offsetsMs: [0, 1000, 2000] });
    schedule.request({ kind: "stills", eventId: "b", at: 1500, offsetsMs: [0, 1000, 2000] });
    expect(schedule.due(999)).toEqual([]);
    expect(schedule.due(1000).map((s) => [s.eventId, s.index])).toEqual([["a", 0]]);
    expect(schedule.due(2600).map((s) => [s.eventId, s.index])).toEqual([
      ["b", 0],
      ["a", 1],
      ["b", 1],
    ]);
    expect(schedule.pending).toBe(2);
    expect(schedule.cancel().map((s) => s.eventId)).toEqual(["a", "b"]);
    expect(schedule.due(10_000)).toEqual([]);
  });
});
