// command: rights (assigned proctor and exam office yes; another proctor and students no), payload
// and state rules, group scope with add_time, and the command reaching session:{session_id}.
import { performance } from "node:perf_hooks";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CommandMessage,
  type CommandRequest,
  CommandResponse,
  IngestResponse,
  sessionTopic,
} from "../../packages/contracts/src/index.ts";
import { call, envelope, errorCode, type Listener, latencySummary, listen } from "./api.ts";
import { adminClient, createWorld, type Student, type World } from "./world.ts";

let world: World;
let writerA: Student;
let writerB: Student;
let ready: Student;
let joined: Student;
let inboxA: Listener;
let inboxB: Listener;

async function ingest(student: Student, body: Record<string, unknown>) {
  const reply = await call("ingest", { session_id: student.sessionId, events: [], ...body }, student.token);
  expect(reply.status).toBe(200);
  return IngestResponse.parse(reply.body);
}

async function sessionRow(sessionId: string) {
  const { data, error } = await adminClient()
    .from("sessions")
    .select("state, extra_min, paused_s")
    .eq("id", sessionId)
    .single();
  if (error) throw error;
  return data;
}

beforeAll(async () => {
  world = await createWorld({ students: 4 });
  const [a, b, c, d] = world.students;
  if (!a || !b || !c || !d) throw new Error("need four students");
  [writerA, writerB, ready, joined] = [a, b, c, d];
  for (const writer of [writerA, writerB]) {
    await ingest(writer, { status: { step: "ready" } });
    await ingest(writer, { events: [envelope(writer.sessionId, "exam.started")] });
  }
  await ingest(ready, { status: { step: "ready" } });
  inboxA = await listen(writerA.client, sessionTopic(writerA.sessionId), ["command"]);
  inboxB = await listen(writerB.client, sessionTopic(writerB.sessionId), ["command"]);
});

afterAll(async () => {
  await world?.destroy();
});

async function send(body: CommandRequest | Record<string, unknown>, token = world.lead.token) {
  return call("command", body, token);
}

describe("command", () => {
  it("reaches the student's session channel within 1 s, with by_name", async () => {
    const samples: number[] = [];
    for (const preset of [
      "message.preset.phones_away",
      "message.preset.camera_view",
      "message.preset.time_15",
    ]) {
      const sentAt = performance.now();
      const reply = await send({
        session_id: writerA.sessionId,
        type: "message",
        payload: { preset, scope: "student" },
      } as CommandRequest);
      expect(reply.status).toBe(200);
      const { command_ids } = CommandResponse.parse(reply.body);
      expect(command_ids).toHaveLength(1);
      const message = await inboxA.waitFor((m) => m.payload.id === command_ids[0], 2000);
      samples.push(message.at - sentAt);
      const command = CommandMessage.parse(message.payload);
      expect(command).toMatchObject({
        session_id: writerA.sessionId,
        exam_id: world.examId,
        type: "message",
        payload: { preset, scope: "student" },
        by_name: world.lead.name,
      });
    }
    const summary = latencySummary(samples);
    console.log(`[latency] command call -> student 'command' broadcast, ms: ${JSON.stringify(summary)}`);
    expect(summary.max).toBeLessThan(1000);
    expect(inboxB.received.filter((m) => m.payload.session_id === writerA.sessionId)).toEqual([]);
  });

  it("pauses and resumes a writing session, writing the proctor events", async () => {
    const pause = await send({
      session_id: writerA.sessionId,
      type: "pause",
      payload: { text: "Stay seated" },
    });
    expect(pause.status).toBe(200);
    const pauseId = CommandResponse.parse(pause.body).command_ids[0];
    const paused = CommandMessage.parse((await inboxA.waitFor((m) => m.payload.id === pauseId)).payload);
    expect(paused).toMatchObject({ type: "pause", payload: { text: "Stay seated" } });
    expect((await sessionRow(writerA.sessionId)).state).toBe("paused");

    const again = await send({ session_id: writerA.sessionId, type: "pause", payload: {} });
    expect(again.status).toBe(409);
    expect(errorCode(again)).toBe("conflict");

    const resume = await send({ session_id: writerA.sessionId, type: "resume", payload: {} });
    expect(resume.status).toBe(200);
    expect((await sessionRow(writerA.sessionId)).state).toBe("writing");

    const events = await adminClient()
      .from("events")
      .select("type, source, review, data")
      .eq("session_id", writerA.sessionId)
      .in("type", ["proctor.paused", "proctor.resumed"]);
    expect(events.data?.map((e) => [e.type, e.source, e.review]).sort()).toEqual([
      ["proctor.paused", "proctor", "log"],
      ["proctor.resumed", "proctor", "log"],
    ]);
  });

  it("refuses a pause for a session that is not writing, and bad payloads", async () => {
    const notWriting = await send({ session_id: ready.sessionId, type: "pause", payload: {} });
    expect(notWriting.status).toBe(409);

    for (const body of [
      { session_id: writerA.sessionId, type: "end", payload: {} },
      { session_id: writerA.sessionId, type: "end", payload: { reason: "   " } },
      {
        session_id: writerA.sessionId,
        type: "message",
        payload: { text: "x".repeat(281), scope: "student" },
      },
      {
        session_id: writerA.sessionId,
        type: "message",
        payload: { preset: "message.preset.nope", scope: "student" },
      },
      { session_id: writerA.sessionId, type: "add_time", payload: { minutes: 61, scope: "student" } },
      { session_id: writerA.sessionId, type: "start", payload: {} },
      { session_id: writerA.sessionId, exam_id: world.examId, type: "resume", payload: {} },
      { exam_id: world.examId, scope: "group", type: "message", payload: { text: "hi", scope: "student" } },
    ]) {
      const reply = await send(body);
      expect(reply.status, JSON.stringify(body)).toBe(400);
      expect(errorCode(reply)).toBe("bad_request");
    }

    const groupPause = await send({ exam_id: world.examId, scope: "group", type: "pause", payload: {} });
    expect(groupPause.status).toBe(400);
  });

  it("adds time for the whole group: every session in rules, ready, writing or paused", async () => {
    const before = await Promise.all(world.students.map((s) => sessionRow(s.sessionId)));
    const reply = await send({
      exam_id: world.examId,
      scope: "group",
      type: "add_time",
      payload: { minutes: 5, scope: "group" },
    });
    expect(reply.status).toBe(200);
    const { command_ids } = CommandResponse.parse(reply.body);
    expect(command_ids).toHaveLength(3);

    const after = await Promise.all(world.students.map((s) => sessionRow(s.sessionId)));
    world.students.forEach((student, i) => {
      const added = (after[i]?.extra_min ?? 0) - (before[i]?.extra_min ?? 0);
      expect(added, student.name).toBe(student === joined ? 0 : 5);
    });

    for (const inbox of [inboxA, inboxB]) {
      const message = await inbox.waitFor((m) => m.payload.type === "add_time");
      expect(CommandMessage.parse(message.payload).payload).toEqual({ minutes: 5, scope: "group" });
    }
    const events = await adminClient()
      .from("events")
      .select("session_id, data")
      .eq("exam_id", world.examId)
      .eq("type", "proctor.time_added");
    expect(events.data).toHaveLength(3);
    expect(events.data?.every((e) => (e.data as { scope?: string }).scope === "group")).toBe(true);

    const audit = await adminClient()
      .from("audit_log")
      .select("action, object_type, actor_id")
      .eq("workspace_id", world.workspaceId)
      .eq("action", "command.add_time");
    expect(audit.data).toEqual([
      { action: "command.add_time", object_type: "exam", actor_id: world.lead.id },
    ]);
  });

  it("answers 403 to a proctor of another exam and to students; the exam office may send", async () => {
    const message = {
      session_id: writerB.sessionId,
      type: "message",
      payload: { text: "Please face the camera", scope: "student" },
    } as const;

    const other = await send(message, world.otherProctor.token);
    expect(other.status).toBe(403);
    expect(errorCode(other)).toBe("forbidden");
    const otherGroup = await send(
      { exam_id: world.examId, scope: "group", type: "add_time", payload: { minutes: 5, scope: "group" } },
      world.otherProctor.token,
    );
    expect(otherGroup.status).toBe(403);

    const student = await send(message, writerA.token);
    expect(student.status).toBe(403);

    const office = await send(message, world.office.token);
    expect(office.status).toBe(200);
    const id = CommandResponse.parse(office.body).command_ids[0];
    const received = CommandMessage.parse((await inboxB.waitFor((m) => m.payload.id === id)).payload);
    expect(received.by_name).toBe(world.office.name);
  });

  it("ends a session with a reason; later commands conflict", async () => {
    const end = await send({
      session_id: writerB.sessionId,
      type: "end",
      payload: { reason: "Phone in hand" },
    });
    expect(end.status).toBe(200);
    const id = CommandResponse.parse(end.body).command_ids[0];
    const received = CommandMessage.parse((await inboxB.waitFor((m) => m.payload.id === id)).payload);
    expect(received).toMatchObject({ type: "end", payload: { reason: "Phone in hand" } });
    expect((await sessionRow(writerB.sessionId)).state).toBe("ended");

    const late = await send({ session_id: writerB.sessionId, type: "resume", payload: {} });
    expect(late.status).toBe(409);
    const unknown = await send({ session_id: crypto.randomUUID(), type: "resume", payload: {} });
    expect(unknown.status).toBe(404);
  });
});
