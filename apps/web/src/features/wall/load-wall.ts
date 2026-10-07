// The server render's data for /exams/[examId]/live (plan, Live wall data flow step 1): the exam, its
// roster and sessions, and its flag and log events from the last 60 minutes, all under the caller's RLS.

import {
  type AnyClient,
  fetchRecentEvents,
  fetchSessions,
  initialEventsSince,
  readPages,
} from "./queries.ts";
import { ExamGroupRow, ExamRow, parseRows, RosterRow, StaffRow } from "./rows.ts";
import type { WallInitialData, WallStudent } from "./wall-store.ts";

/** Null when the exam does not exist or the caller may not see it. */
export async function loadWall(
  client: AnyClient,
  examId: string,
  nowMs: number,
): Promise<WallInitialData | null> {
  const examResult = await client
    .from("exams")
    .select("id, workspace_id, title, starts_at, duration_min, status")
    .eq("id", examId)
    .maybeSingle();
  const exam = ExamRow.safeParse(examResult.data);
  if (examResult.error || !exam.success) return null;

  const [groupsResult, rosterRows, sessions, events, staffRows, questionsResult] = await Promise.all([
    client.from("exam_groups").select("groups(code)").eq("exam_id", examId),
    readPages((from, to) =>
      client
        .from("exam_students")
        .select("seat, students(id, full_name, student_number)")
        .eq("exam_id", examId)
        .order("seat", { ascending: true, nullsFirst: false })
        .range(from, to),
    ),
    fetchSessions(client, examId),
    fetchRecentEvents(client, examId, initialEventsSince(nowMs)),
    readPages((from, to) =>
      client
        .from("staff")
        .select("id, full_name")
        .eq("workspace_id", exam.data.workspace_id)
        .order("id")
        .range(from, to),
    ),
    client.from("exam_questions").select("question_id", { count: "exact", head: true }).eq("exam_id", examId),
  ]);

  const groups = parseRows(ExamGroupRow, groupsResult.data)
    .map((row) => row.groups?.code)
    .filter((code): code is string => code !== undefined)
    .sort();
  const students: WallStudent[] = parseRows(RosterRow, rosterRows).map((row) => ({
    id: row.students.id,
    fullName: row.students.full_name,
    number: row.students.student_number,
    seat: row.seat,
  }));
  const staff = parseRows(StaffRow, staffRows);
  // A proctor cannot read exam_questions, so the count is 0 for them: treat that as unknown.
  const questionCount =
    questionsResult.error === null && typeof questionsResult.count === "number" && questionsResult.count > 0
      ? questionsResult.count
      : null;

  return {
    exam: {
      id: exam.data.id,
      title: exam.data.title,
      startsAt: exam.data.starts_at,
      durationMin: exam.data.duration_min,
      status: exam.data.status,
      groups,
      questionCount,
    },
    students,
    sessions,
    events,
    staff: staff.map((s) => ({ id: s.id, fullName: s.full_name })),
    serverNowMs: nowMs,
  };
}
