// Enums that mirror supabase/migrations/0001_core.sql, the session status sent through `ingest`,
// and the session state machine from "Session states" in docs/phase-0-plan.md.
import { z } from "zod";

export const SESSION_STATES = [
  "joined",
  "checking",
  "identity",
  "rules",
  "ready",
  "writing",
  "paused",
  "submitted",
  "time_up",
  "ended",
] as const;
export const SessionState = z.enum(SESSION_STATES);
export type SessionState = z.infer<typeof SessionState>;

/** `join_exam` creates every session in this state. */
export const INITIAL_STATE: SessionState = "joined";

/** States before 2.1 opens, in order. */
export const PRE_EXAM_STATES = ["joined", "checking", "identity", "rules", "ready"] as const;
export type PreExamState = (typeof PRE_EXAM_STATES)[number];

/** No transition leaves these states. */
export const FINAL_STATES = ["submitted", "time_up", "ended"] as const;
export type FinalState = (typeof FINAL_STATES)[number];

export function isFinalState(state: SessionState): state is FinalState {
  return (FINAL_STATES as readonly SessionState[]).includes(state);
}

export function isPreExamState(state: SessionState): state is PreExamState {
  return (PRE_EXAM_STATES as readonly SessionState[]).includes(state);
}

export const LOCALES = ["kk", "ru", "en"] as const;
export const Locale = z.enum(LOCALES);
export type Locale = z.infer<typeof Locale>;
/** Students see Kazakh unless they pick another language. */
export const DEFAULT_LOCALE: Locale = "kk";

/** `{"kk":"...","ru":"...","en":"..."}` as stored in `questions.body` and `questions.choices[].body`. */
export const LocalizedText = z.object({ kk: z.string(), ru: z.string(), en: z.string() });
export type LocalizedText = z.infer<typeof LocalizedText>;

export const EXAM_MODES = ["app", "browser"] as const;
export const ExamMode = z.enum(EXAM_MODES);
export type ExamMode = z.infer<typeof ExamMode>;

export const EXAM_STATUSES = ["draft", "scheduled", "live", "to_review", "reviewed", "cancelled"] as const;
export const ExamStatus = z.enum(EXAM_STATUSES);
export type ExamStatus = z.infer<typeof ExamStatus>;

export const STAFF_ROLES = ["exam_office", "proctor", "admin"] as const;
export const StaffRole = z.enum(STAFF_ROLES);
export type StaffRole = z.infer<typeof StaffRole>;

/** The two student operating systems; `sessions.device.os`, Lock `hello.os` and the process scan use it. */
export const DESKTOP_OS = ["macos", "windows"] as const;
export const DesktopOs = z.enum(DESKTOP_OS);
export type DesktopOs = z.infer<typeof DesktopOs>;

/** The check-in steps the app reports through `ingest` `status.step`. */
export const STATUS_STEPS = ["checking", "identity", "rules", "ready"] as const;
export const StatusStep = z.enum(STATUS_STEPS);
export type StatusStep = z.infer<typeof StatusStep>;

export const STATUS_DETAIL_MAX = 200;

/**
 * `sessions.status`: what the lobby (1.5) and the wall (2.4) show next to a student. Every field is
 * optional because the column defaults to `{}`; null is tolerated on read.
 * - `step`: the check-in step the app is on.
 * - `detail`: a short machine-readable detail for the step, for example the blocked app's name.
 * - `question`: the 1-based number of the question on screen during the exam ("on screen · Q 9").
 */
export const SessionStatus = z.object({
  step: StatusStep.nullish(),
  detail: z.string().max(STATUS_DETAIL_MAX).nullish(),
  question: z.number().int().positive().nullish(),
});
export type SessionStatus = z.infer<typeof SessionStatus>;

/** What may change `sessions.state`, one per row of the Session states table. */
export type StateCause =
  /** `join_exam` on an existing session returns it unchanged; a new session starts in INITIAL_STATE. */
  | { type: "join_exam" }
  /** `ingest` with `status.step` set. */
  | { type: "status"; step: StatusStep }
  /** Sent when 2.1 opens, or when Üki Lock reports `lock.started` in a browser exam. */
  | { type: "exam.started" }
  | { type: "session.paused" }
  | { type: "proctor.paused" }
  | { type: "session.resumed" }
  | { type: "proctor.resumed" }
  | { type: "proctor.ended" }
  /** `submit_session`; `pastEnd` is `now() >= session_ends_at(session)`. */
  | { type: "submit_session"; pastEnd: boolean }
  /** `session_tick`, applied only to sessions 2 minutes past their end. */
  | { type: "session_tick" };

const RANK: Record<SessionState, number> = {
  joined: 0,
  checking: 1,
  identity: 2,
  rules: 3,
  ready: 4,
  writing: 5,
  paused: 5,
  submitted: 6,
  time_up: 6,
  ended: 6,
};

/**
 * The state after `cause`, or `current` when the cause does not apply. Mirrors the Session states
 * table: states only move forward, except between `writing` and `paused`, and never out of a final
 * state.
 */
export function nextState(current: SessionState, cause: StateCause): SessionState {
  if (isFinalState(current)) return current;
  switch (cause.type) {
    case "join_exam":
      return current;
    case "status":
      return isPreExamState(current) && RANK[cause.step] > RANK[current] ? cause.step : current;
    case "exam.started":
      return isPreExamState(current) ? "writing" : current;
    case "session.paused":
    case "proctor.paused":
      return current === "writing" ? "paused" : current;
    case "session.resumed":
    case "proctor.resumed":
      return current === "paused" ? "writing" : current;
    case "proctor.ended":
      return "ended";
    case "submit_session":
      return cause.pastEnd ? "time_up" : "submitted";
    case "session_tick":
      return "time_up";
  }
}
