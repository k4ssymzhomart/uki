// A throwaway scheduled exam with its lobby open, for WP 1.5's lobby test: its own group and students
// in the KRU workspace, the given proctor as lead, and students who joined through join_exam and moved
// through check-in by ingest, as the app does. destroy() removes every row it made, the anonymous auth
// users and their audit rows included.
import { randomBytes } from "node:crypto";
import type { IngestStatus } from "../../packages/contracts/src/index.ts";
import { KRU } from "./seed.ts";
import { type Draft, ingest, type JoinedStudent, joinExam } from "./student.ts";
import { adminClient, cleanUp } from "./supabase.ts";

export interface LobbyFixture {
  runId: string;
  examId: string;
  examCode: string;
  examTitle: string;
  students: JoinedStudent[];
  destroy(): Promise<void>;
}

/** Where a fixture student goes after joining: the ingest calls the app would make, in order. */
export type CheckInScript = { status: IngestStatus; events?: Draft[] }[];

const FIRST_NAMES = ["Madina", "Dias", "Zhansaya", "Arman"];

function check<T>(result: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  if (result.error || result.data === null || result.data === undefined) {
    throw new Error(`e2e fixture: ${what} failed: ${result.error?.message ?? "no data"}`);
  }
  return result.data;
}

export async function createLobbyFixture(options: {
  proctorId: string;
  /** One script per student; each student joins, then runs it. */
  students: CheckInScript[];
}): Promise<LobbyFixture> {
  const admin = adminClient();
  const count = Math.min(options.students.length, FIRST_NAMES.length);
  const runId = randomBytes(3).toString("hex").toUpperCase();
  const examCode = `E2E-${runId}`;
  const examTitle = `E2E lobby ${runId}`;
  const created = {
    groupId: null as string | null,
    examId: null as string | null,
    studentIds: [] as string[],
    authUids: [] as string[],
  };
  const students: JoinedStudent[] = [];

  async function destroy(): Promise<void> {
    for (const student of students) await student.client.removeAllChannels();
    const sessionIds = students.map((s) => s.sessionId);
    const examId = created.examId;
    const steps: Parameters<typeof cleanUp>[1][number][] = [];
    if (examId !== null) {
      steps.push(
        ["help_requests", () => admin.from("help_requests").delete().eq("exam_id", examId)],
        ["events", () => admin.from("events").delete().eq("exam_id", examId)],
        ["session_commands", () => admin.from("session_commands").delete().eq("exam_id", examId)],
        ["sessions", () => admin.from("sessions").delete().eq("exam_id", examId)],
        ["proctor_assignments", () => admin.from("proctor_assignments").delete().eq("exam_id", examId)],
        ["exam_students", () => admin.from("exam_students").delete().eq("exam_id", examId)],
        ["exam_groups", () => admin.from("exam_groups").delete().eq("exam_id", examId)],
        ["exams", () => admin.from("exams").delete().eq("id", examId)],
        [
          "audit_log",
          () =>
            admin
              .from("audit_log")
              .delete()
              .in("object_id", [examId, ...sessionIds]),
        ],
      );
    }
    if (created.studentIds.length > 0) {
      steps.push(["students", () => admin.from("students").delete().in("id", created.studentIds)]);
    }
    const groupId = created.groupId;
    if (groupId !== null) steps.push(["groups", () => admin.from("groups").delete().eq("id", groupId)]);
    if (created.authUids.length > 0) {
      steps.push([
        "audit_log of students",
        () => admin.from("audit_log").delete().in("actor_id", created.authUids),
      ]);
      for (const uid of created.authUids) {
        steps.push([`auth user ${uid}`, () => admin.auth.admin.deleteUser(uid)]);
      }
    }
    await cleanUp(`fixture ${examCode}`, steps);
  }

  try {
    const now = Date.now();
    const group = check(
      await admin
        .from("groups")
        .insert({ workspace_id: KRU.workspaceId, faculty_id: KRU.mathFacultyId, code: `E2E${runId}` })
        .select("id")
        .single(),
      "group",
    );
    created.groupId = group.id;
    const startsAt = Math.ceil((now + 15 * 60_000) / 60_000) * 60_000;
    const exam = check(
      await admin
        .from("exams")
        .insert({
          workspace_id: KRU.workspaceId,
          faculty_id: KRU.mathFacultyId,
          title: examTitle,
          course: "E2E",
          kind: "Lobby test",
          code: examCode,
          mode: "app",
          status: "scheduled",
          starts_at: new Date(startsAt).toISOString(),
          duration_min: 60,
          lobby_opens_at: new Date(startsAt - 20 * 60_000).toISOString(),
        })
        .select("id")
        .single(),
      "exam",
    );
    created.examId = exam.id;
    check(
      await admin.from("exam_groups").insert({ exam_id: exam.id, group_id: group.id }).select(),
      "group link",
    );

    const base = 70_000_000 + Math.floor(Math.random() * 9_000_000);
    const rows = check(
      await admin
        .from("students")
        .insert(
          Array.from({ length: count }, (_, i) => ({
            workspace_id: KRU.workspaceId,
            group_id: group.id,
            student_number: String(base + i),
            full_name: `${FIRST_NAMES[i]} E2e${runId}`,
            locale: "kk" as const,
          })),
        )
        .select("id, student_number"),
      "students",
    );
    created.studentIds = rows.map((row) => row.id);
    check(
      await admin
        .from("exam_students")
        .insert(rows.map((row, i) => ({ exam_id: exam.id, student_id: row.id, seat: i + 1 })))
        .select(),
      "roster",
    );
    check(
      await admin
        .from("proctor_assignments")
        .insert({ exam_id: exam.id, staff_id: options.proctorId, languages: ["ru", "en"], is_lead: true })
        .select(),
      "proctor assignment",
    );

    for (const [index, row] of rows.entries()) {
      try {
        const student = await joinExam(examCode, row.student_number);
        created.authUids.push(student.uid);
        students.push(student);
        for (const step of options.students[index] ?? []) {
          await ingest(student, step.events ?? [], step.status);
        }
      } catch (error) {
        const uid = (error as { uid?: unknown }).uid;
        if (typeof uid === "string") created.authUids.push(uid);
        throw error;
      }
    }
  } catch (error) {
    await destroy().catch(() => undefined);
    throw error;
  }

  const examId = created.examId;
  if (examId === null) throw new Error("e2e fixture: no exam");
  return { runId, examId, examCode, examTitle, students, destroy };
}
