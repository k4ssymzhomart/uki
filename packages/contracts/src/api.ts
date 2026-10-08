// Input and output of every call in "Endpoints" (docs/phase-0-plan.md), the error shapes, and the
// Storage layout of flagged stills.
import { z } from "zod";
import { BrowserRules } from "./browser-rules.ts";
import { ExamChecks, THRESHOLDS } from "./checks.ts";
import {
  AddTimePayload,
  CommandBroadcast,
  EndPayload,
  MessagePayload,
  PausePayload,
  PENDING_COMMANDS_MAX,
  ResumePayload,
} from "./commands.ts";
import { ClientEventEnvelope } from "./events.ts";
import { Timestamp, Uuid } from "./primitives.ts";
import {
  DesktopOs,
  ExamMode,
  ExamStatus,
  Locale,
  LocalizedText,
  SessionState,
  StatusStep,
} from "./session.ts";
import { StatusDetailText } from "./status-detail.ts";

// ---------------------------------------------------------------------------------------------------
// Storage constants (used by the schemas below)
// ---------------------------------------------------------------------------------------------------

/** The private bucket for flagged stills; nothing else is uploaded anywhere. */
export const FRAMES_BUCKET = "frames";

/** Every flagged still: JPEG, 640 × 360 centre-cropped from 640 × 480, quality 0.7, up to 3, ≤ 200 KB. */
export const STILL = {
  mimeType: "image/jpeg",
  width: 640,
  height: 360,
  quality: 0.7,
  maxCount: 3,
  maxBytes: 200 * 1024,
} as const;

// ---------------------------------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------------------------------

/**
 * Codes the Edge Functions return in `ApiError.error`, with the HTTP status in brackets:
 * bad_request (400), unauthorized (401), forbidden (403), not_found (404), method_not_allowed (405),
 * conflict (409, for example a command on a session in a final state), rate_limited (429),
 * internal (500).
 */
export const API_ERROR_CODES = [
  "bad_request",
  "unauthorized",
  "forbidden",
  "not_found",
  "method_not_allowed",
  "conflict",
  "rate_limited",
  "internal",
] as const;
export const ApiErrorCode = z.enum(API_ERROR_CODES);
export type ApiErrorCode = z.infer<typeof ApiErrorCode>;

/** Body of every non-2xx Edge Function reply. `message` is for logs, never shown to a student. */
export const ApiError = z.object({ error: ApiErrorCode, message: z.string().optional() });
export type ApiError = z.infer<typeof ApiError>;

/**
 * Errors `join_exam` raises. The function raises them as the exception message
 * (`raise exception using message = 'invalid_code'`), so PostgREST returns them in `error.message`.
 * A student not on the roster also gets `invalid_code`.
 */
export const JOIN_ERROR_CODES = ["invalid_code", "already_joined", "lobby_closed", "rate_limited"] as const;
export const JoinErrorCode = z.enum(JOIN_ERROR_CODES);
export type JoinErrorCode = z.infer<typeof JoinErrorCode>;

/** Errors `submit_session` raises the same way. */
export const SUBMIT_ERROR_CODES = ["not_found", "forbidden"] as const;
export const SubmitErrorCode = z.enum(SUBMIT_ERROR_CODES);
export type SubmitErrorCode = z.infer<typeof SubmitErrorCode>;

/** Errors `start_exam` raises the same way: `already_started` once the scheduled start has passed. */
export const START_ERROR_CODES = ["not_found", "forbidden", "already_started"] as const;
export const StartErrorCode = z.enum(START_ERROR_CODES);
export type StartErrorCode = z.infer<typeof StartErrorCode>;

/**
 * The first of `codes` found in a PostgREST or RPC error (`message`, then `details`, then `hint`),
 * or null. Accepts anything, so it can take the `error` of a supabase-js result directly.
 */
export function matchErrorCode<const C extends string>(error: unknown, codes: readonly C[]): C | null {
  if (typeof error !== "object" || error === null) return null;
  const record = error as Record<string, unknown>;
  for (const field of ["message", "details", "hint"]) {
    const text = record[field];
    if (typeof text !== "string") continue;
    const trimmed = text.trim();
    for (const code of codes) {
      if (trimmed === code) return code;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------
// rpc join_exam
// ---------------------------------------------------------------------------------------------------

/** Exam codes look like MATH2-204-FRI and are not case sensitive. */
export const ExamCode = z
  .string()
  .trim()
  .toUpperCase()
  .min(3)
  .max(32)
  .regex(/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/);

/** 8 digits, printed on the student card. */
export const StudentNumber = z
  .string()
  .trim()
  .regex(/^\d{8}$/);

export const Device = z.object({
  os: DesktopOs,
  app_version: z.string().min(1).max(32),
  browser: z.string().min(1).max(40).optional(),
  lock_version: z.string().min(1).max(32).optional(),
});
export type Device = z.infer<typeof Device>;

/** Arguments of `rpc('join_exam', ...)`; the SQL parameters carry these names. */
export const JoinExamInput = z.object({
  code: ExamCode,
  student_number: StudentNumber,
  locale: Locale,
  device: Device,
});
export type JoinExamInput = z.infer<typeof JoinExamInput>;

export const Choice = z.object({ id: z.string().min(1), body: LocalizedText });
export type Choice = z.infer<typeof Choice>;

export const Question = z.object({
  id: Uuid,
  position: z.number().int(),
  body: LocalizedText,
  choices: z.array(Choice),
});
export type Question = z.infer<typeof Question>;

/** The student's session as `join_exam` returns it. */
export const JoinSession = z.object({
  id: Uuid,
  state: SessionState,
  locale: Locale,
  started_at: Timestamp.nullable(),
  extra_min: z.number().int().nonnegative(),
  paused_s: z.number().int().nonnegative(),
  joined_at: Timestamp.nullish(),
  submitted_at: Timestamp.nullish(),
  ended_at: Timestamp.nullish(),
  end_reason: z.string().nullish(),
  time_used_s: z.number().int().nonnegative().nullish(),
  /** Read leniently so a format slip never blocks a join; the database must issue RECEIPT_ID_PATTERN ids. */
  receipt_id: z.string().min(1).max(64).nullish(),
});
export type JoinSession = z.infer<typeof JoinSession>;

export const JoinExam = z.object({
  id: Uuid,
  title: z.string(),
  course: z.string(),
  kind: z.string(),
  mode: ExamMode,
  starts_at: Timestamp,
  duration_min: z.number().int().positive(),
  lobby_opens_at: Timestamp,
  status: ExamStatus,
  checks: ExamChecks,
  lms_url: z.string().nullable(),
  lms_done_path: z.string().nullable(),
  allowed_sites: z.array(z.string()),
  /** Phase 1: E.1's rules, for the Lock's exam.state; optional so an older server still parses. */
  browser_rules: BrowserRules.optional(),
  /** Phase 1: the rules language the exam office picked on 0.4, and the room. */
  rules_locale: Locale.nullish(),
  room: z.string().nullish(),
});
export type JoinExam = z.infer<typeof JoinExam>;

export const JoinStudent = z.object({ id: Uuid, full_name: z.string(), student_number: z.string() });
export type JoinStudent = z.infer<typeof JoinStudent>;

/**
 * What `join_exam` returns (one JSON object). `questions` is null before the exam starts, then every
 * question in `position` order. `proctor_name` is the assigned proctor for the student's seat, for
 * 1.3a. `server_time` is `now()`.
 */
export const JoinExamOutput = z.object({
  session: JoinSession,
  exam: JoinExam,
  student: JoinStudent,
  proctor_name: z.string().nullable(),
  questions: z.array(Question).nullable(),
  server_time: Timestamp,
});
export type JoinExamOutput = z.infer<typeof JoinExamOutput>;

// ---------------------------------------------------------------------------------------------------
// POST /functions/v1/ingest
// ---------------------------------------------------------------------------------------------------

/**
 * Optional status in an ingest call; `ingest` writes it to `sessions.status`. Setting `step` moves the
 * session forward (see `nextState`). `detail` is a wire form of the status-detail.ts vocabulary
 * (`formatStatusDetail`); `question` is the 1-based question number on screen.
 */
export const IngestStatus = z.object({
  step: StatusStep.optional(),
  detail: StatusDetailText.optional(),
  question: z.number().int().positive().optional(),
  /**
   * Phase 1: the language the rules were read in on 1.4, sent with step `ready` after the agree box.
   * ingest_batch stamps it with sessions.rules_accepted_at once; without it the session's locale counts.
   */
  rules_locale: Locale.optional(),
});
export type IngestStatus = z.infer<typeof IngestStatus>;

export const IngestRequest = z
  .object({
    session_id: Uuid,
    events: z.array(ClientEventEnvelope).max(THRESHOLDS.outbox.maxBatch),
    status: IngestStatus.optional(),
  })
  .superRefine((request, ctx) => {
    request.events.forEach((event, index) => {
      if (event.session_id !== request.session_id) {
        ctx.addIssue({
          code: "custom",
          path: ["events", index, "session_id"],
          message: "event belongs to another session",
        });
      }
    });
  });
export type IngestRequest = z.infer<typeof IngestRequest>;
export type IngestRequestInput = z.input<typeof IngestRequest>;

/** One signed upload for a still: PUT the JPEG to `signed_url`, or `uploadToSignedUrl(path, token, blob)`. */
export const SignedStillUpload = z.object({
  index: z.number().int().min(0).max(2),
  path: z.string(),
  token: z.string(),
  signed_url: z.string(),
});
export type SignedStillUpload = z.infer<typeof SignedStillUpload>;

/**
 * The session's timing after this call, so the app's timer follows the server: `ends_at` is
 * `session_ends_at(session)`.
 */
export const IngestSession = z.object({
  state: SessionState,
  ends_at: Timestamp,
  extra_min: z.number().int().nonnegative(),
  paused_s: z.number().int().nonnegative(),
});
export type IngestSession = z.infer<typeof IngestSession>;

/**
 * `accepted`: ids stored by this call. `duplicates`: ids already stored. `uploads`: for every flag
 * event in the batch with `frame_count > 0`, new or duplicate, the stills not yet confirmed by
 * `frames`, each with a fresh signed upload URL valid for 2 hours. `pending_commands`: the session's
 * commands with no `acked_at`, oldest first, at most PENDING_COMMANDS_MAX, shaped like the `command`
 * broadcast; the app applies each once by id and acks it, so the ingest heartbeat delivers a command
 * whose broadcast was lost. The `ingest` function always sends it; it is optional for older servers.
 */
export const IngestResponse = z.object({
  accepted: z.array(Uuid),
  duplicates: z.array(Uuid),
  uploads: z.array(z.object({ event_id: Uuid, stills: z.array(SignedStillUpload) })),
  session: IngestSession,
  pending_commands: z.array(CommandBroadcast).max(PENDING_COMMANDS_MAX).optional(),
  server_time: Timestamp,
});
export type IngestResponse = z.infer<typeof IngestResponse>;

// ---------------------------------------------------------------------------------------------------
// POST /functions/v1/frames
// ---------------------------------------------------------------------------------------------------

/**
 * Confirms uploaded stills. Each path must be `stillPath(exam_id, session_id, event_id, index)` of
 * this session and event, and the object must exist. `frames.captured_at` is the event's `at` plus
 * `THRESHOLDS.stills.offsetsMs[index]`.
 */
export const FramesRequest = z.object({
  event_id: Uuid,
  paths: z.array(z.string().min(1)).min(1).max(STILL.maxCount),
});
export type FramesRequest = z.infer<typeof FramesRequest>;

/** One frame id per path, in request order; a path confirmed before returns its existing id. */
export const FramesResponse = z.object({ frame_ids: z.array(Uuid) });
export type FramesResponse = z.infer<typeof FramesResponse>;

// ---------------------------------------------------------------------------------------------------
// rpc submit_session, rpc start_exam
// ---------------------------------------------------------------------------------------------------

export const SubmitSessionInput = z.object({ session_id: Uuid });
export type SubmitSessionInput = z.infer<typeof SubmitSessionInput>;

/**
 * `state` is `submitted`, `time_up`, or `ended` for a session a proctor ended. `receipt_id` follows
 * RECEIPT_ID_PATTERN (receipt.ts); it is read leniently so a format slip never hides the receipt.
 */
export const SubmitSessionOutput = z.object({
  receipt_id: z.string().min(1).max(64),
  time_used_s: z.number().int().nonnegative(),
  state: z.enum(["submitted", "time_up", "ended"]),
});
export type SubmitSessionOutput = z.infer<typeof SubmitSessionOutput>;

export const StartExamInput = z.object({ exam_id: Uuid });
export type StartExamInput = z.infer<typeof StartExamInput>;

export const StartExamOutput = z.object({ starts_at: Timestamp });
export type StartExamOutput = z.infer<typeof StartExamOutput>;

// ---------------------------------------------------------------------------------------------------
// answers upsert (PostgREST)
// ---------------------------------------------------------------------------------------------------

/** One row upserted into `answers` on (session_id, question_id); the later `saved_at` wins. */
export const AnswerUpsert = z.object({
  session_id: Uuid,
  question_id: Uuid,
  choice_id: z.string().min(1),
  saved_at: Timestamp,
});
export type AnswerUpsert = z.infer<typeof AnswerUpsert>;

// ---------------------------------------------------------------------------------------------------
// POST /functions/v1/command
// ---------------------------------------------------------------------------------------------------

function requestVariants<S extends z.ZodRawShape>(shape: S) {
  return [
    z.strictObject({ ...shape, type: z.literal("pause"), payload: PausePayload }),
    z.strictObject({ ...shape, type: z.literal("resume"), payload: ResumePayload }),
    z.strictObject({ ...shape, type: z.literal("end"), payload: EndPayload }),
    z.strictObject({ ...shape, type: z.literal("message"), payload: MessagePayload }),
    z.strictObject({ ...shape, type: z.literal("add_time"), payload: AddTimePayload }),
  ] as const;
}

/**
 * The caller's id for one command call (UUIDv7). A call with a request id that already issued commands
 * returns those ids and issues nothing, so a call that failed at the gateway can be sent again. The
 * `command` function makes one when the request has none.
 */
export const CommandRequestId = Uuid;

/** A command for one student. */
export const SessionCommandRequest = z.union(
  requestVariants({ session_id: Uuid, request_id: CommandRequestId.optional() }),
);
export type SessionCommandRequest = z.infer<typeof SessionCommandRequest>;

/** A command for every session of the exam in rules, ready, writing or paused. */
export const GroupCommandRequest = z.union(
  requestVariants({ exam_id: Uuid, scope: z.literal("group"), request_id: CommandRequestId.optional() }),
);
export type GroupCommandRequest = z.infer<typeof GroupCommandRequest>;

/**
 * Either `{ session_id, type, payload }` or `{ exam_id, scope: "group", type, payload }`, never both.
 * `start` is not accepted: only `start_exam` issues it. A `scope` inside a message or add_time
 * payload must match the target: `student` with `session_id`, `group` with `exam_id`.
 */
export const CommandRequest = z
  .union([SessionCommandRequest, GroupCommandRequest])
  .superRefine((request, ctx) => {
    const payload: object = request.payload;
    if (!("scope" in payload)) return;
    const expected = "exam_id" in request ? "group" : "student";
    if (payload.scope !== expected) {
      ctx.addIssue({
        code: "custom",
        path: ["payload", "scope"],
        message: `scope must be "${expected}" for this target`,
      });
    }
  });
export type CommandRequest = z.infer<typeof CommandRequest>;

/** One id per inserted `session_commands` row: one for a student, one per session for a group. */
export const CommandResponse = z.object({ command_ids: z.array(Uuid) });
export type CommandResponse = z.infer<typeof CommandResponse>;

// ---------------------------------------------------------------------------------------------------
// POST /functions/v1/stills
// ---------------------------------------------------------------------------------------------------

export const StillsRequest = z.object({ event_id: Uuid });
export type StillsRequest = z.infer<typeof StillsRequest>;

/** Signed 5-minute URLs, ordered by `captured_at`. */
export const StillsResponse = z.object({
  urls: z.array(z.object({ frame_id: Uuid, url: z.string(), captured_at: Timestamp })),
});
export type StillsResponse = z.infer<typeof StillsResponse>;

/** Lifetime of the signed URLs `stills` returns. */
export const STILL_VIEW_URL_TTL_S = 300;
/** Lifetime of the signed upload URLs `ingest` returns. */
export const STILL_UPLOAD_URL_TTL_S = 7200;

// ---------------------------------------------------------------------------------------------------
// Storage: flagged stills
// ---------------------------------------------------------------------------------------------------

const UUID_SOURCE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const STILL_PATH = new RegExp(`^(${UUID_SOURCE})/(${UUID_SOURCE})/(${UUID_SOURCE})-([0-2])\\.jpg$`);

/** `<exam_id>/<session_id>/<event_id>-<index>.jpg` inside the `frames` bucket; index 0 to 2. */
export function stillPath(examId: string, sessionId: string, eventId: string, index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= STILL.maxCount) {
    throw new RangeError(`still index ${index} is outside 0..${STILL.maxCount - 1}`);
  }
  return `${examId.toLowerCase()}/${sessionId.toLowerCase()}/${eventId.toLowerCase()}-${index}.jpg`;
}

export interface StillPathParts {
  examId: string;
  sessionId: string;
  eventId: string;
  index: number;
}

/** The parts of a still path, or null when it is not exactly the shape `stillPath` makes. */
export function parseStillPath(path: string): StillPathParts | null {
  const match = STILL_PATH.exec(path);
  if (!match) return null;
  const [, examId, sessionId, eventId, index] = match;
  if (examId === undefined || sessionId === undefined || eventId === undefined || index === undefined) {
    return null;
  }
  return { examId, sessionId, eventId, index: Number(index) };
}

/** True only for a still path under this exam and session (lower-case ids, no other shape). */
export function isStillPathFor(path: string, examId: string, sessionId: string): boolean {
  const parts = parseStillPath(path);
  return (
    parts !== null && parts.examId === examId.toLowerCase() && parts.sessionId === sessionId.toLowerCase()
  );
}
