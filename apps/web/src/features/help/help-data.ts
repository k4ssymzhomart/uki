// 2.4d's reads and writes under the caller's RLS: the exam's open help requests with the student's
// name, whether the caller may answer them (a proctor of the exam; the exam office only reads), and
// close_help_request for Reply and Mark done. Rows and replies are parsed with Zod.
import {
  type ApiErrorCode,
  CloseHelpRequestInput,
  CloseHelpRequestOutput,
  HelpRequest,
  HelpTopic,
  matchErrorCode,
  Timestamp,
  Uuid,
} from "@uki/contracts";
import { z } from "zod";
import type { AnyClient } from "../wall/queries.ts";

/** `help_requests` columns with the session's student, as PostgREST embeds them. */
export const HELP_COLUMNS =
  "id, session_id, exam_id, topic, text, created_at, reply, done_at, done_by, sessions(student_id, students(full_name))";

const HelpRow = z.object({
  id: Uuid,
  session_id: Uuid,
  exam_id: Uuid,
  topic: HelpTopic.catch("technical"),
  text: z.string().nullable(),
  created_at: Timestamp,
  reply: z.string().nullable(),
  done_at: Timestamp.nullable(),
  done_by: Uuid.nullable(),
  sessions: z.object({ student_id: Uuid, students: z.object({ full_name: z.string() }) }),
});

/** A row as HelpRequest (the `help` broadcast's shape); null when it does not parse. */
export function helpFromRow(row: unknown): HelpRequest | null {
  const parsed = HelpRow.safeParse(row);
  if (!parsed.success) return null;
  const { sessions, ...rest } = parsed.data;
  const request = HelpRequest.safeParse({
    ...rest,
    student_id: sessions.student_id,
    student_name: sessions.students.full_name,
  });
  return request.success ? request.data : null;
}

/** The exam's open requests, oldest first; null when the read failed (the next catch-up asks again). */
export async function fetchOpenHelp(client: AnyClient, examId: string): Promise<HelpRequest[] | null> {
  const { data, error } = await client
    .from("help_requests")
    .select(HELP_COLUMNS)
    .eq("exam_id", examId)
    .is("done_at", null)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error || data === null) return null;
  return data.map(helpFromRow).filter((request): request is HelpRequest => request !== null);
}

export interface HelpInitialData {
  requests: HelpRequest[];
  /** Reply and Mark done are for the exam's proctors (close_help_request); the exam office reads. */
  canAnswer: boolean;
}

/**
 * The server render's 2.4d: the open requests and whether the signed-in staff member proctors the
 * exam. Reading the students' requests is a read of student data, so it writes one audit row
 * (`help.read` on the exam) whenever there is something to read.
 */
export async function loadHelp(client: AnyClient, examId: string, staffId: string): Promise<HelpInitialData> {
  const [read, assignment] = await Promise.all([
    fetchOpenHelp(client, examId),
    client
      .from("proctor_assignments")
      .select("staff_id")
      .eq("exam_id", examId)
      .eq("staff_id", staffId)
      .maybeSingle(),
  ]);
  const requests = read ?? [];
  if (requests.length > 0) {
    await client.rpc("audit_read", { action: "help.read", object_type: "exam", object_id: examId });
  }
  return { requests, canAnswer: assignment.error === null && assignment.data !== null };
}

export type CloseHelpResult =
  | { ok: true; request: CloseHelpRequestOutput }
  | { ok: false; code: ApiErrorCode };

const CLOSE_ERRORS = ["forbidden", "not_found", "bad_request"] as const;

/** Reply (with `reply`) or Mark done (without) through close_help_request. */
export async function closeHelpRequest(
  client: AnyClient,
  input: CloseHelpRequestInput,
): Promise<CloseHelpResult> {
  const checked = CloseHelpRequestInput.safeParse(input);
  if (!checked.success) return { ok: false, code: "bad_request" };
  const args = checked.data.reply === undefined ? { id: checked.data.id } : checked.data;
  let result: { data: unknown; error: unknown };
  try {
    result = await client.rpc("close_help_request", args);
  } catch {
    return { ok: false, code: "internal" };
  }
  if (result.error) return { ok: false, code: matchErrorCode(result.error, CLOSE_ERRORS) ?? "internal" };
  const parsed = CloseHelpRequestOutput.safeParse(result.data);
  return parsed.success ? { ok: true, request: parsed.data } : { ok: false, code: "internal" };
}
