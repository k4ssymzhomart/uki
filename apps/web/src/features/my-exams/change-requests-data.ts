import { Uuid } from "@uki/contracts";
import { createSupabaseServerClient } from "../../lib/supabase/server.ts";

/**
 * The exams with a proctor's open change request from 0.9a, for the exam office's 0.1: their rows say
 * "Change requested" until the office changes the seats (assign_proctors clears the request) or the
 * proctor confirms after all. Read under RLS, so it holds only exams the staff member may see.
 */
export async function loadChangeRequestExamIds(): Promise<string[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("proctor_assignments")
    .select("exam_id")
    .not("change_request", "is", null);
  if (error) throw new Error(`proctor_assignments: ${error.message}`);
  return [
    ...new Set((data ?? []).flatMap((row) => (Uuid.safeParse(row.exam_id).success ? [row.exam_id] : []))),
  ];
}
