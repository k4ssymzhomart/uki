// The privacy centre's reads (A.5, A.5a, A.5b) and the audit log's (A.6), under the caller's row-level
// security, which shows data requests and the audit log to the exam office of the workspace only. Each
// page view writes its audit row before it reads (CLAUDE.md: every read of student data by staff writes
// an audit_log row): `privacy_centre.read` for A.5, `data_request.read` with the student's id when a
// request's drawer opens, `audit.read` for A.6. A failed audit write fails the page. Rows are parsed
// with Zod.
import { type DataRequestKind, Device, type WorkspaceSettings } from "@uki/contracts";
import { z } from "zod";
import { loadWorkspaceSettings } from "../settings/settings-data.ts";
import { parseRows } from "../students/student-profile-model.ts";
import { auditRead } from "../students/students-data.ts";
import { termKey } from "../students/students-model.ts";
import type { AnyClient } from "../wall/queries.ts";
import {
  AUDIT_COLUMNS,
  AUDIT_LIMIT,
  AUDIT_TAB_ACTIONS,
  type AuditEntry,
  type AuditFilters,
  type AuditNames,
  AuditRow,
  auditEntries,
  auditIds,
  type DrawerTarget,
  newRequestDue,
  nextCleanup,
  REQUEST_COLUMNS,
  type RequestCounts,
  RequestRow,
  rangeStart,
} from "./privacy-model.ts";

/** Ids per `in.(...)` filter, so a request line stays short. */
const ID_CHUNK = 100;
/** A.5's Recent access shows this many entries. */
export const RECENT_ACCESS = 3;
/** The privacy centre's own reads, left out of Recent access (A.6 lists them). */
const OWN_READS = ["privacy_centre.read", "data_request.read", "audit.read"] as const;

type Result = { data: unknown; error: { message: string } | null };

function rowsOf(result: Result, what: string): unknown[] {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return Array.isArray(result.data) ? result.data : [];
}

async function byChunks(
  ids: readonly string[],
  what: string,
  query: (chunk: string[]) => PromiseLike<Result>,
): Promise<unknown[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) chunks.push(ids.slice(i, i + ID_CHUNK));
  const results = await Promise.all(chunks.map((chunk) => query(chunk)));
  return results.flatMap((result) => rowsOf(result, what));
}

/** `count: exact, head: true` answers; an error throws. */
function countOf(result: { count: number | null; error: { message: string } | null }, what: string): number {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.count ?? 0;
}

// ---------------------------------------------------------------------------------------------------
// Names behind the audit rows
// ---------------------------------------------------------------------------------------------------

const Named = z.object({ id: z.string(), full_name: z.string() });
const StudentUserRow = z.object({ auth_uid: z.string(), students: z.object({ full_name: z.string() }) });
const SessionNameRow = z.object({
  id: z.string(),
  students: z.object({ full_name: z.string() }),
  exams: z.object({ title: z.string() }),
});
const ExamNameRow = z.object({ id: z.string(), title: z.string(), kind: z.string() });
const ReportCodeRow = z.object({ id: z.string(), verify_code: z.string() });

/** Staff, students, sessions, exams and reports the rows name; what RLS hides stays unnamed. */
export async function loadAuditNames(client: AnyClient, rows: readonly AuditRow[]): Promise<AuditNames> {
  const ids = auditIds(rows);
  const [staff, studentUsers, students, sessions, exams, reports] = await Promise.all([
    byChunks(ids.staff, "staff", (chunk) => client.from("staff").select("id, full_name").in("id", chunk)),
    byChunks(ids.studentUsers, "sessions", (chunk) =>
      client.from("sessions").select("auth_uid, students(full_name)").in("auth_uid", chunk),
    ),
    byChunks(ids.students, "students", (chunk) =>
      client.from("students").select("id, full_name").in("id", chunk),
    ),
    byChunks(ids.sessions, "sessions", (chunk) =>
      client.from("sessions").select("id, students(full_name), exams(title)").in("id", chunk),
    ),
    byChunks(ids.exams, "exams", (chunk) => client.from("exams").select("id, title, kind").in("id", chunk)),
    byChunks(ids.reports, "reports", (chunk) =>
      client.from("reports").select("id, verify_code").in("id", chunk),
    ),
  ]);
  return {
    staff: Object.fromEntries(parseRows(Named, staff).map((row) => [row.id, row.full_name])),
    studentUsers: Object.fromEntries(
      parseRows(StudentUserRow, studentUsers).map((row) => [row.auth_uid, row.students.full_name]),
    ),
    students: Object.fromEntries(parseRows(Named, students).map((row) => [row.id, row.full_name])),
    sessions: Object.fromEntries(
      parseRows(SessionNameRow, sessions).map((row) => [
        row.id,
        { student: row.students.full_name, exam: row.exams.title },
      ]),
    ),
    exams: Object.fromEntries(
      parseRows(ExamNameRow, exams).map((row) => [row.id, { title: row.title, kind: row.kind }]),
    ),
    reports: Object.fromEntries(parseRows(ReportCodeRow, reports).map((row) => [row.id, row.verify_code])),
  };
}

// ---------------------------------------------------------------------------------------------------
// A.5 Privacy centre
// ---------------------------------------------------------------------------------------------------

export type PrivacyCentreData = {
  workspaceId: string;
  settings: WorkspaceSettings;
  /** Sessions this term, for "N sessions checked on device". */
  sessionsThisTerm: number;
  /** The next nightly run and how many kept stills it will delete. */
  cleanup: { at: string; frames: number };
  requests: RequestRow[];
  recent: AuditEntry[];
};

const KpiRow = z.object({ sessions: z.number().int().nonnegative() });

/** A.5: the requests, the retention rule and its next run, the term's sessions and the latest access. */
export async function loadPrivacyCentre(client: AnyClient, nowMs: number): Promise<PrivacyCentreData> {
  await auditRead(client, { action: "privacy_centre.read", object_type: "data_request" });
  const [workspace, requests, kpi, recentRows] = await Promise.all([
    loadWorkspaceSettings(client),
    client
      .from("data_requests")
      .select(REQUEST_COLUMNS)
      .order("received_at", { ascending: false })
      .limit(200),
    client
      .from("term_kpis")
      .select("sessions")
      .eq("term", termKey(nowMs))
      .eq("all_faculties", true)
      .maybeSingle(),
    client
      .from("audit_log")
      .select(AUDIT_COLUMNS)
      .not("action", "in", `(${OWN_READS.join(",")})`)
      .order("at", { ascending: false })
      .order("id", { ascending: false })
      .limit(30),
  ]);
  const cleanup = nextCleanup(nowMs, workspace.settings.retention_days);
  const due = await client
    .from("frames")
    .select("id", { count: "exact", head: true })
    .lt("captured_at", cleanup.cutoff.toISOString());
  if (kpi.error) throw new Error(`term_kpis: ${kpi.error.message}`);
  const audit = parseRows(AuditRow, rowsOf(recentRows, "audit_log"));
  const names = await loadAuditNames(client, audit);
  return {
    workspaceId: workspace.id,
    settings: workspace.settings,
    sessionsThisTerm: KpiRow.safeParse(kpi.data).data?.sessions ?? 0,
    cleanup: { at: cleanup.at.toISOString(), frames: countOf(due, "frames") },
    requests: parseRows(RequestRow, rowsOf(requests, "data_requests")),
    recent: auditEntries(audit, names).slice(0, RECENT_ACCESS),
  };
}

// ---------------------------------------------------------------------------------------------------
// A.5a and A.5b: one request's drawer
// ---------------------------------------------------------------------------------------------------

export type RequestDetail = {
  target: DrawerTarget;
  kind: z.infer<typeof DataRequestKind>;
  /** Null for a new request, not saved until the exam office acts on it. */
  request: RequestRow | null;
  student: { id: string; full_name: string; student_number: string };
  receivedAt: string;
  dueAt: string;
  /** Who answered the request, when it is answered. */
  doneBy: string | null;
  counts: RequestCounts;
};

const StudentRow = z.object({ id: z.string(), full_name: z.string(), student_number: z.string() });
const RequestStudent = z.object({ id: z.string(), student_id: z.string() });
const DetailSession = z.object({
  id: z.string(),
  exam_id: z.string(),
  device: z.unknown(),
  identity_score: z.number().nullable(),
  rules_accepted_at: z.string().nullable(),
  receipt_id: z.string().nullable(),
  last_seen_at: z.string().nullable(),
  joined_at: z.string().nullable(),
});
const ReportCode = z.object({ verify_code: z.string() });

/** Counts what Üki keeps about the student, per session, under RLS. */
async function requestCounts(client: AnyClient, studentId: string): Promise<RequestCounts> {
  const sessions = parseRows(
    DetailSession,
    rowsOf(
      await client
        .from("sessions")
        .select("id, exam_id, device, identity_score, rules_accepted_at, receipt_id, last_seen_at, joined_at")
        .eq("student_id", studentId)
        .limit(1000),
      "sessions",
    ),
  );
  const ids = sessions.map((session) => session.id);
  const perSession = await Promise.all(
    sessions.map(async (session) => {
      const [frames, events, flags] = await Promise.all([
        client.from("frames").select("id", { count: "exact", head: true }).eq("session_id", session.id),
        client.from("events").select("id", { count: "exact", head: true }).eq("session_id", session.id),
        client
          .from("events")
          .select("id", { count: "exact", head: true })
          .eq("session_id", session.id)
          .eq("review", "flag"),
      ]);
      return {
        frames: countOf(frames, "frames"),
        events: countOf(events, "events"),
        flags: countOf(flags, "events"),
      };
    }),
  );
  const reports = parseRows(
    ReportCode,
    await byChunks(ids, "reports", (chunk) =>
      client.from("reports").select("verify_code").in("session_id", chunk),
    ),
  );
  const devices = sessions
    .map((session) => ({ session, device: Device.safeParse(session.device) }))
    .filter((entry) => entry.device.success);
  const laptops = new Set(devices.map(({ device }) => `${device.data?.os}|${device.data?.app_version}`));
  const latest = [...devices].sort(
    (a, b) =>
      Date.parse(b.session.last_seen_at ?? b.session.joined_at ?? "") -
      Date.parse(a.session.last_seen_at ?? a.session.joined_at ?? ""),
  )[0];
  const sum = (key: "frames" | "events" | "flags") => perSession.reduce((total, row) => total + row[key], 0);
  const withAny = (key: "frames" | "events") => perSession.filter((row) => row[key] > 0).length;
  return {
    exams: sessions.length,
    frames: sum("frames"),
    frameExams: withAny("frames"),
    events: sum("events"),
    eventExams: withAny("events"),
    flags: sum("flags"),
    identityScores: sessions.filter((session) => session.identity_score !== null).length,
    devices: devices.length,
    laptops: laptops.size,
    appVersion: latest?.device.data?.app_version ?? null,
    consents: sessions.filter((session) => session.rules_accepted_at !== null).length,
    receipts: sessions.filter((session) => session.receipt_id !== null).length,
    reports: reports.map((report) => report.verify_code).sort(),
  };
}

/**
 * A request's drawer: the request (or, for a new one from A.3, the student and the dates it will get)
 * and what Üki keeps about the student. Null when the request or the student is not one the caller may
 * see. One `data_request.read` audit row with the student's id, written before the student's data is read.
 */
export async function loadRequestDetail(
  client: AnyClient,
  target: DrawerTarget,
  nowMs: number,
): Promise<RequestDetail | null> {
  let studentId: string;
  if (target.type === "request") {
    const found = await client
      .from("data_requests")
      .select("id, student_id")
      .eq("id", target.requestId)
      .maybeSingle();
    if (found.error) throw new Error(`data_requests: ${found.error.message}`);
    const parsed = RequestStudent.safeParse(found.data);
    if (!parsed.success) return null;
    studentId = parsed.data.student_id;
  } else {
    studentId = target.studentId;
  }
  const visible = await client.from("students").select("id").eq("id", studentId).maybeSingle();
  if (visible.error) throw new Error(`students: ${visible.error.message}`);
  if (visible.data === null) return null;

  await auditRead(client, { action: "data_request.read", object_type: "student", object_id: studentId });
  const [student, request, counts] = await Promise.all([
    client.from("students").select("id, full_name, student_number").eq("id", studentId).single(),
    target.type === "request"
      ? client.from("data_requests").select(REQUEST_COLUMNS).eq("id", target.requestId).single()
      : Promise.resolve({ data: null, error: null }),
    requestCounts(client, studentId),
  ]);
  if (student.error) throw new Error(`students: ${student.error.message}`);
  if (request.error) throw new Error(`data_requests: ${request.error.message}`);
  const row = request.data === null ? null : RequestRow.parse(request.data);
  let doneBy: string | null = null;
  if (row?.done_by) {
    const staff = await client.from("staff").select("full_name").eq("id", row.done_by).maybeSingle();
    doneBy = z.object({ full_name: z.string() }).safeParse(staff.data).data?.full_name ?? null;
  }
  const now = new Date(nowMs).toISOString();
  return {
    target,
    kind: row?.kind ?? (target.type === "new" ? target.kind : "delete"),
    request: row,
    student: StudentRow.parse(student.data),
    receivedAt: row?.received_at ?? now,
    dueAt: row?.due_at ?? newRequestDue(nowMs),
    doneBy,
    counts,
  };
}

// ---------------------------------------------------------------------------------------------------
// A.6 Audit log
// ---------------------------------------------------------------------------------------------------

export type AuditLogData = {
  entries: AuditEntry[];
  /** True when the range and tab hold more than AUDIT_LIMIT rows, so the oldest are not shown. */
  truncated: boolean;
};

/** A.6: the audit log of the chosen range and tab, newest first, with the names it refers to. */
export async function loadAuditLog(
  client: AnyClient,
  filters: Pick<AuditFilters, "tab" | "range">,
  nowMs: number,
): Promise<AuditLogData> {
  await auditRead(client, { action: "audit.read", object_type: "workspace" });
  let query = client
    .from("audit_log")
    .select(AUDIT_COLUMNS)
    .gte("at", rangeStart(filters.range, nowMs).toISOString());
  if (filters.tab !== "all") query = query.in("action", [...AUDIT_TAB_ACTIONS[filters.tab]]);
  const result = await query
    .order("at", { ascending: false })
    .order("id", { ascending: false })
    .limit(AUDIT_LIMIT + 1);
  const rows = parseRows(AuditRow, rowsOf(result, "audit_log"));
  const shown = rows.slice(0, AUDIT_LIMIT);
  const names = await loadAuditNames(client, shown);
  return { entries: auditEntries(shown, names), truncated: rows.length > AUDIT_LIMIT };
}
