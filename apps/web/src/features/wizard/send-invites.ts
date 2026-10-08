import { Uuid } from "@uki/contracts";
import { z } from "zod";

/**
 * The send-invites Edge Function's input and output as the plan documents them (Phase 1 plan, API and
 * realtime: Edge Functions): `exam_id` with optional `student_ids[]`, or `test: true` for a test invite
 * to the signed-in staff member; the reply is `sent` and `failed[]`. WP 1.4 builds the function and
 * moves these schemas into packages/contracts; until then the wizard keeps them here and does not call.
 */
export const SendInvitesInput = z.union([
  z.strictObject({ exam_id: Uuid, test: z.literal(true) }),
  z.strictObject({ exam_id: Uuid, student_ids: z.array(Uuid).min(1).max(2000).optional() }),
]);
export type SendInvitesInput = z.infer<typeof SendInvitesInput>;

export const SendInvitesOutput = z.object({
  sent: z.number().int().nonnegative(),
  failed: z.array(z.object({ student_id: Uuid.nullable().optional(), error: z.string() }).passthrough()),
});
export type SendInvitesOutput = z.infer<typeof SendInvitesOutput>;
