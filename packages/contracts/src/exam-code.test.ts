import { describe, expect, it } from "vitest";
import {
  buildExamCode,
  EXAM_CODE_LATIN,
  examCodeCandidates,
  examCodeCourse,
  examCodeDay,
  examCodeGroup,
  examCodeLatin,
  pickExamCode,
} from "./exam-code.ts";

// The same cases are in supabase/tests/10_wizard.test.sql against public.exam_code_base, so the
// browser's preview and schedule_exam agree.
const FRIDAY_MORNING_ALMATY = "2026-10-09T05:00:00Z";

describe("buildExamCode", () => {
  it("makes the code 1.1a teaches: course, group, weekday", () => {
    expect(
      buildExamCode({
        course: "Mathematics 2",
        groups: ["204"],
        startsAt: FRIDAY_MORNING_ALMATY,
        timeZone: "Asia/Almaty",
      }),
    ).toBe("MATH2-204-FRI");
  });

  it("matches the database on the shared cases", () => {
    const cases: [string, string[], string, string, string][] = [
      ["Mathematics 2", ["204"], FRIDAY_MORNING_ALMATY, "Asia/Almaty", "MATH2-204-FRI"],
      ["Математика 2", ["204"], FRIDAY_MORNING_ALMATY, "Asia/Almaty", "MATE2-204-FRI"],
      ["Қазақ тілі 1", [], "2026-10-12T05:00:00Z", "Asia/Almaty", "QAZA1-MON"],
      ["English B2", ["301"], "2026-10-04T20:00:00Z", "Asia/Almaty", "ENGLB2-301-MON"],
      ["  ", ["1-02"], FRIDAY_MORNING_ALMATY, "Asia/Almaty", "EXAM-102-FRI"],
      ["Physics1 lab", ["ab"], FRIDAY_MORNING_ALMATY, "UTC", "PHYS1-AB-FRI"],
    ];
    for (const [course, groups, startsAt, timeZone, code] of cases) {
      expect(buildExamCode({ course, groups, startsAt, timeZone }), course).toBe(code);
    }
  });

  it("names the exam after the first group code in sort order", () => {
    expect(
      buildExamCode({
        course: "Physics 1",
        groups: ["103", "101", "102"],
        startsAt: FRIDAY_MORNING_ALMATY,
        timeZone: "Asia/Almaty",
      }),
    ).toBe("PHYS1-101-FRI");
  });

  it("reads the weekday in the workspace's time zone, not UTC", () => {
    // 20:00 UTC on Thursday is 01:00 on Friday in Almaty.
    expect(examCodeDay("2026-10-08T20:00:00Z", "Asia/Almaty")).toBe("FRI");
    expect(examCodeDay("2026-10-08T20:00:00Z", "UTC")).toBe("THU");
  });
});

describe("parts", () => {
  it("cuts the course to four letters plus its numbers, at most 10 characters", () => {
    expect(examCodeCourse("History of Kazakhstan")).toBe("HIST");
    expect(examCodeCourse("Linear Algebra")).toBe("LINE");
    expect(examCodeCourse("Programming 101 Part 2")).toBe("PROG1012");
    expect(examCodeCourse("Statistics 2026 2027 B")).toBe("STAT202620");
    expect(examCodeCourse("101")).toBe("101");
    expect(examCodeCourse("")).toBe("EXAM");
  });

  it("transliterates Kazakh and Russian letters and drops other symbols", () => {
    expect(examCodeLatin("Шығыс")).toBe("SHYGYS");
    expect(examCodeLatin("Өнер · Ünü")).toBe("ONER · UNU");
    expect(examCodeGroup("ИС-21")).toBe("IS21");
    expect(examCodeGroup("a very long group code")).toBe("AVERYLON");
    expect(examCodeGroup(undefined)).toBe("");
    for (const value of Object.values(EXAM_CODE_LATIN)) expect(value).toMatch(/^[A-Z]*$/);
  });
});

describe("clashes", () => {
  it("adds 2, 3, ... up to 99 to the base", () => {
    const candidates = examCodeCandidates("MATH2-204-FRI");
    expect(candidates.slice(0, 3)).toEqual(["MATH2-204-FRI", "MATH2-204-FRI2", "MATH2-204-FRI3"]);
    expect(candidates).toHaveLength(99);
    expect(candidates.at(-1)).toBe("MATH2-204-FRI99");
  });

  it("picks the first free code, ignoring case", () => {
    expect(pickExamCode("MATH2-204-FRI", [])).toBe("MATH2-204-FRI");
    expect(pickExamCode("MATH2-204-FRI", ["math2-204-fri", "MATH2-204-FRI2"])).toBe("MATH2-204-FRI3");
    expect(pickExamCode("X", examCodeCandidates("X"))).toBeNull();
  });
});
