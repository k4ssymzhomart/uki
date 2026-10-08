import { describe, expect, it } from "vitest";
import { flagChip, topFlagLine } from "./review-copy.ts";
import {
  buildReview,
  durationParts,
  filterGroups,
  flagParam,
  flagTypeCounts,
  median,
  minutesWritten,
  parseFlagParam,
  queuePosition,
  type ReviewGroup,
  reviewStats,
  tabCounts,
} from "./review-model.ts";
import {
  at,
  decision,
  EXAM,
  flag,
  historyFlags,
  historyInput,
  LIVE_EXAM,
  NOW,
  OTHER_EXAM_ID,
  OTHER_REVIEWER,
  REVIEWER,
  session,
  sessionId,
} from "./test-fixtures.ts";

function only(groups: ReviewGroup[]): ReviewGroup {
  const [group] = groups;
  if (group === undefined || groups.length !== 1) throw new Error(`expected one group, got ${groups.length}`);
  return group;
}

function statuses(group: ReviewGroup): Record<string, string> {
  return Object.fromEntries(group.sessions.map((s) => [s.id, s.status]));
}

describe("the queue rule", () => {
  it("puts every flagged session without a decision in the queue: History's seven flags on five sessions", () => {
    const group = only(buildReview(historyInput(), NOW));
    expect(group.sessions.filter((s) => s.status === "to_review").map((s) => s.id)).toHaveLength(5);
    expect(group.sessions.reduce((sum, s) => sum + s.openFlags.length, 0)).toBe(7);
    expect(statuses(group)[sessionId(90)]).toBe("no_flags");
  });

  it("takes a session out once its decision is newer than every flag", () => {
    const group = only(
      buildReview(historyInput({ decisions: [decision(7, at(70)), decision(64, at(70))] }), NOW),
    );
    expect(statuses(group)[sessionId(7)]).toBe("reviewed");
    expect(statuses(group)[sessionId(64)]).toBe("reviewed");
    expect(group.sessions.find((s) => s.id === sessionId(7))?.openFlags).toEqual([]);
  });

  it("puts a session back when a flag arrives after its decision, and counts only that flag as open", () => {
    const late = flag(7, "face.second", 75, { duration_ms: 2000, faces: 2 });
    const group = only(
      buildReview(historyInput({ flags: [...historyFlags(), late], decisions: [decision(7, at(70))] }), NOW),
    );
    const madina = group.sessions.find((s) => s.id === sessionId(7));
    expect(madina?.status).toBe("to_review");
    expect(madina?.openFlags.map((f) => f.id)).toEqual([late.id]);
    expect(madina?.flags).toHaveLength(3);
    // The row shows the open flag, not the older phone the decision covered.
    expect(madina?.top?.type).toBe("face.second");
  });

  it("compares the decision with the flag's server receive time, not the laptop's time", () => {
    // Sent from an offline laptop: happened before the decision, received after it.
    const queued = flag(21, "gaze.down", 30, { duration_ms: 2500 }, { received_at: at(80) });
    const group = only(
      buildReview(
        historyInput({ flags: [...historyFlags(), queued], decisions: [decision(21, at(70))] }),
        NOW,
      ),
    );
    expect(statuses(group)[sessionId(21)]).toBe("to_review");
  });

  it("ignores events that are not flags and leaves out exams without a flag", () => {
    const log = flag(90, "net.offline", 10, { offline_ms: 42_000, queued: 6 }, { review: "log" });
    const groups = buildReview(
      {
        exams: [EXAM, LIVE_EXAM],
        sessions: [session(90), session(100, { exam_id: OTHER_EXAM_ID })],
        flags: [log],
        decisions: [],
      },
      NOW,
    );
    expect(groups).toEqual([]);
    expect(
      buildReview({ exams: [EXAM], sessions: [session(90)], flags: [], decisions: [] }, NOW, {
        keepUnflagged: true,
      }),
    ).toHaveLength(1);
  });
});

describe("grouping and order", () => {
  it("groups by exam, an exam with sessions in the queue first, then the newest", () => {
    const groups = buildReview(
      {
        exams: [EXAM, LIVE_EXAM],
        sessions: [7, 21].map((seat) => session(seat)).concat(session(100, { exam_id: OTHER_EXAM_ID })),
        flags: [
          flag(7, "phone.detected", 12, { score: 0.94 }),
          flag(21, "face.second", 22, { duration_ms: 4000 }),
          flag(100, "tab.blocked", 160, {}, { exam_id: OTHER_EXAM_ID }),
        ],
        decisions: [decision(100, at(170), { exam_id: OTHER_EXAM_ID })],
      },
      NOW,
    );
    // Physics 1 is newer, but History still has its queue.
    expect(groups.map((g) => g.exam.id)).toEqual([EXAM.id, OTHER_EXAM_ID]);
    expect(groups[0]?.exam.endsAt).toBe(at(60));
  });

  it("orders a queue by the top flag (phone, second face, then the rest), more flags first, then by name", () => {
    const group = only(buildReview(historyInput(), NOW));
    expect(group.sessions.map((s) => s.id)).toEqual([
      sessionId(7), // phone, 2 flags
      sessionId(33), // phone, 1 flag
      sessionId(21), // second face
      sessionId(48), // looked down (with a blocked tab)
      sessionId(64), // camera lost
      sessionId(90), // no flags
    ]);
  });

  it("writes each row's top flag as Row/Session does", () => {
    const group = only(buildReview(historyInput(), NOW));
    const line = (seat: number) => topFlagLine(group.sessions.find((s) => s.id === sessionId(seat)) as never);
    expect(line(7)).toEqual({ key: "top.phone_detected", values: { score: 0.94 } });
    expect(line(21)).toEqual({ key: "top.face_second", values: { seconds: 4 } });
    expect(line(48)).toEqual({ key: "top.gaze_down", values: { count: 1, seconds: 3.1 } });
    expect(line(64)).toEqual({ key: "top.camera_lost" });
    expect(line(90)).toBeUndefined();
  });

  it("adds up look-aways for 'Looked away · 6 s in total'", () => {
    const flags = [
      flag(33, "gaze.off_screen", 10, { duration_ms: 2000, direction: "left" }),
      flag(33, "gaze.off_screen", 20, { duration_ms: 1500, direction: "right" }),
      flag(33, "gaze.off_screen", 30, { duration_ms: 2500, direction: "left" }),
    ];
    const group = only(buildReview(historyInput({ flags }), NOW));
    const dias = group.sessions.find((s) => s.id === sessionId(33));
    expect(dias === undefined ? undefined : topFlagLine(dias)).toEqual({
      key: "top.gaze_off_screen",
      values: { count: 3, seconds: 6 },
    });
  });

  it("makes the short chips of 3.3 and 3.2b", () => {
    const [phone, look, , , tab] = historyFlags();
    expect(phone && flagChip(phone)).toEqual({ key: "session.chip.phone_detected", values: { score: 0.94 } });
    expect(look && flagChip(look)).toEqual({ key: "session.chip.gaze_off_screen", values: { seconds: 4.2 } });
    expect(tab && flagChip(tab)).toEqual({ key: "session.chip.tab_blocked" });
  });
});

describe("tabs, the flag filter and the search", () => {
  const groups = buildReview(
    historyInput({ decisions: [decision(64, at(70)), decision(21, at(70), { decision: "talk" })] }),
    NOW,
  );

  it("counts sessions per tab", () => {
    expect(tabCounts(groups)).toEqual({ to_review: 3, reviewed: 2, all: 6 });
  });

  it("keeps only sessions with a flag of a chosen type, among the flags the tab looks at", () => {
    const phones = filterGroups(groups, { tab: "to_review", flags: ["phone.detected"], query: "" });
    expect(phones.flatMap((g) => g.sessions.map((s) => s.id))).toEqual([sessionId(7), sessionId(33)]);
    const cameras = filterGroups(groups, { tab: "to_review", flags: ["camera.lost"], query: "" });
    expect(cameras).toEqual([]);
    const reviewedCameras = filterGroups(groups, { tab: "reviewed", flags: ["camera.lost"], query: "" });
    expect(reviewedCameras.flatMap((g) => g.sessions.map((s) => s.id))).toEqual([sessionId(64)]);
  });

  it("finds a student by name or number, ignoring case", () => {
    const byName = filterGroups(groups, { tab: "all", flags: [], query: "  madina " });
    expect(byName.flatMap((g) => g.sessions.map((s) => s.id))).toEqual([sessionId(7)]);
    const byNumber = filterGroups(groups, { tab: "all", flags: [], query: "20230048" });
    expect(byNumber.flatMap((g) => g.sessions.map((s) => s.id))).toEqual([sessionId(48)]);
  });

  it("counts flags per type for 3.2a, in Figma's order", () => {
    expect(flagTypeCounts(groups, "to_review", "")).toEqual([
      { type: "phone.detected", count: 2 },
      { type: "gaze.off_screen", count: 1 },
      { type: "gaze.down", count: 1 },
      { type: "tab.blocked", count: 1 },
    ]);
    expect(flagTypeCounts(groups, "all", "")).toContainEqual({ type: "camera.lost", count: 1 });
  });

  it("reads and writes ?flag= with known types only, in a stable order", () => {
    expect(parseFlagParam("face.second,phone.detected,nope")).toEqual(["phone.detected", "face.second"]);
    expect(parseFlagParam(["tab.blocked", "camera.lost,tab.blocked"])).toEqual([
      "tab.blocked",
      "camera.lost",
    ]);
    expect(parseFlagParam(undefined)).toEqual([]);
    expect(flagParam(["face.second", "phone.detected"])).toBe("phone.detected,face.second");
    expect(flagParam([])).toBeNull();
  });
});

describe("stat cards", () => {
  it("counts the queue, the reviewed sessions and their reviewers, and the sessions with no flags", () => {
    const groups = buildReview(
      historyInput({
        decisions: [
          decision(64, "2026-10-09T08:00:00.000Z"),
          decision(21, "2026-10-09T08:00:40.000Z", { reviewer_id: OTHER_REVIEWER }),
        ],
      }),
      NOW,
    );
    const stats = reviewStats(groups, NOW);
    expect(stats.toReview).toEqual({ sessions: 3, flags: 5 });
    expect(stats.reviewed).toEqual({ sessions: 2, reviewers: 2, today: true });
    expect(stats.noFlags).toBe(1);
    // Exam end 07:00; decisions at 08:00:00 and 08:00:40: median 3620 s.
    expect(stats.medianReviewS).toBe(3620);
  });

  it("says when a decision was not made today, and has no median without decisions", () => {
    const groups = buildReview(historyInput({ decisions: [decision(64, "2026-10-08T08:00:00.000Z")] }), NOW);
    expect(reviewStats(groups, NOW).reviewed.today).toBe(false);
    expect(reviewStats(buildReview(historyInput(), NOW), NOW).medianReviewS).toBeNull();
  });

  it("formats durations as the two largest units", () => {
    expect(durationParts(42)).toEqual({ unit: "seconds", seconds: 42 });
    expect(durationParts(100)).toEqual({ unit: "minutes", minutes: 1, seconds: 40 });
    expect(durationParts(3 * 3600 + 5 * 60 + 9)).toEqual({ unit: "hours", hours: 3, minutes: 5 });
    expect(durationParts(2 * 86_400 + 4 * 3600)).toEqual({ unit: "days", days: 2, hours: 4 });
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(3);
    expect(median([])).toBeNull();
  });

  it("uses time used, or the minutes since the start while a student still writes", () => {
    expect(minutesWritten({ state: "submitted", started_at: at(0), time_used_s: 87 * 60 + 20 }, NOW)).toBe(
      87,
    );
    expect(
      minutesWritten({ state: "writing", started_at: "2026-10-09T08:30:00.000Z", time_used_s: 0 }, NOW),
    ).toBe(30);
    expect(minutesWritten({ state: "joined", started_at: null, time_used_s: 0 }, NOW)).toBeNull();
  });
});

describe("Save and next", () => {
  it("numbers the session in its exam's queue and goes to the next one, wrapping round", () => {
    const group = only(buildReview(historyInput(), NOW));
    expect(queuePosition(group, sessionId(7))).toEqual({ index: 1, total: 5, next: sessionId(33) });
    expect(queuePosition(group, sessionId(64))).toEqual({ index: 5, total: 5, next: sessionId(7) });
  });

  it("goes back to the queue after the last one, and has no number for a reviewed session", () => {
    const last = only(
      buildReview(
        historyInput({
          decisions: [7, 21, 33, 48].map((seat) => decision(seat, at(70))),
        }),
        NOW,
      ),
    );
    expect(queuePosition(last, sessionId(64))).toEqual({ index: 1, total: 1, next: null });
    expect(queuePosition(last, sessionId(7))).toEqual({ index: 0, total: 1, next: sessionId(64) });
    expect(queuePosition(undefined, sessionId(7))).toBeNull();
  });
});

it("keeps the reviewer of a decision for the Reviewed card", () => {
  const group = only(buildReview(historyInput({ decisions: [decision(7, at(70))] }), NOW));
  expect(group.sessions.find((s) => s.id === sessionId(7))?.decision?.reviewer_id).toBe(REVIEWER);
});
