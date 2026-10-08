import { describe, expect, it } from "vitest";
import { agoParts, isDemoLive, rolledOver, simulatorStatus } from "./judge-model.ts";

const NOW = Date.parse("2026-10-12T09:00:00Z");
const ago = (s: number) => new Date(NOW - s * 1000).toISOString();

describe("simulator indicator", () => {
  it("is live while some session was seen in the last 60 s, from the newest one", () => {
    expect(simulatorStatus([ago(300), ago(4), null, ago(90)], NOW)).toEqual({ live: true, agoMs: 4000 });
    expect(simulatorStatus([ago(60)], NOW)).toEqual({ live: true, agoMs: 60_000 });
    expect(simulatorStatus([ago(61)], NOW)).toEqual({ live: false, agoMs: 61_000 });
  });

  it("is stopped and never seen without any last_seen_at", () => {
    expect(simulatorStatus([], NOW)).toEqual({ live: false, agoMs: null });
    expect(simulatorStatus([null, null], NOW)).toEqual({ live: false, agoMs: null });
  });

  it("never shows a negative age when a clock runs ahead", () => {
    expect(simulatorStatus([new Date(NOW + 2000).toISOString()], NOW)).toEqual({ live: true, agoMs: 0 });
  });

  it("reads Postgres timestamps", () => {
    expect(simulatorStatus(["2026-10-12T08:59:58.123456+00:00"], NOW).live).toBe(true);
  });

  it("says seconds, minutes or hours", () => {
    expect(agoParts(4_900)).toEqual({ unit: "seconds", count: 4 });
    expect(agoParts(59_999)).toEqual({ unit: "seconds", count: 59 });
    expect(agoParts(180_000)).toEqual({ unit: "minutes", count: 3 });
    expect(agoParts(2 * 3_600_000 + 5)).toEqual({ unit: "hours", count: 2 });
  });

  it("shows only on DEMO-LIVE", () => {
    expect(isDemoLive("DEMO-LIVE")).toBe(true);
    expect(isDemoLive("demo-live")).toBe(true);
    expect(isDemoLive("MATH2-204-FRI")).toBe(false);
    expect(isDemoLive(null)).toBe(false);
  });

  it("notices a rollover from starts_at", () => {
    expect(rolledOver("2026-10-12T09:00:00Z", "2026-10-12T09:00:00.000000+00:00")).toBe(false);
    expect(rolledOver("2026-10-12T09:00:00Z", "2026-10-12T20:30:00+00:00")).toBe(true);
  });
});
