// The lead proctor's side of the run: Start exam (the start_exam RPC, which writes a start command for
// every session in the lobby) and the command Edge Function for pause, resume, message, add_time and
// end, exactly as the dashboard calls them.
import { CommandRequest, CommandResponse, StartExamOutput } from "@uki/contracts";
import { admin, type Fixture } from "./fixture.ts";

export interface Issued {
  /** Laptop time just before the request left (the same clock as the app's). */
  sentAt: number;
  /** When the reply came back. */
  answeredAt: number;
}

export async function startExam(fixture: Fixture): Promise<Issued & { startsAt: string }> {
  const sentAt = Date.now();
  const { data, error } = await fixture.lead.client.rpc("start_exam", { exam_id: fixture.examId });
  const answeredAt = Date.now();
  if (error) throw new Error(`start_exam: ${error.message}`);
  return { sentAt, answeredAt, startsAt: StartExamOutput.parse(data).starts_at };
}

/** Statuses the dashboard shows as "try again": the shared local stack under load answers these. */
const RETRYABLE = new Set([500, 502, 503, 504]);

/**
 * POST /functions/v1/command as the lead proctor; the body is checked against the contract first. A
 * 5xx (a statement timeout while other runs load the shared stack) wrote no command, so it is sent
 * again, as a proctor would; the times are those of the attempt that worked, and `attempts` says how
 * many it took.
 */
export async function command(
  fixture: Fixture,
  body: unknown,
): Promise<Issued & { ids: string[]; attempts: number }> {
  const request = CommandRequest.parse(body);
  for (let attempt = 1; ; attempt += 1) {
    const result = await commandOnce(fixture, request);
    if (result.ok) return { ...result.issued, attempts: attempt };
    if (!RETRYABLE.has(result.status) || attempt >= 3) {
      throw new Error(`command ${request.type}: HTTP ${result.status} ${result.text}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

async function commandOnce(
  fixture: Fixture,
  request: CommandRequest,
): Promise<{ ok: true; issued: Issued & { ids: string[] } } | { ok: false; status: number; text: string }> {
  const sentAt = Date.now();
  const response = await fetch(`${fixture.stack.apiUrl}/functions/v1/command`, {
    method: "POST",
    headers: {
      apikey: fixture.stack.publishableKey,
      authorization: `Bearer ${fixture.lead.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(request),
  });
  const text = await response.text();
  const answeredAt = Date.now();
  if (!response.ok) return { ok: false, status: response.status, text };
  return {
    ok: true,
    issued: { sentAt, answeredAt, ids: CommandResponse.parse(JSON.parse(text)).command_ids },
  };
}

/** The student's session row, read with the secret key. */
export async function sessionOf(fixture: Fixture, studentNumber: string) {
  const db = admin(fixture.stack);
  const student = await db
    .from("students")
    .select("id")
    .eq("workspace_id", fixture.workspaceId)
    .eq("student_number", studentNumber)
    .single();
  if (student.error) throw new Error(`student ${studentNumber}: ${student.error.message}`);
  const session = await db
    .from("sessions")
    .select("id, state, receipt_id, extra_min, paused_s, time_used_s, end_reason")
    .eq("exam_id", fixture.examId)
    .eq("student_id", student.data.id)
    .maybeSingle();
  if (session.error) throw new Error(`session of ${studentNumber}: ${session.error.message}`);
  return session.data;
}

/** Answers and events the server holds for a session. */
export async function serverRecord(fixture: Fixture, sessionId: string) {
  const db = admin(fixture.stack);
  const [answers, events] = await Promise.all([
    db.from("answers").select("question_id, choice_id, saved_at").eq("session_id", sessionId),
    db.from("events").select("id, type, source, review, seq, data, frame_count").eq("session_id", sessionId),
  ]);
  if (answers.error) throw new Error(`answers: ${answers.error.message}`);
  if (events.error) throw new Error(`events: ${events.error.message}`);
  return { answers: answers.data, events: events.data };
}

/** Stills the server confirmed for an event (rows in `frames`, each with its Storage path). */
export async function framesOf(fixture: Fixture, eventId: string) {
  const { data, error } = await admin(fixture.stack)
    .from("frames")
    .select("id, storage_path, captured_at")
    .eq("event_id", eventId);
  if (error) throw new Error(`frames: ${error.message}`);
  return data;
}
