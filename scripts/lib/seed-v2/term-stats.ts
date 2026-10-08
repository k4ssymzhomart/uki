// The term_* views of WP 1.1 (supabase/migrations/20261009000000_phase1.sql, section 8) computed over a
// seed v2 term plan, for one faculty or all of them, and A.1's figures from them as WP 1.10's page
// derives them: the unit tests check the frame's numbers here, and the stack test checks that the
// database's views agree.

import type { Decision, TermPlan } from "./term.ts";
import type { FacultyKey } from "./world.ts";

export interface TermStats {
  examsRun: number;
  firstDay: string | null;
  sessions: number;
  flags: number;
  flaggedSessions: number;
  decisions: number;
  committee: number;
  weekly: { week: string; sessions: number; flags: number; rate: number }[];
  flagTypes: Record<string, number>;
  decisionCounts: Record<Decision, number>;
  medianReviewS: { week: string; decisions: number; median: number }[];
}

/** round(x, 1) of Postgres numeric for the view's flags_per_100 (half away from zero). */
export function rate1(flags: number, sessions: number): number {
  return Math.round((flags * 1000) / sessions) / 10;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 1 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  return Math.round(value);
}

/** The figures of `plan` for `faculty`, or for all faculties. */
export function termStats(plan: TermPlan, faculty: FacultyKey | "all"): TermStats {
  const exams = plan.exams.filter((exam) => faculty === "all" || exam.faculty === faculty);
  const examIds = new Set(exams.map((exam) => exam.id));
  const weekOf = new Map(exams.map((exam) => [exam.id, exam.week]));
  const endOf = new Map(
    exams.map((exam) => [exam.id, Date.parse(exam.startsAt) + exam.durationMin * 60_000]),
  );
  const sessions = plan.sessions.filter((session) => examIds.has(session.examId));
  const events = plan.events.filter((event) => examIds.has(event.examId));
  const flagsBySession = new Map<string, number>();
  for (const event of events)
    flagsBySession.set(event.sessionId, (flagsBySession.get(event.sessionId) ?? 0) + 1);
  const decisions = plan.decisions.filter((decision) => examIds.has(decision.examId));
  const flaggedDecisions = decisions.filter((decision) => (flagsBySession.get(decision.sessionId) ?? 0) > 0);

  const weeks = [...new Set(exams.map((exam) => exam.week))].sort();
  const weekly = weeks.map((week) => {
    const inWeek = sessions.filter((session) => weekOf.get(session.examId) === week);
    const flags = inWeek.reduce((sum, session) => sum + (flagsBySession.get(session.id) ?? 0), 0);
    return { week, sessions: inWeek.length, flags, rate: rate1(flags, inWeek.length) };
  });
  const flagTypes: Record<string, number> = {};
  for (const event of events) flagTypes[event.type] = (flagTypes[event.type] ?? 0) + 1;
  const decisionCounts: Record<Decision, number> = { no_issue: 0, talk: 0, committee: 0 };
  for (const decision of flaggedDecisions) decisionCounts[decision.decision] += 1;
  const medianReviewS = weeks.flatMap((week) => {
    const times = flaggedDecisions
      .filter((decision) => weekOf.get(decision.examId) === week)
      .map((decision) =>
        Math.max(0, Math.round((Date.parse(decision.decidedAt) - (endOf.get(decision.examId) ?? 0)) / 1000)),
      );
    return times.length === 0 ? [] : [{ week, decisions: times.length, median: median(times) }];
  });
  return {
    examsRun: exams.length,
    firstDay: exams.map((exam) => exam.day).sort()[0] ?? null,
    sessions: sessions.length,
    flags: events.length,
    flaggedSessions: sessions.filter((session) => (flagsBySession.get(session.id) ?? 0) > 0).length,
    decisions: flaggedDecisions.length,
    committee: decisions.filter((decision) => decision.decision === "committee").length,
    weekly,
    flagTypes,
    decisionCounts,
    medianReviewS,
  };
}

/** A.1's six flag groups (WP 1.10's reports-model.ts FLAG_GROUPS without Other). */
export const A1_FLAG_GROUPS: Readonly<Record<string, string>> = {
  "gaze.off_screen": "looked_away",
  "gaze.down": "looked_away",
  "phone.detected": "phone",
  "tab.blocked": "tab_or_site",
  "face.missing": "no_face",
  "face.second": "second_face",
  "camera.lost": "camera_lost",
};

/** Whole percentages that add up to 100, by largest remainder (the kit's `shares`, WP 1.10). */
export function shares(values: readonly number[]): number[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total === 0) return values.map(() => 0);
  const exact = values.map((value) => (value * 100) / total);
  const floors = exact.map(Math.floor);
  let left = 100 - floors.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, rest: value - Math.floor(value) }))
    .sort((a, b) => b.rest - a.rest || a.index - b.index);
  for (const { index } of order) {
    if (left <= 0) break;
    floors[index] = (floors[index] ?? 0) + 1;
    left -= 1;
  }
  return floors;
}

/** Flags per A.1 group, and their shares in A1_FRAME.flagShares' order. */
export function flagGroupShares(flagTypes: Readonly<Record<string, number>>): Record<string, number> {
  const groups = ["looked_away", "phone", "tab_or_site", "no_face", "second_face", "camera_lost"];
  const totals = groups.map((group) =>
    Object.entries(flagTypes)
      .filter(([type]) => A1_FLAG_GROUPS[type] === group)
      .reduce((sum, [, count]) => sum + count, 0),
  );
  const percents = shares(totals);
  return Object.fromEntries(groups.map((group, i) => [group, percents[i] ?? 0]));
}
