"use server";

// The review's writes as the signed-in staff member: `decide_session` (3.3's decision and Mark reviewed
// on 2.4a) and `add_session_note` (Add note on 2.5). Input and output are checked with the contracts'
// Zod schemas; the database checks who may write (the exam's proctors and its exam office) and writes
// the audit rows. A failure comes back as a code the UI translates, never as an exception.
import {
  AddSessionNoteInput,
  AddSessionNoteOutput,
  DecideSessionInput,
  DecideSessionOutput,
  matchErrorCode,
} from "@uki/contracts";
import { revalidatePath } from "next/cache";
import { requireStaff } from "../../lib/auth.ts";
import { createSupabaseServerClient } from "../../lib/supabase/server.ts";

/** Each maps to dashboard.review.error (and the wall's toast). */
export type ReviewErrorCode = "forbidden" | "not_found" | "bad_request" | "failed";

export type ReviewActionResult<T> = { ok: true; data: T } | { ok: false; code: ReviewErrorCode };

const DATABASE_CODES = ["forbidden", "not_found", "bad_request"] as const;

function failure(error: unknown): { ok: false; code: ReviewErrorCode } {
  return { ok: false, code: matchErrorCode(error, DATABASE_CODES) ?? "failed" };
}

/**
 * One decision for the session (no issue, talk to the student, or committee) with an optional note.
 * A later decision replaces the earlier one; the exam turns `reviewed` when no flag is left without a
 * newer decision. The review pages are revalidated, so the queue never shows the old state.
 */
export async function decideSession(input: unknown): Promise<ReviewActionResult<DecideSessionOutput>> {
  if (!(await requireStaff())) return { ok: false, code: "failed" };
  const parsed = DecideSessionInput.safeParse(input);
  if (!parsed.success) return { ok: false, code: "bad_request" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("decide_session", {
    session_id: parsed.data.session_id,
    decision: parsed.data.decision,
    ...(parsed.data.note === undefined ? {} : { note: parsed.data.note }),
  });
  if (error) return failure(error);
  const output = DecideSessionOutput.safeParse(data);
  if (!output.success) return { ok: false, code: "failed" };
  revalidatePath("/review", "layout");
  return { ok: true, data: output.data };
}

/** A proctor's note on the session's timeline: a `proctor.note` event that 2.5 and 3.3 show. */
export async function addSessionNote(input: unknown): Promise<ReviewActionResult<string>> {
  if (!(await requireStaff())) return { ok: false, code: "failed" };
  const parsed = AddSessionNoteInput.safeParse(input);
  if (!parsed.success) return { ok: false, code: "bad_request" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("add_session_note", {
    session_id: parsed.data.session_id,
    text: parsed.data.text,
  });
  if (error) return failure(error);
  const output = AddSessionNoteOutput.safeParse(data);
  if (!output.success) return { ok: false, code: "failed" };
  revalidatePath("/review", "layout");
  return { ok: true, data: output.data };
}
