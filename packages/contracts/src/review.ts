// Help requests (2.4d), the review (3.2, 3.3, Mark reviewed in 2.4a, Add note in 2.5), the integrity
// report (3.4, 3.5), its share link and the verify code: the shapes of close_help_request,
// decide_session, add_session_note, get_report, create_share, revoke_share, open_shared_report and
// verify_report (supabase/migrations/20261009000000_phase1.sql and 20261012160000_verify_codes_share_revoke.sql).
import { z } from "zod";
import { MessageText } from "./commands.ts";
import { HelpTopic, SESSION_NOTE_TEXT_MAX } from "./events.ts";
import { Timestamp, Uuid } from "./primitives.ts";
import { ExamMode, ExamStatus, Locale, SessionState } from "./session.ts";

// ---------------------------------------------------------------------------------------------------
// Help requests
// ---------------------------------------------------------------------------------------------------

/**
 * One `help_requests` row with the student, as 2.4d lists it and as the `help` broadcast on
 * exam:{exam_id} carries it (once when the request arrives, again with `done_at` when it closes).
 */
export const HelpRequest = z.object({
  id: Uuid,
  session_id: Uuid,
  exam_id: Uuid,
  student_id: Uuid,
  student_name: z.string(),
  topic: HelpTopic,
  text: z.string().nullable(),
  created_at: Timestamp,
  reply: z.string().nullable(),
  done_at: Timestamp.nullable(),
  done_by: Uuid.nullable(),
});
export type HelpRequest = z.infer<typeof HelpRequest>;

/** Arguments of `rpc('close_help_request', ...)`: Mark done, or Reply (which also closes it). */
export const CloseHelpRequestInput = z.object({ id: Uuid, reply: MessageText.optional() });
export type CloseHelpRequestInput = z.infer<typeof CloseHelpRequestInput>;

/** The closed request; `message_sent` is true when the reply went to the student as a message. */
export const CloseHelpRequestOutput = HelpRequest.extend({ message_sent: z.boolean() });
export type CloseHelpRequestOutput = z.infer<typeof CloseHelpRequestOutput>;

/** Open requests first, oldest first: the order of 2.4d. */
export function sortHelpRequests<T extends Pick<HelpRequest, "created_at" | "done_at">>(
  requests: readonly T[],
): T[] {
  return [...requests].sort((a, b) => {
    if ((a.done_at === null) !== (b.done_at === null)) return a.done_at === null ? -1 : 1;
    return Date.parse(a.created_at) - Date.parse(b.created_at);
  });
}

// ---------------------------------------------------------------------------------------------------
// Decisions and notes
// ---------------------------------------------------------------------------------------------------

/** Mirrors the SQL enum `review_decision`: the three choices on 3.3. */
export const REVIEW_DECISIONS = ["no_issue", "talk", "committee"] as const;
export const ReviewDecisionValue = z.enum(REVIEW_DECISIONS);
export type ReviewDecisionValue = z.infer<typeof ReviewDecisionValue>;

export const DECISION_NOTE_MAX = 1000;

/** One `review_decisions` row: one per session, covering all of its flags. */
export const ReviewDecision = z.object({
  session_id: Uuid,
  exam_id: Uuid,
  decision: ReviewDecisionValue,
  note: z.string().nullable(),
  reviewer_id: Uuid,
  decided_at: Timestamp,
});
export type ReviewDecision = z.infer<typeof ReviewDecision>;

/** Arguments of `rpc('decide_session', ...)`; Mark reviewed on 2.4a sends `no_issue`. */
export const DecideSessionInput = z.object({
  session_id: Uuid,
  decision: ReviewDecisionValue,
  note: z.string().trim().min(1).max(DECISION_NOTE_MAX).optional(),
});
export type DecideSessionInput = z.infer<typeof DecideSessionInput>;

/** The stored decision and the exam's status after it (`reviewed` once no flag is left open). */
export const DecideSessionOutput = ReviewDecision.omit({ exam_id: true }).extend({ exam_status: ExamStatus });
export type DecideSessionOutput = z.infer<typeof DecideSessionOutput>;

/**
 * The queue rule (3.2): a session is in the queue while it has a flag received after its decision,
 * or a flag and no decision. `flags` are the received_at times of its flag events.
 */
export function isInReviewQueue(flags: readonly string[], decidedAt: string | null): boolean {
  if (decidedAt === null) return flags.length > 0;
  const decided = Date.parse(decidedAt);
  return flags.some((receivedAt) => Date.parse(receivedAt) > decided);
}

/** One row of the `review_queue` view. */
export const ReviewQueueRow = z.object({
  session_id: Uuid,
  exam_id: Uuid,
  student_id: Uuid,
  workspace_id: Uuid,
  faculty_id: Uuid.nullable(),
  flags: z.number().int().positive(),
  open_flags: z.number().int().positive(),
  flag_types: z.array(z.string()),
  first_flag_at: Timestamp,
  last_flag_received_at: Timestamp,
  decision: ReviewDecisionValue.nullable(),
  decided_at: Timestamp.nullable(),
});
export type ReviewQueueRow = z.infer<typeof ReviewQueueRow>;

export const SESSION_NOTE_MAX = SESSION_NOTE_TEXT_MAX;

/** Arguments of `rpc('add_session_note', ...)`; it returns the proctor.note event's id. */
export const AddSessionNoteInput = z.object({
  session_id: Uuid,
  text: z.string().trim().min(1).max(SESSION_NOTE_MAX),
});
export type AddSessionNoteInput = z.infer<typeof AddSessionNoteInput>;
export const AddSessionNoteOutput = Uuid;

// ---------------------------------------------------------------------------------------------------
// Verify codes
// ---------------------------------------------------------------------------------------------------

/** Crockford base32: no I, L, O or U. */
export const VERIFY_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
/**
 * A report's code: 8 random characters of VERIFY_CODE_ALPHABET, drawn by public.unused_verify_code when
 * the report is made and again for each new version of its content (the user's decision of 8 Oct).
 */
export const VERIFY_CODE_LENGTH = 8;
/** How 3.4, 3.5 and /verify print a code: UKI-7K2M-9QXD. */
export const VERIFY_CODE_PREFIX = "UKI";
export const VerifyCode = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{8}$/);

/** UKI-XXXX-XXXX for print. */
export function formatVerifyCode(code: string): string {
  return `${VERIFY_CODE_PREFIX}-${code.slice(0, 4)}-${code.slice(4, 8)}`;
}

/**
 * A typed or scanned code as stored, or null: case, spaces and hyphens do not matter, the UKI prefix is
 * optional, O reads as 0 and I or L as 1 (public.normalize_verify_code). U is never read as anything.
 */
export function normalizeVerifyCode(input: string): string | null {
  let code = input
    .slice(0, 64)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (code.length === VERIFY_CODE_PREFIX.length + VERIFY_CODE_LENGTH && code.startsWith(VERIFY_CODE_PREFIX)) {
    code = code.slice(VERIFY_CODE_PREFIX.length);
  }
  code = code.replace(/O/g, "0").replace(/[IL]/g, "1");
  return VerifyCode.safeParse(code).success ? code : null;
}

// ---------------------------------------------------------------------------------------------------
// rpc get_report (3.4), the shared-report function (3.5)
// ---------------------------------------------------------------------------------------------------

export const ReportFlag = z.object({
  id: Uuid,
  type: z.string(),
  source: z.string(),
  at: Timestamp,
  received_at: Timestamp,
  data: z.record(z.string(), z.unknown()),
  frame_count: z.number().int().min(0).max(3),
  frames: z.array(z.object({ id: Uuid, captured_at: Timestamp })),
});
export type ReportFlag = z.infer<typeof ReportFlag>;

export const ReportNote = z.object({
  id: Uuid,
  at: Timestamp,
  text: z.string().nullable(),
  staff_id: z.string().nullable(),
  by_name: z.string().nullable(),
});
export type ReportNote = z.infer<typeof ReportNote>;

/**
 * What get_report returns: the report row (verify code), the session, student, exam, the assigned
 * proctor, every flag with its stills, the notes, the decision, and the data kept (3.4's Data kept and
 * 3.5's This copy). `video_bytes` is always 0: video never leaves the laptop.
 */
export const ReportPayload = z.object({
  report: z
    .object({ id: Uuid, verify_code: VerifyCode, created_at: Timestamp, issued_at: Timestamp })
    .nullable(),
  session: z.object({
    id: Uuid,
    state: SessionState,
    locale: Locale,
    joined_at: Timestamp.nullable(),
    started_at: Timestamp.nullable(),
    submitted_at: Timestamp.nullable(),
    ended_at: Timestamp.nullable(),
    end_reason: z.string().nullable(),
    time_used_s: z.number().int().nonnegative(),
    extra_min: z.number().int().nonnegative(),
    receipt_id: z.string().nullable(),
    identity_result: z.string().nullable(),
    identity_score: z.number().nullable(),
    identity_at: Timestamp.nullable(),
    rules_accepted_at: Timestamp.nullable(),
    rules_locale: Locale.nullable(),
    device: z.record(z.string(), z.unknown()),
  }),
  student: z.object({
    id: Uuid,
    full_name: z.string(),
    student_number: z.string(),
    group_code: z.string().nullable(),
    programme: z.string().nullable(),
    year: z.number().int().nullable(),
  }),
  exam: z.object({
    id: Uuid,
    title: z.string(),
    course: z.string(),
    kind: z.string(),
    code: z.string().nullable(),
    mode: ExamMode,
    starts_at: Timestamp,
    duration_min: z.number().int(),
    faculty_name: z.string().nullable(),
    workspace_name: z.string(),
    timezone: z.string(),
  }),
  proctor_name: z.string().nullable(),
  flags: z.array(ReportFlag),
  notes: z.array(ReportNote),
  decision: z
    .object({
      decision: ReviewDecisionValue,
      note: z.string().nullable(),
      reviewer_id: Uuid,
      reviewer_name: z.string(),
      decided_at: Timestamp,
    })
    .nullable(),
  data_kept: z.object({
    video_bytes: z.literal(0),
    session_frames: z.number().int().nonnegative(),
    session_events: z.number().int().nonnegative(),
    exam_frames: z.number().int().nonnegative(),
    exam_events: z.number().int().nonnegative(),
    retention_days: z.number().int().positive(),
    frames_kept_until: Timestamp,
  }),
  generated_at: Timestamp,
});
export type ReportPayload = z.infer<typeof ReportPayload>;

export const GetReportInput = z.object({ session_id: Uuid });
export type GetReportInput = z.infer<typeof GetReportInput>;

// ---------------------------------------------------------------------------------------------------
// Share links: rpc create_share and revoke_share, the shared-report function, rpc verify_report
// ---------------------------------------------------------------------------------------------------

/** create_share's links expire this many days after they are made (the user's decision of 8 Oct). */
export const SHARE_TTL_DAYS = 30;
export const SHARE_TOKEN_BYTES = 32;
/** 32 random bytes in base64url without padding: 43 characters. */
export const ShareToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
/** `report_shares.token_hash`: SHA-256 of the token's UTF-8 text, in lower-case hex. */
export const ShareTokenHash = z.string().regex(/^[0-9a-f]{64}$/);

export const CreateShareInput = z.object({ report_id: Uuid });
export type CreateShareInput = z.infer<typeof CreateShareInput>;

/** create_share's reply, the only place the token appears; the link is the site's origin + `path`. */
export const ShareLink = z.object({
  share_id: Uuid,
  token: ShareToken,
  path: z.string().regex(/^\/r\/[A-Za-z0-9_-]{43}$/),
  expires_at: Timestamp,
});
export type ShareLink = z.infer<typeof ShareLink>;

/** The shared-report function's input: the token from /r/[token]. */
export const SharedReportRequest = z.object({ token: ShareToken });
export type SharedReportRequest = z.infer<typeof SharedReportRequest>;

/** 3.5: the report, plus who shared it and until when. */
export const SharedReportPayload = ReportPayload.extend({
  share: z.object({
    id: Uuid,
    expires_at: Timestamp,
    shared_by: z.string().nullable(),
    workspace_name: z.string(),
  }),
});
export type SharedReportPayload = z.infer<typeof SharedReportPayload>;

/** 3.5 with still URLs signed for 5 minutes, as the shared-report function returns it. */
export const SharedReportResponse = SharedReportPayload.extend({
  stills: z.array(z.object({ frame_id: Uuid, event_id: Uuid, url: z.string(), captured_at: Timestamp })),
});
export type SharedReportResponse = z.infer<typeof SharedReportResponse>;

/**
 * rpc revoke_share: Revoke on 3.4, for staff of the exam. Sets `revoked_at`, after which the
 * shared-report function answers the link as not found; revoking twice changes nothing.
 */
export const RevokeShareInput = z.object({ share_id: Uuid });
export type RevokeShareInput = z.infer<typeof RevokeShareInput>;
export const RevokeShareOutput = z.object({ share_id: Uuid, report_id: Uuid, revoked_at: Timestamp });
export type RevokeShareOutput = z.infer<typeof RevokeShareOutput>;

/** A link of the report that still opens, as 3.4 reads it from `report_shares` (never the token). */
export const ActiveShare = z.object({ id: Uuid, created_at: Timestamp, expires_at: Timestamp });
export type ActiveShare = z.infer<typeof ActiveShare>;

/** /verify answers this many lookups per client in a minute; the next one is rate_limited (HTTP 429). */
export const VERIFY_LOOKUPS_PER_MINUTE = 10;
/** verify_report's client_hash: the SHA-256 of the visitor's IP, in lower-case hex. */
export const VerifyClientHash = z.string().regex(/^[0-9a-f]{64}$/);

export const VerifyReportInput = z.object({ code: z.string().min(1).max(64), client_hash: VerifyClientHash });
export type VerifyReportInput = z.infer<typeof VerifyReportInput>;

/**
 * /verify/[code]: found or not; when found, the exam, the student's initials, when this version was
 * issued, and whether the report still has the content the code was made from.
 */
export const VerifyReportOutput = z.discriminatedUnion("found", [
  z.object({ found: z.literal(false) }),
  z.object({
    found: z.literal(true),
    code: VerifyCode,
    exam_title: z.string(),
    exam_starts_at: Timestamp,
    timezone: z.string(),
    initials: z.string().max(2),
    issued_at: Timestamp,
    intact: z.boolean(),
  }),
]);
export type VerifyReportOutput = z.infer<typeof VerifyReportOutput>;
