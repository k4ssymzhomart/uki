// A throwaway exam for load measurement on the local stack (scripts/lib/perf/ingest-load.ts): its own
// workspace, group, live exam and roster, one proctor who watches exam:{id} the way the wall does, and
// N students. By default each signs in anonymously and joins through join_exam, exactly as the desktop
// app does, so their ingest calls take the real path (token check, session owner, ingest_batch,
// triggers). With `signIn: false` the sessions are inserted with the secret key and an auth uid that
// has no user, as demo:simulate does, for load on ingest_batch alone. Built with the secret key;
// destroy() removes every row and auth user it made.
import { randomUUID } from "node:crypto";
import { JoinExamOutput } from "../../../packages/contracts/src/index.ts";
import { createUkiClient, type UkiClient } from "../../../packages/db/src/index.ts";
import type { Logger } from "../cli.ts";
import type { ScriptEnv } from "../env.ts";
import { adminClient } from "../supabase.ts";

export interface PerfStudent {
  uid: string;
  sessionId: string;
  /** The anonymous user's access token; empty for a session made with `signIn: false`. */
  token: string;
  /** Last envelope seq sent. */
  seq: number;
}

export interface PerfWorld {
  runId: string;
  examId: string;
  examCode: string;
  questionIds: string[];
  proctor: { id: string; client: UkiClient; token: string };
  students: PerfStudent[];
  destroy(): Promise<void>;
}

const CLIENT_OPTIONS = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  realtime: { timeout: 30_000 },
} as const;

function must<T>(result: { data: T; error: unknown }, what: string): NonNullable<T> {
  if (result.error || result.data === null || result.data === undefined) {
    const error = result.error as { message?: unknown } | null;
    throw new Error(`perf fixture: ${what} failed: ${String(error?.message ?? JSON.stringify(error))}`);
  }
  return result.data;
}

async function inBatches<T, R>(items: readonly T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}

export async function createPerfWorld(
  env: ScriptEnv,
  options: { students: number; questions: number; log: Logger; signIn?: boolean },
): Promise<PerfWorld> {
  const publishable = env.SUPABASE_PUBLISHABLE_KEY;
  if (publishable === undefined) throw new Error("perf fixture: SUPABASE_PUBLISHABLE_KEY is required");
  const admin = adminClient(env);
  const runId = randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  const authUsers: string[] = [];
  const now = Date.now();
  let workspaceId: string | null = null;
  let examId: string | null = null;
  const sessionIds: string[] = [];

  async function destroy(): Promise<void> {
    const steps: [string, () => PromiseLike<{ error: unknown }>][] = [];
    if (examId !== null) {
      const id = examId;
      steps.push(
        ["events", () => admin.from("events").delete().eq("exam_id", id)],
        ["session_commands", () => admin.from("session_commands").delete().eq("exam_id", id)],
        ["answers", () => admin.from("answers").delete().in("session_id", sessionIds)],
        ["sessions", () => admin.from("sessions").delete().eq("exam_id", id)],
        ["proctor_assignments", () => admin.from("proctor_assignments").delete().eq("exam_id", id)],
        ["exam_students", () => admin.from("exam_students").delete().eq("exam_id", id)],
        ["exam_groups", () => admin.from("exam_groups").delete().eq("exam_id", id)],
        ["exam", () => admin.from("exams").delete().eq("id", id)],
      );
    }
    if (workspaceId !== null) {
      const id = workspaceId;
      steps.push(
        ["questions", () => admin.from("questions").delete().eq("workspace_id", id)],
        ["students", () => admin.from("students").delete().eq("workspace_id", id)],
        ["staff", () => admin.from("staff").delete().eq("workspace_id", id)],
        ["groups", () => admin.from("groups").delete().eq("workspace_id", id)],
        ["faculties", () => admin.from("faculties").delete().eq("workspace_id", id)],
        ["audit_log", () => admin.from("audit_log").delete().eq("workspace_id", id)],
        ["workspace", () => admin.from("workspaces").delete().eq("id", id)],
      );
    }
    for (let i = 0; i < authUsers.length; i += 100) {
      const chunk = authUsers.slice(i, i + 100);
      steps.push(["audit_log of students", () => admin.from("audit_log").delete().in("actor_id", chunk)]);
    }
    // Each step is tried three times: a loaded stack times statements out, and a PostgREST schema
    // reload aborts the transactions in flight.
    for (const [what, step] of steps) {
      let { error } = await step();
      for (let attempt = 1; error && attempt < 3; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
        ({ error } = await step());
      }
      if (error) options.log.warn(`cleanup ${what}: ${JSON.stringify(error)}`);
    }
    await inBatches(authUsers, 8, async (id) => {
      let { error } = await admin.auth.admin.deleteUser(id);
      if (error) ({ error } = await admin.auth.admin.deleteUser(id));
      if (error) options.log.warn(`cleanup auth user ${id}: ${error.message}`);
    });
  }

  try {
    const workspace = must(
      await admin
        .from("workspaces")
        .insert({ name: `Perf ${runId}`, slug: `perf-${runId.toLowerCase()}` })
        .select("id")
        .single(),
      "workspace",
    );
    workspaceId = workspace.id;
    const faculty = must(
      await admin
        .from("faculties")
        .insert({ workspace_id: workspace.id, name: "Perf" })
        .select("id")
        .single(),
      "faculty",
    );
    const group = must(
      await admin
        .from("groups")
        .insert({ workspace_id: workspace.id, faculty_id: faculty.id, code: `PF${runId}` })
        .select("id")
        .single(),
      "group",
    );
    const examCode = `PERF-${runId}`;
    const exam = must(
      await admin
        .from("exams")
        .insert({
          workspace_id: workspace.id,
          faculty_id: faculty.id,
          title: `Perf ${runId}`,
          course: "Perf",
          kind: "Load",
          code: examCode,
          mode: "app",
          starts_at: new Date(now - 60_000).toISOString(),
          duration_min: 90,
          lobby_opens_at: new Date(now - 30 * 60_000).toISOString(),
          status: "live",
        })
        .select("id")
        .single(),
      "exam",
    );
    examId = exam.id;
    must(
      await admin.from("exam_groups").insert({ exam_id: exam.id, group_id: group.id }).select(),
      "exam group",
    );

    const questions = must(
      await admin
        .from("questions")
        .insert(
          Array.from({ length: options.questions }, (_, i) => ({
            workspace_id: workspace.id,
            body: { kk: `Q${i + 1}`, ru: `Q${i + 1}`, en: `Q${i + 1}` },
            choices: [
              { id: "a", body: { kk: "a", ru: "a", en: "a" } },
              { id: "b", body: { kk: "b", ru: "b", en: "b" } },
            ],
          })),
        )
        .select("id"),
      "questions",
    );
    must(
      await admin
        .from("exam_questions")
        .insert(questions.map((q, i) => ({ exam_id: exam.id, question_id: q.id, position: i + 1 })))
        .select(),
      "exam questions",
    );

    const base = 80_000_000 + Math.floor(Math.random() * 9_000_000);
    const numbers = Array.from({ length: options.students }, (_, i) => String(base + i));
    const rows = must(
      await admin
        .from("students")
        .insert(
          numbers.map((number, i) => ({
            workspace_id: workspace.id,
            student_number: number,
            full_name: `Perf ${runId} ${i + 1}`,
            group_id: group.id,
            locale: "kk" as const,
          })),
        )
        .select("id"),
      "students",
    );
    must(
      await admin
        .from("exam_students")
        .insert(rows.map((row, i) => ({ exam_id: exam.id, student_id: row.id, seat: i + 1 })))
        .select(),
      "roster",
    );

    // The proctor who watches exam:{id}: a password user (admin API, no rate limit), one sign-in.
    const email = `perf.${runId.toLowerCase()}@perf.test`;
    const password = randomUUID();
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    const proctorId = must({ data: created.data.user, error: created.error }, "proctor auth user").id;
    authUsers.push(proctorId);
    must(
      await admin
        .from("staff")
        .insert({
          id: proctorId,
          workspace_id: workspace.id,
          faculty_id: faculty.id,
          full_name: `Perf ${runId}`,
          role: "proctor",
          languages: ["ru"],
        })
        .select(),
      "staff",
    );
    must(
      await admin
        .from("proctor_assignments")
        .insert({ exam_id: exam.id, staff_id: proctorId, languages: ["ru"], is_lead: true })
        .select(),
      "assignment",
    );
    const proctorClient = createUkiClient(env.SUPABASE_URL, publishable, CLIENT_OPTIONS);
    const signIn = await proctorClient.auth.signInWithPassword({ email, password });
    const proctorToken = must(
      { data: signIn.data.session, error: signIn.error },
      "proctor sign-in",
    ).access_token;
    await proctorClient.realtime.setAuth(proctorToken);

    if (options.signIn === false) {
      const inserted = must(
        await admin
          .from("sessions")
          .insert(
            rows.map((row) => ({
              exam_id: exam.id,
              student_id: row.id,
              auth_uid: randomUUID(),
              state: "joined" as const,
              locale: "kk" as const,
              device: { os: "macos", app_version: "0.0.0-perf", simulated: true },
            })),
          )
          .select("id, auth_uid"),
        "sessions",
      );
      sessionIds.push(...inserted.map((row) => row.id));
      return {
        runId,
        examId: exam.id,
        examCode,
        questionIds: questions.map((q) => q.id),
        proctor: { id: proctorId, client: proctorClient, token: proctorToken },
        students: inserted.map((row) => ({ uid: row.auth_uid, sessionId: row.id, token: "", seq: 0 })),
        async destroy() {
          await proctorClient.removeAllChannels();
          await proctorClient.auth.signOut().catch(() => undefined);
          await destroy();
        },
      };
    }

    // Students: anonymous sign-in and join_exam, eight at a time.
    let joined = 0;
    const students = await inBatches(numbers, 8, async (number): Promise<PerfStudent> => {
      const client = createUkiClient(env.SUPABASE_URL, publishable, CLIENT_OPTIONS);
      const anon = must(await client.auth.signInAnonymously(), "anonymous sign-in");
      const uid = anon.user?.id;
      const token = anon.session?.access_token;
      if (!uid || !token) throw new Error("perf fixture: anonymous sign-in returned no session");
      authUsers.push(uid);
      const output = JoinExamOutput.parse(
        must(
          await client.rpc("join_exam", {
            code: examCode,
            student_number: number,
            locale: "kk",
            device: { os: "macos", app_version: "0.0.0-perf" },
          }),
          `join_exam ${number}`,
        ),
      );
      sessionIds.push(output.session.id);
      joined += 1;
      if (joined % 40 === 0) options.log.info(`  ${joined} of ${numbers.length} students joined`);
      return { uid, sessionId: output.session.id, token, seq: 0 };
    });

    return {
      runId,
      examId: exam.id,
      examCode,
      questionIds: questions.map((q) => q.id),
      proctor: { id: proctorId, client: proctorClient, token: proctorToken },
      students,
      async destroy() {
        await proctorClient.removeAllChannels();
        await proctorClient.auth.signOut().catch(() => undefined);
        await destroy();
      },
    };
  } catch (error) {
    await destroy();
    throw error;
  }
}
