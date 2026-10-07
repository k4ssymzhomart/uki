// What the Lock keeps in chrome.storage.local ("Manifest" in docs/phase-0-plan.md: lock state, saved tabs
// and the pairing), and the two views the service worker publishes there for its pages: `view` for the
// popup and the block page, `bar` for the content script on the exam portal. Every read goes through Zod;
// anything that fails parses as missing.
import {
  ClockOffsetMs,
  DesktopOs,
  ExamMode,
  ExamStatePhase,
  Locale,
  LockEvent,
  LockExam,
  PairFailReason,
  Uuid,
  WatchLabel,
} from "@uki/contracts";
import { z } from "zod";
import { KeptTab, SavedWindow } from "./tab-plan.ts";

export const STORAGE_KEYS = {
  installId: "install_id",
  paired: "paired",
  lock: "lock",
  released: "released",
  examState: "exam_state",
  outbox: "outbox",
  view: "view",
  bar: "bar",
} as const;
export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

/** The app's exam.state message as the contract defines it. */
export const ExamStateMessage = z.object({
  type: z.literal("exam.state"),
  phase: ExamStatePhase,
  watch: WatchLabel,
  locale: Locale,
  exam: LockExam.nullable(),
  clock_offset_ms: ClockOffsetMs.optional(),
});
export type ExamStateMessage = z.infer<typeof ExamStateMessage>;

const Count = z.number().int().nonnegative();

/** The running lock. Saved before any tab closes, so a crash never loses the student's tabs. */
export const LockRecord = z.object({
  mode: ExamMode,
  exam: LockExam,
  locale: Locale,
  started_at: z.number(),
  keep: KeptTab.nullable(),
  saved: z.array(SavedWindow),
  tabs_closed: Count,
  fullscreen_exits: Count,
  blocked_count: Count,
  /** Server time minus the laptop's clock, from the app's latest exam.state for this exam. */
  clock_offset_ms: ClockOffsetMs.default(0),
});
export type LockRecord = z.infer<typeof LockRecord>;

export const RELEASE_TRIGGERS = ["done_path", "app", "exam_done", "deadline"] as const;

/** What E.9 shows, kept until the student closes it or the next lock starts. */
export const ReleasedSummary = z.object({
  trigger: z.enum(RELEASE_TRIGGERS),
  mode: ExamMode,
  released_at: z.number(),
  started_at: z.number(),
  tabs_restored: Count,
  blocked_count: Count,
  locale: Locale,
});
export type ReleasedSummary = z.infer<typeof ReleasedSummary>;

/**
 * Lock events wait here until a paired app takes them; resends are safe because the app keys them by id.
 * Each entry belongs to the exam the Lock was locked to, and goes only to an app on that exam.
 */
export const OutboxEntry = z.object({ event: LockEvent, queued_at: z.number(), session_id: Uuid });
export type OutboxEntry = z.infer<typeof OutboxEntry>;
export const Outbox = z.array(OutboxEntry);

export const LINK_STATES = ["absent", "connected", "paired"] as const;
export const LinkState = z.enum(LINK_STATES);
export type LinkState = z.infer<typeof LinkState>;

/**
 * The popup's and the block page's view of the service worker. `locked.exam` carries its times on the
 * laptop's clock (shifted by the app's clock offset), so countdowns that read Date.now() are right.
 */
export const LockView = z.object({
  link: LinkState,
  app: z.object({ os: DesktopOs, student_name: z.string().nullable(), app_version: z.string() }).nullable(),
  pair: z.object({ code: z.string(), expires_at: z.string() }).nullable(),
  pair_error: PairFailReason.nullable(),
  exam_state: ExamStateMessage.nullable(),
  locked: z.object({ mode: ExamMode, exam: LockExam, started_at: z.number(), locale: Locale }).nullable(),
  released: ReleasedSummary.nullable(),
});
export type LockView = z.infer<typeof LockView>;

export const EMPTY_VIEW: LockView = {
  link: "absent",
  app: null,
  pair: null,
  pair_error: null,
  exam_state: null,
  locked: null,
  released: null,
};

/**
 * What the content script on the exam portal needs for the bar, the guards and the toast. `starts_at` and
 * `ends_at` are on the laptop's clock, like `locked.exam` in LockView.
 */
export const BarState = z.object({
  mode: ExamMode,
  title: z.string(),
  starts_at: z.string(),
  ends_at: z.string(),
  phase: ExamStatePhase,
  watch: WatchLabel,
  locale: Locale,
  lms_url: z.string().nullable(),
  allowed_hosts: z.array(z.string()),
});
export type BarState = z.infer<typeof BarState>;

export const InstallId = Uuid;

/** Parses one stored value, or returns the fallback when it is missing or does not match. */
export function readStored<T>(schema: z.ZodType<T>, value: unknown, fallback: T): T {
  if (value === undefined || value === null) return fallback;
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
}
