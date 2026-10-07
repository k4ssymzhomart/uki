// The server render's data for /exams/[examId]/live (plan, Live wall data flow step 1): the exam, its
// roster and sessions, its flag and log events from the last 60 minutes and every older phone or
// second-face flag (the Flagged tile has no time limit), all under the caller's RLS.

import { type AnyClient, fetchInitialEvents, fetchSessions, readPages } from "./queries.ts";
import { ExamGroupRow, ExamRow, parseQuestionCount, parseRows, RosterRow, StaffRow } from "./rows.ts";
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
    fetchInitialEvents(client, examId, nowMs),
    readPages((from, to) =>
      client
        .from("staff")
        .select("id, full_name")
        .eq("workspace_id", exam.data.workspace_id)
        .order("id")
        .range(from, to),
    ),
    client.rpc("exam_question_count", { exam_id: examId }),
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
  // exam_question_count answers exam staff (proctors cannot read exam_questions); null is unknown.
  const questionCount = questionsResult.error === null ? parseQuestionCount(questionsResult.data) : null;

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
