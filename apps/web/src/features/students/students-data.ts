// A.2 and A.3 reads under the caller's row-level security, each with its audit row: the plan says every
// read of student data by staff writes an `audit_log` row, so the list writes `students.list` and a
// profile `student.read` (through `audit_read`, WP 1.1) before anything is shown. A failed audit write
// fails the page rather than showing data without its row. Rows are parsed with Zod.
import { AuditReadInput, DEFAULT_WORKSPACE_SETTINGS, Locale, WorkspaceSettings } from "@uki/contracts";
import { z } from "zod";
import type { AnyClient } from "../wall/queries.ts";
import {
  PROFILE_SESSION_COLUMNS,
  ProfileDecision,
  ProfileFlag,
  ProfileFrame,
  ProfileSession,
  parseRows,
} from "./student-profile-model.ts";
import { parseStudentRows, STUDENT_COLUMNS, StudentRow, termKey } from "./students-model.ts";

/** PostgREST answers at most this many rows per request (supabase/config.toml max_rows). */
const PAGE_ROWS = 1000;
/** A workspace larger than this many students is cut off rather than stalling the page. */
const MAX_PAGES = 20;
/** Ids per `in.(...)` filter, so a request line stays short. */
const ID_CHUNK = 150;

type Result = { data: unknown; error: { message: string } | null };

function rowsOf(result: Result, what: string): unknown[] {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return Array.isArray(result.data) ? result.data : [];
}

/** Every row of a query, page by page; an error throws. */
async function allPages(what: string, query: (from: number, to: number) => PromiseLike<Result>) {
  const rows: unknown[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_ROWS;
    const data = rowsOf(await query(from, from + PAGE_ROWS - 1), what);
    rows.push(...data);
    if (data.length < PAGE_ROWS) break;
  }
  return rows;
}

/** Runs one read per chunk of ids and joins the rows. */
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

/** Writes the audit row of a read; throws when it cannot be written. */
export async function auditRead(client: AnyClient, input: AuditReadInput): Promise<void> {
  const args = AuditReadInput.parse(input);
  const { error } = await client.rpc("audit_read", args);
  if (error) throw new Error(`audit_read ${args.action}: ${error.message}`);
}

export type StudentsData = {
  rows: StudentRow[];
  /** Ids of the students with a flag in an exam of the current term (A.2 "Flagged this term"). */
  flaggedThisTerm: string[];
};

/**
 * A.2: the workspace's students (within the faculty chosen in the workspace menu, 0.1c, when there is
 * one) from `student_overview`, and who was flagged this term, from `term_sessions` (the views A.1 also
 * reads). One `students.list` audit row per page view.
 */
export async function loadStudents(
  client: AnyClient,
  facultyId: string | null,
  nowMs: number,
): Promise<StudentsData> {
  await auditRead(client, { action: "students.list", object_type: "student" });
  const rows = parseStudentRows(
    await allPages("student_overview", (from, to) => {
      let query = client.from("student_overview").select(STUDENT_COLUMNS);
      if (facultyId !== null) query = query.eq("faculty_id", facultyId);
      return query.order("id").range(from, to);
    }),
  );
  const termSessions = await allPages("term_sessions", (from, to) =>
    client
      .from("term_sessions")
      .select("session_id")
      .eq("term", termKey(nowMs))
      .gt("flags", 0)
      .order("session_id")
      .range(from, to),
  );
  const sessionIds = parseRows(z.object({ session_id: z.string() }), termSessions).map(
    (row) => row.session_id,
  );
  const owners = await byChunks(sessionIds, "sessions", (chunk) =>
    client.from("sessions").select("student_id").in("id", chunk),
  );
  const flagged = new Set(
    parseRows(z.object({ student_id: z.string() }), owners).map((row) => row.student_id),
  );
  return { rows, flaggedThisTerm: rows.filter((row) => flagged.has(row.id)).map((row) => row.id) };
}

/** A.3's student with the extra columns the profile shows. */
export const ProfileStudent = StudentRow.extend({ locale: Locale });
export type ProfileStudent = z.infer<typeof ProfileStudent>;

export type StudentProfileData = {
  student: ProfileStudent;
  sessions: ProfileSession[];
  flags: ProfileFlag[];
  decisions: ProfileDecision[];
  frames: ProfileFrame[];
  /** The workspace's `retention_days` (A.4), for when kept stills are deleted. */
  retentionDays: number;
};

/**
 * A.3: one student with their sessions (and each session's exam), flag events, decisions and kept
 * stills, and the workspace's retention. Null when the student is not one the staff member may see.
 * One `student.read` audit row per page view, written before the read.
 */
export async function loadStudentProfile(
  client: AnyClient,
  studentId: string,
): Promise<StudentProfileData | null> {
  await auditRead(client, { action: "student.read", object_type: "student", object_id: studentId });
  const [studentResult, sessionsResult, workspaceResult] = await Promise.all([
    client.from("student_overview").select(`${STUDENT_COLUMNS}, locale`).eq("id", studentId).maybeSingle(),
    client.from("sessions").select(PROFILE_SESSION_COLUMNS).eq("student_id", studentId).limit(PAGE_ROWS),
    client.from("workspaces").select("settings").limit(1).maybeSingle(),
  ]);
  if (studentResult.error) throw new Error(`student_overview: ${studentResult.error.message}`);
  const student = ProfileStudent.safeParse(studentResult.data);
  if (!student.success) return null;
  const sessions = parseRows(ProfileSession, rowsOf(sessionsResult, "sessions"));
  if (workspaceResult.error) throw new Error(`workspaces: ${workspaceResult.error.message}`);
  const settings = WorkspaceSettings.safeParse(
    (workspaceResult.data as { settings?: unknown } | null)?.settings,
  );
  const ids = sessions.map((session) => session.id);
  const [flags, decisions, frames] = await Promise.all([
    byChunks(ids, "events", (chunk) =>
      client.from("events").select("session_id, received_at").eq("review", "flag").in("session_id", chunk),
    ),
    byChunks(ids, "review_decisions", (chunk) =>
      client.from("review_decisions").select("session_id, decision, decided_at").in("session_id", chunk),
    ),
    byChunks(ids, "frames", (chunk) =>
      client.from("frames").select("session_id, captured_at").in("session_id", chunk),
    ),
  ]);
  return {
    student: student.data,
    sessions,
    flags: parseRows(ProfileFlag, flags),
    decisions: parseRows(ProfileDecision, decisions),
    frames: parseRows(ProfileFrame, frames),
    retentionDays: settings.success
      ? settings.data.retention_days
      : DEFAULT_WORKSPACE_SETTINGS.retention_days,
  };
}
