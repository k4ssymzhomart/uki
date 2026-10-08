// The privacy centre (A.5, A.5a, A.5b, A.6), the data-request and retention Edge Functions, and the
// public Book a pilot form (194:4014): `data_requests`, `pilot_requests` and request_pilot
// (supabase/migrations/20261009000000_phase1.sql).
import { z } from "zod";
import { Timestamp, Uuid } from "./primitives.ts";

// ---------------------------------------------------------------------------------------------------
// Data requests
// ---------------------------------------------------------------------------------------------------

/** Mirrors the SQL enum `data_request_kind`. */
export const DATA_REQUEST_KINDS = ["delete", "copy"] as const;
export const DataRequestKind = z.enum(DATA_REQUEST_KINDS);
export type DataRequestKind = z.infer<typeof DataRequestKind>;

/** Mirrors the SQL enum `data_request_status`. */
export const DATA_REQUEST_STATUSES = ["received", "done", "replied"] as const;
export const DataRequestStatus = z.enum(DATA_REQUEST_STATUSES);
export type DataRequestStatus = z.infer<typeof DataRequestStatus>;

/**
 * A request is due this many days after it arrives (`due_at`'s default): A.5a and A.5b draw 7 (asked
 * 7 Oct, due 14 Oct), where the plan started from 30 (20261012120000_privacy_requests.sql, WP 1.12).
 */
export const DATA_REQUEST_DUE_DAYS = 7;
export const DATA_REQUEST_REPLY_MAX = 2000;

/** One `data_requests` row. */
export const DataRequest = z.object({
  id: Uuid,
  workspace_id: Uuid,
  student_id: Uuid,
  kind: DataRequestKind,
  status: DataRequestStatus,
  received_at: Timestamp,
  due_at: Timestamp,
  reply: z.string().nullable(),
  export_path: z.string().nullable(),
  done_by: Uuid.nullable(),
  done_at: Timestamp.nullable(),
});
export type DataRequest = z.infer<typeof DataRequest>;

/** What the exam office enters on A.5 (PostgREST insert under row-level security). */
export const NewDataRequest = z.object({ workspace_id: Uuid, student_id: Uuid, kind: DataRequestKind });
export type NewDataRequest = z.infer<typeof NewDataRequest>;

/**
 * The data-request function's input: `delete` (A.5a) removes the student's stills, frames, events,
 * identity score and device record and keeps the answers and the receipt; `copy` (A.5b) writes one
 * JSON file to the `exports` bucket; `reply` answers with a reason and does neither.
 */
export const DataRequestActionInput = z.discriminatedUnion("action", [
  z.object({ request_id: Uuid, action: z.literal("delete") }),
  z.object({ request_id: Uuid, action: z.literal("copy") }),
  z.object({
    request_id: Uuid,
    action: z.literal("reply"),
    reply: z.string().trim().min(1).max(DATA_REQUEST_REPLY_MAX),
  }),
]);
export type DataRequestActionInput = z.infer<typeof DataRequestActionInput>;

/** What a delete removed (A.5a), counted by the data-request function and privacy_delete_student. */
export const DataRequestDeleted = z.object({
  /** Objects removed from the frames bucket. */
  stills: z.number().int().nonnegative(),
  frames: z.number().int().nonnegative(),
  events: z.number().int().nonnegative(),
  identity_scores: z.number().int().nonnegative(),
  devices: z.number().int().nonnegative(),
});
export type DataRequestDeleted = z.infer<typeof DataRequestDeleted>;

/**
 * The updated request; for copy, a signed link to the export valid EXPORT_LINK_TTL_S; for delete, what
 * was removed.
 */
export const DataRequestActionOutput = z.object({
  request: DataRequest,
  link: z.object({ url: z.string(), expires_at: Timestamp }).nullable(),
  deleted: DataRequestDeleted.nullable().default(null),
});
export type DataRequestActionOutput = z.infer<typeof DataRequestActionOutput>;
export type DataRequestActionReply = z.input<typeof DataRequestActionOutput>;

// WP 1.12: the database half of the data-request function (20261012120000_privacy_requests.sql), for the
// secret key only.

/** `privacy_delete_plan`: the still folders (`<exam_id>/<session_id>`) and paths to remove first. */
export const DataRequestDeletePlan = z.object({
  request_id: Uuid,
  student_id: Uuid,
  workspace_id: Uuid,
  folders: z.array(z.string().min(1)),
  paths: z.array(z.string().min(1)),
});
export type DataRequestDeletePlan = z.infer<typeof DataRequestDeletePlan>;

/** `privacy_delete_student`: the done request and the rows it deleted or cleared. */
export const DataRequestDeleteResult = z.object({
  request: DataRequest,
  frames: z.number().int().nonnegative(),
  events: z.number().int().nonnegative(),
  identity_scores: z.number().int().nonnegative(),
  devices: z.number().int().nonnegative(),
  sessions: z.number().int().nonnegative(),
});
export type DataRequestDeleteResult = z.infer<typeof DataRequestDeleteResult>;

/** The format tag of a copy (A.5b), the first key of the file. */
export const DATA_COPY_FORMAT = "uki.data-copy.v1";

const CopyStill = z.object({ id: Uuid, captured_at: Timestamp });

/**
 * A copy of a student's data (A.5b): who they are, their exam history with times, results, receipts and
 * decisions, their flags with the stills, consent records and devices. `privacy_export` returns it with
 * each still's storage path; the file the student gets has the image instead (base64 JPEG), or null for
 * a still that is gone or would push the file past EXPORT_MAX_BYTES.
 */
export const DataCopyPackage = z.object({
  format: z.literal(DATA_COPY_FORMAT),
  generated_at: Timestamp,
  request: z.object({ id: Uuid, received_at: Timestamp }),
  workspace: z.string().nullable(),
  student: z.object({
    student_number: z.string(),
    full_name: z.string(),
    email: z.string().nullable(),
    group: z.string().nullable(),
    programme: z.string().nullable(),
    year: z.number().int().nullable(),
    locale: z.string(),
  }),
  exams: z.array(
    z.object({
      session_id: Uuid,
      exam: z.object({
        title: z.string(),
        course: z.string(),
        kind: z.string(),
        code: z.string().nullable(),
        starts_at: Timestamp,
        duration_min: z.number().int(),
      }),
      state: z.string(),
      joined_at: Timestamp.nullable(),
      started_at: Timestamp.nullable(),
      submitted_at: Timestamp.nullable(),
      ended_at: Timestamp.nullable(),
      end_reason: z.string().nullable(),
      time_used_s: z.number().int(),
      extra_min: z.number().int(),
      receipt_id: z.string().nullable(),
      identity_result: z.string().nullable(),
      identity_score: z.number().nullable(),
      decision: z
        .object({ decision: z.string(), note: z.string().nullable(), decided_at: Timestamp })
        .nullable(),
    }),
  ),
  flags: z.array(
    z.object({
      id: Uuid,
      session_id: Uuid,
      exam: z.string(),
      type: z.string(),
      source: z.string(),
      at: Timestamp,
      data: z.record(z.string(), z.unknown()),
      frames: z.array(CopyStill.extend({ storage_path: z.string().min(1) })),
    }),
  ),
  consent: z.array(
    z.object({
      session_id: Uuid,
      exam: z.string(),
      rules_accepted_at: Timestamp,
      rules_locale: z.string().nullable(),
    }),
  ),
  devices: z.array(
    z.object({
      session_id: Uuid,
      exam: z.string(),
      device: z.record(z.string(), z.unknown()),
      last_seen_at: Timestamp.nullable(),
    }),
  ),
});
export type DataCopyPackage = z.infer<typeof DataCopyPackage>;

/** One still in the file the student gets: the JPEG itself, or null when it could not be included. */
export type DataCopyStill = z.infer<typeof CopyStill> & { image_jpeg_base64: string | null };

/** The private bucket for copy requests: JSON only. */
export const EXPORTS_BUCKET = "exports";
export const EXPORT_MAX_BYTES = 10 * 1024 * 1024;
/** Copy links are signed for 7 days. */
export const EXPORT_LINK_TTL_S = 7 * 24 * 60 * 60;

/** `<workspace_id>/<request_id>.json` inside the exports bucket. */
export function exportPath(workspaceId: string, requestId: string): string {
  return `${workspaceId.toLowerCase()}/${requestId.toLowerCase()}.json`;
}

// ---------------------------------------------------------------------------------------------------
// Retention
// ---------------------------------------------------------------------------------------------------

/** retention_nightly runs at 22:00 UTC, 03:00 in Almaty. */
export const RETENTION_CRON = "0 22 * * *";
/** The hour (UTC) of RETENTION_CRON, for the next run that A.5 shows. */
export const RETENTION_HOUR_UTC = 22;
/** The retention function's input: nothing (pg_cron sends `{}`). */
export const RetentionInput = z.object({}).strict();
export type RetentionInput = z.infer<typeof RetentionInput>;
/** Batches one run takes at most, RETENTION_BATCH stills each; the next night carries on. */
export const RETENTION_MAX_BATCHES = 20;

/** The next retention run after `now`: the next 22:00 UTC. */
export function nextRetentionRun(now: number | Date): Date {
  const ms = now instanceof Date ? now.getTime() : now;
  const next = new Date(ms);
  next.setUTCHours(RETENTION_HOUR_UTC, 0, 0, 0);
  if (next.getTime() <= ms) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}
/** Stills the retention function removes per call (public.retention_due's limit). */
export const RETENTION_BATCH = 500;

/** The retention function's reply: objects removed from Storage, frames rows deleted, workspaces touched. */
export const RetentionOutput = z.object({
  stills: z.number().int().nonnegative(),
  frames: z.number().int().nonnegative(),
  workspaces: z.number().int().nonnegative(),
});
export type RetentionOutput = z.infer<typeof RetentionOutput>;

/** The first instant a still captured at `capturedAt` is past `retentionDays` (public.retention_due). */
export function retentionDeadline(capturedAt: string | number | Date, retentionDays: number): Date {
  const ms = capturedAt instanceof Date ? capturedAt.getTime() : new Date(capturedAt).getTime();
  return new Date(ms + retentionDays * 24 * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------------------------------
// Pilot requests (Book a pilot, Sent)
// ---------------------------------------------------------------------------------------------------

/** request_pilot refuses a fourth request from one address within 24 hours. */
export const PILOT_REQUESTS_PER_EMAIL_PER_DAY = 3;
/** ... and any request while this many arrived in the last hour. */
export const PILOT_REQUESTS_PER_HOUR = 30;
export const PILOT_MESSAGE_MAX = 500;

/** Arguments of `rpc('request_pilot', ...)`, open to anonymous visitors. */
export const PilotRequestInput = z.strictObject({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  university: z.string().trim().min(1).max(160),
  role: z.string().trim().min(1).max(80).optional(),
  message: z.string().trim().max(PILOT_MESSAGE_MAX).optional(),
  exam_size: z.string().trim().min(1).max(40).optional(),
  pilot_month: z.string().trim().min(1).max(40).optional(),
  demo_invite: z.boolean().optional(),
});
export type PilotRequestInput = z.infer<typeof PilotRequestInput>;

/** `ok` shows Sent (195:4090); `rate_limited` shows the form's error line. */
export const PilotRequestOutput = z.object({ status: z.enum(["ok", "rate_limited"]) });
export type PilotRequestOutput = z.infer<typeof PilotRequestOutput>;

/** One `pilot_requests` row; admins read them, pilot-notify emails them. */
export const PilotRequest = z.object({
  id: Uuid,
  name: z.string(),
  email: z.string(),
  university: z.string(),
  role: z.string().nullable(),
  message: z.string().nullable(),
  exam_size: z.string().nullable(),
  pilot_month: z.string().nullable(),
  demo_invite: z.boolean(),
  created_at: Timestamp,
});
export type PilotRequest = z.infer<typeof PilotRequest>;

/** pilot-notify's input, sent by the pilot_requests trigger through pg_net. */
export const PilotNotifyInput = z.object({ id: Uuid });
export type PilotNotifyInput = z.infer<typeof PilotNotifyInput>;

// ---------------------------------------------------------------------------------------------------
// rpc audit_read
// ---------------------------------------------------------------------------------------------------

export const AUDIT_OBJECT_TYPES = [
  "student",
  "session",
  "exam",
  "report",
  "workspace",
  "data_request",
] as const;

/**
 * Arguments of `rpc('audit_read', ...)`: the dashboard records a read of student data that no other
 * function records (A.2's list, A.3's profile, 3.3's session, an export), for A.6.
 */
export const AuditReadInput = z.object({
  action: z
    .string()
    .max(60)
    .regex(/^[a-z_]+(?:\.[a-z_]+)+$/),
  object_type: z.enum(AUDIT_OBJECT_TYPES),
  object_id: z.string().max(100).optional(),
});
export type AuditReadInput = z.infer<typeof AuditReadInput>;
