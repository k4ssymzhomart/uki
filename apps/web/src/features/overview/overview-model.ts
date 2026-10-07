import { ExamChecks, ExamStatus, Timestamp, toMs, Uuid } from "@uki/contracts";
import type { ChipStatus, ExamCheck } from "@uki/ui";
import { z } from "zod";

/**
 * 0.1 Overview, as pure functions over `exam_overview` rows (the view runs under the caller's RLS, so a
 * proctor only ever has assigned exams here). Unit-tested in overview-model.test.ts.
 */

const Count = z.number().int().nonnegative();

/** One `exam_overview` row with the columns the overview and the sidebar read. */
export const OverviewRow = z.object({
  id: Uuid,
  title: z.string(),
  course: z.string(),
  status: ExamStatus,
  starts_at: Timestamp,
  duration_min: z.number().int().positive(),
  lobby_opens_at: Timestamp,
  checks: ExamChecks,
  groups: z.array(z.string()),
  proctor_count: Count,
  roster_size: Count,
  joined: Count,
  writing: Count,
  flagged_events: Count,
  sessions_final: Count,
});
export type OverviewRow = z.infer<typeof OverviewRow>;

/** The columns to select from `exam_overview`. */
export const OVERVIEW_COLUMNS =
  "id, title, course, status, starts_at, duration_min, lobby_opens_at, checks, groups, proctor_count, roster_size, joined, writing, flagged_events, sessions_final";

/** Parses the view's rows; a row that does not parse is left out rather than shown wrong. */
export function parseOverviewRows(rows: readonly unknown[]): OverviewRow[] {
  return rows.flatMap((row) => {
    const parsed = OverviewRow.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}

/** The Exams table filters (Figma Tabs: All, Upcoming, Live, Done). */
export const EXAM_FILTERS = ["all", "upcoming", "live", "done"] as const;
export type ExamFilter = (typeof EXAM_FILTERS)[number];

export type ExamPhase = Exclude<ExamFilter, "all"> | "cancelled";

/** Draft and scheduled exams are upcoming; to_review and reviewed are done; cancelled only shows in All. */
export function examPhase(status: ExamStatus): ExamPhase {
  switch (status) {
    case "draft":
    case "scheduled":
      return "upcoming";
    case "live":
      return "live";
    case "to_review":
    case "reviewed":
      return "done";
    case "cancelled":
      return "cancelled";
  }
}

/** Figma's row order: the next scheduled exam, live, to review, drafts, reviewed; then by start time. */
const STATUS_ORDER: Record<ExamStatus, number> = {
  scheduled: 0,
  live: 1,
  to_review: 2,
  draft: 3,
  reviewed: 4,
  cancelled: 5,
};

export function sortExams(rows: readonly OverviewRow[]): OverviewRow[] {
  return [...rows].sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || toMs(a.starts_at) - toMs(b.starts_at),
  );
}

/** The rows a filter tab shows, in table order. */
export function filterExams(rows: readonly OverviewRow[], filter: ExamFilter): OverviewRow[] {
  const sorted = sortExams(rows);
  return filter === "all" ? sorted : sorted.filter((row) => examPhase(row.status) === filter);
}

/** Students in a session that has not ended yet. */
export function activeStudents(row: OverviewRow): number {
  return Math.max(0, row.joined - row.sessions_final);
}

export type OverviewStats = {
  upcoming: { count: number; next: OverviewRow | null };
  live: { students: number; exams: OverviewRow[] };
  review: { flags: number; exams: OverviewRow[] };
};

/** The four stat cards (the fourth, video uploaded, is always 0 MB) and the next-exam card. */
export function overviewStats(rows: readonly OverviewRow[]): OverviewStats {
  const sorted = sortExams(rows);
  const upcoming = sorted.filter((row) => examPhase(row.status) === "upcoming");
  const scheduled = upcoming.filter((row) => row.status === "scheduled");
  const live = sorted.filter((row) => row.status === "live");
  const review = sorted.filter((row) => row.status === "to_review");
  return {
    upcoming: { count: upcoming.length, next: scheduled[0] ?? null },
    live: { students: live.reduce((sum, row) => sum + activeStudents(row), 0), exams: live },
    review: { flags: review.reduce((sum, row) => sum + row.flagged_events, 0), exams: review },
  };
}

/**
 * The sidebar's Live count: students in a session that has not ended, in live exams and in exams whose
 * lobby is open (Figma: 86 on 0.1 while Physics 1 is live, 121 on 1.5 while the lobby fills).
 */
export function liveStudentCount(rows: readonly OverviewRow[], nowMs: number): number {
  return rows
    .filter(
      (row) => row.status === "live" || (row.status === "scheduled" && toMs(row.lobby_opens_at) <= nowMs),
    )
    .reduce((sum, row) => sum + activeStudents(row), 0);
}

/** Which of Row/Exam's four check icons an exam shows. Gaze and phone always run in Phase 0. */
export function examChecks(checks: ExamChecks): Record<ExamCheck, boolean> {
  return { lock: checks.lock, gaze: checks.gaze_s > 0, phone: checks.phone_score <= 1, id: checks.identity };
}

/** The status chip of a row: its dot and the dashboard.overview.status.* key. */
export type StatusChip = {
  status: ChipStatus;
  key: "draft" | "scheduled" | "live" | "toReview" | "reviewed" | "cancelled";
  count?: number;
};

export function statusChip(row: OverviewRow): StatusChip {
  switch (row.status) {
    case "draft":
      return { status: "idle", key: "draft" };
    case "scheduled":
      return { status: "idle", key: "scheduled" };
    case "live":
      return { status: "ok", key: "live" };
    case "to_review":
      return { status: "warn", key: "toReview", count: row.flagged_events };
    case "reviewed":
      return { status: "ok", key: "reviewed" };
    case "cancelled":
      return { status: "idle", key: "cancelled" };
  }
}

/** Where the sidebar's Live item leads: the live wall of a live exam, else the next lobby. */
export type LiveTarget = { kind: "live" | "lobby"; examId: string } | null;

export function liveTarget(rows: readonly OverviewRow[], nowMs: number): LiveTarget {
  const sorted = sortExams(rows);
  const live = sorted.find((row) => row.status === "live");
  if (live) return { kind: "live", examId: live.id };
  const scheduled = sorted.filter((row) => row.status === "scheduled");
  const lobbyOpen = scheduled.find((row) => toMs(row.lobby_opens_at) <= nowMs);
  const next = lobbyOpen ?? scheduled[0];
  return next ? { kind: "lobby", examId: next.id } : null;
}

/**
 * "All groups" when an exam covers every group the staff member can see (and more than one);
 * otherwise the codes themselves.
 */
export function coversAllGroups(groups: readonly string[], workspaceGroupCount: number): boolean {
  return groups.length > 1 && groups.length >= workspaceGroupCount;
}
