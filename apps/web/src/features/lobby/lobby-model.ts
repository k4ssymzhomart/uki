import {
  Device,
  ExamStatus,
  parseStatusDetail,
  SessionState,
  SessionStatus,
  type SessionTileMessage,
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
 * - `card:retry:<n>` (and `card:help:<n>` on 1.3a): "Card unreadable · retry 2 of 3".
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
  student: z.object({ full_name: z.string(), student_number: z.string() }),
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
});
export type LobbySession = z.infer<typeof LobbySession>;

export const LOBBY_SESSION_COLUMNS = "id, student_id, state, status, device";

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
  | { key: "cardRetry"; attempt: number; max: number };

/** dashboard.lobby.chip.* */
export type ChipKey = "needsHelp" | "notJoined" | "checking" | "ready" | "writing" | "paused" | "done";

export type LobbyRow = {
  studentId: string;
  sessionId: string | null;
  name: string;
  number: string;
  seat: number | null;
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
      return { key: "cardRetry", attempt: detail.tries, max: THRESHOLDS.identity.maxTries };
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
  const base = {
    studentId: entry.student_id,
    sessionId: session?.id ?? null,
    name: entry.student.full_name,
    number: entry.student.student_number,
    seat: entry.seat,
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
  const problem = checkProblem(session);
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

export type LobbyRole = { role: "exam_office" | "proctor" | "admin"; isLead: boolean };

/** True before the scheduled start of a scheduled exam (start_exam refuses anything else). */
export function beforeStart(exam: LobbyExam, nowMs: number): boolean {
  return exam.status === "scheduled" && nowMs < toMs(exam.starts_at);
}

/** Start exam is enabled for the lead proctor and the exam office, only before the scheduled start. */
export function canStartExam(exam: LobbyExam, who: LobbyRole, nowMs: number): boolean {
  return (who.role !== "proctor" || who.isLead) && beforeStart(exam, nowMs);
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
