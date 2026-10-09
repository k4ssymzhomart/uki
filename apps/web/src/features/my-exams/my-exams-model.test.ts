import { describe, expect, it } from "vitest";
import {
  applyConfirmation,
  assignmentState,
  bannerExam,
  canConfirm,
  confirmSeatsArgs,
  endsAtMs,
  listedExams,
  MyAssignmentRow,
  type MyExam,
  myExamStats,
  nextLabel,
  seatRange,
  thisWeekAndNext,
} from "./my-exams-model.ts";

// Thursday 8 October 2026, 12:00 in Almaty (07:00 UTC): 0.9's "Today 14:00" is Physics 1.
const NOW = Date.parse("2026-10-08T07:00:00Z");
const CHECKS = { gaze_s: 2, phone_score: 0.55, face_missing_s: 10, identity: true, lock: true };

function exam(
  n: number,
  title: string,
  startsAt: string,
  options: Partial<{
    status: string;
    seats: [number, number] | null;
    confirmed: boolean;
    request: string;
  }> = {},
  students = 0,
): MyExam {
  const row = MyAssignmentRow.parse({
    exam_id: `e0000000-0000-4000-8000-00000000000${n}`,
    seat_from: options.seats === null ? null : (options.seats?.[0] ?? 1),
    seat_to: options.seats === null ? null : (options.seats?.[1] ?? 10),
    languages: ["ru", "en"],
    is_lead: false,
    confirmed_at: options.confirmed ? "2026-10-07T10:00:00Z" : null,
    change_request: options.request ?? null,
    exam: {
      id: `e0000000-0000-4000-8000-00000000000${n}`,
      title,
      course: title.split(" · ")[0],
      status: options.status ?? "scheduled",
      starts_at: startsAt,
      duration_min: 90,
      lobby_opens_at: new Date(Date.parse(startsAt) - 20 * 60_000).toISOString(),
      checks: CHECKS,
      creator: { full_name: "Dana Akhmetova" },
    },
  });
  return { ...row, students };
}

// The three rows of 0.9: Physics 1 today 14:00 (confirmed), Mathematics 2 Fri 10:00 (to confirm),
// Linear Algebra Tue 13 Oct 09:00 (confirmed); plus a finished exam and a draft that 0.9 leaves out.
const physics = exam(
  2,
  "Physics 1 · Quiz 3",
  "2026-10-08T09:00:00Z",
  { seats: [30, 58], confirmed: true },
  29,
);
const math = exam(1, "Mathematics 2 · Midterm", "2026-10-09T05:00:00Z", { seats: [65, 128] }, 64);
const algebra = exam(
  4,
  "Linear Algebra · Final",
  "2026-10-13T04:00:00Z",
  { seats: [107, 159], confirmed: true },
  53,
);
const history = exam(3, "History of Kazakhstan · Test", "2026-10-07T06:00:00Z", { status: "to_review" }, 20);
const draft = exam(5, "English B2 · Reading", "2026-10-10T06:00:00Z", { status: "draft" }, 12);
const rows = [algebra, history, math, draft, physics];

describe("0.9 My exams", () => {
  it("lists live and scheduled exams, live first, then by start", () => {
    expect(listedExams(rows).map((row) => row.exam.title)).toEqual([
      "Physics 1 · Quiz 3",
      "Mathematics 2 · Midterm",
      "Linear Algebra · Final",
    ]);
    const live = exam(6, "Live one", "2026-10-08T10:00:00Z", { status: "live" });
    expect(listedExams([math, live])[0]?.exam.title).toBe("Live one");
  });

  it("gives each row its chip: confirmed, to confirm, change requested, live", () => {
    expect(assignmentState(physics)).toBe("confirmed");
    expect(assignmentState(math)).toBe("toConfirm");
    expect(assignmentState(exam(1, "M", "2026-10-09T05:00:00Z", { request: "1–64 please" }))).toBe(
      "changeRequested",
    );
    expect(assignmentState(exam(6, "L", "2026-10-08T06:00:00Z", { status: "live" }))).toBe("live");
    expect(canConfirm(math)).toBe(true);
    expect(canConfirm(exam(1, "M", "2026-10-09T05:00:00Z", { request: "x" }))).toBe(true);
    expect(canConfirm(physics)).toBe(false);
    expect(canConfirm(exam(6, "L", "2026-10-08T06:00:00Z", { status: "live" }))).toBe(false);
  });

  it("puts the soonest assignment to confirm on the banner, and none once every one is answered", () => {
    expect(bannerExam(rows)?.exam.title).toBe("Mathematics 2 · Midterm");
    expect(bannerExam([physics, algebra])).toBeNull();
    expect(bannerExam([exam(1, "M", "2026-10-09T05:00:00Z", { request: "x" })])).toBeNull();
  });

  it("fills the four stat cards as 0.9 draws them", () => {
    const stats = myExamStats(rows, NOW);
    expect(stats.next?.exam.title).toBe("Physics 1 · Quiz 3");
    expect(stats.assigned).toBe(3);
    expect(stats.students).toBe(146);
    expect(stats.toConfirm.count).toBe(1);
    expect(stats.toConfirm.first?.exam.course).toBe("Mathematics 2");
    // An exam the week after next is assigned but not "this week and next".
    const later = exam(7, "Later · Final", "2026-10-21T04:00:00Z", {}, 40);
    expect(myExamStats([later], NOW)).toMatchObject({ assigned: 0, students: 0 });
    expect(myExamStats([], NOW)).toEqual({
      next: null,
      assigned: 0,
      students: 0,
      toConfirm: { count: 0, first: null },
    });
  });

  it("covers this Monday-to-Sunday week and the next one in Almaty", () => {
    const days = thisWeekAndNext(NOW);
    expect(days.size).toBe(14);
    expect(days.has("2026-10-05")).toBe(true);
    expect(days.has("2026-10-18")).toBe(true);
    expect(days.has("2026-10-19")).toBe(false);
  });

  it("writes NEXT EXAM as Today, a weekday within six days, or a date", () => {
    expect(nextLabel("2026-10-08T09:00:00Z", NOW).kind).toBe("today");
    expect(nextLabel("2026-10-09T05:00:00Z", NOW).kind).toBe("weekday");
    expect(nextLabel("2026-10-21T04:00:00Z", NOW).kind).toBe("date");
  });
});

describe("0.9a Confirm seats", () => {
  it("reads the seats, or none for an assignment of the whole exam", () => {
    expect(seatRange(math)).toEqual({ from: 65, to: 128 });
    expect(seatRange(exam(2, "P", "2026-10-08T09:00:00Z", { seats: null }))).toBeNull();
    expect(endsAtMs(math)).toBe(Date.parse("2026-10-09T06:30:00Z"));
  });

  it("confirms without text and asks for a change with the trimmed text", () => {
    expect(confirmSeatsArgs(math.exam_id)).toEqual({ exam_id: math.exam_id });
    expect(confirmSeatsArgs(math.exam_id, "   ")).toEqual({ exam_id: math.exam_id });
    expect(confirmSeatsArgs(math.exam_id, "  Seats 1–64, please. ")).toEqual({
      exam_id: math.exam_id,
      change_request: "Seats 1–64, please.",
    });
  });

  it("applies confirm_seats' reply to its row only", () => {
    const next = applyConfirmation(rows, {
      exam_id: math.exam_id,
      confirmed_at: "2026-10-08T07:01:00Z",
      change_request: null,
    });
    expect(next.find((row) => row.exam_id === math.exam_id)?.confirmed_at).toBe("2026-10-08T07:01:00Z");
    expect(assignmentState(next.find((row) => row.exam_id === math.exam_id) as MyExam)).toBe("confirmed");
    expect(next.find((row) => row.exam_id === physics.exam_id)).toBe(physics);
  });
});
