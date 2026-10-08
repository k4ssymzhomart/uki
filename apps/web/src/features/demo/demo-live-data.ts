import { unstable_rethrow } from "next/navigation";
import type { SupabaseServerClient } from "../../lib/supabase/server.ts";
import { DEMO_LIVE_CODE, type DemoLiveExam, DemoLiveRow } from "./demo-model.ts";

/**
 * Finds the always-live exam by its code under the signed-in staff member's RLS: the judge (an observer
 * of DEMO-LIVE only), the exam office, or a proctor of the exam see it; anyone else gets `missing`, as
 * when the exam does not exist yet. Reads only the exam's id, no student data, so no audit row.
 */
export async function findDemoLiveExam(supabase: SupabaseServerClient): Promise<DemoLiveExam> {
  try {
    const { data, error } = await supabase
      .from("exams")
      .select("id")
      .eq("code", DEMO_LIVE_CODE)
      .maybeSingle();
    if (error) return { status: "failed" };
    if (data === null) return { status: "missing" };
    const row = DemoLiveRow.safeParse(data);
    return row.success ? { status: "found", examId: row.data.id } : { status: "failed" };
  } catch (error) {
    unstable_rethrow(error);
    return { status: "failed" };
  }
}
