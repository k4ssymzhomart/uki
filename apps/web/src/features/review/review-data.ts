// Server-side reads for 3.2 and 3.3, as the signed-in staff member under RLS: a proctor sees only the
// exams assigned to it, the exam office its workspace. Every read of student data writes its audit row
// through `audit_read` before the page gets the data (CLAUDE.md, Rules).
import { CompactEvent, Uuid } from "@uki/contracts";
import type { SupabaseServerClient } from "../../lib/supabase/server.ts";
import { readPages } from "../wall/queries.ts";
import { EVENT_COLUMNS } from "../wall/rows.ts";
import {
  buildReview,
  parseRows,
  REVIEW_DECISION_COLUMNS,
  REVIEW_EXAM_COLUMNS,
  REVIEW_SESSION_COLUMNS,
  ReviewDecisionRow,
  ReviewExamRow,
  type ReviewGroup,
  ReviewSessionRow,
} from "./review-model.ts";

/**
 * Besides every exam with a session in the queue, 3.2 shows the flagged exams that started in this
 * window, so the Reviewed and All tabs keep an exam after its last decision (docs/decisions.md, 1.8).
 */
export const RECENT_EXAMS_MS = 7 * 24 * 3600 * 1000;

/** Exam states that can have flags. */
const FLAGGABLE_STATUSES = ["live", "to_review", "reviewed"] as const;

const QueueRow = Uuid;

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

/** Writes one audit row for a read of student data; throws when it cannot, so nothing is shown unaudited. */
export async function auditRead(
  supabase: SupabaseServerClient,
  action: string,
  objectType: "exam" | "session",
  objectId: string,
): Promise<void> {
  let lastError: string | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { error } = await supabase.rpc("audit_read", {
      action,
      object_type: objectType,
      object_id: objectId,
    });
    if (error === null) return;
    lastError = error.message;
  }
  throw new Error(`audit_read ${action}: ${lastError ?? "failed"}`);
}

/** The exam ids with at least one session in the queue (the `review_queue` view). */
async function openExamIds(supabase: SupabaseServerClient): Promise<string[]> {
  const rows = await readPages((from, to) =>
    supabase.from("review_queue").select("exam_id").order("session_id").range(from, to),
  );
  return unique(
    rows.flatMap((row) => {
      const parsed = QueueRow.safeParse((row as { exam_id?: unknown }).exam_id);
      return parsed.success ? [parsed.data] : [];
    }),
  );
}

/** Sessions, flags and decisions of the given exams, grouped and sorted (review-model.ts). */
export async function loadReviewGroups(
  supabase: SupabaseServerClient,
  exams: readonly ReviewExamRow[],
  nowMs: number,
  options: { keepUnflagged?: boolean } = {},
): Promise<ReviewGroup[]> {
  const ids = exams.map((exam) => exam.id);
  if (ids.length === 0) return [];
  const [flagRows, sessionRows, decisionRows] = await Promise.all([
    readPages((from, to) =>
      supabase
        .from("events")
        .select(EVENT_COLUMNS)
        .in("exam_id", ids)
        .eq("review", "flag")
        .order("id")
        .range(from, to),
    ),
    readPages((from, to) =>
      supabase.from("sessions").select(REVIEW_SESSION_COLUMNS).in("exam_id", ids).order("id").range(from, to),
    ),
    readPages((from, to) =>
      supabase
        .from("review_decisions")
        .select(REVIEW_DECISION_COLUMNS)
        .in("exam_id", ids)
        .order("session_id")
        .range(from, to),
    ),
  ]);
  return buildReview(
    {
      exams,
      sessions: parseRows(ReviewSessionRow, sessionRows),
      flags: parseRows(CompactEvent, flagRows),
      decisions: parseRows(ReviewDecisionRow, decisionRows),
    },
    nowMs,
    options,
  );
}

/**
 * 3.2: every exam with a session in the queue, and the flagged exams that started in the last
 * RECENT_EXAMS_MS, with one audit row per exam shown (`review.queue_viewed`).
 */
export async function loadReviewQueue(supabase: SupabaseServerClient, nowMs: number): Promise<ReviewGroup[]> {
  const open = await openExamIds(supabase);
  const since = new Date(nowMs - RECENT_EXAMS_MS).toISOString();
  const recent = `and(starts_at.gte."${since}",status.in.(${FLAGGABLE_STATUSES.join(",")}))`;
  const filter = open.length > 0 ? `${recent},id.in.(${open.join(",")})` : recent;
  const { data, error } = await supabase.from("exams").select(REVIEW_EXAM_COLUMNS).or(filter);
  if (error) throw new Error(`exams: ${error.message}`);
  const groups = await loadReviewGroups(supabase, parseRows(ReviewExamRow, data), nowMs);
  for (const group of groups) {
    await auditRead(supabase, "review.queue_viewed", "exam", group.exam.id);
  }
  return groups;
}

export interface SessionReviewData {
  group: ReviewGroup;
  sessionId: string;
  /** Every event of the session, newest first, notes included. */
  events: CompactEvent[];
  /** Staff names by id, for proctor events and notes. */
  staffNames: Record<string, string>;
}

/**
 * 3.3: the session, its exam's review group (for "1 of 7" and Save and next), every event of the
 * session and the staff names; one audit row (`review.session_viewed`). Null when the session does not
 * exist or the staff member may not see it.
 */
export async function loadSessionReview(
  supabase: SupabaseServerClient,
  sessionId: string,
  nowMs: number,
): Promise<SessionReviewData | null> {
  const sessionResult = await supabase.from("sessions").select("exam_id").eq("id", sessionId).maybeSingle();
  const examId = Uuid.safeParse(sessionResult.data?.exam_id);
  if (sessionResult.error || !examId.success) return null;

  const examResult = await supabase
    .from("exams")
    .select(`${REVIEW_EXAM_COLUMNS}, workspace_id`)
    .eq("id", examId.data)
    .maybeSingle();
  const exam = ReviewExamRow.safeParse(examResult.data);
  const workspaceId = Uuid.safeParse(examResult.data?.workspace_id);
  if (examResult.error || !exam.success || !workspaceId.success) return null;

  await auditRead(supabase, "review.session_viewed", "session", sessionId);

  const [groups, eventRows, staffRows] = await Promise.all([
    loadReviewGroups(supabase, [exam.data], nowMs, { keepUnflagged: true }),
    readPages((from, to) =>
      supabase
        .from("events")
        .select(EVENT_COLUMNS)
        .eq("session_id", sessionId)
        .order("at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
    ),
    readPages((from, to) =>
      supabase
        .from("staff")
        .select("id, full_name")
        .eq("workspace_id", workspaceId.data)
        .order("id")
        .range(from, to),
    ),
  ]);
  const group = groups[0];
  if (group === undefined || !group.sessions.some((session) => session.id === sessionId)) return null;
  const staffNames: Record<string, string> = {};
  for (const row of staffRows) {
    const { id, full_name } = row as { id?: unknown; full_name?: unknown };
    if (typeof id === "string" && typeof full_name === "string") staffNames[id] = full_name;
  }
  return { group, sessionId, events: parseRows(CompactEvent, eventRows), staffNames };
}
