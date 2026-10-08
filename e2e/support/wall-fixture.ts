// A throwaway live exam in the KRU workspace for the wall test, made with the secret key so the test
// never depends on the seeded Mathematics 2 clock: its own group and students, the given proctor as
// lead, and students who joined through join_exam and started writing (exam.started through ingest).
// destroy() removes every row it made, the anonymous auth users and their audit rows included.
import { randomBytes } from "node:crypto";
import { KRU } from "./seed.ts";
import { draft, ingest, type JoinedStudent, joinExam } from "./student.ts";
import { adminClient, cleanUp } from "./supabase.ts";

export interface WallFixture {
  runId: string;
  examId: string;
  examCode: string;
  examTitle: string;
  students: JoinedStudent[];
  /** One ingest call per student without events, so no tile drifts into No signal. */
  heartbeat(question?: number): Promise<void>;
  destroy(): Promise<void>;
}

const FIRST_NAMES = ["Aruzhan", "Bolat", "Dinara", "Erlan", "Gaukhar", "Kanat"];

function check<T>(result: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  if (result.error || result.data === null || result.data === undefined) {
    throw new Error(`e2e fixture: ${what} failed: ${result.error?.message ?? "no data"}`);
  }
  return result.data;
}

async function waitForStates(sessionIds: readonly string[], state: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const rows = check(
      await adminClient()
        .from("sessions")
        .select("id, state")
        .in("id", [...sessionIds]),
      "reading sessions",
    );
    if (rows.length === sessionIds.length && rows.every((row) => row.state === state)) return;
    if (Date.now() > deadline) {
      throw new Error(`e2e fixture: sessions did not reach ${state}: ${JSON.stringify(rows)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

export async function createWallFixture(options: {
  proctorId: string;
  students?: number;
  /** More proctors of the exam, not lead (the Ask proctor test watches 2.4d on two walls). */
  moreProctorIds?: readonly string[];
}): Promise<WallFixture> {
  const admin = adminClient();
  const count = Math.min(options.students ?? 3, FIRST_NAMES.length);
  const runId = randomBytes(3).toString("hex").toUpperCase();
  const examCode = `E2E-${runId}`;
  const examTitle = `E2E wall ${runId}`;
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
        ["frames", () => admin.from("frames").delete().eq("exam_id", examId)],
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
    const exam = check(
      await admin
        .from("exams")
        .insert({
          workspace_id: KRU.workspaceId,
          faculty_id: KRU.mathFacultyId,
          title: examTitle,
          course: "E2E",
          kind: "Smoke test",
          code: examCode,
          mode: "app",
          status: "live",
          starts_at: new Date(now - 60_000).toISOString(),
          duration_min: 60,
          lobby_opens_at: new Date(now - 30 * 60_000).toISOString(),
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

    const base = 80_000_000 + Math.floor(Math.random() * 9_000_000);
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
        .insert([
          { exam_id: exam.id, staff_id: options.proctorId, languages: ["kk", "ru"], is_lead: true },
          ...(options.moreProctorIds ?? []).map((staffId) => ({
            exam_id: exam.id,
            staff_id: staffId,
            languages: ["kk", "ru"] as ("kk" | "ru")[],
            is_lead: false,
          })),
        ])
        .select(),
      "proctor assignment",
    );

    for (const row of rows) {
      try {
        const student = await joinExam(examCode, row.student_number);
        created.authUids.push(student.uid);
        students.push(student);
      } catch (error) {
        const uid = (error as { uid?: unknown }).uid;
        if (typeof uid === "string") created.authUids.push(uid);
        throw error;
      }
    }
    // 1.4 to 2.1: exam.started moves each session to writing (events_broadcast trigger).
    for (const student of students) await ingest(student, [draft("exam.started", {})], { question: 1 });
    await waitForStates(
      students.map((s) => s.sessionId),
      "writing",
      15_000,
    );
  } catch (error) {
    await destroy().catch(() => undefined);
    throw error;
  }

  return {
    runId,
    examId: created.examId,
    examCode,
    examTitle,
    students,
    async heartbeat(question = 1) {
      await Promise.all(students.map((student) => ingest(student, [], { question })));
    },
    destroy,
  };
}
