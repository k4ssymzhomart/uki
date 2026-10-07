"use server";

import { matchErrorCode, START_ERROR_CODES, StartExamInput, StartExamOutput } from "@uki/contracts";
import { redirect } from "next/navigation";
import { requireStaff } from "../../../../../lib/auth.ts";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server.ts";

/** Why Start exam failed; each maps to dashboard.lobby.startError.<code>. */
export type StartExamError = "alreadyStarted" | "forbidden" | "failed";

/**
 * 1.5 Start exam: `start_exam` as the signed-in staff member. The database allows only the lead proctor
 * and the exam office, only before the scheduled start; it sets the exam live and sends `start` to every
 * session in rules or ready. On success the proctor goes to the live wall (2.4).
 */
export async function startExam(input: unknown): Promise<{ error: StartExamError }> {
  await requireStaff();
  const parsed = StartExamInput.safeParse(input);
  if (!parsed.success) return { error: "failed" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("start_exam", { exam_id: parsed.data.exam_id });
  if (error) {
    const code = matchErrorCode(error, START_ERROR_CODES);
    return {
      error: code === "already_started" ? "alreadyStarted" : code === "forbidden" ? "forbidden" : "failed",
    };
  }
  if (!StartExamOutput.safeParse(data).success) return { error: "failed" };
  redirect(`/exams/${parsed.data.exam_id}/live`);
}
