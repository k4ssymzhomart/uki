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

/** A request is due this many days after it arrives (`due_at`'s default). */
export const DATA_REQUEST_DUE_DAYS = 30;
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

/** The updated request; for copy, a signed link to the export valid EXPORT_LINK_TTL_S. */
export const DataRequestActionOutput = z.object({
  request: DataRequest,
  link: z.object({ url: z.string(), expires_at: Timestamp }).nullable(),
});
export type DataRequestActionOutput = z.infer<typeof DataRequestActionOutput>;

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
/** Stills the retention function removes per call (public.retention_due's limit). */
export const RETENTION_BATCH = 500;

/** The retention function's reply. */
export const RetentionOutput = z.object({
  stills: z.number().int().nonnegative(),
  frames: z.number().int().nonnegative(),
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
