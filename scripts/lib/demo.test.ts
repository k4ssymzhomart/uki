import { describe, expect, it } from "vitest";
import { DEMO_EXAMS, demoSchedule, physicsLmsUrl } from "./demo.ts";

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
