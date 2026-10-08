// The send-invites Edge Function (WP 1.4): its input and output, as the dashboard calls it from 0.5
// (Send a test invite, Schedule exam) and 0.3 and 0.3b (Resend). The invite email itself is 0.8
// (161:13438); its strings are the catalog's `email.invite.*` keys.
import { z } from "zod";
import { Uuid } from "./primitives.ts";
import { ROSTER_ROWS_MAX } from "./wizard.ts";

/** Resend's batch endpoint takes at most 100 emails a request. */
export const INVITE_BATCH_SIZE = 100;

/** `invites.error` and each `failed[].error`: Resend's message, cut to this length. */
export const INVITE_ERROR_MAX = 500;

/**
 * `{ exam_id }` sends every invite of the exam that is not sent yet (pending, failed or bounced);
 * `{ exam_id, student_ids }` sends those students' invites again, whatever their state;
 * `{ exam_id, test: true }` sends one test invite to the signed-in staff member, in their language,
 * and records nothing in `invites`.
 */
export const SendInvitesInput = z.union([
  z.strictObject({ exam_id: Uuid, test: z.literal(true) }),
  z.strictObject({ exam_id: Uuid, student_ids: z.array(Uuid).min(1).max(ROSTER_ROWS_MAX).optional() }),
]);
export type SendInvitesInput = z.infer<typeof SendInvitesInput>;

/** One invite that did not go out. `student_id` is null for the test invite. */
export const SendInvitesFailure = z.object({
  student_id: Uuid.nullable(),
  error: z.string().min(1).max(INVITE_ERROR_MAX),
});
export type SendInvitesFailure = z.infer<typeof SendInvitesFailure>;

/** `sent` counts the emails Resend accepted; `failed` lists the rest. */
export const SendInvitesOutput = z.object({
  sent: z.number().int().nonnegative(),
  failed: z.array(SendInvitesFailure),
});
export type SendInvitesOutput = z.infer<typeof SendInvitesOutput>;

/** Splits the recipients into Resend batches of at most `size`, in order. */
export function inviteBatches<T>(items: readonly T[], size: number = INVITE_BATCH_SIZE): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new RangeError("chunk size must be a positive integer");
  const out: T[][] = [];
  for (let start = 0; start < items.length; start += size) out.push(items.slice(start, start + size));
  return out;
}
