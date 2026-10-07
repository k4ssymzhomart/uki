// The desktop flow's services against the local stack: the real join_exam, ingest, frames, answers,
// session_commands, Realtime and submit_session. A throwaway exam is made with the secret key (the
// seed's Mathematics 2 lobby closes 15 minutes after a reset) and removed afterwards.
// Run: pnpm --filter desktop exec vitest run -c src/renderer/test/vitest.stack.config.mjs
import "fake-indexeddb/auto";
import { ClientEventEnvelope, type EventType, RECEIPT_ID_PATTERN, STILL, uuidv7 } from "@uki/contracts";
import { createUkiClient, type UkiClient } from "@uki/db";
import { createUkiAdminClient } from "@uki/db/admin";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { stageOf } from "../flow/derive.ts";
import { FlowRuntime } from "../flow/runtime.ts";
import { selectScreen } from "../flow/select.ts";
import { OutboxDb } from "../outbox/db.ts";
import { Outbox } from "../outbox/outbox.ts";
import { type Connectivity, type SyncApi, SyncLoop } from "../outbox/sync.ts";
import { CommandRouter, type FlowCommand } from "../services/commands.ts";
import { ServiceError } from "../services/errors.ts";
import { createStudentApi, type StudentApi } from "../services/student-api.ts";
import { ensureStudentSession } from "../services/supabase.ts";
import { FakeBridge, FakeDetection, FakeIdentity } from "./fakes.ts";

/** A 64 × 36 JPEG, the same as the functions' integration tests use. */
const TINY_JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAkAEADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwChRRRX1J88FFFFABRRRQAUUUUAXv7Qtf8AoDWX/fc//wAco/tC1/6A1l/33P8A/HKo0VHIv6bK5mXv7Qtf+gNZf99z/wDxyj+0LX/oDWX/AH3P/wDHKo0Uci/psOZl7+0LX/oDWX/fc/8A8co/tC1/6A1l/wB9z/8AxyqNFHIv6bDmZe/tC1/6A1l/33P/APHKP7Qtf+gNZf8Afc//AMcqjRRyL+mw5mFFFFWSFFFFABRRRQAUUUUAf//Z";

function tinyJpeg(): ArrayBuffer {
  const binary = atob(TINY_JPEG_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

const NO_PERSIST = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
} as const;

async function until(
  check: () => boolean | Promise<boolean>,
  timeoutMs = 30_000,
  stepMs = 200,
  explain: () => unknown = () => "",
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, stepMs));
  }
  throw new Error(`condition not met within ${timeoutMs} ms ${JSON.stringify(explain())}`);
}

function must<T>(result: { data: T; error: unknown }, what: string): NonNullable<T> {
  if (result.error || result.data === null || result.data === undefined) {
    throw new Error(`fixture: ${what}: ${JSON.stringify(result.error)}`);
  }
  return result.data;
}

interface Fixture {
  examId: string;
  code: string;
  students: { number: string }[];
  lead: { id: string; token: string };
  questionIds: string[];
  authUsers: string[];
  sessions: string[];
}

const stack = () => inject("stack");
const admin = () => createUkiAdminClient(stack().apiUrl, stack().secretKey);
const studentClient = (): UkiClient => createUkiClient(stack().apiUrl, stack().publishableKey, NO_PERSIST);
const studentApi = (client: UkiClient): StudentApi =>
  createStudentApi(client, { url: stack().apiUrl, publishableKey: stack().publishableKey });

let fixture: Fixture;
let workspaceId = "";

async function createFixture(): Promise<Fixture> {
  const db = admin();
  const run = uuidv7().replaceAll("-", "").slice(-8).toUpperCase();
  const workspace = must(
    await db
      .from("workspaces")
      .insert({ name: `Desktop flow ${run}`, slug: `df-${run.toLowerCase()}` })
      .select("id")
      .single(),
    "workspace",
  );
  workspaceId = workspace.id;
  const faculty = must(
    await db
      .from("faculties")
      .insert({ workspace_id: workspace.id, name: "Faculty of Flow" })
      .select("id")
      .single(),
    "faculty",
  );
  const group = must(
    await db
      .from("groups")
      .insert({ workspace_id: workspace.id, faculty_id: faculty.id, code: `DF${run}` })
      .select("id")
      .single(),
    "group",
  );
  const code = `DF-${run}`;
  const now = Date.now();
  const exam = must(
    await db
      .from("exams")
      .insert({
        workspace_id: workspace.id,
        faculty_id: faculty.id,
        title: `Desktop flow ${run} · Test`,
        course: "Desktop flow",
        kind: "Test",
        code,
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
  must(await db.from("exam_groups").insert({ exam_id: exam.id, group_id: group.id }).select(), "exam group");
  const base = 80_000_000 + Math.floor(Math.random() * 9_000_000);
  const numbers = [0, 1, 2].map((i) => String(base + i));
  const students = must(
    await db
      .from("students")
      .insert(
        numbers.map((n, i) => ({
          workspace_id: workspace.id,
          student_number: n,
          full_name: `Flow Student ${i} ${run}`,
          group_id: group.id,
        })),
      )
      .select("id"),
    "students",
  );
  must(
    await db
      .from("exam_students")
      .insert(students.map((s, i) => ({ exam_id: exam.id, student_id: s.id, seat: i + 1 })))
      .select(),
    "roster",
  );
  const questions = must(
    await db
      .from("questions")
      .insert(
        [1, 2, 3].map((n) => ({
          workspace_id: workspace.id,
          body: { kk: `Сұрақ ${n}`, ru: `Вопрос ${n}`, en: `Question ${n}` },
          choices: ["a", "b", "c", "d"].map((id) => ({ id, body: { kk: id, ru: id, en: id } })),
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
  const email = `lead.${run.toLowerCase()}@flow.test`;
  const password = uuidv7();
  const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
  const leadId = must({ data: created.data.user, error: created.error }, "lead user").id;
  must(
    await db
      .from("staff")
      .insert({
        id: leadId,
        workspace_id: workspace.id,
        faculty_id: faculty.id,
        full_name: `Lead ${run}`,
        role: "proctor",
        languages: ["ru"],
      })
      .select(),
    "staff",
  );
  must(
    await db
      .from("proctor_assignments")
      .insert({ exam_id: exam.id, staff_id: leadId, languages: ["ru"], is_lead: true })
      .select(),
    "assignment",
  );
  const leadClient = createUkiClient(stack().apiUrl, stack().publishableKey, NO_PERSIST);
  const signIn = await leadClient.auth.signInWithPassword({ email, password });
  const token = must({ data: signIn.data.session, error: signIn.error }, "lead sign-in").access_token;
  return {
    examId: exam.id,
    code,
    students: numbers.map((number) => ({ number })),
    lead: { id: leadId, token },
    questionIds: questions.map((q) => q.id),
    authUsers: [leadId],
    sessions: [],
  };
}

/** Removes everything under the fixture's workspace, also when the fixture was only half built. */
async function destroyWorkspace(id: string, extraUsers: string[]): Promise<void> {
  if (!id) return;
  const db = admin();
  const exams = ((await db.from("exams").select("id").eq("workspace_id", id)).data ?? []).map((e) => e.id);
  const staff = ((await db.from("staff").select("id").eq("workspace_id", id)).data ?? []).map((s) => s.id);
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
    if (sessions.length > 0)
      await db
        .from("answers")
        .delete()
        .in(
          "session_id",
          sessions.map((s) => s.id),
        );
    await db.from("sessions").delete().in("exam_id", exams);
    await db.from("proctor_assignments").delete().in("exam_id", exams);
    await db.from("exam_students").delete().in("exam_id", exams);
    await db.from("exam_groups").delete().in("exam_id", exams);
    await db.from("exam_questions").delete().in("exam_id", exams);
    await db.from("exams").delete().in("id", exams);
  }
  await db.from("questions").delete().eq("workspace_id", id);
  await db.from("students").delete().eq("workspace_id", id);
  await db.from("staff").delete().eq("workspace_id", id);
  await db.from("groups").delete().eq("workspace_id", id);
  await db.from("faculties").delete().eq("workspace_id", id);
  const users = [...new Set([...extraUsers, ...staff, ...sessions.map((s) => s.auth_uid)])];
  await db.from("audit_log").delete().eq("workspace_id", id);
  if (users.length > 0) await db.from("audit_log").delete().in("actor_id", users);
  await db.from("workspaces").delete().eq("id", id);
  for (const user of users) await db.auth.admin.deleteUser(user);
}

/** The real API with a switch that drops every call like a dead network. */
class SwitchableApi implements SyncApi {
  online = true;
  constructor(private readonly api: StudentApi) {}
  private gate(): void {
    if (!this.online) throw new ServiceError("network", "network switched off by the test");
  }
  upsertAnswers: SyncApi["upsertAnswers"] = async (rows) => {
    this.gate();
    return this.api.upsertAnswers(rows);
  };
  ingest: SyncApi["ingest"] = async (request) => {
    this.gate();
    return this.api.ingest(request);
  };
  uploadStill: SyncApi["uploadStill"] = async (grant, jpeg) => {
    this.gate();
    return this.api.uploadStill(grant, jpeg);
  };
  confirmFrames: SyncApi["confirmFrames"] = async (request) => {
    this.gate();
    return this.api.confirmFrames(request);
  };
}

function envelope(
  sessionId: string,
  type: EventType,
  seq: number,
  data: Record<string, unknown> = {},
  frameCount = 0,
) {
  return ClientEventEnvelope.parse({
    id: uuidv7(),
    session_id: sessionId,
    type,
    source: "app",
    at: new Date().toISOString(),
    seq,
    data,
    frame_count: frameCount,
    app_version: "0.0.0-flow",
  });
}

beforeAll(async () => {
  fixture = await createFixture();
});

afterAll(async () => {
  await destroyWorkspace(workspaceId, fixture?.authUsers ?? []);
});

describe("the desktop flow against the local stack", () => {
  it("syncs answers, events and stills through ingest and frames, and loses nothing in a network cut", async () => {
    const client = studentClient();
    const signed = await ensureStudentSession(client);
    fixture.authUsers.push(signed.userId);
    const api = studentApi(client);
    const joined = await api.joinExam({
      code: fixture.code.toLowerCase(),
      student_number: fixture.students[0]?.number ?? "",
      locale: "ru",
      device: { os: "macos", app_version: "0.0.0-flow" },
    });
    expect(joined.questions).toHaveLength(3);
    const again = await api.joinExam({
      code: fixture.code,
      student_number: fixture.students[0]?.number ?? "",
      locale: "ru",
      device: { os: "macos", app_version: "0.0.0-flow" },
    });
    expect(again.session.id).toBe(joined.session.id);
    const sessionId = joined.session.id;

    const outbox = new Outbox(new OutboxDb(`flow-stack-${uuidv7()}`));
    const switchable = new SwitchableApi(api);
    const connectivity: Connectivity[] = [];
    const loop = new SyncLoop({
      api: switchable,
      outbox,
      sessionId,
      getStatus: () => ({ question: 2 }),
      onConnectivity: (state) => connectivity.push(state),
      onReconnect: async ({ offlineMs, queued }) => {
        await outbox.enqueueEvent(sessionId, (seq) =>
          envelope(sessionId, "net.offline", seq, { offline_ms: offlineMs, queued }),
        );
      },
    });

    const q1 = fixture.questionIds[0] ?? "";
    const q2 = fixture.questionIds[1] ?? "";
    await outbox.enqueueEvent(sessionId, (seq) => envelope(sessionId, "exam.started", seq));
    await outbox.saveAnswer(sessionId, q1, "a", new Date().toISOString());
    await outbox.enqueueEvent(sessionId, (seq) =>
      envelope(sessionId, "answer.saved", seq, { question_id: q1 }),
    );
    const look = await outbox.enqueueEvent(sessionId, (seq) =>
      envelope(sessionId, "gaze.off_screen", seq, { duration_ms: 3100, direction: "left" }, 3),
    );
    for (let index = 0; index < 3; index += 1) {
      await outbox.addStill({
        sessionId,
        eventId: look.id,
        index,
        at: Date.now() + index * 1000,
        bytes: tinyJpeg(),
      });
    }
    loop.start();
    await until(() => outbox.isEmpty(sessionId));

    const db = admin();
    const stored = must(
      await db
        .from("events")
        .select("id, type, review, seq, source, frame_count")
        .eq("session_id", sessionId)
        .order("seq"),
      "events",
    );
    expect(stored.map((e) => e.type)).toEqual(["exam.started", "answer.saved", "gaze.off_screen"]);
    expect(stored.find((e) => e.type === "gaze.off_screen")?.review).toBe("flag");
    expect(stored.find((e) => e.type === "exam.started")?.review).toBe("none");
    const frames = must(
      await db.from("frames").select("event_id, storage_path").eq("event_id", look.id),
      "frames",
    );
    expect(frames).toHaveLength(STILL.maxCount);
    const session = must(
      await db.from("sessions").select("state, status, last_seen_at").eq("id", sessionId).single(),
      "session",
    );
    expect(session.state).toBe("writing");
    expect(session.status).toMatchObject({ question: 2 });
    const answers = must(
      await db.from("answers").select("question_id, choice_id").eq("session_id", sessionId),
      "answers",
    );
    expect(answers).toEqual([{ question_id: q1, choice_id: "a" }]);

    // The network goes for a while: writing continues on the laptop.
    switchable.online = false;
    const cutIds: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const row = await outbox.enqueueEvent(sessionId, (seq) => envelope(sessionId, "gaze.on_screen", seq));
      cutIds.push(row.id);
      loop.kick();
    }
    await outbox.saveAnswer(sessionId, q1, "c", new Date().toISOString());
    await outbox.saveAnswer(sessionId, q2, "b", new Date().toISOString());
    await until(() => connectivity.some((c) => c.offline), 15_000);
    switchable.online = true;
    loop.nudge();
    await until(
      async () => (await outbox.isEmpty(sessionId)) && connectivity.at(-1)?.offline === false,
      90_000,
    );
    loop.stop();

    const after = must(
      await db.from("events").select("id, type, seq, data").eq("session_id", sessionId).order("seq"),
      "events",
    );
    expect(after.filter((e) => cutIds.includes(e.id))).toHaveLength(5);
    // The cut's net.offline counts the 5 events and 2 answers it held. On a loaded shared stack a slow
    // call (no reply for 5 s) is an offline spell too and may add another net.offline.
    const offline = after.filter((e) => e.type === "net.offline");
    expect(offline.length).toBeGreaterThanOrEqual(1);
    expect(offline.some((e) => (e.data as { queued?: number }).queued === 7)).toBe(true);
    const seqs = after.map((e) => e.seq);
    expect(seqs).toEqual(seqs.map((_, i) => i));
    const answersAfter = must(
      await db
        .from("answers")
        .select("question_id, choice_id")
        .eq("session_id", sessionId)
        .order("question_id"),
      "answers",
    );
    expect(answersAfter).toEqual(
      [
        { question_id: q1, choice_id: "c" },
        { question_id: q2, choice_id: "b" },
      ].sort((a, b) => a.question_id.localeCompare(b.question_id)),
    );
    await outbox.db.delete();
  });

  it("applies proctor commands from session:{id} once, within a second, and acks them", async () => {
    const client = studentClient();
    const signed = await ensureStudentSession(client);
    fixture.authUsers.push(signed.userId);
    const api = studentApi(client);
    const joined = await api.joinExam({
      code: fixture.code,
      student_number: fixture.students[1]?.number ?? "",
      locale: "kk",
      device: { os: "windows", app_version: "0.0.0-flow" },
    });
    const sessionId = joined.session.id;
    // exam.started moves the session to writing, so a pause is allowed.
    await api.ingest({ session_id: sessionId, events: [envelope(sessionId, "exam.started", 0)] });

    const outbox = new Outbox(new OutboxDb(`flow-stack-${uuidv7()}`));
    const applied: Array<FlowCommand & { receivedAt: number }> = [];
    let subscribed = false;
    const router = new CommandRouter({
      api,
      outbox,
      sessionId,
      apply: (command) => applied.push({ ...command, receivedAt: Date.now() }),
      onStatus: (status) => {
        if (status === "SUBSCRIBED") subscribed = true;
      },
    });
    await router.start();
    await until(() => subscribed, 20_000);

    async function issue(body: object): Promise<number> {
      const sent = Date.now();
      const response = await fetch(`${stack().apiUrl}/functions/v1/command`, {
        method: "POST",
        headers: {
          apikey: stack().publishableKey,
          authorization: `Bearer ${fixture.lead.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(200);
      return sent;
    }

    const sentMessage = await issue({
      session_id: sessionId,
      type: "message",
      payload: { preset: "message.preset.phones_away", scope: "student" },
    });
    await until(() => applied.length === 1, 10_000, 20);
    const sentPause = await issue({
      session_id: sessionId,
      type: "pause",
      payload: { text: "Stay in your seat." },
    });
    await until(() => applied.length === 2, 10_000, 20);
    await issue({ session_id: sessionId, type: "resume", payload: {} });
    await until(() => applied.length === 3, 10_000, 20);
    expect(applied.map((c) => c.type)).toEqual(["message", "pause", "resume"]);
    expect(applied[0]?.byName).toMatch(/^Lead /);
    const latencies = [
      (applied[0]?.receivedAt ?? 0) - sentMessage,
      (applied[1]?.receivedAt ?? 0) - sentPause,
    ];
    expect(Math.max(...latencies)).toBeLessThan(1000);

    // A catch-up read (as after a reconnect) applies nothing twice and every row is acked.
    await router.catchUp();
    await until(async () => {
      const rows = must(
        await admin().from("session_commands").select("id, acked_at").eq("session_id", sessionId),
        "commands",
      );
      return rows.length === 3 && rows.every((row) => row.acked_at !== null);
    }, 10_000);
    expect(applied).toHaveLength(3);
    router.stop();
    await client.removeAllChannels();
    await outbox.db.delete();
    console.info(`command to app: ${latencies.map((ms) => `${ms} ms`).join(", ")}`);
  });

  it("runs the flow runtime from join to receipt with fake hardware", async () => {
    const client = studentClient();
    const api = studentApi(client);
    const bridge = new FakeBridge();
    const outbox = new Outbox(new OutboxDb(`flow-stack-${uuidv7()}`));
    let signedIn = "";
    const runtime = new FlowRuntime({
      bridge,
      api,
      ensureSignedIn: async () => {
        signedIn = (await ensureStudentSession(client)).userId;
      },
      outbox,
      locale: "en",
      contactEmail: null,
      createDetection: (options) => new FakeDetection(options),
      createIdentity: (options) => new FakeIdentity(options),
    });
    const stage = () => stageOf(runtime.actor.getSnapshot());
    runtime.start();
    runtime.send({ type: "JOIN", code: fixture.code, studentNumber: fixture.students[2]?.number ?? "" });
    await until(
      () => stage() === "system",
      20_000,
      200,
      () => selectScreen(runtime.actor.getSnapshot()),
    );
    fixture.authUsers.push(signedIn);
    await until(
      () => (selectScreen(runtime.actor.getSnapshot()) as { canContinue?: boolean }).canContinue === true,
      20_000,
      200,
      () => selectScreen(runtime.actor.getSnapshot()),
    );
    runtime.send({ type: "CONTINUE" });
    await until(() => stage() === "identityMatched", 10_000);
    runtime.send({ type: "CONTINUE" });
    runtime.send({ type: "SET_AGREED", agreed: true });
    // The exam already started on the server: 2.1 opens at once and the questions load.
    await until(
      () => stage() === "writing" && selectScreen(runtime.actor.getSnapshot()).frame === "2.1",
      20_000,
    );
    await until(
      () => (selectScreen(runtime.actor.getSnapshot()) as { question?: unknown }).question != null,
      20_000,
    );
    const q1 = fixture.questionIds[0] ?? "";
    runtime.send({ type: "SELECT_CHOICE", questionId: q1, choiceId: "d" });
    const sessionId = runtime.actor.getSnapshot().context.joined?.session.id ?? "";
    const db = admin();
    await until(
      async () =>
        ((await db.from("answers").select("choice_id").eq("session_id", sessionId)).data ?? []).length === 1,
      20_000,
    );
    expect(bridge.last("lockdown")).toBe(true);

    runtime.send({ type: "SUBMIT" });
    await until(() => stage() === "submitted", 30_000);
    const receipt = selectScreen(runtime.actor.getSnapshot());
    expect(receipt.frame).toBe("3.1");
    const receiptId = receipt.frame === "3.1" ? receipt.receiptId : "";
    expect(receiptId).toMatch(RECEIPT_ID_PATTERN);
    expect(bridge.last("lockdown")).toBe(false);
    const session = must(
      await db.from("sessions").select("state, receipt_id").eq("id", sessionId).single(),
      "session",
    );
    expect(session).toEqual({ state: "submitted", receipt_id: receiptId });
    const types = must(
      await db.from("events").select("type, source").eq("session_id", sessionId),
      "events",
    ).map((e) => `${e.source}:${e.type}`);
    expect(types).toEqual(
      expect.arrayContaining([
        "app:identity.matched",
        "app:exam.started",
        "app:answer.saved",
        "server:exam.submitted",
      ]),
    );
    expect(types.filter((t) => t === "app:exam.started")).toHaveLength(1);
    // The outbox empties and is cleared after the receipt.
    await until(async () => (await outbox.getMeta("join", (v) => v)) === null, 20_000);
    runtime.stop();
    await client.removeAllChannels();
    await outbox.db.delete();
  });
});
