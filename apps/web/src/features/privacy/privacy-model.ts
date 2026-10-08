import {
  DATA_REQUEST_DUE_DAYS,
  DataRequestKind,
  DataRequestStatus,
  nextRetentionRun,
  Timestamp,
  Uuid,
} from "@uki/contracts";
import type { IconName } from "@uki/ui";
import { z } from "zod";
import { almatyDay } from "../../lib/format.ts";
import { almatyStamp, csvField } from "../report/report-model.ts";

/**
 * The privacy centre (A.5 107:11102, A.5a 165:14035, A.5b 165:16241) and the audit log (A.6 108:11296) as
 * pure functions: the requests list, the next cleanup, what a request's drawer lists, and the audit
 * entries with their filters, icons, message keys and CSV. Every word around the values is a
 * dashboard.privacy.* message. Unit-tested in privacy-model.test.ts.
 */

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------------------------------
// Requests (A.5's Requests card)
// ---------------------------------------------------------------------------------------------------

/** One `data_requests` row with its student, as PostgREST embeds it. */
export const RequestRow = z.object({
  id: Uuid,
  student_id: Uuid,
  kind: DataRequestKind,
  status: DataRequestStatus,
  received_at: Timestamp,
  due_at: Timestamp,
  reply: z.string().nullable(),
  export_path: z.string().nullable(),
  done_by: Uuid.nullable(),
  done_at: Timestamp.nullable(),
  students: z.object({ full_name: z.string(), student_number: z.string() }),
});
export type RequestRow = z.infer<typeof RequestRow>;

export const REQUEST_COLUMNS =
  "id, student_id, kind, status, received_at, due_at, reply, export_path, done_by, done_at, students(full_name, student_number)";

/** Answered requests stay on the card this long after they were answered. */
export const CLOSED_SHOWN_DAYS = 30;

/**
 * The Requests card: open requests first, the one due soonest on top, then the ones answered in the last
 * CLOSED_SHOWN_DAYS, newest first. The card's count is the open ones.
 */
export function requestList(
  rows: readonly RequestRow[],
  nowMs: number,
): { open: number; rows: RequestRow[] } {
  const open = rows
    .filter((row) => row.status === "received")
    .sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at) || a.id.localeCompare(b.id));
  const closed = rows
    .filter(
      (row) =>
        row.status !== "received" &&
        row.done_at !== null &&
        nowMs - Date.parse(row.done_at) <= CLOSED_SHOWN_DAYS * DAY_MS,
    )
    .sort((a, b) => Date.parse(b.done_at ?? "") - Date.parse(a.done_at ?? ""));
  return { open: open.length, rows: [...open, ...closed] };
}

/** A request's drawer: an existing request (`?request=`) or a new one from A.3 (`?new=` and `?student=`). */
export type DrawerTarget =
  | { type: "request"; requestId: string }
  | { type: "new"; kind: DataRequestKind; studentId: string };

/** Reads the drawer from the address; anything that does not parse opens nothing. */
export function drawerFromSearch(params: Record<string, string | string[] | undefined>): DrawerTarget | null {
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const request = Uuid.safeParse(one(params.request));
  if (request.success) return { type: "request", requestId: request.data };
  const kind = DataRequestKind.safeParse(one(params.new));
  const student = Uuid.safeParse(one(params.student));
  return kind.success && student.success ? { type: "new", kind: kind.data, studentId: student.data } : null;
}

/** The privacy centre's address with a drawer open. */
export function drawerHref(target: DrawerTarget): string {
  return target.type === "request"
    ? `/privacy-centre?request=${target.requestId}`
    : `/privacy-centre?new=${target.kind}&student=${target.studentId}`;
}

/** When a new request (not yet saved) is due: DATA_REQUEST_DUE_DAYS after now, as the database sets it. */
export function newRequestDue(nowMs: number): string {
  return new Date(nowMs + DATA_REQUEST_DUE_DAYS * DAY_MS).toISOString();
}

// ---------------------------------------------------------------------------------------------------
// Retention (A.5's Retention card)
// ---------------------------------------------------------------------------------------------------

/**
 * The next nightly run (22:00 UTC, 03:00 in Almaty) and the capture time before which a still is gone by
 * then: the stills that run deletes are those captured before `cutoff`.
 */
export function nextCleanup(nowMs: number, retentionDays: number): { at: Date; cutoff: Date } {
  const at = nextRetentionRun(nowMs);
  return { at, cutoff: new Date(at.getTime() - retentionDays * DAY_MS) };
}

// ---------------------------------------------------------------------------------------------------
// A request's drawer (A.5a, A.5b)
// ---------------------------------------------------------------------------------------------------

/** What Üki keeps about the student, counted under the caller's RLS for the drawer. */
export type RequestCounts = {
  /** Sessions: one per exam the student joined. */
  exams: number;
  frames: number;
  /** Exams with at least one kept still. */
  frameExams: number;
  events: number;
  eventExams: number;
  flags: number;
  /** Sessions with an identity score, and with a device record. */
  identityScores: number;
  devices: number;
  /** Distinct laptops (system and app version) and the newest app version, for A.5b's Devices row. */
  laptops: number;
  appVersion: string | null;
  /** Rule acceptances (`rules_accepted_at`). */
  consents: number;
  /** Sessions with a receipt, and sessions with answers. */
  receipts: number;
  /** Verify codes of the student's integrity reports. */
  reports: string[];
};

/** A.5a's list: what the delete removes and what it keeps (plan: Decisions, Data requests). */
export type DeleteItem = {
  id: "frames" | "events" | "identity" | "results" | "reports";
  action: "delete" | "keep";
};

export function deleteItems(counts: RequestCounts): DeleteItem[] {
  const items: DeleteItem[] = [
    { id: "frames", action: "delete" },
    { id: "events", action: "delete" },
    { id: "identity", action: "delete" },
    { id: "results", action: "keep" },
  ];
  if (counts.reports.length > 0) items.push({ id: "reports", action: "keep" });
  return items;
}

/** How many of the list's rows the delete removes: "Delete 3 items". */
export function deleteCount(items: readonly DeleteItem[]): number {
  return items.filter((item) => item.action === "delete").length;
}

/** The first word of a name, for "What Üki keeps about Yerlan". */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? "";
}

/** Why an action failed, as the data-request function or the action says it; each maps to a message. */
export type ActionError = "in_exam" | "done" | "forbidden" | "invalid" | "failed";

/** The data-request function's refusal (`{ error, message }`) as one of the drawer's messages. */
export function actionError(code: string | null, message: string | null): ActionError {
  if (code === "conflict") return message === "in_exam" ? "in_exam" : "done";
  if (code === "forbidden" || code === "unauthorized" || code === "not_found") return "forbidden";
  if (code === "bad_request") return "invalid";
  return "failed";
}

// ---------------------------------------------------------------------------------------------------
// The audit log (A.6 and A.5's Recent access)
// ---------------------------------------------------------------------------------------------------

/** One `audit_log` row. */
export const AuditRow = z.object({
  id: z.number().int(),
  at: Timestamp,
  actor_id: Uuid.nullable(),
  actor_kind: z.string(),
  action: z.string(),
  object_type: z.string(),
  object_id: z.string().nullable(),
  meta: z.record(z.string(), z.unknown()),
});
export type AuditRow = z.infer<typeof AuditRow>;

export const AUDIT_COLUMNS = "id, at, actor_id, actor_kind, action, object_type, object_id, meta";

/** A.6 reads at most this many rows of the chosen range and tab, newest first. */
export const AUDIT_LIMIT = 500;
/** Rows per page of A.6's table. */
export const AUDIT_PAGE = 25;

/** A.6's tabs (108:11555): All, then the frame's four kinds of action. */
export const AUDIT_TABS = ["all", "frames", "exports", "settings", "deletions"] as const;
export type AuditTab = (typeof AUDIT_TABS)[number];

/** The actions of each tab but All. */
export const AUDIT_TAB_ACTIONS: Readonly<Record<Exclude<AuditTab, "all">, readonly string[]>> = {
  frames: ["still.viewed"],
  exports: ["data_request.copy", "report.share", "report.share_view", "audit.export"],
  settings: ["settings.update"],
  deletions: ["data_request.delete", "retention.run"],
};

/** A.6's range menu (108:11572 "Last 7 days"). */
export const AUDIT_RANGES = ["1d", "7d", "30d", "90d"] as const;
export type AuditRange = (typeof AUDIT_RANGES)[number];
const RANGE_DAYS: Record<AuditRange, number> = { "1d": 1, "7d": 7, "30d": 30, "90d": 90 };

export function rangeStart(range: AuditRange, nowMs: number): Date {
  return new Date(nowMs - RANGE_DAYS[range] * DAY_MS);
}

export type AuditFilters = { tab: AuditTab; range: AuditRange; query: string };
export const DEFAULT_AUDIT_FILTERS: AuditFilters = { tab: "all", range: "7d", query: "" };

/** The filters from the address (`?tab=`, `?range=`, `?q=`); values that do not parse are dropped. */
export function auditFiltersFromSearch(params: Record<string, string | string[] | undefined>): AuditFilters {
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const tab = AUDIT_TABS.find((value) => value === one(params.tab)) ?? DEFAULT_AUDIT_FILTERS.tab;
  const range = AUDIT_RANGES.find((value) => value === one(params.range)) ?? DEFAULT_AUDIT_FILTERS.range;
  const query = (one(params.q) ?? "").slice(0, 100);
  return { tab, range, query };
}

/** The address of the filters, without the defaults: "?tab=deletions&range=30d". */
export function auditSearch(filters: AuditFilters): string {
  const params = new URLSearchParams();
  if (filters.tab !== DEFAULT_AUDIT_FILTERS.tab) params.set("tab", filters.tab);
  if (filters.range !== DEFAULT_AUDIT_FILTERS.range) params.set("range", filters.range);
  if (filters.query.trim() !== "") params.set("q", filters.query.trim());
  const text = params.toString();
  return text === "" ? "" : `?${text}`;
}

/** Names behind the rows' ids, read on the server under the caller's RLS. */
export type AuditNames = {
  /** Staff id → full name. */
  staff: Record<string, string>;
  /** A student's anonymous sign-in (auth uid) → the student's full name, for join_exam rows. */
  studentUsers: Record<string, string>;
  /** Student id → full name. */
  students: Record<string, string>;
  sessions: Record<string, { student: string; exam: string }>;
  exams: Record<string, { title: string; kind: string }>;
  /** Report id → its verify code. */
  reports: Record<string, string>;
};

export const EMPTY_NAMES: AuditNames = {
  staff: {},
  studentUsers: {},
  students: {},
  sessions: {},
  exams: {},
  reports: {},
};

export type AuditActor =
  | { kind: "staff"; id: string | null; name: string | null }
  | { kind: "student"; name: string | null }
  | { kind: "share" }
  | { kind: "system" };

export type AuditObject =
  | { kind: "exam"; title: string; examKind: string }
  | { kind: "session"; student: string; exam: string }
  | { kind: "student"; student: string }
  | { kind: "report"; code: string }
  | { kind: "settings" }
  | { kind: "privacy" }
  | { kind: "auditLog" }
  | { kind: "workspace" }
  | { kind: "none" };

export type AuditEntry = {
  /** The first row's id. */
  id: number;
  at: string;
  actor: AuditActor;
  action: string;
  /** Rows folded into this entry: stills one staff member opened at once. */
  count: number;
  object: AuditObject;
  meta: Record<string, unknown>;
};

/** Ids the rows refer to, for the name lookups. */
export function auditIds(rows: readonly AuditRow[]) {
  const staff = new Set<string>();
  const studentUsers = new Set<string>();
  const students = new Set<string>();
  const sessions = new Set<string>();
  const exams = new Set<string>();
  const reports = new Set<string>();
  for (const row of rows) {
    if (row.actor_id !== null && row.actor_kind === "staff") staff.add(row.actor_id);
    if (row.actor_id !== null && row.actor_kind === "student") studentUsers.add(row.actor_id);
    const id = row.object_id;
    const sessionOfMeta = typeof row.meta.session_id === "string" ? row.meta.session_id : null;
    if (id !== null && row.object_type === "exam") exams.add(id);
    if (id !== null && row.object_type === "session") sessions.add(id);
    if (id !== null && row.object_type === "student") students.add(id);
    if (id !== null && row.object_type === "report") reports.add(id);
    if (row.object_type === "frame" && sessionOfMeta !== null) sessions.add(sessionOfMeta);
  }
  const valid = (set: Set<string>) => [...set].filter((id) => Uuid.safeParse(id).success).sort();
  return {
    staff: valid(staff),
    studentUsers: valid(studentUsers),
    students: valid(students),
    sessions: valid(sessions),
    exams: valid(exams),
    reports: valid(reports),
  };
}

function actorOf(row: AuditRow, names: AuditNames): AuditActor {
  switch (row.actor_kind) {
    case "staff":
      return {
        kind: "staff",
        id: row.actor_id,
        name: row.actor_id === null ? null : (names.staff[row.actor_id] ?? null),
      };
    case "student":
      return {
        kind: "student",
        name: row.actor_id === null ? null : (names.studentUsers[row.actor_id] ?? null),
      };
    case "share":
      return { kind: "share" };
    default:
      return { kind: "system" };
  }
}

function objectOf(row: AuditRow, names: AuditNames): AuditObject {
  const id = row.object_id ?? "";
  if (row.action === "settings.update") return { kind: "settings" };
  if (row.action === "privacy_centre.read") return { kind: "privacy" };
  if (row.action.startsWith("audit.")) return { kind: "auditLog" };
  switch (row.object_type) {
    case "exam": {
      const exam = names.exams[id];
      return exam ? { kind: "exam", title: exam.title, examKind: exam.kind } : { kind: "none" };
    }
    case "session":
    case "frame": {
      const sessionId = row.object_type === "frame" ? row.meta.session_id : id;
      const session = typeof sessionId === "string" ? names.sessions[sessionId] : undefined;
      return session ? { kind: "session", ...session } : { kind: "none" };
    }
    case "student": {
      const student = names.students[id];
      return student ? { kind: "student", student } : { kind: "none" };
    }
    case "report": {
      const code = names.reports[id];
      return code ? { kind: "report", code } : { kind: "none" };
    }
    case "workspace":
      return { kind: "workspace" };
    case "data_request":
      return { kind: "privacy" };
    default:
      return { kind: "none" };
  }
}

/**
 * Rows to entries, newest first: the stills one staff member opened in one call (the stills function
 * writes one row per still, all at the same instant, for the same session) fold into one entry, "Viewed
 * 3 flagged frames"; every other row is its own entry, so each share view is its own line.
 */
export function auditEntries(rows: readonly AuditRow[], names: AuditNames): AuditEntry[] {
  const sorted = [...rows].sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || b.id - a.id);
  const entries: AuditEntry[] = [];
  for (const row of sorted) {
    const previous = entries.at(-1);
    if (
      previous !== undefined &&
      row.action === "still.viewed" &&
      previous.action === "still.viewed" &&
      previous.at === row.at &&
      previous.actor.kind === "staff" &&
      row.actor_kind === "staff" &&
      previous.actor.id === row.actor_id &&
      previous.meta.session_id === row.meta.session_id
    ) {
      previous.count += 1;
      continue;
    }
    entries.push({
      id: row.id,
      at: row.at,
      actor: actorOf(row, names),
      action: row.action,
      count: 1,
      object: objectOf(row, names),
      meta: row.meta,
    });
  }
  return entries;
}

/**
 * Each action this page has words for: its icon (Figma draws trash, sliders, download, check, gaze, flag,
 * play and browser-lock) and its message under dashboard.privacy.audit.action. An action missing here
 * shows its stored name, which is data, with the info icon.
 */
const ACTIONS = {
  "audit.export": { icon: "download", key: "audit_export" },
  "audit.read": { icon: "list-check", key: "audit_read" },
  "command.add_time": { icon: "timer", key: "command_add_time" },
  "command.end": { icon: "stop", key: "command_end" },
  "command.message": { icon: "message", key: "command_message" },
  "command.pause": { icon: "pause", key: "command_pause" },
  "command.resume": { icon: "play", key: "command_resume" },
  "command.start": { icon: "play", key: "command_start" },
  "data_request.copy": { icon: "download", key: "data_request_copy" },
  "data_request.delete": { icon: "trash", key: "data_request_delete" },
  "data_request.read": { icon: "shield", key: "data_request_read" },
  "data_request.received": { icon: "inbox", key: "data_request_received" },
  "data_request.reply": { icon: "send", key: "data_request_reply" },
  "exam.draft_created": { icon: "exam", key: "exam_draft_created" },
  "exam.schedule": { icon: "calendar", key: "exam_schedule" },
  "help.close": { icon: "help", key: "help_close" },
  "help.read": { icon: "help", key: "help_read" },
  "identity_help.read": { icon: "id-card", key: "identity_help_read" },
  "invites.send": { icon: "mail", key: "invites_send" },
  "invites.test": { icon: "mail", key: "invites_test" },
  join_exam: { icon: "user", key: "join_exam" },
  "privacy_centre.read": { icon: "shield", key: "privacy_centre_read" },
  "proctors.assign": { icon: "users", key: "proctors_assign" },
  "report.share": { icon: "link", key: "report_share" },
  "report.share_view": { icon: "link", key: "report_share_view" },
  "report.view": { icon: "file-text", key: "report_view" },
  "retention.run": { icon: "trash", key: "retention_run" },
  "review.decide": { icon: "check", key: "review_decide" },
  "review.queue_viewed": { icon: "flag", key: "review_queue_viewed" },
  "review.session_viewed": { icon: "eyes", key: "review_session_viewed" },
  "roster.import": { icon: "upload", key: "roster_import" },
  "roster.view": { icon: "users", key: "roster_view" },
  "seats.change_request": { icon: "edit", key: "seats_change_request" },
  "seats.confirm": { icon: "check", key: "seats_confirm" },
  "session.note": { icon: "edit", key: "session_note" },
  "settings.update": { icon: "sliders", key: "settings_update" },
  start_exam: { icon: "play", key: "start_exam" },
  "still.viewed": { icon: "gaze", key: "still_viewed" },
  "student.read": { icon: "user", key: "student_read" },
  "students.list": { icon: "users", key: "students_list" },
} as const satisfies Readonly<Record<string, { icon: IconName; key: string }>>;

type KnownAction = keyof typeof ACTIONS;

/** A message key under dashboard.privacy.audit.action. */
export type ActionMessageKey =
  | (typeof ACTIONS)[KnownAction]["key"]
  | "settings_retention"
  | "join_exam_refused";

function known(action: string): action is KnownAction {
  return Object.hasOwn(ACTIONS, action);
}

export function actionIcon(action: string): IconName {
  return known(action) ? ACTIONS[action].icon : "info";
}

const RetentionChange = z.object({
  before: z.object({ retention_days: z.number() }),
  after: z.object({ retention_days: z.number() }),
});

/**
 * The message of an entry's action, under dashboard.privacy.audit.action, with its values; null for an
 * action this page has no message for, which then shows its stored name.
 */
export function actionMessage(
  entry: AuditEntry,
): { key: ActionMessageKey; values: Record<string, string | number> } | null {
  const meta = entry.meta;
  switch (entry.action) {
    case "still.viewed":
      return { key: "still_viewed", values: { count: entry.count } };
    case "review.decide":
      return { key: "review_decide", values: { decision: String(meta.decision ?? "") } };
    case "settings.update": {
      const change = RetentionChange.safeParse(meta);
      if (change.success && change.data.before.retention_days !== change.data.after.retention_days) {
        return {
          key: "settings_retention",
          values: { before: change.data.before.retention_days, after: change.data.after.retention_days },
        };
      }
      return { key: "settings_update", values: {} };
    }
    case "retention.run":
      return {
        key: "retention_run",
        values: {
          count: typeof meta.frames === "number" ? meta.frames : 0,
          days: typeof meta.retention_days === "number" ? meta.retention_days : 0,
        },
      };
    case "data_request.received":
      return { key: "data_request_received", values: { kind: String(meta.kind ?? "") } };
    case "join_exam":
      return { key: meta.result === "ok" ? "join_exam" : "join_exam_refused", values: {} };
    default:
      return known(entry.action) ? { key: ACTIONS[entry.action].key, values: {} } : null;
  }
}

/** The entry matches every word of the query in its who, action or object text, in any case. */
export function matchesQuery(text: string, query: string): boolean {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const haystack = text.toLocaleLowerCase();
  return words.every((word) => haystack.includes(word));
}

/** Page `page` (from 0) of `rows`, clamped. */
export function auditPage<T>(rows: readonly T[], page: number) {
  const pageCount = Math.max(1, Math.ceil(rows.length / AUDIT_PAGE));
  const current = Math.min(Math.max(0, page), pageCount - 1);
  const start = current * AUDIT_PAGE;
  return {
    rows: rows.slice(start, start + AUDIT_PAGE),
    page: current,
    pageCount,
    from: rows.length === 0 ? 0 : start + 1,
    to: Math.min(rows.length, start + AUDIT_PAGE),
    total: rows.length,
  };
}

/** One line of A.6's Export CSV, with the names and words the page shows. */
export type AuditCsvLine = { entry: AuditEntry; who: string; action: string; object: string };

export const AUDIT_CSV_COLUMNS = [
  "at_utc",
  "at_almaty",
  "actor_kind",
  "who",
  "action",
  "count",
  "what",
  "object",
];

/** A.6's Export CSV: the entries shown, oldest last, with CRLF line ends (as 3.4's events file). */
export function auditCsv(lines: readonly AuditCsvLine[]): string {
  const rows = lines.map(({ entry, who, action, object }) =>
    [entry.at, almatyStamp(entry.at), entry.actor.kind, who, entry.action, entry.count, action, object]
      .map(csvField)
      .join(","),
  );
  return `${[AUDIT_CSV_COLUMNS.join(","), ...rows].join("\r\n")}\r\n`;
}

/** "uki-audit-log-2026-10-12.csv", by the day in Almaty. */
export function auditCsvName(nowMs: number): string {
  return `uki-audit-log-${almatyDay(nowMs)}.csv`;
}
