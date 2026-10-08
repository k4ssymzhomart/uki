// Messages between Üki Lock and the Üki app over the local WebSocket ("Pairing (E.3)" and
// "Lock messages" in docs/phase-0-plan.md). Each message is one JSON text frame.
import { z } from "zod";
import { BrowserRules } from "./browser-rules.ts";
import { MessageText } from "./commands.ts";
import { CopyKind, type EventEnvelope, HelpTopic, TabBlockedLockData } from "./events.ts";
import { Host, Timestamp, UtcTimestamp, Uuid } from "./primitives.ts";
import { DesktopOs, ExamMode, Locale } from "./session.ts";

/** The app listens on 127.0.0.1 at the first free port of these. */
export const LOCK_PORTS = [47801, 47802, 47803] as const;
export const LOCK_HOST = "127.0.0.1";
/** The service worker retries the three ports this often until one answers. */
export const LOCK_RECONNECT_INTERVAL_MS = 2000;
/** Both sides ping this often. */
export const PING_INTERVAL_MS = 5000;
/** Three unanswered pings mean the link is down. */
export const MISSED_PINGS_DOWN = 3;
/** A pairing code is valid for 2 minutes. */
export const PAIR_CODE_TTL_MS = 120_000;
/** Six digits, made with `crypto.randomInt` in the app. */
export const PAIR_CODE = /^\d{6}$/;
/** While locked, the link may be down this long before the app sends lock.app_disconnected. */
export const LOCK_DISCONNECT_GRACE_MS = 15_000;
/** The app sends exam.state on every change and at least this often. */
export const EXAM_STATE_INTERVAL_MS = 5000;
/** Focus away from every browser window this long sends tab.blocked with host null. */
export const LOCK_FOCUS_LOSS_MS = 2000;
/** At most one copy.blocked per kind in this window. */
export const COPY_BLOCKED_THROTTLE_MS = 10_000;
/** The Lock releases itself at the Üki end time plus 2 minutes. */
export const RELEASE_AFTER_END_MS = 120_000;
/** Frames larger than this many characters are refused unparsed. */
export const LOCK_MAX_MESSAGE_CHARS = 64 * 1024;

/** The only Origin the app's socket accepts. */
export function lockOrigin(extensionId: string): string {
  return `chrome-extension://${extensionId}`;
}

export function isAllowedLockOrigin(origin: string | undefined | null, extensionId: string): boolean {
  return typeof origin === "string" && extensionId !== "" && origin === lockOrigin(extensionId);
}

export const PairCode = z.string().regex(PAIR_CODE);

/**
 * What the app is doing, for the Lock popup and bar:
 * - `idle`: no exam joined (E.3 pairing only).
 * - `lobby`: joined, checking in or waiting on 1.4.
 * - `ready`: the start has come; in a browser exam the student may press Lock and start (E.4).
 * - `writing`: the exam runs.
 * - `paused`: paused by the student's absence or by the proctor.
 * - `done`: submitted, time up or ended; release follows.
 */
export const EXAM_STATE_PHASES = ["idle", "lobby", "ready", "writing", "paused", "done"] as const;
export const ExamStatePhase = z.enum(EXAM_STATE_PHASES);
export type ExamStatePhase = z.infer<typeof ExamStatePhase>;

/**
 * The Lock bar's watch label: `watching` shows `lock.watching` ("Üki watching"), `phone_found` shows
 * `exam.phone.title` ("Phone found") while the phone warning is up.
 */
export const WATCH_LABELS = ["watching", "phone_found"] as const;
export const WatchLabel = z.enum(WATCH_LABELS);
export type WatchLabel = z.infer<typeof WatchLabel>;

export const RELEASE_REASONS = ["submitted", "time_up", "ended"] as const;
export const ReleaseReason = z.enum(RELEASE_REASONS);
export type ReleaseReason = z.infer<typeof ReleaseReason>;

/**
 * Why the Lock let go: the exam tab reached `lms_done_path`, the app sent lock.release, the app reported
 * the exam done, or the end time plus 2 minutes passed with no app holding the exam.
 */
export const LOCK_RELEASE_TRIGGERS = ["done_path", "app", "exam_done", "deadline"] as const;
export const LockReleaseTrigger = z.enum(LOCK_RELEASE_TRIGGERS);
export type LockReleaseTrigger = z.infer<typeof LockReleaseTrigger>;

/**
 * Server time minus the laptop's clock in ms, from the app's ClockOffset. The app and the browser read
 * the same laptop clock, so the Lock adds it to Date.now() to get server time for its deadline and
 * countdowns.
 */
export const ClockOffsetMs = z.number().int();

export const PAIR_FAIL_REASONS = ["wrong_code", "expired", "no_code"] as const;
export const PairFailReason = z.enum(PAIR_FAIL_REASONS);
export type PairFailReason = z.infer<typeof PairFailReason>;

/** Events the Lock reports through `lock.event`; the app sends them on with `source: "lock"`. */
export const LOCK_EVENT_TYPES = [
  "tab.blocked",
  "site.closed",
  "copy.blocked",
  "lock.fullscreen_exit",
  "exam.submitted",
  // Phase 1: Ask proctor in the bar (E.5a).
  "student.help_requested",
] as const;
export type LockEventType = (typeof LOCK_EVENT_TYPES)[number];

/**
 * One event seen by the Lock. `id` is a UUIDv7 made by the Lock, so a resend after a reconnect is
 * stored once; the app uses it as the envelope id. `exam.submitted` means the exam tab reached
 * `lms_done_path`: it carries no data, and the app calls `submit_session` before it sends the event.
 */
export const LockEvent = z.discriminatedUnion("type", [
  z.object({ id: Uuid, at: UtcTimestamp, type: z.literal("tab.blocked"), data: TabBlockedLockData }),
  z.object({ id: Uuid, at: UtcTimestamp, type: z.literal("site.closed"), data: z.object({ host: Host }) }),
  z.object({
    id: Uuid,
    at: UtcTimestamp,
    type: z.literal("copy.blocked"),
    data: z.object({ kind: CopyKind }),
  }),
  z.object({
    id: Uuid,
    at: UtcTimestamp,
    type: z.literal("lock.fullscreen_exit"),
    data: z.object({ count: z.number().int().min(1) }),
  }),
  z.object({ id: Uuid, at: UtcTimestamp, type: z.literal("exam.submitted"), data: z.object({}) }),
  // Phase 1: E.5a's sheet. The app queues it in its outbox as its own event and answers help.queued.
  z.object({
    id: Uuid,
    at: UtcTimestamp,
    type: z.literal("student.help_requested"),
    data: z.object({ topic: HelpTopic, text: MessageText.optional() }),
  }),
]);
export type LockEvent = z.infer<typeof LockEvent>;

const Ping = z.object({ type: z.literal("ping"), at: z.number().optional() });
const Pong = z.object({ type: z.literal("pong"), at: z.number().optional() });

/** Messages from Üki Lock to the app. */
export const LockToApp = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("hello"),
    lock_version: z.string().min(1).max(32),
    browser: z.string().min(1).max(40),
    install_id: Uuid,
  }),
  z.object({ type: z.literal("pair.request") }),
  z.object({ type: z.literal("pair.confirm"), code: PairCode }),
  z.object({ type: z.literal("lock.started"), tabs_closed: z.number().int().nonnegative() }),
  /** `trigger` says why; `deadline` while the app still holds the exam means the browser is free. */
  z.object({
    type: z.literal("lock.released"),
    tabs_restored: z.number().int().nonnegative(),
    trigger: LockReleaseTrigger.optional(),
  }),
  /** `session_id` is the exam the Lock was locked to when the event happened; the app drops others. */
  z.object({ type: z.literal("lock.event"), session_id: Uuid.optional(), event: LockEvent }),
  Ping,
  Pong,
]);
export type LockToApp = z.infer<typeof LockToApp>;

/**
 * The exam the Lock guards, inside `exam.state`. `allowed_hosts` is the host of `lms_url` plus
 * `allowed_sites` for browser exams, and empty for exams in the app. `ends_at` is
 * `session_ends_at`, so the Lock can release itself 2 minutes after it.
 */
export const LockExam = z.object({
  session_id: Uuid,
  mode: ExamMode,
  title: z.string(),
  starts_at: Timestamp,
  ends_at: Timestamp,
  allowed_hosts: z.array(Host),
  lms_url: z.string().nullable(),
  done_path: z.string().nullable(),
  /**
   * Phase 1: E.1's rules from join_exam. Copy and paste, print and full screen follow them; with a
   * rule off the Lock skips that guard and its event. Missing from an older app: every rule is on
   * (effectiveBrowserRules in browser-rules.ts).
   */
  browser_rules: BrowserRules.nullish(),
});
export type LockExam = z.infer<typeof LockExam>;

/** Messages from the app to Üki Lock. */
export const AppToLock = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("hello"),
    app_version: z.string().min(1).max(32),
    os: DesktopOs,
    paired: z.boolean(),
    student_name: z.string().nullable(),
  }),
  z.object({ type: z.literal("pair.code"), code: PairCode, expires_at: UtcTimestamp }),
  z.object({ type: z.literal("pair.ok") }),
  z.object({ type: z.literal("pair.fail"), reason: PairFailReason }),
  /**
   * On every change and every 5 s. `exam` is null in phase `idle`. Its times are server time;
   * `clock_offset_ms` lets the Lock read them without trusting the laptop clock.
   */
  z.object({
    type: z.literal("exam.state"),
    phase: ExamStatePhase,
    watch: WatchLabel,
    locale: Locale,
    exam: LockExam.nullable(),
    clock_offset_ms: ClockOffsetMs.optional(),
  }),
  /** Exams in the app: lock the browser when 2.1 opens. */
  z.object({ type: z.literal("lock.start") }),
  z.object({ type: z.literal("lock.release"), reason: ReleaseReason }),
  /** Phase 1: the app queued the Lock's student.help_requested with this event id; E.5a confirms. */
  z.object({ type: z.literal("help.queued"), id: Uuid }),
  Ping,
  Pong,
]);
export type AppToLock = z.infer<typeof AppToLock>;

export type LockMessageType = LockToApp["type"] | AppToLock["type"];

export type LockParseResult<T> = { ok: true; message: T } | { ok: false; error: string };

function parseWith<T>(schema: z.ZodType<T>, raw: string): LockParseResult<T> {
  if (raw.length > LOCK_MAX_MESSAGE_CHARS) return { ok: false, error: "message too large" };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: "not JSON" };
  }
  const result = schema.safeParse(json);
  return result.success ? { ok: true, message: result.data } : { ok: false, error: result.error.message };
}

/** Parses a frame the app received from the Lock. */
export function parseLockToApp(raw: string): LockParseResult<LockToApp> {
  return parseWith(LockToApp, raw);
}

/** Parses a frame the Lock received from the app. */
export function parseAppToLock(raw: string): LockParseResult<AppToLock> {
  return parseWith(AppToLock, raw);
}

/** Parses a frame by its sender: `lock` for frames the app receives, `app` for frames the Lock receives. */
export function parseLockMessage(raw: string, from: "lock"): LockParseResult<LockToApp>;
export function parseLockMessage(raw: string, from: "app"): LockParseResult<AppToLock>;
export function parseLockMessage(raw: string, from: "lock" | "app"): LockParseResult<LockToApp | AppToLock> {
  return from === "lock" ? parseLockToApp(raw) : parseAppToLock(raw);
}

/** One JSON text frame. */
export function encodeLockMessage(message: LockToApp | AppToLock): string {
  return JSON.stringify(message);
}

/**
 * The envelope the app sends to `ingest` for a Lock event. For `exam.submitted`, pass the
 * `time_used_s` that `submit_session` returned; the other types carry the Lock's data unchanged.
 */
export function lockEventToEnvelope(
  event: LockEvent,
  ctx: { session_id: string; seq: number; app_version: string; time_used_s?: number },
): EventEnvelope {
  let data: Record<string, unknown> = { ...event.data };
  if (event.type === "exam.submitted") {
    if (ctx.time_used_s === undefined)
      throw new Error("exam.submitted needs time_used_s from submit_session");
    data = { time_used_s: ctx.time_used_s };
  }
  return {
    id: event.id,
    session_id: ctx.session_id,
    type: event.type,
    source: "lock",
    at: event.at,
    seq: ctx.seq,
    data,
    frame_count: 0,
    app_version: ctx.app_version,
  };
}
