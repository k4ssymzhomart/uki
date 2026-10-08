import { DEFAULT_EXAM_CHECKS } from "@uki/contracts";
import { describe, expect, it } from "vitest";
import {
  coversAllGroups,
  examChecks,
  examPhase,
  filterExams,
  liveStudentCount,
  liveTarget,
  type OverviewRow,
  overviewStats,
  parseOverviewRows,
  statusChip,
} from "./overview-model.ts";

const now = Date.parse("2026-10-07T09:00:00Z");

function exam(id: number, status: OverviewRow["status"], startsAt: string, extra: Partial<OverviewRow> = {}) {
  return {
    id: `e0000000-0000-4000-8000-00000000000${id}`,
    faculty_id: null,
    title: `Exam ${id}`,
    course: `Course ${id}`,
    status,
    starts_at: startsAt,
    duration_min: 60,
    lobby_opens_at: new Date(Date.parse(startsAt) - 20 * 60_000).toISOString(),
    checks: DEFAULT_EXAM_CHECKS,
    groups: ["204"],
    proctor_count: 2,
    roster_size: 128,
    joined: 0,
    writing: 0,
    flagged_events: 0,
    sessions_final: 0,
    ...extra,
  } satisfies OverviewRow;
}

// The seeded world of 0.1: Mathematics 2 next, Physics 1 live, History to review, Linear Algebra draft,
// English B2 reviewed.
const rows = parseOverviewRows([
  exam(5, "reviewed", "2026-10-03T10:00:00+00:00"),
  exam(4, "draft", "2026-10-13T04:00:00+00:00"),
  exam(3, "to_review", "2026-10-07T06:00:00+00:00", { flagged_events: 7, joined: 136, sessions_final: 136 }),
  exam(2, "live", "2026-10-07T08:55:00+00:00", { joined: 84, sessions_final: 2 }),
  exam(1, "scheduled", "2026-10-07T09:15:00+00:00"),
]);

describe("overview rows", () => {
  it("parses view rows and drops a row that does not fit, instead of showing it wrong", () => {
    expect(rows).toHaveLength(5);
    expect(parseOverviewRows([{ id: "nope" }, exam(6, "scheduled", "2026-10-08T09:00:00Z")])).toHaveLength(1);
  });

  it("orders the table like Figma: next scheduled, live, to review, draft, reviewed", () => {
    expect(filterExams(rows, "all").map((row) => row.title)).toEqual([
      "Exam 1",
      "Exam 2",
      "Exam 3",
      "Exam 4",
      "Exam 5",
    ]);
  });
});

describe("overview filters", () => {
  it("All shows every exam, Upcoming draft and scheduled, Live live, Done to review and reviewed", () => {
    const titles = (filter: Parameters<typeof filterExams>[1]) =>
      filterExams(rows, filter).map((row) => row.title);
    expect(titles("upcoming")).toEqual(["Exam 1", "Exam 4"]);
    expect(titles("live")).toEqual(["Exam 2"]);
    expect(titles("done")).toEqual(["Exam 3", "Exam 5"]);
    expect(titles("all")).toHaveLength(5);
  });

  it("keeps cancelled exams in All only", () => {
    expect(examPhase("cancelled")).toBe("cancelled");
    const withCancelled = [...rows, ...parseOverviewRows([exam(7, "cancelled", "2026-10-08T09:00:00Z")])];
    for (const filter of ["upcoming", "live", "done"] as const) {
      expect(filterExams(withCancelled, filter).some((row) => row.status === "cancelled")).toBe(false);
    }
    expect(filterExams(withCancelled, "all")).toHaveLength(6);
  });
});

describe("overview stat cards", () => {
  it("counts upcoming exams, students live now and flags to review", () => {
    const stats = overviewStats(rows);
    expect(stats.upcoming.count).toBe(2);
    expect(stats.upcoming.next?.title).toBe("Exam 1");
    expect(stats.live.students).toBe(82);
    expect(stats.live.exams.map((row) => row.title)).toEqual(["Exam 2"]);
    expect(stats.review.flags).toBe(7);
    expect(stats.review.exams.map((row) => row.title)).toEqual(["Exam 3"]);
  });

  it("has no next exam when nothing is scheduled (a draft is not next)", () => {
    expect(overviewStats(filterExams(rows, "done")).upcoming).toEqual({ count: 0, next: null });
    expect(overviewStats(rows.filter((row) => row.status === "draft")).upcoming.next).toBeNull();
  });
});

describe("overview rows' cells", () => {
  it("maps each status to its chip", () => {
    const chips = Object.fromEntries(rows.map((row) => [row.status, statusChip(row)]));
    expect(chips.scheduled).toEqual({ status: "idle", key: "scheduled" });
    expect(chips.live).toEqual({ status: "ok", key: "live" });
    expect(chips.to_review).toEqual({ status: "warn", key: "toReview", count: 7 });
    expect(chips.draft).toEqual({ status: "idle", key: "draft" });
    expect(chips.reviewed).toEqual({ status: "ok", key: "reviewed" });
  });

  it("shows the Lock and card checks only when the exam runs them", () => {
    expect(examChecks(DEFAULT_EXAM_CHECKS)).toEqual({ lock: true, gaze: true, phone: true, id: true });
    expect(examChecks({ ...DEFAULT_EXAM_CHECKS, lock: false, identity: false })).toEqual({
      lock: false,
      gaze: true,
      phone: true,
      id: false,
    });
  });

  it("says All groups only when an exam has every group", () => {
    expect(coversAllGroups(["101", "102", "103", "204"], 4)).toBe(true);
    expect(coversAllGroups(["101", "102", "103", "204"], 6)).toBe(false);
    expect(coversAllGroups(["204"], 1)).toBe(false);
  });
});

describe("the sidebar's Live target", () => {
  it("prefers a live exam's wall, then an open lobby, then the next lobby", () => {
    expect(liveTarget(rows, now)).toEqual({
      kind: "live",
      examId: rows.find((r) => r.status === "live")?.id,
    });
    const noLive = rows.filter((row) => row.status !== "live");
    expect(liveTarget(noLive, now)).toEqual({
      kind: "lobby",
      examId: "e0000000-0000-4000-8000-000000000001",
    });
    expect(liveTarget(filterExams(rows, "done"), now)).toBeNull();
  });
});

describe("the sidebar's Live count", () => {
  it("counts students in live exams and in lobbies that are open", () => {
    // Exam 2 is live with 82 active; exam 1's lobby opens at 08:55 UTC.
    expect(liveStudentCount(rows, now)).toBe(82);
    const lobby = parseOverviewRows([
      exam(8, "scheduled", "2026-10-07T09:10:00+00:00", { joined: 121 }),
      exam(9, "scheduled", "2026-10-07T12:00:00+00:00", { joined: 3 }),
    ]);
    expect(liveStudentCount([...rows, ...lobby], now)).toBe(82 + 121);
  });
});
