import {
  type DesktopOs,
  Device,
  Locale,
  ReviewDecisionValue,
  SessionState,
  Timestamp,
  toMs,
  Uuid,
} from "@uki/contracts";
import { z } from "zod";
import { type ReviewStatus, reviewStatus } from "./students-model.ts";

/**
 * A.3 Student profile (Figma 105:10746) as pure functions over the student's sessions, their flag
 * events, review decisions and kept stills: the exam history, the stat tiles, the devices from
 * `sessions.device`, the consent record from `rules_accepted_at` and `rules_locale`, and the data kept.
 * Unit-tested in student-profile-model.test.ts.
 */

/** One of the student's sessions with its exam, as PostgREST embeds it. */
export const ProfileSession = z.object({
  id: Uuid,
  exam_id: Uuid,
  state: SessionState,
  joined_at: Timestamp.nullable(),
  last_seen_at: Timestamp.nullable(),
  time_used_s: z.number().int().nonnegative(),
  /** `{ os, app_version, browser?, lock_version? }`; anything else (the column's `{}` default) is no device. */
  device: z.unknown(),
  rules_accepted_at: Timestamp.nullable(),
  rules_locale: Locale.nullable(),
  exams: z.object({
    title: z.string(),
    course: z.string(),
    starts_at: Timestamp,
    duration_min: z.number().int().positive(),
  }),
});
export type ProfileSession = z.infer<typeof ProfileSession>;

export const PROFILE_SESSION_COLUMNS =
  "id, exam_id, state, joined_at, last_seen_at, time_used_s, device, rules_accepted_at, rules_locale, exams(title, course, starts_at, duration_min)";

/** A flag event of one of the sessions: `events` with `review = 'flag'`. */
export const ProfileFlag = z.object({ session_id: Uuid, received_at: Timestamp });
export type ProfileFlag = z.infer<typeof ProfileFlag>;

export const ProfileDecision = z.object({
  session_id: Uuid,
  decision: ReviewDecisionValue,
  decided_at: Timestamp,
});
export type ProfileDecision = z.infer<typeof ProfileDecision>;

/** A kept still of one of the sessions (`frames`). */
export const ProfileFrame = z.object({ session_id: Uuid, captured_at: Timestamp });
export type ProfileFrame = z.infer<typeof ProfileFrame>;

/** Parses rows with a schema; a row that does not parse is left out rather than shown wrong. */
export function parseRows<T>(schema: z.ZodType<T>, rows: readonly unknown[]): T[] {
  return rows.flatMap((row) => {
    const parsed = schema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}

// ---------------------------------------------------------------------------------------------------
// Exam history and the stat tiles
// ---------------------------------------------------------------------------------------------------

export type ExamHistoryRow = {
  sessionId: string;
  examId: string;
  title: string;
  course: string;
  startsAt: string;
  durationMin: number;
  /** Whole minutes written, from `time_used_s`; null before the student submits. */
  usedMin: number | null;
  flags: number;
  decision: ReviewDecisionValue | null;
  status: ReviewStatus;
};

/**
 * One row per session, newest exam first. A session is in review while it has a flag received after its
 * decision, or a flag and no decision (the queue rule of WP 1.1).
 */
export function examHistory(
  sessions: readonly ProfileSession[],
  flags: readonly ProfileFlag[],
  decisions: readonly ProfileDecision[],
): ExamHistoryRow[] {
  const decisionOf = new Map(decisions.map((d) => [d.session_id, d]));
  return sessions
    .map((session): ExamHistoryRow => {
      const own = flags.filter((flag) => flag.session_id === session.id);
      const decision = decisionOf.get(session.id) ?? null;
      const open = own.some(
        (flag) => decision === null || toMs(flag.received_at) > toMs(decision.decided_at),
      );
      return {
        sessionId: session.id,
        examId: session.exam_id,
        title: session.exams.title,
        course: session.exams.course,
        startsAt: session.exams.starts_at,
        durationMin: session.exams.duration_min,
        usedMin: session.time_used_s > 0 ? Math.round(session.time_used_s / 60) : null,
        flags: own.length,
        decision: decision?.decision ?? null,
        status: reviewStatus({ flags: own.length, open, decision: decision?.decision ?? null }),
      };
    })
    .sort((a, b) => toMs(b.startsAt) - toMs(a.startsAt) || a.title.localeCompare(b.title));
}

export type ProfileStats = {
  exams: number;
  /** The first exam's start, for "since 4 September"; null without exams. */
  firstExamAt: string | null;
  flags: number;
  /** The course with the most flags, for "3 in Mathematics 2"; null without flags. */
  topCourse: { course: string; flags: number } | null;
  decisions: number;
  committee: number;
  /** The latest decision, for "follow-up · 0 to committee"; null without decisions. */
  latest: ReviewDecisionValue | null;
};

export function profileStats(
  history: readonly ExamHistoryRow[],
  decisions: readonly ProfileDecision[],
): ProfileStats {
  const first = history.reduce<string | null>(
    (min, row) => (min === null || toMs(row.startsAt) < toMs(min) ? row.startsAt : min),
    null,
  );
  const byCourse = new Map<string, number>();
  for (const row of history) {
    if (row.flags > 0) byCourse.set(row.course, (byCourse.get(row.course) ?? 0) + row.flags);
  }
  let topCourse: ProfileStats["topCourse"] = null;
  for (const [course, count] of byCourse) {
    if (topCourse === null || count > topCourse.flags) topCourse = { course, flags: count };
  }
  const sessionIds = new Set(history.map((row) => row.sessionId));
  const own = decisions.filter((d) => sessionIds.has(d.session_id));
  const latest = own.reduce<ProfileDecision | null>(
    (last, d) => (last === null || toMs(d.decided_at) > toMs(last.decided_at) ? d : last),
    null,
  );
  return {
    exams: history.length,
    firstExamAt: first,
    flags: history.reduce((sum, row) => sum + row.flags, 0),
    topCourse,
    decisions: own.length,
    committee: own.filter((d) => d.decision === "committee").length,
    latest: latest?.decision ?? null,
  };
}

// ---------------------------------------------------------------------------------------------------
// Devices, consent and data kept
// ---------------------------------------------------------------------------------------------------

export type ProfileDevice =
  | { kind: "app"; os: DesktopOs; version: string; seenAt: string | null }
  | { kind: "lock"; browser: string | null; version: string; seenAt: string | null };

function latest(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return toMs(b) > toMs(a) ? b : a;
}

/**
 * The laptops and Locks the student's sessions reported in `sessions.device`: one row per app (system
 * and version) and per Lock (browser and version), each with when it was last seen (`last_seen_at`, or
 * `joined_at` before the first ingest call), most recent first. The app reports neither the laptop's
 * model nor the system version, and a Lock's pairing time is not recorded.
 */
export function profileDevices(sessions: readonly ProfileSession[]): ProfileDevice[] {
  const found = new Map<string, ProfileDevice>();
  for (const session of sessions) {
    const parsed = Device.safeParse(session.device);
    if (!parsed.success) continue;
    const seen = session.last_seen_at ?? session.joined_at;
    const device = parsed.data;
    const appKey = `app|${device.os}|${device.app_version}`;
    const app = found.get(appKey);
    found.set(appKey, {
      kind: "app",
      os: device.os,
      version: device.app_version,
      seenAt: latest(app?.seenAt ?? null, seen),
    });
    if (device.lock_version !== undefined) {
      const lockKey = `lock|${device.browser ?? ""}|${device.lock_version}`;
      const lock = found.get(lockKey);
      found.set(lockKey, {
        kind: "lock",
        browser: device.browser ?? null,
        version: device.lock_version,
        seenAt: latest(lock?.seenAt ?? null, seen),
      });
    }
  }
  return [...found.values()].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "app" ? -1 : 1;
    return (b.seenAt === null ? 0 : toMs(b.seenAt)) - (a.seenAt === null ? 0 : toMs(a.seenAt));
  });
}

/**
 * The consent record (plan, Decisions: Consent record): when the student last accepted an exam's rules
 * and in which language, from `sessions.rules_accepted_at` and `rules_locale`. Null when no session has
 * reached `ready`.
 */
export function latestConsent(
  sessions: readonly ProfileSession[],
): { acceptedAt: string; locale: Locale; examTitle: string } | null {
  let found: { acceptedAt: string; locale: Locale; examTitle: string } | null = null;
  for (const session of sessions) {
    if (session.rules_accepted_at === null || session.rules_locale === null) continue;
    if (found === null || toMs(session.rules_accepted_at) > toMs(found.acceptedAt)) {
      found = {
        acceptedAt: session.rules_accepted_at,
        locale: session.rules_locale,
        examTitle: session.exams.title,
      };
    }
  }
  return found;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export type DataKept = {
  /** Flagged stills kept in `frames`. */
  frames: number;
  /** When retention removes the last of them: the newest still plus `retention_days`; null without stills. */
  framesGoneAt: number | null;
  /** Exams whose event log is kept. */
  exams: number;
};

export function dataKept(
  frames: readonly ProfileFrame[],
  sessions: readonly ProfileSession[],
  retentionDays: number,
): DataKept {
  const newest = frames.reduce<number | null>(
    (max, frame) => (max === null || toMs(frame.captured_at) > max ? toMs(frame.captured_at) : max),
    null,
  );
  return {
    frames: frames.length,
    framesGoneAt: newest === null ? null : newest + retentionDays * DAY_MS,
    exams: new Set(sessions.map((session) => session.exam_id)).size,
  };
}
