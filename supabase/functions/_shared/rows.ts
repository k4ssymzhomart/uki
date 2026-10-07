// Zod schemas for what the functions read back from Postgres (rows and the internal RPC results in
// supabase/migrations/*_internals.sql), and a parse helper that turns a mismatch into a 500. Pure.
import { z } from "zod";
import { EventReview, IngestSession, Timestamp, Uuid } from "./contracts/index.ts";
import { ApiFailure, summarizeIssues } from "./errors.ts";

/** `sessions` columns the owner check reads. */
export const SessionOwnerRow = z.object({ id: Uuid, exam_id: Uuid, auth_uid: Uuid });
export type SessionOwnerRow = z.infer<typeof SessionOwnerRow>;

/** `events` columns the frames and stills functions read. */
export const EventRow = z.object({
  id: Uuid,
  session_id: Uuid,
  exam_id: Uuid,
  review: EventReview,
  frame_count: z.number().int().min(0).max(3),
});
export type EventRow = z.infer<typeof EventRow>;

/** `frames` columns the stills function reads. */
export const FrameRow = z.object({ id: Uuid, storage_path: z.string().min(1), captured_at: Timestamp });
export type FrameRow = z.infer<typeof FrameRow>;

export const ExamWorkspaceRow = z.object({ workspace_id: Uuid });

/** Result of `ingest_batch(p_session_id, p_events, p_status)`. */
export const IngestBatchResult = z.object({
  accepted: z.array(Uuid),
  duplicates: z.array(Uuid),
  uploads: z.array(
    z.object({
      event_id: Uuid,
      exam_id: Uuid,
      session_id: Uuid,
      frame_count: z.number().int().min(1).max(3),
      confirmed: z.number().int().nonnegative(),
      missing: z.array(z.number().int().min(0).max(2)),
    }),
  ),
  session: IngestSession,
  server_time: Timestamp,
});
export type IngestBatchResult = z.infer<typeof IngestBatchResult>;

/** Result of `confirm_frames` and `issue_command`. */
export const UuidList = z.array(Uuid);

/** Parses a database result; a mismatch means the schema and the migrations disagree, so 500. */
export function parseRow<S extends z.ZodType>(schema: S, value: unknown, context: string): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiFailure(
      "internal",
      `${context} returned an unexpected shape: ${summarizeIssues(result.error.issues)}`,
    );
  }
  return result.data;
}
