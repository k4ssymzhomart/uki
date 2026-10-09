// A throwaway exam for the desktop end-to-end run, made with the secret key on the local stack and
// removed afterwards. It mirrors the seed's Mathematics 2 · Midterm (title, the 20 seeded questions,
// Madina Tulegenova 20231187 at seat 23, Arman Bekzhanov 20230912, lead proctor Aigerim Sadykova), so
// the screens show what the Figma frames show. It lives in its own workspace: the seeded one stays as
// the dashboard's tests expect it, and a half-built fixture is still removed completely.
import { uuidv7 } from "@uki/contracts";
import { createUkiClient, type UkiClient } from "@uki/db";
import { createUkiAdminClient } from "@uki/db/admin";
import { readStackEnv, type StackEnv } from "../../../../test/integration/stack.ts";

export const SEED_EXAM_CODE = "MATH2-204-FRI";

export interface FixtureStudent {
  number: string;
  fullName: string;
  seat: number;
}

export const STUDENTS = {
  madina: { number: "20231187", fullName: "Madina Tulegenova", seat: 23 },
  arman: { number: "20230912", fullName: "Arman Bekzhanov", seat: 5 },
} as const satisfies Record<string, FixtureStudent>;

export interface Fixture {
  stack: StackEnv;
  workspaceId: string;
  examId: string;
  code: string;
  title: string;
  startsAt: number;
  questionCount: number;
  lead: { id: string; name: string; token: string; client: UkiClient };
}

export interface FixtureOptions {
  /** Minutes from now to the scheduled start (the lobby is open already). Default 20. */
  startsInMin?: number;
  /** Exam checks; the Lock is off by default (pairing has its own smoke test in apps/lock). */
  checks?: {
    identity?: boolean;
    lock?: boolean;
    phone_score?: number;
    face_missing_s?: number;
    gaze_s?: number;
  };
}

const NO_PERSIST = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
} as const;

function must<T>(result: { data: T; error: unknown }, what: string): NonNullable<T> {
  if (result.error || result.data === null || result.data === undefined) {
    throw new Error(`fixture: ${what}: ${JSON.stringify(result.error)}`);
  }
  return result.data;
}

export function admin(stack: StackEnv = readStackEnv()): UkiClient {
  return createUkiAdminClient(stack.apiUrl, stack.secretKey);
}

interface QuestionRow {
  body: unknown;
  choices: unknown;
}

/** The seed's Mathematics 2 questions in order, or 20 plain ones when the seed is not there. */
async function seededQuestions(db: UkiClient): Promise<QuestionRow[]> {
  const exam = await db.from("exams").select("id").eq("code", SEED_EXAM_CODE).maybeSingle();
  if (exam.data) {
    const rows = await db
      .from("exam_questions")
      .select("position, questions(body, choices)")
      .eq("exam_id", exam.data.id)
      .order("position");
    const questions = (rows.data ?? [])
      .map((row) => row.questions as QuestionRow | null)
      .filter((q): q is QuestionRow => q !== null);
    if (questions.length > 0) return questions;
  }
  return Array.from({ length: 20 }, (_, i) => ({
    body: { kk: `Сұрақ ${i + 1}`, ru: `Вопрос ${i + 1}`, en: `Question ${i + 1}` },
    choices: ["a", "b", "c", "d"].map((id) => ({ id, body: { kk: id, ru: id, en: id } })),
  }));
}

export async function createFixture(options: FixtureOptions = {}): Promise<Fixture> {
  const stack = readStackEnv();
  const db = admin(stack);
  const run = uuidv7().replaceAll("-", "").slice(-8).toUpperCase();
  const fixture: Partial<Fixture> & { workspaceId?: string } = { stack };
  try {
    const workspace = must(
      await db
        .from("workspaces")
        .insert({ name: `Desktop e2e ${run}`, slug: `desktop-e2e-${run.toLowerCase()}` })
        .select("id")
        .single(),
      "workspace",
    );
    fixture.workspaceId = workspace.id;
    const faculty = must(
      await db
        .from("faculties")
        .insert({ workspace_id: workspace.id, name: "Faculty of Mathematics" })
        .select("id")
        .single(),
      "faculty",
    );
    const group = must(
      await db
        .from("groups")
        .insert({ workspace_id: workspace.id, faculty_id: faculty.id, code: "204" })
        .select("id")
        .single(),
      "group",
    );
    const code = `E2E-${run}`;
    const now = Date.now();
    const startsAt = now + (options.startsInMin ?? 20) * 60_000;
    const exam = must(
      await db
        .from("exams")
        .insert({
          workspace_id: workspace.id,
          faculty_id: faculty.id,
          title: "Mathematics 2 · Midterm",
          course: "Mathematics 2",
          kind: "Midterm",
          code,
          mode: "app",
          starts_at: new Date(startsAt).toISOString(),
          duration_min: 90,
          lobby_opens_at: new Date(now - 60_000).toISOString(),
          status: "scheduled",
          checks: {
            gaze_s: 2,
            phone_score: 0.55,
            face_missing_s: 10,
            identity: true,
            lock: false,
            ...options.checks,
          },
        })
        .select("id")
        .single(),
      "exam",
    );
    fixture.examId = exam.id;
    fixture.code = code;
    fixture.title = "Mathematics 2 · Midterm";
    fixture.startsAt = startsAt;
    must(
      await db.from("exam_groups").insert({ exam_id: exam.id, group_id: group.id }).select(),
      "exam group",
    );
    const roster = Object.values(STUDENTS);
    const students = must(
      await db
        .from("students")
        .insert(
          roster.map((s) => ({
            workspace_id: workspace.id,
            student_number: s.number,
            full_name: s.fullName,
            group_id: group.id,
          })),
        )
        .select("id, student_number"),
      "students",
    );
    must(
      await db
        .from("exam_students")
        .insert(
          students.map((s) => ({
            exam_id: exam.id,
            student_id: s.id,
            seat: roster.find((r) => r.number === s.student_number)?.seat ?? null,
          })),
        )
        .select(),
      "roster",
    );
    const source = await seededQuestions(db);
    const questions = must(
      await db
        .from("questions")
        .insert(
          source.map((q) => ({
            workspace_id: workspace.id,
            body: q.body as never,
            choices: q.choices as never,
          })),
        )
        .select("id"),
      "questions",
    );
    must(
      await db
        .from("exam_questions")
        .insert(questions.map((q, i) => ({ exam_id: exam.id, question_id: q.id, position: i + 1 })))
        .select(),
      "exam questions",
    );
    fixture.questionCount = questions.length;

    const email = `e2e-lead-${run.toLowerCase()}@desktop.test`;
    const password = uuidv7();
    const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
    const leadId = must({ data: created.data.user, error: created.error }, "lead user").id;
    const name = "Aigerim Sadykova";
    must(
      await db
        .from("staff")
        .insert({
          id: leadId,
          workspace_id: workspace.id,
          faculty_id: faculty.id,
          full_name: name,
          role: "proctor",
          languages: ["kk", "ru"],
        })
        .select(),
      "staff",
    );
    must(
      await db
        .from("proctor_assignments")
        .insert({
          exam_id: exam.id,
          staff_id: leadId,
          seat_from: 1,
          seat_to: 64,
          languages: ["kk", "ru"],
          is_lead: true,
        })
        .select(),
      "assignment",
    );
    const client = createUkiClient(stack.apiUrl, stack.publishableKey, NO_PERSIST);
    const signIn = await client.auth.signInWithPassword({ email, password });
    const token = must({ data: signIn.data.session, error: signIn.error }, "lead sign-in").access_token;
    fixture.lead = { id: leadId, name, token, client };
    return fixture as Fixture;
  } catch (error) {
    if (fixture.workspaceId) await destroyWorkspace(fixture.workspaceId).catch(() => {});
    throw error;
  }
}

/** Removes everything under a fixture workspace: stills, rows, the lead and the students' anonymous users. */
export async function destroyWorkspace(workspaceId: string): Promise<void> {
  const db = admin();
  const exams = ((await db.from("exams").select("id").eq("workspace_id", workspaceId)).data ?? []).map(
    (e) => e.id,
  );
  const staff = ((await db.from("staff").select("id").eq("workspace_id", workspaceId)).data ?? []).map(
    (s) => s.id,
  );
  const sessions =
    exams.length > 0
      ? ((await db.from("sessions").select("id, auth_uid").in("exam_id", exams)).data ?? [])
      : [];
  const bucket = db.storage.from("frames");
  for (const examId of exams) {
    const folders = (await bucket.list(examId, { limit: 1000 })).data ?? [];
    for (const folder of folders) {
      const files = (await bucket.list(`${examId}/${folder.name}`, { limit: 1000 })).data ?? [];
      if (files.length > 0) await bucket.remove(files.map((file) => `${examId}/${folder.name}/${file.name}`));
    }
  }
  if (exams.length > 0) {
    await db.from("frames").delete().in("exam_id", exams);
    await db.from("events").delete().in("exam_id", exams);
    await db.from("session_commands").delete().in("exam_id", exams);
    if (sessions.length > 0) {
      await db
        .from("answers")
        .delete()
        .in(
          "session_id",
          sessions.map((s) => s.id),
        );
    }
    await db.from("sessions").delete().in("exam_id", exams);
    await db.from("proctor_assignments").delete().in("exam_id", exams);
    await db.from("exam_students").delete().in("exam_id", exams);
    await db.from("exam_groups").delete().in("exam_id", exams);
    await db.from("exam_questions").delete().in("exam_id", exams);
    await db.from("exams").delete().in("id", exams);
  }
  await db.from("questions").delete().eq("workspace_id", workspaceId);
  await db.from("students").delete().eq("workspace_id", workspaceId);
  await db.from("staff").delete().eq("workspace_id", workspaceId);
  await db.from("groups").delete().eq("workspace_id", workspaceId);
  await db.from("faculties").delete().eq("workspace_id", workspaceId);
  const users = [...new Set([...staff, ...sessions.map((s) => s.auth_uid)])];
  await db.from("audit_log").delete().eq("workspace_id", workspaceId);
  if (users.length > 0) await db.from("audit_log").delete().in("actor_id", users);
  await db.from("workspaces").delete().eq("id", workspaceId);
  for (const user of users) await db.auth.admin.deleteUser(user);
}

/** Workspaces a crashed run left behind (named "Desktop e2e ..."). */
export async function leftoverWorkspaces(): Promise<string[]> {
  const rows = (await admin().from("workspaces").select("id").like("slug", "desktop-e2e-%")).data ?? [];
  return rows.map((row) => row.id);
}
