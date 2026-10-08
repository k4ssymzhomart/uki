// Every event is named and typed here and only here. The envelope and the review map are the plan's
// ("Event envelope"); EVENT_DATA follows its "Event data" table.
import { z } from "zod";
import { CommandScope, END_REASON_MAX, MessagePreset, MessageText } from "./commands.ts";
import { Host, Timestamp, UtcTimestamp, Uuid } from "./primitives.ts";

export const EVENT_TYPES = [
  "gaze.on_screen",
  "gaze.off_screen",
  "gaze.down",
  "phone.detected",
  "face.missing",
  "face.second",
  "camera.lost",
  "tab.blocked",
  "copy.blocked",
  "site.closed",
  "net.offline",
  "identity.matched",
  "exam.started",
  "browser.locked",
  "answer.saved",
  "session.paused",
  "session.resumed",
  "exam.submitted",
  "exam.time_up",
  "proctor.paused",
  "proctor.resumed",
  "proctor.ended",
  "proctor.time_added",
  "proctor.message",
  "student.help_requested",
  "lock.app_disconnected",
  "lock.fullscreen_exit",
  // Phase 1
  "proctor.note",
] as const;
export const EventType = z.enum(EVENT_TYPES);
export type EventType = z.infer<typeof EventType>;

/** Mirrors the SQL enum `event_source`. */
export const EVENT_SOURCES = ["app", "lock", "proctor", "server"] as const;
export const EventSource = z.enum(EVENT_SOURCES);
export type EventSource = z.infer<typeof EventSource>;

/** Mirrors the SQL enum `event_review`. */
export const EVENT_REVIEWS = ["flag", "log", "none"] as const;
export const EventReview = z.enum(EVENT_REVIEWS);
export type EventReview = z.infer<typeof EventReview>;

export const EventEnvelope = z.object({
  id: Uuid, // UUIDv7, made on the laptop
  session_id: Uuid,
  type: EventType,
  source: EventSource,
  at: UtcTimestamp, // laptop clock, UTC; server also stores received_at
  seq: z.number().int().nonnegative(), // per session, increments by 1; server-written events have none
  data: z.record(z.string(), z.unknown()),
  frame_count: z.number().int().min(0).max(3).default(0),
  app_version: z.string(),
});
export type EventEnvelope = z.infer<typeof EventEnvelope>;
/** What a sender may write before defaults apply (`frame_count` may be left out). */
export type EventEnvelopeInput = z.input<typeof EventEnvelope>;

// Review is set on the server from this map, never trusted from the client.
export const REVIEW: Record<(typeof EVENT_TYPES)[number], "flag" | "log" | "none"> = {
  "gaze.on_screen": "none",
  "gaze.off_screen": "flag",
  "gaze.down": "flag",
  "phone.detected": "flag",
  "face.missing": "flag",
  "face.second": "flag",
  "camera.lost": "flag",
  "tab.blocked": "flag",
  "copy.blocked": "log",
  "site.closed": "log",
  "net.offline": "log",
  "identity.matched": "none",
  "exam.started": "none",
  "browser.locked": "none",
  "answer.saved": "none",
  "session.paused": "log",
  "session.resumed": "none",
  "exam.submitted": "none",
  "exam.time_up": "none",
  "proctor.paused": "log",
  "proctor.resumed": "log",
  "proctor.ended": "flag",
  "proctor.time_added": "log",
  "proctor.message": "log",
  "student.help_requested": "log",
  "lock.app_disconnected": "flag",
  "lock.fullscreen_exit": "log", // the third exit in a session is a flag
  // Phase 1: a proctor's note on 2.5 and 3.3 (add_session_note) stays on the timeline only.
  "proctor.note": "none",
};

/** From this many full-screen exits in one session on, lock.fullscreen_exit is a flag. */
export const FULLSCREEN_EXIT_FLAG_FROM = 3;

/**
 * The review the server stores. `fullscreenExitCount` is the server's own count of
 * lock.fullscreen_exit events in the session including this one (never the client's `data.count`).
 * The third exit is a flag, and so is every later one, so a race between two ingest calls cannot skip
 * the flag.
 */
export function serverReview(type: EventType, ctx: { fullscreenExitCount: number }): EventReview {
  if (type === "lock.fullscreen_exit") {
    return ctx.fullscreenExitCount >= FULLSCREEN_EXIT_FLAG_FROM ? "flag" : "log";
  }
  return REVIEW[type];
}

/** Events the dashboard's `command` function writes; `ingest` refuses them from clients. */
export const PROCTOR_EVENT_TYPES = [
  "proctor.paused",
  "proctor.resumed",
  "proctor.ended",
  "proctor.time_added",
  "proctor.message",
  // Phase 1: add_session_note writes it.
  "proctor.note",
] as const satisfies readonly EventType[];

/** Event types a client (the app, or Üki Lock through the app) may send to `ingest`. */
export const CLIENT_EVENT_TYPES = EVENT_TYPES.filter(
  (type): type is Exclude<EventType, (typeof PROCTOR_EVENT_TYPES)[number]> =>
    !(PROCTOR_EVENT_TYPES as readonly string[]).includes(type),
);
export type ClientEventType = Exclude<EventType, (typeof PROCTOR_EVENT_TYPES)[number]>;

/** Sources a client may send to `ingest`. */
export const CLIENT_EVENT_SOURCES = ["app", "lock"] as const;

// ---------------------------------------------------------------------------------------------------
// Event data
// ---------------------------------------------------------------------------------------------------

const DurationMs = z.number().int().nonnegative();
const Score = z.number().min(0).max(1);

export const GazeDirection = z.enum(["left", "right", "up"]);
export type GazeDirection = z.infer<typeof GazeDirection>;
export const CameraLostReason = z.enum(["ended", "muted", "error"]);
export type CameraLostReason = z.infer<typeof CameraLostReason>;
export const CopyKind = z.enum(["copy", "cut", "paste", "print"]);
export type CopyKind = z.infer<typeof CopyKind>;
/**
 * Why the app paused its own session: the reasons a client may send in session.paused. "proctor" is
 * not one of them: only the server's proctor.paused is a proctor pause, so a forged session.paused
 * cannot escape the 300 s self-pause cap ("Session states").
 */
export const ClientPauseReason = z.enum(["face_missing", "camera_lost"]);
export type ClientPauseReason = z.infer<typeof ClientPauseReason>;
/** A pause's reason as the wall shows it: a self pause's reason, or "proctor" for proctor.paused. */
export const PauseReason = z.enum(["face_missing", "camera_lost", "proctor"]);
export type PauseReason = z.infer<typeof PauseReason>;
/**
 * Why a student asks the proctor. 1.3's Ask proctor sends `identity`; the sheet on 2.1 to 2.3 and in the
 * Lock bar (E.5a) offers E.5a's four reasons: Question is unclear (`question`), Technical problem
 * (`technical`), I need a break (`break`) and Something else (`other`). Phase 1 added the last two
 * (20261010060000_help_topics.sql; docs/decisions.md, 1.6 Ask proctor).
 */
export const HELP_TOPICS = ["identity", "question", "technical", "break", "other"] as const;
export const HelpTopic = z.enum(HELP_TOPICS);
export type HelpTopic = z.infer<typeof HelpTopic>;
/** The reasons E.5a's sheet offers, in its order (catalog lock.ask.reason.*). */
export const ASK_REASONS = [
  "question",
  "technical",
  "break",
  "other",
] as const satisfies readonly HelpTopic[];
export const AskReason = z.enum(ASK_REASONS);
export type AskReason = z.infer<typeof AskReason>;
/** The sheet's optional note: E.5a's counter reads "32/200". The server keeps up to 280 (MessageText). */
export const HELP_NOTE_MAX = 200;
/** `lock` when the extension or browser went away, `app` after an app crash. */
export const DisconnectSide = z.enum(["lock", "app"]);
export type DisconnectSide = z.infer<typeof DisconnectSide>;

/** A proctor.note's text: what add_session_note accepts (AddSessionNoteInput in review.ts). */
export const SESSION_NOTE_TEXT_MAX = 500;

/** A blocked app's display name from blocked-apps.ts, like "Telegram". */
export const BlockedAppName = z.string().min(1).max(100);

const Empty = z.object({});

/**
 * A group command (scope `group`) writes one proctor.time_added or proctor.message per session; all
 * of them carry the same `group_id` (`session_commands.group_id`), so the wall's feed shows the
 * command once.
 */
export const CommandGroupId = Uuid;

/** From Üki Lock: the tab's host, or null when focus left every browser window. */
export const TabBlockedLockData = z.object({ host: Host.nullable() });
/** From the desktop app: the blocked app's name, or null when focus left the exam window. */
export const TabBlockedAppData = z.object({ app: BlockedAppName.nullable() });

export const EVENT_DATA = {
  "gaze.on_screen": Empty,
  "gaze.off_screen": z.object({ duration_ms: DurationMs, direction: GazeDirection }),
  "gaze.down": z.object({ duration_ms: DurationMs }),
  "phone.detected": z.object({ score: Score, held_ms: DurationMs }),
  "face.missing": z.object({ duration_ms: DurationMs }),
  "face.second": z.object({ duration_ms: DurationMs, faces: z.number().int().min(2) }),
  "camera.lost": z.object({ reason: CameraLostReason }),
  "tab.blocked": z.union([TabBlockedLockData, TabBlockedAppData]),
  "copy.blocked": z.object({ kind: CopyKind }),
  "site.closed": z.object({ host: Host }),
  "net.offline": z.object({ offline_ms: DurationMs, queued: z.number().int().nonnegative() }),
  "identity.matched": z.object({ score: Score, tries: z.number().int().min(1) }),
  "exam.started": Empty,
  "browser.locked": Empty,
  "answer.saved": z.object({ question_id: Uuid }),
  "session.paused": z.object({ reason: ClientPauseReason }),
  "session.resumed": z.object({ paused_ms: DurationMs, by: z.literal("student") }),
  "exam.submitted": z.object({ time_used_s: z.number().int().nonnegative() }),
  "exam.time_up": Empty,
  "proctor.paused": z.object({ staff_id: Uuid }),
  "proctor.resumed": z.object({ staff_id: Uuid }),
  "proctor.ended": z.object({ staff_id: Uuid, reason: z.string().min(1).max(END_REASON_MAX) }),
  "proctor.time_added": z.object({
    minutes: z.number().int().min(1).max(60),
    scope: CommandScope,
    group_id: CommandGroupId.optional(),
  }),
  "proctor.message": z.union([
    z.object({ text: MessageText, scope: CommandScope, group_id: CommandGroupId.optional() }),
    z.object({ preset: MessagePreset, scope: CommandScope, group_id: CommandGroupId.optional() }),
  ]),
  "student.help_requested": z.object({ topic: HelpTopic, text: MessageText.optional() }),
  "lock.app_disconnected": z.object({ side: DisconnectSide }),
  "lock.fullscreen_exit": z.object({ count: z.number().int().min(1) }),
  // Phase 1
  "proctor.note": z.object({ text: z.string().trim().min(1).max(SESSION_NOTE_TEXT_MAX), staff_id: Uuid }),
} as const satisfies Record<EventType, z.ZodType>;

export type EventData<T extends EventType> = z.infer<(typeof EVENT_DATA)[T]>;

export type DataParseResult<T> = { success: true; data: T } | { success: false; error: z.ZodError };

/** Checks `data` against its type's schema. Unknown keys are stripped from the result. */
export function parseEventData<T extends EventType>(type: T, data: unknown): DataParseResult<EventData<T>> {
  const schema = EVENT_DATA[type] as unknown as z.ZodType<EventData<T>>;
  const result = schema.safeParse(data);
  return result.success ? { success: true, data: result.data } : { success: false, error: result.error };
}

/**
 * An envelope `ingest` accepts from a client: source `app` or `lock`, no proctor event, and `data`
 * valid for its type. IngestRequest also checks that `session_id` matches the request.
 */
export const ClientEventEnvelope = EventEnvelope.extend({
  source: z.enum(CLIENT_EVENT_SOURCES),
}).superRefine((event, ctx) => {
  if ((PROCTOR_EVENT_TYPES as readonly string[]).includes(event.type)) {
    ctx.addIssue({
      code: "custom",
      path: ["type"],
      message: "proctor events come only from the command function",
    });
    return;
  }
  const result = EVENT_DATA[event.type].safeParse(event.data);
  if (!result.success) {
    for (const issue of result.error.issues) {
      ctx.addIssue({ code: "custom", path: ["data", ...issue.path], message: issue.message });
    }
  }
});
export type ClientEventEnvelope = z.infer<typeof ClientEventEnvelope>;

/**
 * A stored event as the `events_broadcast` trigger sends it to `exam:{exam_id}` (broadcast event
 * `event`) and as the wall reads it from `events`. `seq` and `app_version` stay in the table.
 */
export const CompactEvent = z.object({
  id: Uuid,
  session_id: Uuid,
  exam_id: Uuid,
  type: EventType,
  source: EventSource,
  review: EventReview,
  at: Timestamp,
  received_at: Timestamp,
  data: z.record(z.string(), z.unknown()),
  frame_count: z.number().int().min(0).max(3),
});
export type CompactEvent = z.infer<typeof CompactEvent>;
