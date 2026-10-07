// A student as the desktop app plays one: an anonymous sign-in, join_exam with the exam code and the
// student number, then events through the `ingest` Edge Function with the student's own token. Every
// envelope is checked against the contracts before it is sent.
import {
  ClientEventEnvelope,
  type EventData,
  type EventType,
  IngestRequest,
  IngestResponse,
  type IngestStatus,
  JoinExamOutput,
  uuidv7,
} from "../../packages/contracts/src/index.ts";
import { anonymousClient, callFunction, type UkiClient } from "./supabase.ts";

export const E2E_APP_VERSION = "0.0.0-e2e";

export interface JoinedStudent {
  uid: string;
  token: string;
  client: UkiClient;
  sessionId: string;
  studentId: string;
  number: string;
  fullName: string;
  /** Last envelope seq sent; ingest wants it to grow by one per event. */
  seq: number;
}

/** Anonymous sign-in plus join_exam, as 1.1 does. */
export async function joinExam(code: string, studentNumber: string): Promise<JoinedStudent> {
  const { client, userId, token } = await anonymousClient();
  const { data, error } = await client.rpc("join_exam", {
    code,
    student_number: studentNumber,
    locale: "kk",
    device: { os: "macos", app_version: E2E_APP_VERSION },
  });
  if (error) {
    await client.auth.signOut().catch(() => undefined);
    throw Object.assign(new Error(`e2e: join_exam ${code} ${studentNumber}: ${error.message}`), {
      uid: userId,
    });
  }
  const joined = JoinExamOutput.parse(data);
  return {
    uid: userId,
    token,
    client,
    sessionId: joined.session.id,
    studentId: joined.student.id,
    number: joined.student.student_number,
    fullName: joined.student.full_name,
    seq: 0,
  };
}

export interface Draft<T extends EventType = EventType> {
  type: T;
  data: EventData<T>;
  /** The laptop's clock when the event happened; defaults to now. */
  atMs?: number;
}

export function draft<T extends EventType>(type: T, data: EventData<T>, atMs?: number): Draft<T> {
  return atMs === undefined ? { type, data } : { type, data, atMs };
}

export interface SentEvent {
  id: string;
  type: EventType;
  /** Epoch ms of the envelope's `at`. */
  atMs: number;
}

/**
 * One ingest call with `drafts` (possibly none, as a heartbeat) and an optional status. Retries on a
 * gateway failure with the same event ids, so a resend is stored once. Throws on any other failure.
 */
export async function ingest(
  student: JoinedStudent,
  drafts: readonly Draft[],
  status?: IngestStatus,
): Promise<{ sent: SentEvent[]; response: IngestResponse }> {
  const envelopes = drafts.map((d) => {
    student.seq += 1;
    const atMs = d.atMs ?? Date.now();
    return ClientEventEnvelope.parse({
      id: uuidv7(atMs),
      session_id: student.sessionId,
      type: d.type,
      source: "app",
      at: new Date(atMs).toISOString(),
      seq: student.seq,
      data: d.data,
      frame_count: 0,
      app_version: E2E_APP_VERSION,
    });
  });
  const request = IngestRequest.parse({
    session_id: student.sessionId,
    events: envelopes,
    ...(status === undefined ? {} : { status }),
  });
  const reply = await callFunction("ingest", request, student.token, { retries: 3 });
  if (reply.status !== 200) {
    throw new Error(`e2e: ingest answered ${reply.status}: ${JSON.stringify(reply.body)}`);
  }
  return {
    sent: envelopes.map((e) => ({ id: e.id, type: e.type, atMs: Date.parse(e.at) })),
    response: IngestResponse.parse(reply.body),
  };
}
