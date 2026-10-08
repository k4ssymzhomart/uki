"use server";

import { ConfirmSeatsInput, matchErrorCode, ProctorAssignment } from "@uki/contracts";
import { revalidatePath } from "next/cache";
import { requireStaff } from "../../../lib/auth.ts";
import { createSupabaseServerClient } from "../../../lib/supabase/server.ts";

export type ConfirmSeatsResult =
  | { ok: true; assignment: ProctorAssignment }
  | { ok: false; error: "forbidden" | "failed" };

/**
 * 0.9a: `confirm_seats` as the signed-in proctor. Without text it confirms the seats (confirmed_at);
 * with text it asks the exam office for a change (change_request), up to 500 characters. The database
 * allows only the caller's own assignment and writes the audit row. A staff lookup that failed twice is
 * `failed`, so the proctor can try again without being sent to sign-in.
 */
export async function confirmSeats(input: unknown): Promise<ConfirmSeatsResult> {
  if (!(await requireStaff())) return { ok: false, error: "failed" };
  const parsed = ConfirmSeatsInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "failed" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("confirm_seats", parsed.data);
  if (error) {
    return {
      ok: false,
      error: matchErrorCode(error, ["forbidden"] as const) === "forbidden" ? "forbidden" : "failed",
    };
  }
  const assignment = ProctorAssignment.safeParse(data);
  if (!assignment.success) return { ok: false, error: "failed" };
  revalidatePath("/my-exams");
  return { ok: true, assignment: assignment.data };
}
