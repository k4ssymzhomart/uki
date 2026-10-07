import { describe, expect, it } from "vitest";
import { groupPairCode, sameAlmatyDay } from "./pairing.ts";

describe("groupPairCode", () => {
  it("shows six digits in two groups, as E.3 draws them", () => {
    expect(groupPairCode("482913")).toBe("482 913");
    expect(groupPairCode("48291")).toBe("48291");
  });
});

describe("sameAlmatyDay", () => {
  it("compares calendar days in Asia/Almaty (UTC+5)", () => {
    const morning = Date.parse("2026-10-09T03:00:00+05:00");
    const evening = Date.parse("2026-10-09T23:30:00+05:00");
    const next = Date.parse("2026-10-10T00:10:00+05:00");
    expect(sameAlmatyDay(morning, evening)).toBe(true);
    expect(sameAlmatyDay(evening, next)).toBe(false);
    // 20:00 UTC is already the next day in Almaty.
    expect(sameAlmatyDay(Date.parse("2026-10-09T20:00:00Z"), next)).toBe(true);
  });
});
