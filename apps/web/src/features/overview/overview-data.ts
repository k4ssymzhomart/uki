import { cache } from "react";
import { createSupabaseServerClient } from "../../lib/supabase/server.ts";
import { OVERVIEW_COLUMNS, type OverviewRow, parseOverviewRows } from "./overview-model.ts";

/**
 * Server-side reads for 0.1 and the sidebar, as the signed-in staff member under RLS: a proctor gets
 * only assigned exams. Cached per request, so the layout and the overview share one query.
 */
export const loadOverviewRows = cache(async (): Promise<OverviewRow[]> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("exam_overview").select(OVERVIEW_COLUMNS);
  if (error) throw new Error(`exam_overview: ${error.message}`);
  return parseOverviewRows(data ?? []);
});

/** How many groups the staff member can see, for "All groups". */
export async function loadGroupCount(): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase.from("groups").select("id", { count: "exact", head: true });
  if (error) throw new Error(`groups: ${error.message}`);
  return count ?? 0;
}

/** Roster students of an exam whose invite email bounced (the readiness card's roster count). */
export async function loadBouncedInvites(examId: string): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase
    .from("exam_students")
    .select("student_id", { count: "exact", head: true })
    .eq("exam_id", examId)
    .eq("invite_status", "bounced");
  if (error) throw new Error(`exam_students: ${error.message}`);
  return count ?? 0;
}
