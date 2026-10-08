import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { EVENT_DATA, type EventType, serverReview } from "../../../packages/contracts/src/index.ts";
import { createRng } from "../sim/rng.ts";
import { A1_FRAME, apportion, buildTermPlan, MATH_WEEKS, reviewTimes, TERM_SEED, termExams } from "./term.ts";
import { flagGroupShares, rate1, shares, termStats } from "./term-stats.ts";
import { allStudents, PEOPLE, phase0Students, seedName } from "./world.ts";

const plan = buildTermPlan();
const math = termStats(plan, "mathematics");

describe("seed v2 world", () => {
  it("has A.2's 1,284 students, each with a unique number and id, a programme and a year", () => {
    const students = allStudents();
    expect(students).toHaveLength(1284);
    expect(new Set(students.map((s) => s.number)).size).toBe(1284);
    expect(new Set(students.map((s) => s.id)).size).toBe(1284);
    for (const s of students) {
      expect(s.programme).toBeTruthy();
      if (s.number !== PEOPLE.zhansaya) expect(s.year).toBeGreaterThan(0);
    }
    expect(phase0Students()).toHaveLength(448);
  });

  it("repeats seed.sql's names (spot checks against the seeded database)", () => {
    const byNumber = new Map(phase0Students().map((s) => [s.number, s.fullName]));
    expect(byNumber.get("20235001")).toBe("Kairat Kairatov");
    expect(byNumber.get("20235021")).toBe("Alikhan Utepov");
    expect(byNumber.get("20235024")).toBe("Aigerim Zhumabayeva");
    expect(byNumber.get(PEOPLE.deleteRequest)).toBe("Kairat Mukanov");
    expect(seedName(2)).toBe("Karina Nurpeisova");
  });
});

describe("seed v2 term (fixed seed, fixed numbers)", () => {
  it("is the same plan for the same seed, row for row", () => {
    const digest = createHash("sha256")
      .update(JSON.stringify(buildTermPlan(TERM_SEED)))
      .digest("hex");
    expect(digest).toBe(createHash("sha256").update(JSON.stringify(plan)).digest("hex"));
    expect(digest.slice(0, 16)).toBe("b361857735b1d3fa");
  });

  it("has 42 past exams in three faculties from 1 September to 7 October", () => {
    expect(plan.exams).toHaveLength(42);
    expect(new Set(plan.exams.map((e) => e.faculty))).toEqual(new Set(["mathematics", "physics", "history"]));
    const days = plan.exams.map((e) => e.day).sort();
    expect(days[0]).toBe("2026-09-01");
    expect(days[days.length - 1]).toBe("2026-10-07");
    expect(plan.sessions).toHaveLength(5346);
    expect(plan.events).toHaveLength(534);
    expect(plan.decisions).toHaveLength(330);
  });

  it("gives A.1 its frame's tiles for the Faculty of Mathematics", () => {
    expect(math.examsRun).toBe(A1_FRAME.examsRun);
    expect(math.firstDay).toBe(A1_FRAME.firstDay);
    expect(math.sessions).toBe(A1_FRAME.sessions);
    expect(math.committee).toBe(A1_FRAME.committee);
    expect(Math.round((math.committee * 1000) / math.sessions) / 10).toBe(A1_FRAME.committeePercent);
  });

  it("gives the weekly flags per 100 sessions, 11.6 down to 8.4, and 10.5 for September", () => {
    expect(math.weekly.map((w) => ({ week: w.week, rate: w.rate }))).toEqual(A1_FRAME.weekly);
    const september = math.weekly.slice(0, 4);
    expect(
      rate1(
        september.reduce((sum, w) => sum + w.flags, 0),
        september.reduce((sum, w) => sum + w.sessions, 0),
      ),
    ).toBe(A1_FRAME.flagsPer100September);
    expect(math.weekly[math.weekly.length - 1]?.rate).toBe(A1_FRAME.flagsPer100Latest);
    expect(math.weekly.map((w) => w.sessions)).toEqual(MATH_WEEKS.map((w) => w.sessions));
  });

  it("gives What gets flagged its six shares", () => {
    expect(flagGroupShares(math.flagTypes)).toEqual(A1_FRAME.flagShares);
  });

  it("gives Decisions 298 flagged sessions: 214, 61 and 23 (72, 20 and 8 per cent)", () => {
    expect(math.flaggedSessions).toBe(A1_FRAME.flaggedSessions);
    expect(math.decisions).toBe(A1_FRAME.flaggedSessions);
    expect(math.decisionCounts).toEqual(A1_FRAME.decisions);
    expect(
      shares([math.decisionCounts.no_issue, math.decisionCounts.talk, math.decisionCounts.committee]),
    ).toEqual([72, 20, 8]);
  });

  it("gives the weekly median review time, 2:30 down to 1:40", () => {
    expect(math.medianReviewS.map((w) => w.median)).toEqual(A1_FRAME.medianReviewS);
  });

  it("writes only flag events whose data the contracts accept", () => {
    for (const event of plan.events) {
      expect(serverReview(event.type, { fullscreenExitCount: 0 })).toBe("flag");
      expect(EVENT_DATA[event.type as EventType].safeParse(event.data).success).toBe(true);
    }
  });

  it("uses ids the contracts accept and never reuses one", () => {
    const uuid = z.uuid();
    const ids = [
      ...plan.exams.map((e) => e.id),
      ...plan.sessions.map((s) => s.id),
      ...plan.sessions.map((s) => s.authUid),
      ...plan.events.map((e) => e.id),
    ];
    for (const id of ids) expect(uuid.safeParse(id).success).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(plan.sessions.map((s) => s.receiptId)).size).toBe(plan.sessions.length);
  });

  it("keeps every flag inside its attempt and every decision after its flags", () => {
    const sessions = new Map(plan.sessions.map((s) => [s.id, s]));
    const lastFlag = new Map<string, number>();
    for (const event of plan.events) {
      const session = sessions.get(event.sessionId);
      expect(session).toBeDefined();
      if (!session) continue;
      expect(Date.parse(event.at)).toBeGreaterThan(Date.parse(session.startedAt));
      expect(Date.parse(event.receivedAt)).toBeLessThan(Date.parse(session.submittedAt));
      lastFlag.set(
        event.sessionId,
        Math.max(lastFlag.get(event.sessionId) ?? 0, Date.parse(event.receivedAt)),
      );
    }
    for (const decision of plan.decisions) {
      expect(Date.parse(decision.decidedAt)).toBeGreaterThan(lastFlag.get(decision.sessionId) ?? 0);
    }
    expect(new Set(plan.decisions.map((d) => d.sessionId))).toEqual(new Set(lastFlag.keys()));
  });

  it("leaves Madina, Aliya and the delete request's student present and unflagged", () => {
    const flagged = new Set(plan.events.map((e) => e.sessionId));
    for (const number of [PEOPLE.madina, PEOPLE.aliya, PEOPLE.deleteRequest]) {
      const theirs = plan.sessions.filter((s) => s.number === number);
      expect(theirs.length).toBeGreaterThan(0);
      for (const session of theirs) expect(flagged.has(session.id)).toBe(false);
    }
    // Madina's five term exams and Mathematics 2 make A.2's six.
    expect(plan.sessions.filter((s) => s.number === PEOPLE.madina)).toHaveLength(5);
  });
});

describe("seed v2 helpers", () => {
  it("apportions by largest remainder", () => {
    expect(apportion(8, [124, 118, 122, 128])).toEqual([2, 2, 2, 2]);
    expect(apportion(5, [1, 1, 1])).toEqual([2, 2, 1]);
  });

  it("makes review times with an exact median", () => {
    for (const count of [17, 18]) {
      const times = reviewTimes(count, 9000, createRng(1));
      const sorted = [...times].sort((a, b) => a - b);
      const mid = Math.floor(count / 2);
      const median = count % 2 ? sorted[mid] : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
      expect(median).toBe(9000);
    }
  });

  it("schedules the term's exams on weekdays at whole Almaty hours", () => {
    for (const exam of termExams()) {
      const local = new Date(Date.parse(exam.startsAt) + 5 * 3_600_000);
      expect([1, 2, 3, 4, 5]).toContain(local.getUTCDay());
      expect(local.getUTCMinutes()).toBe(0);
    }
  });
});
