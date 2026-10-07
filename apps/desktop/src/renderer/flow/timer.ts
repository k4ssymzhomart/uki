// The exam timer on the app ("Timer" in docs/phase-0-plan.md). The server owns time: a session ends at
// session_ends_at = starts_at + duration_min + extra_min + paused_s, and every ingest reply carries it.
// Between replies the app adds what it already knows but the server has not confirmed yet: minutes a
// proctor just added, and the pause that just ended. It stops while paused and keeps running offline.
// All times are server-clock milliseconds.
//
// Added minutes are counted, not timed: extra_min only grows, so the app's extra_min is the larger of
// the server's last report and the join's extra_min plus every add_time applied since (each command id
// once). An ingest reply that read the session before the command committed, and arrives after its
// broadcast, therefore cannot take the minutes back.
import { type IngestSession, sessionEndsAt, THRESHOLDS, toMs } from "@uki/contracts";

export interface TimerState {
  /** The exam's start; moves earlier when the lead proctor presses Start exam. */
  startsAt: number;
  durationMin: number;
  /** extra_min and paused_s as the server last reported them. */
  extraMin: number;
  pausedS: number;
  /** session_ends_at from the server. */
  endsAt: number;
  /** Server time of the join's report: add_time commands issued before it are in its extra_min. */
  joinedAt: number;
  /** The join's extra_min plus the minutes of every add_time applied since. */
  knownExtraMin: number;
  /** Ids of the add_time commands counted in `knownExtraMin`. */
  addedIds: readonly string[];
  /** Added minutes the server's last report does not show yet: knownExtraMin - extraMin, at least 0. */
  pendingExtraMin: number;
  /** A pause that ended but is not in `pausedS` yet: its credit and the `pausedS` it adds to. */
  pendingCredit: { ms: number; basePausedS: number; at: number } | null;
  /** The running pause; the timer stands still at `since`. */
  pause: { since: number; kind: "self" | "proctor" } | null;
  /** Seconds of self-pause given back so far (at most 300 per session). */
  selfCreditS: number;
}

/** The server takes a while to report a resume's credit; after this the estimate is dropped. */
export const PENDING_CREDIT_MAX_MS = 60_000;

export function initialTimer(input: {
  startsAt: string | number;
  durationMin: number;
  extraMin: number;
  pausedS: number;
  serverTime: string | number;
}): TimerState {
  const startsAt = toMs(input.startsAt);
  return {
    startsAt,
    durationMin: input.durationMin,
    extraMin: input.extraMin,
    pausedS: input.pausedS,
    endsAt: sessionEndsAt(
      { starts_at: startsAt, duration_min: input.durationMin },
      { extra_min: input.extraMin, paused_s: input.pausedS },
    ).getTime(),
    joinedAt: toMs(input.serverTime),
    knownExtraMin: input.extraMin,
    addedIds: [],
    pendingExtraMin: 0,
    pendingCredit: null,
    pause: null,
    selfCreditS: 0,
  };
}

/** When the session ends, with what the app knows ahead of the server. */
export function effectiveEndsAt(timer: TimerState): number {
  return timer.endsAt + timer.pendingExtraMin * 60_000 + (timer.pendingCredit?.ms ?? 0);
}

/** Time left; frozen at the pause's start while paused. Never negative. */
export function remainingMs(timer: TimerState, now: number): number {
  const at = timer.pause ? Math.min(timer.pause.since, now) : now;
  return Math.max(0, effectiveEndsAt(timer) - at);
}

/** duration_min + extra_min, with added minutes the server has not confirmed yet. */
export function totalMs(timer: TimerState): number {
  return (timer.durationMin + timer.extraMin + timer.pendingExtraMin) * 60_000;
}

/** Time ran out on a running timer: the app submits (3.1 with exam.time_up). */
export function isTimeUp(timer: TimerState, now: number): boolean {
  return timer.pause === null && remainingMs(timer, now) <= 0;
}

/**
 * Applies an ingest reply's `session` at server time `serverTime`. The reply is the truth for
 * extra_min and paused_s; the start is derived from ends_at, so Start exam moves the lobby countdown.
 */
export function syncTimer(
  timer: TimerState,
  session: IngestSession,
  serverTime: string | number,
): TimerState {
  const endsAt = toMs(session.ends_at);
  const syncedAt = toMs(serverTime);
  const startsAt = endsAt - (timer.durationMin + session.extra_min) * 60_000 - session.paused_s * 1000;
  let pendingCredit = timer.pendingCredit;
  if (
    pendingCredit !== null &&
    (session.paused_s > pendingCredit.basePausedS || syncedAt - pendingCredit.at > PENDING_CREDIT_MAX_MS)
  ) {
    pendingCredit = null;
  }
  return {
    ...timer,
    startsAt,
    extraMin: session.extra_min,
    pausedS: session.paused_s,
    endsAt,
    // Minutes this reply does not show yet stay added, whenever the reply's session was read.
    pendingExtraMin: Math.max(0, timer.knownExtraMin - session.extra_min),
    pendingCredit,
  };
}

/**
 * add_time: counts once per command id, and not at all when the join's report already holds it (a
 * catch-up read after a restart of a command issued before the join).
 */
export function addTime(timer: TimerState, id: string, minutes: number, issuedAt: number): TimerState {
  if (issuedAt <= timer.joinedAt || timer.addedIds.includes(id)) return timer;
  const knownExtraMin = timer.knownExtraMin + minutes;
  return {
    ...timer,
    knownExtraMin,
    addedIds: [...timer.addedIds, id],
    pendingExtraMin: Math.max(0, knownExtraMin - timer.extraMin),
  };
}

export function startPause(timer: TimerState, since: number, kind: "self" | "proctor"): TimerState {
  if (timer.pause) return timer;
  return { ...timer, pause: { since, kind } };
}

/**
 * Ends the pause at `at`. The server adds the pause to paused_s (all of a proctor pause, a self-pause up
 * to 300 s per session); until its next reply shows that, the app adds the same estimate.
 */
export function endPause(timer: TimerState, at: number): TimerState {
  if (!timer.pause) return timer;
  const lasted = Math.max(0, at - timer.pause.since);
  let creditS = Math.floor(lasted / 1000);
  let selfCreditS = timer.selfCreditS;
  if (timer.pause.kind === "self") {
    creditS = Math.min(creditS, Math.max(0, THRESHOLDS.pause.selfGiveBackCapS - selfCreditS));
    selfCreditS += creditS;
  }
  const previous = timer.pendingCredit?.ms ?? 0;
  return {
    ...timer,
    pause: null,
    selfCreditS,
    pendingCredit:
      creditS + previous > 0
        ? {
            ms: previous + creditS * 1000,
            basePausedS: timer.pendingCredit?.basePausedS ?? timer.pausedS,
            at,
          }
        : timer.pendingCredit,
  };
}
