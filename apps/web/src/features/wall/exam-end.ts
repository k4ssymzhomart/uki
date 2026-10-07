// The group's end time for the breadcrumb ("00:42:17 left") and 2.4c ("Ends at 11:40 instead of 11:30").
import { type SessionState, sessionEndsAt } from "@uki/contracts";
import type { WallExam, WallSession } from "./wall-store.ts";

/** Sessions a group command reaches: rules, ready, writing or paused (plan, API; issue_command). */
export const GROUP_STATES: ReadonlySet<SessionState> = new Set(["rules", "ready", "writing", "paused"]);

/**
 * Minutes a group add_time gave everyone: the smallest extra_min among the sessions a group command
 * reaches (a student with their own extra minutes has more). Sessions still at check-in (joined,
 * checking, identity) never get a group add_time, so they do not count. 0 when no session is reached.
 */
export function groupExtraMin(sessions: Iterable<WallSession>): number {
  let least: number | null = null;
  for (const session of sessions) {
    if (!GROUP_STATES.has(session.state)) continue;
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
