// What a signed-in staff client can read of one exam under row-level security: row counts per table,
// and whether Realtime lets it join the exam's private channel.
import { examTopic } from "../../packages/contracts/src/index.ts";
import { type ChannelProbe, probeChannel } from "./realtime.ts";
import type { UkiClient } from "./supabase.ts";

export type ExamRowCounts = Record<
  | "exams"
  | "exam_overview"
  | "exam_groups"
  | "exam_students"
  | "proctor_assignments"
  | "sessions"
  | "events"
  | "frames"
  | "session_commands",
  number
>;

function count(result: { count: number | null; error: { message: string } | null }, table: string): number {
  if (result.error) throw new Error(`e2e: counting ${table} failed: ${result.error.message}`);
  return result.count ?? 0;
}

export async function examRowCounts(client: UkiClient, examId: string): Promise<ExamRowCounts> {
  const head = { count: "exact", head: true } as const;
  const [exams, overview, groups, roster, assignments, sessions, events, frames, commands] =
    await Promise.all([
      client.from("exams").select("id", head).eq("id", examId),
      client.from("exam_overview").select("id", head).eq("id", examId),
      client.from("exam_groups").select("exam_id", head).eq("exam_id", examId),
      client.from("exam_students").select("exam_id", head).eq("exam_id", examId),
      client.from("proctor_assignments").select("exam_id", head).eq("exam_id", examId),
      client.from("sessions").select("id", head).eq("exam_id", examId),
      client.from("events").select("id", head).eq("exam_id", examId),
      client.from("frames").select("id", head).eq("exam_id", examId),
      client.from("session_commands").select("id", head).eq("exam_id", examId),
    ]);
  return {
    exams: count(exams, "exams"),
    exam_overview: count(overview, "exam_overview"),
    exam_groups: count(groups, "exam_groups"),
    exam_students: count(roster, "exam_students"),
    proctor_assignments: count(assignments, "proctor_assignments"),
    sessions: count(sessions, "sessions"),
    events: count(events, "events"),
    frames: count(frames, "frames"),
    session_commands: count(commands, "session_commands"),
  };
}

export function examChannel(client: UkiClient, examId: string, timeoutMs?: number): Promise<ChannelProbe> {
  return probeChannel(client, examTopic(examId), timeoutMs);
}
