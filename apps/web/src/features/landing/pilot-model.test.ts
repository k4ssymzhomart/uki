import { describe, expect, it } from "vitest";
import {
  checkPilotValues,
  demoDayCalendar,
  initialPilotState,
  monthDate,
  PILOT_LIMITS,
  type PilotValues,
  pilotMonths,
  pilotValues,
} from "./pilot-model.ts";

const VALID: PilotValues = {
  name: "Dana Akhmetova",
  email: "dana.akhmetova@kru.test",
  university: "KRU · Kostanay",
  role: "exam_office",
  students: "from100",
  when: "2026-11",
  message: "Midterms for the Faculty of Mathematics, 4 groups, mostly students’ own laptops.",
  demoDay: true,
};

describe("Book a pilot's When list", () => {
  it("starts with next month in Almaty and runs six months", () => {
    expect(pilotMonths(new Date("2026-10-08T10:00:00Z"))).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
      "2027-03",
      "2027-04",
    ]);
  });

  it("uses Almaty's month at a month boundary and rolls over the year", () => {
    // 31 Oct 20:00 UTC is already 1 November in Almaty (UTC+5).
    expect(pilotMonths(new Date("2026-10-31T20:00:00Z"), 2)).toEqual(["2026-12", "2027-01"]);
    expect(pilotMonths(new Date("2026-12-15T10:00:00Z"), 1)).toEqual(["2027-01"]);
  });

  it("formats a month from the middle of its first day, so no time zone moves it", () => {
    expect(monthDate("2026-11").toISOString()).toBe("2026-11-01T12:00:00.000Z");
  });

  it("starts the form on the frame's values: exam office, 100–300, next month, the invite ticked", () => {
    const state = initialPilotState(["2026-11"]);
    expect(state).toMatchObject({
      status: "editing",
      values: { role: "exam_office", students: "from100", when: "2026-11", demoDay: true },
    });
  });
});

describe("Book a pilot's checks", () => {
  it("accepts the frame's example and trims it", () => {
    const result = checkPilotValues({ ...VALID, name: "  Dana Akhmetova  " });
    expect(result).toEqual({ ok: true, request: { ...VALID, name: "Dana Akhmetova" } });
  });

  it("names the line to show under each wrong field", () => {
    const result = checkPilotValues({ ...VALID, name: " ", email: "dana@", university: "" });
    expect(result).toEqual({
      ok: false,
      errors: { name: "nameRequired", email: "emailInvalid", university: "universityRequired" },
    });
  });

  it("refuses a message over the limit, and a role or month that is not offered", () => {
    expect(checkPilotValues({ ...VALID, message: "x".repeat(PILOT_LIMITS.message + 1) })).toEqual({
      ok: false,
      errors: { message: "tooLong" },
    });
    expect(checkPilotValues({ ...VALID, role: "rector" }).ok).toBe(false);
    expect(checkPilotValues({ ...VALID, when: "2026-13" }).ok).toBe(false);
  });

  it("reads the form, with the checkbox ticked only when it posts on", () => {
    const form = new FormData();
    for (const [key, value] of Object.entries(VALID)) if (typeof value === "string") form.set(key, value);
    expect(pilotValues(form)).toEqual({ ...VALID, demoDay: false });
    form.set("demoDay", "on");
    expect(pilotValues(form).demoDay).toBe(true);
  });
});

describe("Add Demo Day to calendar", () => {
  it("is an all-day event on 16 October 2026 with escaped text", () => {
    const ics = demoDayCalendar({
      title: "Üki · Demo Day",
      place: "Qostanai Hub, Kostanay",
      stamp: new Date("2026-10-08T10:00:00.123Z"),
    });
    expect(ics).toContain("DTSTART;VALUE=DATE:20261016\r\n");
    expect(ics).toContain("DTEND;VALUE=DATE:20261017\r\n");
    expect(ics).toContain("DTSTAMP:20261008T100000Z\r\n");
    expect(ics).toContain("SUMMARY:Üki · Demo Day\r\n");
    expect(ics).toContain("LOCATION:Qostanai Hub\\, Kostanay\r\n");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
  });
});
