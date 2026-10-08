// The review queue (3.2, 3.2a) and the session review (3.3) as pure functions: which sessions need a
// decision (the queue rule), how they group by exam and sort, the tabs, the flag-type filter in
// `?flag=`, the search, the stat cards and where "Save and next" goes. Rows are parsed with Zod before
// they get here (review-data.ts); every word on screen comes from dashboard.review.* messages.
import {
  CompactEvent,
  type EventType,
  ExamStatus,
  isInReviewQueue,
  ReviewDecisionValue,
  SessionState,
  Timestamp,
  toMs,
  Uuid,
} from "@uki/contracts";
import { z } from "zod";
import { almatyDay } from "../../lib/format.ts";

// ---------------------------------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------------------------------

export const REVIEW_EXAM_COLUMNS = "id, title, status, starts_at, duration_min";

export const ReviewExamRow = z.object({
  id: Uuid,
  title: z.string().min(1),
  status: ExamStatus,
  starts_at: Timestamp,
  duration_min: z.number().int().positive(),
});
export type ReviewExamRow = z.infer<typeof ReviewExamRow>;

export const REVIEW_SESSION_COLUMNS =
  "id, exam_id, student_id, state, started_at, time_used_s, identity_result, students(full_name, student_number)";

export const ReviewSessionRow = z.object({
  id: Uuid,
  exam_id: Uuid,
  student_id: Uuid,
  state: SessionState,
  started_at: Timestamp.nullable(),
  time_used_s: z.number().int().nonnegative(),
  identity_result: z.string().nullable(),
  students: z.object({ full_name: z.string().min(1), student_number: z.string().min(1) }),
});
export type ReviewSessionRow = z.infer<typeof ReviewSessionRow>;

export const REVIEW_DECISION_COLUMNS = "session_id, exam_id, decision, note, reviewer_id, decided_at";

export const ReviewDecisionRow = z.object({
  session_id: Uuid,
  exam_id: Uuid,
  decision: ReviewDecisionValue,
  note: z.string().nullable(),
  reviewer_id: Uuid,
  decided_at: Timestamp,
});
export type ReviewDecisionRow = z.infer<typeof ReviewDecisionRow>;

export const FlagEvent = CompactEvent;
export type FlagEvent = CompactEvent;

/** Keeps the rows that parse; a row that does not is dropped, never trusted. */
export function parseRows<T>(schema: z.ZodType<T>, rows: unknown): T[] {
  if (!Array.isArray(rows)) return [];
  const out: T[] = [];
  for (const row of rows) {
    const parsed = schema.safeParse(row);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------
// Flag types
// ---------------------------------------------------------------------------------------------------

/**
 * The event types a flag can have (REVIEW in events.ts, plus the third full-screen exit), in the order
 * 3.2 ranks a session's top flag and 3.2a lists the filter: phone, second face, the two the proctor and
 * the Lock raise, then looked away, looked down, tab blocked, no face and camera lost (Figma 51:2092 and
 * 87:8275 list them in this order).
 */
export const FLAG_TYPES = [
  "phone.detected",
  "face.second",
  "proctor.ended",
  "lock.app_disconnected",
  "gaze.off_screen",
  "gaze.down",
  "tab.blocked",
  "face.missing",
  "camera.lost",
  "lock.fullscreen_exit",
] as const satisfies readonly EventType[];
export type FlagType = (typeof FLAG_TYPES)[number];

export function isFlagType(type: string): type is FlagType {
  return (FLAG_TYPES as readonly string[]).includes(type);
}

/** The message segment of a type: "phone.detected" is "phone_detected". */
export function flagSegment(type: FlagType): string {
  return type.replace(".", "_");
}

/** Lower ranks are shown first: the session's top flag, and the queue's order. */
export function flagRank(type: string): number {
  const index = (FLAG_TYPES as readonly string[]).indexOf(type);
  return index === -1 ? FLAG_TYPES.length : index;
}

/** `?flag=phone.detected,face.second` (or the parameter repeated) as known types in FLAG_TYPES order. */
export function parseFlagParam(value: string | readonly string[] | null | undefined): FlagType[] {
  if (value === null || value === undefined) return [];
  const parts = (typeof value === "string" ? [value] : value).flatMap((part) => part.split(","));
  const wanted = new Set(parts.map((part) => part.trim()));
  return FLAG_TYPES.filter((type) => wanted.has(type));
}

/** The `?flag=` value for a set of types, or null for no filter. */
export function flagParam(types: readonly FlagType[]): string | null {
  const ordered = FLAG_TYPES.filter((type) => types.includes(type));
  return ordered.length === 0 ? null : ordered.join(",");
}

// ---------------------------------------------------------------------------------------------------
// Sessions and groups
// ---------------------------------------------------------------------------------------------------

/** to_review: a flag newer than its decision, or no decision (the queue rule); no_flags: never flagged. */
export type ReviewStatus = "to_review" | "reviewed" | "no_flags";

export interface ReviewExam {
  id: string;
  title: string;
  status: ExamStatus;
  startsAt: string;
  durationMin: number;
  /** The scheduled end: start plus duration. */
  endsAt: string;
}

export interface ReviewSession {
  id: string;
  examId: string;
  studentId: string;
  name: string;
  number: string;
  state: SessionState;
  identityResult: string | null;
  /** Minutes written: time used, or for a session still writing the minutes since its start. */
  minutes: number | null;
  /** Every flag of the session, newest first. */
  flags: FlagEvent[];
  /** Flags received after the decision (all of them without one), newest first. */
  openFlags: FlagEvent[];
  decision: ReviewDecisionRow | null;
  status: ReviewStatus;
  /** The flag the row shows: the highest ranked open flag, or of all flags once reviewed. */
  top: FlagEvent | null;
}

export interface ReviewGroup {
  exam: ReviewExam;
  sessions: ReviewSession[];
}

export interface ReviewInput {
  exams: readonly ReviewExamRow[];
  sessions: readonly ReviewSessionRow[];
  flags: readonly FlagEvent[];
  decisions: readonly ReviewDecisionRow[];
}

const LIVE_STATES: ReadonlySet<SessionState> = new Set(["writing", "paused"]);

function byNewest(a: FlagEvent, b: FlagEvent): number {
  return toMs(b.at) - toMs(a.at) || (b.id > a.id ? 1 : b.id < a.id ? -1 : 0);
}

/** The flag a row shows: the lowest rank, then the newest. */
export function topFlag(flags: readonly FlagEvent[]): FlagEvent | null {
  let best: FlagEvent | null = null;
  for (const flag of flags) {
    if (best === null) {
      best = flag;
      continue;
    }
    const rank = flagRank(flag.type) - flagRank(best.type);
    if (rank < 0 || (rank === 0 && byNewest(flag, best) < 0)) best = flag;
  }
  return best;
}

/** Flags received after the decision; every flag when there is none (the queue rule, review.ts). */
export function openFlagsOf(flags: readonly FlagEvent[], decidedAt: string | null): FlagEvent[] {
  if (decidedAt === null) return [...flags];
  const decided = toMs(decidedAt);
  return flags.filter((flag) => toMs(flag.received_at) > decided);
}

export function minutesWritten(
  row: Pick<ReviewSessionRow, "state" | "started_at" | "time_used_s">,
  nowMs: number,
): number | null {
  if (row.time_used_s > 0) return Math.round(row.time_used_s / 60);
  if (row.started_at !== null && LIVE_STATES.has(row.state)) {
    return Math.max(0, Math.floor((nowMs - toMs(row.started_at)) / 60_000));
  }
  return null;
}

function examOf(row: ReviewExamRow): ReviewExam {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    startsAt: row.starts_at,
    durationMin: row.duration_min,
    endsAt: new Date(toMs(row.starts_at) + row.duration_min * 60_000).toISOString(),
  };
}

const STATUS_ORDER: Record<ReviewStatus, number> = { to_review: 0, reviewed: 1, no_flags: 2 };

/** Queue order inside an exam: needs review first, then by top flag, more flags first, then by name. */
export function compareSessions(a: ReviewSession, b: ReviewSession): number {
  return (
    STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
    flagRank(a.top?.type ?? "") - flagRank(b.top?.type ?? "") ||
    countFor(b) - countFor(a) ||
    a.name.localeCompare(b.name, "en") ||
    (a.id < b.id ? -1 : 1)
  );
}

/** The number on the row's Count: open flags while in the queue, all flags once reviewed. */
export function countFor(session: ReviewSession): number {
  return session.status === "to_review" ? session.openFlags.length : session.flags.length;
}

/**
 * Sessions of the given exams with their flags and decisions, grouped by exam. Exams without a single
 * flag are left out, since there is nothing to review in them, unless `keepUnflagged` (3.3 opens any
 * session). Exams with a session in the queue come first, then the newest.
 */
export function buildReview(
  input: ReviewInput,
  nowMs: number,
  options: { keepUnflagged?: boolean } = {},
): ReviewGroup[] {
  const flagsBySession = new Map<string, FlagEvent[]>();
  for (const flag of input.flags) {
    if (flag.review !== "flag") continue;
    const list = flagsBySession.get(flag.session_id) ?? [];
    if (!list.some((f) => f.id === flag.id)) list.push(flag);
    flagsBySession.set(flag.session_id, list);
  }
  const decisions = new Map(input.decisions.map((d) => [d.session_id, d]));

  const groups: ReviewGroup[] = [];
  for (const examRow of input.exams) {
    const sessions: ReviewSession[] = [];
    for (const row of input.sessions) {
      if (row.exam_id !== examRow.id) continue;
      const flags = (flagsBySession.get(row.id) ?? []).sort(byNewest);
      const decision = decisions.get(row.id) ?? null;
      const decidedAt = decision?.decided_at ?? null;
      const open = openFlagsOf(flags, decidedAt);
      const status: ReviewStatus =
        flags.length === 0
          ? "no_flags"
          : isInReviewQueue(
                flags.map((f) => f.received_at),
                decidedAt,
              )
            ? "to_review"
            : "reviewed";
      sessions.push({
        id: row.id,
        examId: row.exam_id,
        studentId: row.student_id,
        name: row.students.full_name,
        number: row.students.student_number,
        state: row.state,
        identityResult: row.identity_result,
        minutes: minutesWritten(row, nowMs),
        flags,
        openFlags: open,
        decision,
        status,
        top: topFlag(status === "to_review" ? open : flags),
      });
    }
    if (!options.keepUnflagged && !sessions.some((s) => s.flags.length > 0)) continue;
    groups.push({ exam: examOf(examRow), sessions: sessions.sort(compareSessions) });
  }
  return groups.sort((a, b) => {
    const open = Number(hasQueue(b)) - Number(hasQueue(a));
    return open || toMs(b.exam.startsAt) - toMs(a.exam.startsAt) || (a.exam.id < b.exam.id ? -1 : 1);
  });
}

function hasQueue(group: ReviewGroup): boolean {
  return group.sessions.some((s) => s.status === "to_review");
}

// ---------------------------------------------------------------------------------------------------
// Tabs, filter and search
// ---------------------------------------------------------------------------------------------------

export const REVIEW_TABS = ["to_review", "reviewed", "all"] as const;
export type ReviewTab = (typeof REVIEW_TABS)[number];

export function inTab(session: ReviewSession, tab: ReviewTab): boolean {
  return tab === "all" || session.status === tab;
}

/** The flags a filter and its counts look at: the open ones in the queue, all of them otherwise. */
export function flagsForTab(session: ReviewSession, tab: ReviewTab): FlagEvent[] {
  return tab === "to_review" ? session.openFlags : session.flags;
}

/** True when the student's name or number contains the query (case and spaces ignored). */
export function matchesQuery(session: Pick<ReviewSession, "name" | "number">, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (needle === "") return true;
  return (
    session.name.toLocaleLowerCase().includes(needle) || session.number.toLocaleLowerCase().includes(needle)
  );
}

export interface ReviewFilter {
  tab: ReviewTab;
  /** Flag types from `?flag=`; empty is every type. */
  flags: readonly FlagType[];
  query: string;
}

export function matchesFilter(session: ReviewSession, filter: ReviewFilter): boolean {
  if (!inTab(session, filter.tab) || !matchesQuery(session, filter.query)) return false;
  if (filter.flags.length === 0) return true;
  return flagsForTab(session, filter.tab).some((flag) =>
    (filter.flags as readonly string[]).includes(flag.type),
  );
}

/** The groups with only the sessions that pass the filter; empty groups are dropped. */
export function filterGroups(groups: readonly ReviewGroup[], filter: ReviewFilter): ReviewGroup[] {
  return groups
    .map((group) => ({ exam: group.exam, sessions: group.sessions.filter((s) => matchesFilter(s, filter)) }))
    .filter((group) => group.sessions.length > 0);
}

/** Sessions per tab, for "To review · 7", "Reviewed · 41" and "All · 125". */
export function tabCounts(groups: readonly ReviewGroup[]): Record<ReviewTab, number> {
  const counts: Record<ReviewTab, number> = { to_review: 0, reviewed: 0, all: 0 };
  for (const session of groups.flatMap((g) => g.sessions)) {
    counts.all += 1;
    if (session.status === "to_review") counts.to_review += 1;
    if (session.status === "reviewed") counts.reviewed += 1;
  }
  return counts;
}

/**
 * Flags per type among the sessions of a tab (and the search), for the rows of 3.2a: "Counts are flags
 * in this exam" (Dropdown/Filter 76:2284). Every type that has a flag is listed, in FLAG_TYPES order.
 */
export function flagTypeCounts(
  groups: readonly ReviewGroup[],
  tab: ReviewTab,
  query: string,
): { type: FlagType; count: number }[] {
  const counts = new Map<FlagType, number>();
  for (const session of groups.flatMap((g) => g.sessions)) {
    if (!inTab(session, tab) || !matchesQuery(session, query)) continue;
    for (const flag of flagsForTab(session, tab)) {
      if (isFlagType(flag.type)) counts.set(flag.type, (counts.get(flag.type) ?? 0) + 1);
    }
  }
  return FLAG_TYPES.filter((type) => counts.has(type)).map((type) => ({
    type,
    count: counts.get(type) ?? 0,
  }));
}

// ---------------------------------------------------------------------------------------------------
// Stat cards
// ---------------------------------------------------------------------------------------------------

export interface ReviewStats {
  toReview: { sessions: number; flags: number };
  /** `today` when every decision shown was made today in Asia/Almaty. */
  reviewed: { sessions: number; reviewers: number; today: boolean };
  noFlags: number;
  /** Median seconds from the exam's end to the decision (A.1's rule, never negative); null without any. */
  medianReviewS: number | null;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 1
      ? (sorted[middle] as number)
      : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
  return Math.round(value);
}

export function reviewStats(groups: readonly ReviewGroup[], nowMs: number): ReviewStats {
  const stats: ReviewStats = {
    toReview: { sessions: 0, flags: 0 },
    reviewed: { sessions: 0, reviewers: 0, today: true },
    noFlags: 0,
    medianReviewS: null,
  };
  const reviewers = new Set<string>();
  const reviewSeconds: number[] = [];
  const today = almatyDay(nowMs);
  for (const group of groups) {
    for (const session of group.sessions) {
      if (session.status === "to_review") {
        stats.toReview.sessions += 1;
        stats.toReview.flags += session.openFlags.length;
      } else if (session.status === "no_flags") {
        stats.noFlags += 1;
      } else if (session.decision !== null) {
        stats.reviewed.sessions += 1;
        reviewers.add(session.decision.reviewer_id);
        if (almatyDay(session.decision.decided_at) !== today) stats.reviewed.today = false;
      }
      if (session.flags.length > 0 && session.decision !== null) {
        reviewSeconds.push(
          Math.max(0, Math.round((toMs(session.decision.decided_at) - toMs(group.exam.endsAt)) / 1000)),
        );
      }
    }
  }
  stats.reviewed.reviewers = reviewers.size;
  if (stats.reviewed.sessions === 0) stats.reviewed.today = false;
  stats.medianReviewS = median(reviewSeconds);
  return stats;
}

/** A duration as the largest two units: "1 min 40 s", "3 h 5 min", "2 d 4 h". */
export type DurationParts =
  | { unit: "seconds"; seconds: number }
  | { unit: "minutes"; minutes: number; seconds: number }
  | { unit: "hours"; hours: number; minutes: number }
  | { unit: "days"; days: number; hours: number };

export function durationParts(totalSeconds: number): DurationParts {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return { unit: "seconds", seconds: s };
  if (s < 3600) return { unit: "minutes", minutes: Math.floor(s / 60), seconds: s % 60 };
  if (s < 86_400) return { unit: "hours", hours: Math.floor(s / 3600), minutes: Math.floor((s % 3600) / 60) };
  return { unit: "days", days: Math.floor(s / 86_400), hours: Math.floor((s % 86_400) / 3600) };
}

// ---------------------------------------------------------------------------------------------------
// The session review (3.3)
// ---------------------------------------------------------------------------------------------------

/** "1 of 7" and where Skip and "Save and next" go: the next session in the exam's queue, else null. */
export function queuePosition(
  group: ReviewGroup | undefined,
  sessionId: string,
): { index: number; total: number; next: string | null } | null {
  if (group === undefined) return null;
  const queue = group.sessions.filter((s) => s.status === "to_review");
  const index = queue.findIndex((s) => s.id === sessionId);
  const after = index === -1 ? queue : [...queue.slice(index + 1), ...queue.slice(0, index)];
  const next = after.find((s) => s.id !== sessionId)?.id ?? null;
  if (index === -1) return { index: 0, total: queue.length, next };
  return { index: index + 1, total: queue.length, next };
}

/** Seconds as a one-decimal number for "gaze 2.3 s", or undefined when the event has none. */
export function durationSeconds(data: Record<string, unknown>): number | undefined {
  const ms = data.duration_ms ?? data.held_ms ?? data.offline_ms;
  return typeof ms === "number" && Number.isFinite(ms) && ms >= 0 ? Math.round(ms / 100) / 10 : undefined;
}

export function scoreOf(data: Record<string, unknown>): number | undefined {
  const score = data.score;
  return typeof score === "number" && Number.isFinite(score) ? score : undefined;
}

/** Total seconds of the session's flags of one type, for "Looked away · 6 s in total". */
export function totalSeconds(flags: readonly FlagEvent[], type: string): number | undefined {
  let total = 0;
  let any = false;
  for (const flag of flags) {
    if (flag.type !== type) continue;
    const seconds = durationSeconds(flag.data);
    if (seconds === undefined) continue;
    total += seconds;
    any = true;
  }
  return any ? Math.round(total * 10) / 10 : undefined;
}
