import { createSupabaseServerClient } from "../../lib/supabase/server.ts";
import { MY_ASSIGNMENT_COLUMNS, MyAssignmentRow, type MyExam, seatRange } from "./my-exams-model.ts";

/**
 * 0.9 on the server, as the signed-in proctor under RLS: their own `proctor_assignments` rows with the
 * exams (a proctor may read a colleague's row of the same exam, so the query filters on staff_id), and
 * for each the number of roster students in the seats. Counts only: no student row leaves the
 * database, so the page reads no student data and writes no audit row.
 */
export async function loadMyExams(staffId: string): Promise<MyExam[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("proctor_assignments")
    .select(MY_ASSIGNMENT_COLUMNS)
    .eq("staff_id", staffId);
  if (error) throw new Error(`proctor_assignments: ${error.message}`);
  const rows = (data ?? []).flatMap((row) => {
    const parsed = MyAssignmentRow.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
  return Promise.all(
    rows.map(async (row): Promise<MyExam> => {
      const range = seatRange(row);
      let query = supabase
        .from("exam_students")
        .select("student_id", { count: "exact", head: true })
        .eq("exam_id", row.exam_id);
      if (range) query = query.gte("seat", range.from).lte("seat", range.to);
      const { count, error: countError } = await query;
      if (countError) throw new Error(`exam_students: ${countError.message}`);
      return { ...row, students: count ?? 0 };
    }),
  );
}
