import { describe, expect, it } from "vitest";
import { elapsedShare, formatTimeLeft, timeLeftMs, wholeMinutes } from "./time-left.ts";

describe("time left", () => {
  it("prints minutes and seconds, and hours past an hour", () => {
    expect(formatTimeLeft(26 * 60_000 + 14_000)).toBe("26:14");
    expect(formatTimeLeft(59_500)).toBe("01:00");
    expect(formatTimeLeft(3_725_000)).toBe("1:02:05");
    expect(formatTimeLeft(-5)).toBe("00:00");
  });

  it("counts down to the end and never below zero", () => {
    const end = "2026-10-07T09:40:00Z";
    expect(timeLeftMs(end, Date.parse(end) - 1000)).toBe(1000);
    expect(timeLeftMs(end, Date.parse(end) + 1000)).toBe(0);
  });

  it("gives the used share and whole minutes", () => {
    expect(
      elapsedShare("2026-10-07T09:00:00Z", "2026-10-07T09:40:00Z", Date.parse("2026-10-07T09:22:00Z")),
    ).toBe(0.55);
    expect(elapsedShare("2026-10-07T09:00:00Z", "2026-10-07T09:40:00Z", 0)).toBe(0);
    expect(wholeMinutes(0, 38 * 60_000 + 20_000)).toBe(38);
  });
});
