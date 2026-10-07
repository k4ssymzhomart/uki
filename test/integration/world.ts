// A throwaway exam world per test file, made with the secret key so tests never depend on the seed's
// clock (Mathematics 2 is only joinable for a while after `supabase db reset`): its own workspace,
// group, live exam, roster, a lead proctor, a second proctor who is not assigned, an exam office user,
// and anonymous students who joined through `join_exam`. destroy() removes all of it, auth users and
// stored stills included.
import { randomUUID } from "node:crypto";
import { inject } from "vitest";
import { JoinExamOutput } from "../../packages/contracts/src/index.ts";
import { createUkiAdminClient } from "../../packages/db/src/admin.ts";
import { createUkiClient, type UkiClient } from "../../packages/db/src/index.ts";

export interface Staff {
  id: string;
  name: string;
  email: string;
  client: UkiClient;
  token: string;
}

export interface Student {
  /** auth.uid() of the anonymous sign-in. */
  uid: string;
  studentId: string;
  number: string;
  name: string;
  sessionId: string;
  client: UkiClient;
  token: string;
}

export interface World {
  runId: string;
  workspaceId: string;
  examId: string;
  examCode: string;
  lead: Staff;
  /** A proctor of the same workspace with no assignment to this exam. */
  otherProctor: Staff;
  office: Staff;
  students: Student[];
  destroy(): Promise<void>;
}

const SESSION_OPTIONS = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
} as const;

export function stack() {
  return inject("stack");
}

export function adminClient(): UkiClient {
  const { apiUrl, secretKey } = stack();
  return createUkiAdminClient(apiUrl, secretKey);
}

export function publicClient(): UkiClient {
  const { apiUrl, publishableKey } = stack();
  return createUkiClient(apiUrl, publishableKey, SESSION_OPTIONS);
}

function must<T>(result: { data: T; error: unknown }, what: string): NonNullable<T> {
  if (result.error || result.data === null || result.data === undefined) {
    throw new Error(`world: ${what} failed: ${JSON.stringify(result.error)}`);
  }
  return result.data;
}

async function signedIn(client: UkiClient): Promise<string> {
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("world: no session after sign-in");
  await client.realtime.setAuth(token);
  return token;
}

export async function createWorld(options: { students?: number } = {}): Promise<World> {
  const studentCount = options.students ?? 3;
  const admin = adminClient();
  const runId = randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  const password = randomUUID();
  const authUsers: string[] = [];
  const now = Date.now();

  const workspace = must(
    await admin
      .from("workspaces")
      .insert({ name: `Integration ${runId}`, slug: `it-${runId.toLowerCase()}` })
      .select("id")
      .single(),
    "workspace",
  );
  const faculty = must(
    await admin
      .from("faculties")
      .insert({ workspace_id: workspace.id, name: "Faculty of Integration" })
      .select("id")
      .single(),
    "faculty",
  );
  const group = must(
    await admin
      .from("groups")
      .insert({ workspace_id: workspace.id, faculty_id: faculty.id, code: `IT${runId}` })
      .select("id")
      .single(),
    "group",
  );
  const examCode = `IT-${runId}`;
  const exam = must(
    await admin
      .from("exams")
      .insert({
        workspace_id: workspace.id,
        faculty_id: faculty.id,
        title: `Integration ${runId}`,
        course: "Integration",
        kind: "Test",
        code: examCode,
        mode: "app",
        starts_at: new Date(now - 60_000).toISOString(),
        duration_min: 60,
        lobby_opens_at: new Date(now - 30 * 60_000).toISOString(),
        status: "live",
      })
      .select("id")
      .single(),
    "exam",
  );
  must(
    await admin.from("exam_groups").insert({ exam_id: exam.id, group_id: group.id }).select(),
    "exam group",
  );

  const base = 90_000_000 + Math.floor(Math.random() * 9_000_000);
  const roster = Array.from({ length: studentCount }, (_, i) => ({
    number: String(base + i),
    name: `Student ${String.fromCharCode(65 + i)} ${runId}`,
  }));
  const studentRows = must(
    await admin
      .from("students")
      .insert(
        roster.map((s) => ({
          workspace_id: workspace.id,
          student_number: s.number,
          full_name: s.name,
          group_id: group.id,
          locale: "kk" as const,
        })),
      )
      .select("id, student_number"),
    "students",
  );
  must(
    await admin
      .from("exam_students")
      .insert(studentRows.map((row, i) => ({ exam_id: exam.id, student_id: row.id, seat: i + 1 })))
      .select(),
    "roster",
  );

  async function makeStaff(label: string, role: "proctor" | "exam_office"): Promise<Staff> {
    const email = `${label}.${runId.toLowerCase()}@it.test`;
    const name = `${label[0]?.toUpperCase()}${label.slice(1)} ${runId}`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    const id = must({ data: created.data.user, error: created.error }, `auth user ${label}`).id;
    authUsers.push(id);
    must(
      await admin
        .from("staff")
        .insert({
          id,
          workspace_id: workspace.id,
          faculty_id: faculty.id,
          full_name: name,
          role,
          languages: ["ru"],
        })
        .select(),
      `staff ${label}`,
    );
    const client = publicClient();
    const signIn = await client.auth.signInWithPassword({ email, password });
    must({ data: signIn.data.session, error: signIn.error }, `sign-in ${label}`);
    return { id, name, email, client, token: await signedIn(client) };
  }

  const lead = await makeStaff("lead", "proctor");
  const otherProctor = await makeStaff("other", "proctor");
  const office = await makeStaff("office", "exam_office");
  must(
    await admin
      .from("proctor_assignments")
      .insert({ exam_id: exam.id, staff_id: lead.id, languages: ["ru"], is_lead: true })
      .select(),
    "assignment",
  );

  const students: Student[] = [];
  for (const [i, entry] of roster.entries()) {
    const client = publicClient();
    const anon = must(await client.auth.signInAnonymously(), `anonymous sign-in ${i}`);
    const uid = anon.user?.id;
    if (!uid) throw new Error("world: anonymous sign-in returned no user");
    authUsers.push(uid);
    const joined = await client.rpc("join_exam", {
      code: examCode,
      student_number: entry.number,
      locale: "kk",
      device: { os: "macos", app_version: "0.0.0-it" },
    });
    const output = JoinExamOutput.parse(must(joined, `join_exam ${i}`));
    students.push({
      uid,
      studentId: output.student.id,
      number: entry.number,
      name: entry.name,
      sessionId: output.session.id,
      client,
      token: await signedIn(client),
    });
  }

  async function destroy(): Promise<void> {
    for (const client of [
      lead.client,
      otherProctor.client,
      office.client,
      ...students.map((s) => s.client),
    ]) {
      await client.removeAllChannels();
    }
    // Stills: every object under frames/<exam_id>/.
    const bucket = admin.storage.from("frames");
    const folders = (await bucket.list(exam.id, { limit: 1000 })).data ?? [];
    for (const folder of folders) {
      const files = (await bucket.list(`${exam.id}/${folder.name}`, { limit: 1000 })).data ?? [];
      if (files.length > 0) await bucket.remove(files.map((f) => `${exam.id}/${folder.name}/${f.name}`));
    }
    const sessionIds = students.map((s) => s.sessionId);
    await admin.from("frames").delete().eq("exam_id", exam.id);
    await admin.from("events").delete().eq("exam_id", exam.id);
    await admin.from("session_commands").delete().eq("exam_id", exam.id);
    if (sessionIds.length > 0) await admin.from("answers").delete().in("session_id", sessionIds);
    await admin.from("sessions").delete().eq("exam_id", exam.id);
    await admin.from("proctor_assignments").delete().eq("exam_id", exam.id);
    await admin.from("exam_students").delete().eq("exam_id", exam.id);
    await admin.from("exam_groups").delete().eq("exam_id", exam.id);
    await admin.from("exams").delete().eq("id", exam.id);
    // Questions a test added (exam_questions went with the exam).
    await admin.from("questions").delete().eq("workspace_id", workspace.id);
    await admin.from("students").delete().eq("workspace_id", workspace.id);
    await admin.from("staff").delete().eq("workspace_id", workspace.id);
    await admin.from("groups").delete().eq("workspace_id", workspace.id);
    await admin.from("faculties").delete().eq("workspace_id", workspace.id);
    await admin.from("audit_log").delete().eq("workspace_id", workspace.id);
    await admin.from("audit_log").delete().in("actor_id", authUsers);
    await admin.from("workspaces").delete().eq("id", workspace.id);
    for (const id of authUsers) await admin.auth.admin.deleteUser(id);
  }

  return {
    runId,
    workspaceId: workspace.id,
    examId: exam.id,
    examCode,
    lead,
    otherProctor,
    office,
    students,
    destroy,
  };
}
