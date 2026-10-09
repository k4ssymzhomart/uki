import { describe, expect, it } from "vitest";
import { DEMO_EXAMS, demoSchedule, physicsLmsUrl, withDefaultPhoneScore } from "./demo.ts";

describe("demoSchedule", () => {
  const now = Date.parse("2026-10-16T05:42:37.512Z");
  const schedule = demoSchedule(now);

  it("starts Mathematics 2 in 15 whole minutes with the lobby open 20 minutes before", () => {
    expect(schedule.math).toEqual({
      starts_at: "2026-10-16T05:57:00.000Z",
      lobby_opens_at: "2026-10-16T05:37:00.000Z",
      duration_min: 90,
      status: "scheduled",
    });
    expect(Date.parse(schedule.math.lobby_opens_at)).toBeLessThan(now);
  });

  it("has Physics 1 started 5 minutes ago and live", () => {
    expect(schedule.physics).toEqual({
      starts_at: "2026-10-16T05:37:00.000Z",
      lobby_opens_at: "2026-10-16T05:17:00.000Z",
      duration_min: 40,
      status: "live",
    });
  });

  it("uses the seed's exam codes", () => {
    expect(DEMO_EXAMS.math.code).toBe("MATH2-204-FRI");
    expect(DEMO_EXAMS.physics.code).toBe("PHYS1-102-FRI");
  });
});

describe("physicsLmsUrl", () => {
  it("appends the quiz path to a portal base URL, as seed.sql does", () => {
    expect(physicsLmsUrl("http://localhost:5180")).toBe("http://localhost:5180/physics-1/quiz-3");
    expect(physicsLmsUrl("https://uki-lms.vercel.app/")).toBe("https://uki-lms.vercel.app/physics-1/quiz-3");
    expect(physicsLmsUrl("https://x.app/physics-1/quiz-3")).toBe("https://x.app/physics-1/quiz-3");
  });
});

describe("withDefaultPhoneScore", () => {
  it("moves an exam seeded at 0.85 to the 0.55 default and keeps its other checks", () => {
    expect(
      withDefaultPhoneScore({ gaze_s: 3, phone_score: 0.85, face_missing_s: 10, identity: false, lock: true }),
    ).toEqual({ gaze_s: 3, phone_score: 0.55, face_missing_s: 10, identity: false, lock: true });
  });

  it("fills a partial or missing checks object with the defaults", () => {
    expect(withDefaultPhoneScore({ lock: false })).toEqual({
      gaze_s: 2,
      phone_score: 0.55,
      face_missing_s: 10,
      identity: true,
      lock: false,
    });
    expect(withDefaultPhoneScore(null).phone_score).toBe(0.55);
  });

  it("refuses checks the database would refuse", () => {
    expect(() => withDefaultPhoneScore({ gaze_s: 0 })).toThrow();
  });
});
