// Zod schemas for the rows the wall reads through PostgREST under RLS. Every row is parsed before it
// reaches the store; a row that does not parse is dropped, never trusted.
import {
  CompactEvent,
  DesktopOs,
  Locale,
  SessionState,
  SessionStatus,
  Timestamp,
  Uuid,
} from "@uki/contracts";
import { z } from "zod";

/** `sessions` columns the wall needs. */
export const SESSION_COLUMNS =
  "id, student_id, state, status, last_seen_at, joined_at, started_at, extra_min, paused_s, device, locale";

/** `events` columns, in CompactEvent's shape. */
export const EVENT_COLUMNS =
  "id, session_id, exam_id, type, source, review, at, received_at, data, frame_count";

/** `sessions.device`: only the OS matters here; the rest of the JSON is ignored. */
export const SessionDevice = z.object({ os: DesktopOs.optional().catch(undefined) }).catch({ os: undefined });
export type SessionDevice = z.infer<typeof SessionDevice>;

/** `sessions.status` may be `{}` or hold stale keys; anything unreadable counts as no status. */
const LooseStatus = SessionStatus.nullable().catch(null);

export const SessionRow = z.object({
  id: Uuid,
  student_id: Uuid,
  state: SessionState,
  status: LooseStatus,
  last_seen_at: Timestamp.nullable(),
  joined_at: Timestamp.nullable(),
  started_at: Timestamp.nullable(),
  extra_min: z.number().int().nonnegative(),
  paused_s: z.number().int().nonnegative(),
  device: SessionDevice,
  locale: Locale,
});
export type SessionRow = z.infer<typeof SessionRow>;

/** `exam_students` with the embedded student. */
export const RosterRow = z.object({
  seat: z.number().int().nullable(),
  students: z.object({ id: Uuid, full_name: z.string().min(1), student_number: z.string().min(1) }),
});
export type RosterRow = z.infer<typeof RosterRow>;

export const ExamRow = z.object({
  id: Uuid,
  workspace_id: Uuid,
  title: z.string().min(1),
  starts_at: Timestamp,
  duration_min: z.number().int().positive(),
  status: z.string(),
});
export type ExamRow = z.infer<typeof ExamRow>;

export const ExamGroupRow = z.object({ groups: z.object({ code: z.string().min(1) }).nullable() });

export const StaffRow = z.object({ id: Uuid, full_name: z.string().min(1) });
export type StaffRow = z.infer<typeof StaffRow>;

/** Parses each row with `schema` and keeps the ones that pass. */
export function parseRows<T>(schema: z.ZodType<T>, rows: unknown): T[] {
  if (!Array.isArray(rows)) return [];
  const out: T[] = [];
  for (const row of rows) {
    const parsed = schema.safeParse(row);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

export const parseEvents = (rows: unknown): CompactEvent[] => parseRows(CompactEvent, rows);
export const parseSessions = (rows: unknown): SessionRow[] => parseRows(SessionRow, rows);

/** `exam_question_count(exam_id)`: the exam's questions for its staff, null for anyone else. */
export const QuestionCount = z.number().int().nonnegative().nullable();

/** The count for "Q 9 of 20" in 2.5; null (unknown) when it is missing, unreadable or 0. */
export function parseQuestionCount(value: unknown): number | null {
  const parsed = QuestionCount.safeParse(value);
  return parsed.success && parsed.data !== null && parsed.data > 0 ? parsed.data : null;
}
