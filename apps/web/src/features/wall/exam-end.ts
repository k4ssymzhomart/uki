// The group's end time for the breadcrumb ("00:42:17 left") and 2.4c ("Ends at 11:40 instead of 11:30").
import { isFinalState, sessionEndsAt } from "@uki/contracts";
import type { WallExam, WallSession } from "./wall-store.ts";

/**
 * Minutes a group add_time gave everyone: the smallest extra_min among sessions still writing or
 * waiting (a student with their own extra minutes has more). 0 when no session is active.
 */
export function groupExtraMin(sessions: Iterable<WallSession>): number {
  let least: number | null = null;
  for (const session of sessions) {
    if (isFinalState(session.state)) continue;
    least = least === null ? session.extraMin : Math.min(least, session.extraMin);
  }
  return least ?? 0;
}

/** When the exam ends for the group, with the group's added minutes. */
export function examEndsAt(exam: WallExam, sessions: Iterable<WallSession>): Date {
  return sessionEndsAt(
    { starts_at: exam.startsAt, duration_min: exam.durationMin },
    { extra_min: groupExtraMin(sessions), paused_s: 0 },
  );
}
