import { describe, expect, it } from "vitest";
import {
  DEMO_FIRST_NUMBER,
  DEMO_LIVE_CODE,
  DemoLivePurgeInput,
  DemoLiveSeenOutput,
  DemoLiveStatus,
  demoStudentNumbers,
  ExamCode,
  SessionHeartbeatOutput,
  STAFF_ROLES,
  StudentNumber,
} from "./index.ts";

describe("judge mode contracts", () => {
  it("DEMO-LIVE is a valid exam code", () => {
    expect(ExamCode.parse(DEMO_LIVE_CODE)).toBe("DEMO-LIVE");
  });

  it("the roster is 20249001 to 20249030, eight digits each", () => {
    const numbers = demoStudentNumbers();
    expect(numbers).toHaveLength(30);
    expect(numbers[0]).toBe(String(DEMO_FIRST_NUMBER));
    expect(numbers.at(-1)).toBe("20249030");
    for (const number of numbers) expect(StudentNumber.parse(number)).toBe(number);
    expect(demoStudentNumbers(24)).toHaveLength(24);
    expect(demoStudentNumbers(99)).toHaveLength(30);
    expect(demoStudentNumbers(-1)).toEqual([]);
  });

  it("observer is a staff role", () => {
    expect(STAFF_ROLES).toContain("observer");
  });

  it("parses what the RPCs return, with Postgres timestamps", () => {
    const at = "2026-10-12T09:00:00.123456+00:00";
    expect(
      SessionHeartbeatOutput.parse({ state: "writing", last_seen_at: at, ends_at: at, server_time: at })
        .state,
    ).toBe("writing");
    expect(
      DemoLiveStatus.parse({
        exam: { id: "0192a6e0-0000-7000-8000-000000000001", status: "live", starts_at: at, ends_at: at },
        viewers: 2,
        server_time: at,
      }).viewers,
    ).toBe(2);
    expect(DemoLiveStatus.parse({ exam: null, viewers: 0, server_time: at }).exam).toBeNull();
    expect(DemoLiveSeenOutput.parse({ starts_at: at, duration_min: 720, status: "live" }).duration_min).toBe(
      720,
    );
    expect(DemoLiveStatus.safeParse({ exam: null, viewers: -1, server_time: at }).success).toBe(false);
  });

  it("the purge takes an optional limit of 1 to 1000", () => {
    expect(DemoLivePurgeInput.parse({})).toEqual({});
    expect(DemoLivePurgeInput.safeParse({ limit: 0 }).success).toBe(false);
    expect(DemoLivePurgeInput.safeParse({ limit: 1001 }).success).toBe(false);
  });
});
