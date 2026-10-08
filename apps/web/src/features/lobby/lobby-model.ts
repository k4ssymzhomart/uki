import {
  Device,
  ExamStatus,
  Locale,
  parseStatusDetail,
  SessionState,
  SessionStatus,
  type SessionTileMessage,
  type StaffRole,
  type StatusDetail,
  THRESHOLDS,
  Timestamp,
  toMs,
  Uuid,
} from "@uki/contracts";
import type { ChipStatus } from "@uki/ui";
import { z } from "zod";

/**
 * 1.5 Lobby as pure functions: who is where in check-in, the counts on the banner, the stat cards and
 * the tabs, the client-side filters and search, and how a realtime `session` message changes a row.
 * Unit-tested in lobby-model.test.ts.
 *
 * `sessions.status.detail` (set by the app through ingest) says what holds a student at a check step,
 * in the vocabulary of packages/contracts/src/status-detail.ts; a session at a check step with a
 * detail needs help. 1.5 draws three of them, each with its dashboard.lobby.detail.* string:
 * - `app:<name>`: "Telegram is open";
 * - `camera:busy`: "Camera blocked by another app";
 * - `card:retry:<n>`: "Card unreadable · retry 2 of 3", and `card:help:<n>` on 1.3a: 1.5b's
 *   "Card unreadable · 3 of 3 tries".
 * The other details (lock, network, storage, other camera problems) have no string in Figma yet: the row
 * shows its step and Needs help without a detail line. Text outside the vocabulary is never shown.
 */

// ---------------------------------------------------------------------------------------------------
// Rows from the database

export const LobbyExam = z.object({
  id: Uuid,
  title: z.string(),
  status: ExamStatus,
  starts_at: Timestamp,
  duration_min: z.number().int().positive(),
  lobby_opens_at: Timestamp,
  groups: z.array(z.string()),
});
export type LobbyExam = z.infer<typeof LobbyExam>;

export const RosterEntry = z.object({
  student_id: Uuid,
  seat: z.number().int().nullable(),
  invite_status: z.string(),
  student: z.object({
    full_name: z.string(),
    student_number: z.string(),
    /** The student's group, for 1.5a's "20231044 · Group 204". */
    group: z.object({ code: z.string() }).nullable().optional().catch(null),
  }),
});
export type RosterEntry = z.infer<typeof RosterEntry>;

/** sessions.device as the app writes it; anything unreadable shows as no device. */
const DeviceCell = Device.pick({ os: true, app_version: true }).nullable().catch(null);

export const LobbySession = z.object({
  id: Uuid,
  student_id: Uuid,
  state: SessionState,
  status: SessionStatus.catch({}),
  device: DeviceCell,
  /** The app's language, for 1.5b's "Sent in English, Madina's app language"; Kazakh by default. */
  locale: Locale.catch("kk"),
});
export type LobbySession = z.infer<typeof LobbySession>;

/** A proctor's open change request on 0.9a, as the exam office sees it in the lobby. */
export const ChangeRequestRow = z.object({
  staff_id: Uuid,
  seat_from: z.number().int().positive().nullable(),
  seat_to: z.number().int().positive().nullable(),
  change_request: z.string(),
  staff: z.object({ full_name: z.string() }),
});
export type ChangeRequestRow = z.infer<typeof ChangeRequestRow>;

export const LOBBY_SESSION_COLUMNS = "id, student_id, state, status, device, locale";

export function parseRows<T>(schema: z.ZodType<T>, rows: readonly unknown[]): T[] {
  return rows.flatMap((row) => {
    const parsed = schema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}

// ---------------------------------------------------------------------------------------------------
// What a row shows

export type LobbyCategory = "needHelp" | "notJoined" | "checking" | "ready" | "writing" | "done";

/** dashboard.lobby.step.* */
export type StepKey = "notJoined" | "joined" | "checking" | "identity" | "rules" | "writing" | "finished";

/** dashboard.lobby.detail.* with its values. */
export type StepDetail =
  | { key: "waiting" }
  | { key: "bounced" }
  | { key: "cameraBlocked" }
  | { key: "appOpen"; app: string }
  | { key: "cardRetry"; attempt: number; max: number }
  | { key: "cardHelp"; tries: number; max: number };

/** dashboard.lobby.chip.* */
export type ChipKey = "needsHelp" | "notJoined" | "checking" | "ready" | "writing" | "paused" | "done";

export type LobbyRow = {
  studentId: string;
  sessionId: string | null;
  name: string;
  number: string;
  seat: number | null;
  /** The student's group code, "204". */
  group: string | null;
  /** The session's state; null before the student joins. */
  state: SessionState | null;
  /** What holds the student at a check step (status.detail), for 1.5a and 1.5b. */
  problem: StatusDetail | null;
  /** The app's language. */
  locale: Locale | null;
  category: LobbyCategory;
  step: StepKey;
  detail: StepDetail | null;
  device: { os: "macos" | "windows"; version: string } | null;
  chip: { status: ChipStatus; key: ChipKey };
};

const CHECK_STATES: readonly SessionState[] = ["joined", "checking", "identity"];

const STEP_OF_STATE: Record<SessionState, StepKey> = {
  joined: "joined",
  checking: "checking",
  identity: "identity",
  rules: "rules",
  ready: "rules",
  writing: "writing",
  paused: "writing",
  submitted: "finished",
  time_up: "finished",
  ended: "finished",
};

/** The 1.5 line for a status detail; null for one Figma draws no string for. */
export function problemDetail(detail: StatusDetail): StepDetail | null {
  switch (detail.kind) {
    case "app":
      return { key: "appOpen", app: detail.name };
    case "camera":
      return detail.problem === "busy" ? { key: "cameraBlocked" } : null;
    case "card":
      return detail.problem === "help"
        ? { key: "cardHelp", tries: detail.tries, max: THRESHOLDS.identity.maxTries }
        : { key: "cardRetry", attempt: detail.tries, max: THRESHOLDS.identity.maxTries };
    default:
      return null;
  }
}

/** The session's status detail while it is at a check step, or null. */
function checkProblem(session: LobbySession): StatusDetail | null {
  return CHECK_STATES.includes(session.state) ? parseStatusDetail(session.status.detail) : null;
}

export function categoryOf(session: LobbySession | null): LobbyCategory {
  if (!session) return "notJoined";
  if (CHECK_STATES.includes(session.state)) return checkProblem(session) ? "needHelp" : "checking";
  if (session.state === "rules" || session.state === "ready") return "ready";
  if (session.state === "writing" || session.state === "paused") return "writing";
  return "done";
}

function chipOf(category: LobbyCategory, state: SessionState | null): LobbyRow["chip"] {
  switch (category) {
    case "needHelp":
      return { status: "warn", key: "needsHelp" };
    case "notJoined":
      return { status: "idle", key: "notJoined" };
    case "checking":
      return { status: "idle", key: "checking" };
    case "ready":
      return { status: "ok", key: "ready" };
    case "writing":
      return state === "paused" ? { status: "warn", key: "paused" } : { status: "ok", key: "writing" };
    case "done":
      return { status: "idle", key: "done" };
  }
}

/** One student's row: the roster entry and the student's session, if they joined. */
export function lobbyRow(entry: RosterEntry, session: LobbySession | null): LobbyRow {
  const category = categoryOf(session);
  const problem = session ? checkProblem(session) : null;
  const base = {
    studentId: entry.student_id,
    sessionId: session?.id ?? null,
    name: entry.student.full_name,
    number: entry.student.student_number,
    seat: entry.seat,
    group: entry.student.group?.code ?? null,
    state: session?.state ?? null,
    problem,
    locale: session?.locale ?? null,
    category,
    chip: chipOf(category, session?.state ?? null),
  };
  if (!session) {
    return {
      ...base,
      step: "notJoined",
      detail: entry.invite_status === "bounced" ? { key: "bounced" } : null,
      device: null,
    };
  }
  return {
    ...base,
    step: STEP_OF_STATE[session.state],
    detail: problem ? problemDetail(problem) : session.state === "ready" ? { key: "waiting" } : null,
    device: session.device ? { os: session.device.os, version: session.device.app_version } : null,
  };
}

/** Every roster student's row, in roster order. A session of a student not on the roster is left out. */
export function lobbyRows(roster: readonly RosterEntry[], sessions: readonly LobbySession[]): LobbyRow[] {
  const byStudent = new Map(sessions.map((session) => [session.student_id, session]));
  return roster.map((entry) => lobbyRow(entry, byStudent.get(entry.student_id) ?? null));
}

// ---------------------------------------------------------------------------------------------------
// 1.5a: the student card on a lobby row

/** The four check-in steps of 1.5a's bar, in order. */
export const CHECK_IN_STEPS = ["system", "identity", "rules", "ready"] as const;
export type CheckInStepId = (typeof CHECK_IN_STEPS)[number];

const STEP_NUMBER: Record<SessionState, number> = {
  joined: 1,
  checking: 1,
  identity: 2,
  rules: 3,
  ready: 4,
  writing: 4,
  paused: 4,
  submitted: 4,
  time_up: 4,
  ended: 4,
};

/**
 * Where a student is in check-in: the step's number (1 to 4) and the state of each step on 1.5a's bar.
 * Steps before the current one are done; the current one is warn while something holds the student
 * there, done once the student is ready (or past check-in), and still to do otherwise.
 */
export function checkInProgress(
  state: SessionState,
  problem: StatusDetail | null,
): { step: number; steps: { id: CheckInStepId; state: "done" | "warn" | "todo" }[] } {
  const step = STEP_NUMBER[state];
  const finished = !CHECK_STATES.includes(state) && state !== "rules";
  return {
    step,
    steps: CHECK_IN_STEPS.map((id, index) => {
      if (index + 1 < step) return { id, state: "done" };
      if (index + 1 > step) return { id, state: "todo" };
      return { id, state: problem ? "warn" : finished ? "done" : "todo" };
    }),
  };
}

/** The card's "retry 2 of 3" (1.3) or "3 of 3 tries" (1.3a) beside the step, for a card problem. */
export type CardTriesMeta =
  | { key: "retry"; attempt: number; max: number }
  | { key: "tries"; tries: number; max: number };

export function cardTriesMeta(problem: StatusDetail | null): CardTriesMeta | null {
  if (problem?.kind !== "card") return null;
  const max = THRESHOLDS.identity.maxTries;
  return problem.problem === "help"
    ? { key: "tries", tries: problem.tries, max }
    : { key: "retry", attempt: problem.tries, max };
}

/** 1.5a's Problem fact: the lobby's detail line, or "Card unreadable" for the card; null otherwise. */
export type ProblemFact =
  | { key: "appOpen"; app: string }
  | { key: "cameraBlocked" }
  | { key: "cardUnreadable" };

export function problemFact(problem: StatusDetail | null): ProblemFact | null {
  switch (problem?.kind) {
    case "app":
      return { key: "appOpen", app: problem.name };
    case "camera":
      return problem.problem === "busy" ? { key: "cameraBlocked" } : null;
    case "card":
      return { key: "cardUnreadable" };
    default:
      return null;
  }
}

/** 1.5b: a student held at the identity check by the card, who may need a hint. */
export function stuckOnIdentity(row: Pick<LobbyRow, "state" | "problem">): boolean {
  return row.state === "identity" && row.problem?.kind === "card";
}

// ---------------------------------------------------------------------------------------------------
// Counts, filters, search

export type LobbyCounts = {
  total: number;
  joined: number;
  ready: number;
  needHelp: number;
  notJoined: number;
  /** Not joined, but the invite email was opened (NOT JOINED caption). */
  invitesOpened: number;
};

export function lobbyCounts(rows: readonly LobbyRow[], roster: readonly RosterEntry[]): LobbyCounts {
  const opened = new Set(roster.filter((e) => e.invite_status === "opened").map((e) => e.student_id));
  const count = (category: LobbyCategory) => rows.filter((row) => row.category === category).length;
  return {
    total: rows.length,
    joined: rows.filter((row) => row.sessionId !== null).length,
    ready: count("ready"),
    needHelp: count("needHelp"),
    notJoined: count("notJoined"),
    invitesOpened: rows.filter((row) => row.category === "notJoined" && opened.has(row.studentId)).length,
  };
}

/** The Check-in tabs, in Figma order. */
export const LOBBY_FILTERS = ["needHelp", "notJoined", "ready", "all"] as const;
export type LobbyFilter = (typeof LOBBY_FILTERS)[number];

/** Figma opens on Need help; with nobody needing help the list starts on All. */
export function defaultLobbyFilter(counts: LobbyCounts): LobbyFilter {
  return counts.needHelp > 0 ? "needHelp" : "all";
}

const CATEGORY_ORDER: Record<LobbyCategory, number> = {
  needHelp: 0,
  notJoined: 1,
  checking: 2,
  ready: 3,
  writing: 4,
  done: 5,
};

function compareRows(a: LobbyRow, b: LobbyRow): number {
  return (
    CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category] ||
    (a.seat ?? Number.MAX_SAFE_INTEGER) - (b.seat ?? Number.MAX_SAFE_INTEGER) ||
    a.name.localeCompare(b.name)
  );
}

function matches(row: LobbyRow, query: string): boolean {
  const q = query.trim().toLocaleLowerCase();
  if (q === "") return true;
  return row.name.toLocaleLowerCase().includes(q) || row.number.includes(q);
}

/** The rows a tab and the search show: those who need help first, then by seat and name. */
export function visibleRows(rows: readonly LobbyRow[], filter: LobbyFilter, query: string): LobbyRow[] {
  return rows
    .filter((row) => filter === "all" || row.category === filter)
    .filter((row) => matches(row, query))
    .sort(compareRows);
}

// ---------------------------------------------------------------------------------------------------
// The banner and Start exam

export type LobbyRole = { role: StaffRole; isLead: boolean };

/** True before the scheduled start of a scheduled exam (start_exam refuses anything else). */
export function beforeStart(exam: LobbyExam, nowMs: number): boolean {
  return exam.status === "scheduled" && nowMs < toMs(exam.starts_at);
}

/** Start exam is enabled for the lead proctor and the exam office, only before the scheduled start. */
export function canStartExam(exam: LobbyExam, who: LobbyRole, nowMs: number): boolean {
  // The observer (judge mode) reads only: never the Start button.
  const mayStart =
    who.role === "exam_office" || who.role === "admin" || (who.role === "proctor" && who.isLead);
  return mayStart && beforeStart(exam, nowMs);
}

// ---------------------------------------------------------------------------------------------------
// Realtime

export type SessionUpdate = Pick<SessionTileMessage, "id" | "state" | "status">;

/**
 * Applies a `session` message from the exam channel. A known session gets the new state and status;
 * an unknown one (a student who has just joined) has to be read from the database, because the
 * message carries no student or device.
 */
export function applySessionUpdate(
  sessions: readonly LobbySession[],
  update: SessionUpdate,
): { sessions: LobbySession[]; unknown: boolean } {
  let found = false;
  const next = sessions.map((session) => {
    if (session.id !== update.id) return session;
    found = true;
    return { ...session, state: update.state, status: update.status };
  });
  return { sessions: found ? next : [...sessions], unknown: !found };
}

/**
 * Adds or replaces sessions read from the database, keyed by session id. Sessions in `keep` that the
 * list already holds stay as they are: a `session` message updated them while the read was in flight,
 * so the read's row may be older.
 */
export function mergeSessions(
  sessions: readonly LobbySession[],
  fresh: readonly LobbySession[],
  keep: ReadonlySet<string> = new Set(),
): LobbySession[] {
  const byId = new Map(sessions.map((session) => [session.id, session]));
  for (const session of fresh) {
    if (keep.has(session.id) && byId.has(session.id)) continue;
    byId.set(session.id, session);
  }
  return [...byId.values()];
}

/** "Madina Tulegenova" gives "Madina", as 1.5b writes "Hint for Madina". */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/u)[0] ?? "";
}

/** The most a hint holds: 1.5b's counter reads "78/200" (the server takes up to 280, MESSAGE_TEXT_MAX). */
export const HINT_MAX = 200;

/**
 * 1.5b's log: the session's identity help requests and the proctors' messages, oldest first. Other help
 * topics belong to the exam (2.4d), not to check-in.
 */
export function identityHelpLog<T extends { type: string; data: Record<string, unknown>; at: string }>(
  events: readonly T[],
): T[] {
  return events
    .filter(
      (event) =>
        event.type === "proctor.message" ||
        (event.type === "student.help_requested" && event.data.topic === "identity"),
    )
    .sort((a, b) => toMs(a.at) - toMs(b.at));
}
