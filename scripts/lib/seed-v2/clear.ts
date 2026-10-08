// Removing an exam's sessions with everything that hangs off them, in the order the foreign keys need:
// still objects in the private `frames` bucket, then frames rows, events, proctor commands, answers and
// the sessions (help requests, review decisions and reports go with their session). Phase 0's
// `pnpm demo:reset` cleared Mathematics 2 and Physics 1 this way; seed v2 also deletes the exams the
// wizard made, and rebuilds the term.
import { must, ok } from "../cli.ts";
import { listFramesUnder, removeFrames, type UkiClient } from "../supabase.ts";

export interface Cleared {
  stills: number;
  frames: number;
  events: number;
  commands: number;
  answers: number;
  sessions: number;
  simulated: number;
}

export const NOTHING_CLEARED: Cleared = {
  stills: 0,
  frames: 0,
  events: 0,
  commands: 0,
  answers: 0,
  sessions: 0,
  simulated: 0,
};

/** Runs `task` on `items` in slices of `size`, one after another. */
export async function inChunks<T>(
  items: readonly T[],
  size: number,
  task: (chunk: T[]) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += size) await task(items.slice(i, i + size));
}

async function countRows(
  client: UkiClient,
  table: "frames" | "events" | "session_commands",
  examId: string,
): Promise<number> {
  const { count, error } = await client
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("exam_id", examId);
  if (error) throw new Error(`count ${table}: ${error.message}`);
  return count ?? 0;
}

function isSimulated(device: unknown): boolean {
  return (
    typeof device === "object" &&
    device !== null &&
    !Array.isArray(device) &&
    (device as Record<string, unknown>).simulated === true
  );
}

/** Deletes every session of `examId` and its rows (or only counts them with `dryRun`). */
export async function clearExamSessions(
  client: UkiClient,
  examId: string,
  dryRun: boolean,
): Promise<Cleared> {
  const stills = await listFramesUnder(client, examId);
  const sessions: { id: string; device: unknown }[] = [];
  for (let from = 0; ; from += 1000) {
    const page = must(
      await client
        .from("sessions")
        .select("id, device")
        .eq("exam_id", examId)
        .order("id")
        .range(from, from + 999),
      "sessions",
    );
    sessions.push(...page);
    if (page.length < 1000) break;
  }
  const sessionIds = sessions.map((row) => row.id);
  let answers = 0;
  await inChunks(sessionIds, 100, async (chunk) => {
    const { count, error } = await client
      .from("answers")
      .select("*", { count: "exact", head: true })
      .in("session_id", chunk);
    if (error) throw new Error(`count answers: ${error.message}`);
    answers += count ?? 0;
  });
  const cleared: Cleared = {
    stills: stills.length,
    frames: await countRows(client, "frames", examId),
    events: await countRows(client, "events", examId),
    commands: await countRows(client, "session_commands", examId),
    answers,
    sessions: sessionIds.length,
    simulated: sessions.filter((row) => isSimulated(row.device)).length,
  };
  if (dryRun) return cleared;

  await removeFrames(client, stills);
  ok(await client.from("frames").delete().eq("exam_id", examId), "delete frames");
  ok(await client.from("events").delete().eq("exam_id", examId), "delete events");
  ok(await client.from("session_commands").delete().eq("exam_id", examId), "delete session_commands");
  await inChunks(sessionIds, 100, async (chunk) => {
    ok(await client.from("answers").delete().in("session_id", chunk), "delete answers");
  });
  ok(await client.from("sessions").delete().eq("exam_id", examId), "delete sessions");
  return cleared;
}

/** Deletes an exam completely: its sessions as above, then the exam (roster, groups, invites cascade). */
export async function deleteExam(client: UkiClient, examId: string, dryRun: boolean): Promise<Cleared> {
  const cleared = await clearExamSessions(client, examId, dryRun);
  if (!dryRun) {
    ok(await client.from("help_requests").delete().eq("exam_id", examId), "delete help_requests");
    ok(await client.from("exams").delete().eq("id", examId), "delete exam");
  }
  return cleared;
}
