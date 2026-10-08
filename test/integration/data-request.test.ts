// The data-request function (WP 1.12) against the local stack. Delete (A.5a): the student's stills leave
// Storage, confirmed or not, then their frames and events, identity score and device record; the
// answers, the receipt, the decision and the integrity report stay, 3.4 still opens, and another
// student keeps everything. Copy (A.5b): one JSON file in the private exports bucket, with the stills'
// images, behind a working link signed for 7 days. Reply: the reason is stored and the request closes.
// Rights: only the exam office of the workspace; proctors, students and callers without a token are
// refused. Each action leaves its audit row.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DATA_COPY_FORMAT,
  DataRequestActionOutput,
  EXPORT_LINK_TTL_S,
  EXPORTS_BUCKET,
  exportPath,
  ReportPayload,
} from "../../packages/contracts/src/index.ts";
import { call, errorCode, TINY_JPEG } from "./api.ts";
import { type FlagWithStills, flagWithStills } from "./flag-stills.ts";
import { adminClient, createWorld, type Student, type World } from "./world.ts";

let world: World;
/** The student who asks for deletion: a confirmed still, a still uploaded but never confirmed. */
let leaver: Student;
/** Another student of the same exam, who asks for a copy and must keep everything. */
let stayer: Student;
let leaverFlag: FlagWithStills;
let unconfirmed: FlagWithStills;
let stayerFlag: FlagWithStills;
const requests: string[] = [];

async function newRequest(student: Student, kind: "delete" | "copy"): Promise<string> {
  const { data, error } = await world.office.client
    .from("data_requests")
    .insert({ workspace_id: world.workspaceId, student_id: student.studentId, kind })
    .select("id")
    .single();
  if (error || !data) throw new Error(`data_requests insert: ${error?.message}`);
  requests.push(data.id);
  return data.id;
}

async function stillExists(path: string): Promise<boolean> {
  const { data, error } = await adminClient().storage.from("frames").download(path);
  return error === null && data !== null;
}

async function countRows(table: "frames" | "events", sessionId: string): Promise<number> {
  const { count, error } = await adminClient()
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function auditRows(action: string, studentId: string) {
  const { data, error } = await adminClient()
    .from("audit_log")
    .select("actor_id, actor_kind, object_type, object_id, meta")
    .eq("workspace_id", world.workspaceId)
    .eq("action", action)
    .eq("object_id", studentId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

beforeAll(async () => {
  world = await createWorld({ students: 2 });
  const [first, second] = world.students;
  if (!first || !second) throw new Error("need two students");
  leaver = first;
  stayer = second;
  leaverFlag = await flagWithStills(leaver, "phone.detected", 1);
  unconfirmed = await flagWithStills(leaver, "gaze.off_screen", 1, false);
  stayerFlag = await flagWithStills(stayer, "face.second", 1);

  const admin = adminClient();
  // What the delete keeps: an answer to a question of the exam, the receipt, a decision and a report.
  const question = await admin
    .from("questions")
    .insert({ workspace_id: world.workspaceId, body: { en: "Q" }, choices: [{ id: "a", body: { en: "A" } }] })
    .select("id")
    .single();
  if (question.error || !question.data) throw new Error(`question: ${question.error?.message}`);
  const answer = await admin.from("answers").insert({
    session_id: leaver.sessionId,
    question_id: question.data.id,
    choice_id: "a",
    saved_at: new Date().toISOString(),
  });
  expect(answer.error).toBeNull();
  const decided = await world.lead.client.rpc("decide_session", {
    session_id: leaver.sessionId,
    decision: "talk",
    note: "Phone on the desk.",
  });
  expect(decided.error).toBeNull();
  const report = await world.lead.client.rpc("get_report", { session_id: leaver.sessionId });
  expect(report.error).toBeNull();
  expect(ReportPayload.parse(report.data).flags).toHaveLength(2);
});

afterAll(async () => {
  const admin = adminClient();
  for (const id of requests) {
    await admin.storage.from(EXPORTS_BUCKET).remove([exportPath(world.workspaceId, id)]);
  }
  if (requests.length > 0) await admin.from("data_requests").delete().in("id", requests);
  await world?.destroy();
});

describe("data-request: who may call", () => {
  it("refuses a caller without a token, proctors and students, and names an unknown request", async () => {
    const id = await newRequest(leaver, "delete");
    const body = { request_id: id, action: "delete" };
    expect((await call("data-request", body, null)).status).toBe(401);
    for (const caller of [world.lead, world.otherProctor]) {
      const reply = await call("data-request", body, caller.token);
      expect(reply.status).toBe(403);
      expect(errorCode(reply)).toBe("forbidden");
    }
    const student = await call("data-request", body, leaver.token);
    expect(student.status).toBe(403);
    const copy = await call("data-request", { request_id: id, action: "copy" }, world.lead.token);
    expect(copy.status).toBe(403);
    const unknown = await call(
      "data-request",
      { request_id: "019a0000-0000-7000-8000-000000000000", action: "delete" },
      world.office.token,
    );
    expect(unknown.status).toBe(404);
    expect((await call("data-request", { request_id: id, action: "erase" }, world.office.token)).status).toBe(
      400,
    );
    // Nothing happened: the still is there and the request is still open.
    expect(await stillExists(leaverFlag.paths[0] ?? "")).toBe(true);
    const row = await adminClient().from("data_requests").select("status").eq("id", id).single();
    expect(row.data?.status).toBe("received");
    await adminClient().from("data_requests").delete().eq("id", id);
  });
});

describe("data-request: delete (A.5a)", () => {
  it("waits while the student is writing the live exam", async () => {
    const id = await newRequest(leaver, "delete");
    const reply = await call("data-request", { request_id: id, action: "delete" }, world.office.token);
    expect(reply.status).toBe(409);
    expect(reply.body).toEqual({ error: "conflict", message: "in_exam" });
    expect(await stillExists(leaverFlag.paths[0] ?? "")).toBe(true);
  });

  it("removes the stills from Storage, then the frames, events, identity score and device record", async () => {
    const admin = adminClient();
    // The exam is over: both students have handed in, with receipts.
    for (const [index, student] of [leaver, stayer].entries()) {
      const handed = await admin
        .from("sessions")
        .update({
          state: "submitted",
          submitted_at: new Date().toISOString(),
          receipt_id: `IT-${world.runId}-${index}`,
          identity_result: "matched",
          identity_score: 0.82,
        })
        .eq("id", student.sessionId);
      expect(handed.error).toBeNull();
    }
    expect(await stillExists(unconfirmed.paths[0] ?? "")).toBe(true);
    const id = requests.at(-1) ?? "";
    const reply = await call("data-request", { request_id: id, action: "delete" }, world.office.token);
    expect(reply.status).toBe(200);
    const body = DataRequestActionOutput.parse(reply.body);
    expect(body.request).toMatchObject({ id, status: "done", done_by: world.office.id });
    expect(body.link).toBeNull();
    // Two objects: the confirmed still and the one uploaded but never confirmed.
    expect(body.deleted).toEqual({ stills: 2, frames: 1, events: 2, identity_scores: 1, devices: 1 });

    for (const path of [...leaverFlag.paths, ...unconfirmed.paths])
      expect(await stillExists(path)).toBe(false);
    expect(await countRows("frames", leaver.sessionId)).toBe(0);
    expect(await countRows("events", leaver.sessionId)).toBe(0);
    const session = await admin
      .from("sessions")
      .select("state, receipt_id, identity_result, identity_score, device")
      .eq("id", leaver.sessionId)
      .single();
    expect(session.data).toEqual({
      state: "submitted",
      receipt_id: `IT-${world.runId}-0`,
      identity_result: "matched",
      identity_score: null,
      device: {},
    });

    // Kept: the answer, the decision and the report, and 3.4 still opens with what is left.
    const answers = await admin.from("answers").select("choice_id").eq("session_id", leaver.sessionId);
    expect(answers.data).toEqual([{ choice_id: "a" }]);
    const decision = await admin
      .from("review_decisions")
      .select("decision")
      .eq("session_id", leaver.sessionId)
      .single();
    expect(decision.data?.decision).toBe("talk");
    const report = await world.lead.client.rpc("get_report", { session_id: leaver.sessionId });
    expect(report.error).toBeNull();
    const payload = ReportPayload.parse(report.data);
    expect(payload.flags).toEqual([]);
    expect(payload.session.receipt_id).toBe(`IT-${world.runId}-0`);

    // Another student keeps everything.
    expect(await stillExists(stayerFlag.paths[0] ?? "")).toBe(true);
    expect(await countRows("frames", stayer.sessionId)).toBe(1);
    expect(await countRows("events", stayer.sessionId)).toBe(1);

    const audit = await auditRows("data_request.delete", leaver.studentId);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actor_id: world.office.id,
      actor_kind: "staff",
      object_type: "student",
      meta: { data_request_id: id, stills: 2, frames: 1, events: 2, identity_scores: 1, devices: 1 },
    });
  });

  it("runs once", async () => {
    const id = requests.at(-1) ?? "";
    const again = await call("data-request", { request_id: id, action: "delete" }, world.office.token);
    expect(again.status).toBe(409);
    expect(again.body).toEqual({ error: "conflict", message: "already done" });
    expect(await auditRows("data_request.delete", leaver.studentId)).toHaveLength(1);
  });
});

describe("data-request: copy (A.5b)", () => {
  it("writes one JSON file with the stills and links it for 7 days", async () => {
    const id = await newRequest(stayer, "copy");
    const reply = await call("data-request", { request_id: id, action: "copy" }, world.office.token);
    expect(reply.status).toBe(200);
    const body = DataRequestActionOutput.parse(reply.body);
    const path = exportPath(world.workspaceId, id);
    expect(body.request).toMatchObject({ id, status: "done", export_path: path, done_by: world.office.id });
    expect(body.deleted).toBeNull();
    const link = body.link;
    if (link === null) throw new Error("no link");
    const expiresIn = Date.parse(link.expires_at) - Date.now();
    expect(expiresIn).toBeGreaterThan(EXPORT_LINK_TTL_S * 1000 - 60_000);
    expect(expiresIn).toBeLessThanOrEqual(EXPORT_LINK_TTL_S * 1000);

    // The link works without any key, and its token is signed for exactly 7 days.
    const url = new URL(link.url);
    const jwt = url.searchParams.get("token") ?? "";
    const claims = JSON.parse(Buffer.from(jwt.split(".")[1] ?? "", "base64url").toString("utf8")) as {
      iat: number;
      exp: number;
    };
    expect(claims.exp - claims.iat).toBe(EXPORT_LINK_TTL_S);
    const download = await fetch(url);
    expect(download.status).toBe(200);
    expect(download.headers.get("content-type")).toContain("application/json");
    const text = await download.text();
    expect(text).not.toContain("storage_path");
    const file = JSON.parse(text) as {
      format: string;
      student: { student_number: string; full_name: string };
      exams: Array<{ session_id: string; receipt_id: string | null }>;
      flags: Array<{ id: string; frames: Array<{ id: string; image_jpeg_base64: string | null }> }>;
      consent: unknown[];
      devices: Array<{ device: { app_version?: string } }>;
    };
    expect(file.format).toBe(DATA_COPY_FORMAT);
    expect(file.student).toMatchObject({ student_number: stayer.number, full_name: stayer.name });
    expect(file.exams.map((exam) => exam.session_id)).toEqual([stayer.sessionId]);
    expect(file.exams[0]?.receipt_id).toBe(`IT-${world.runId}-1`);
    expect(file.flags.map((flag) => flag.id)).toEqual([stayerFlag.eventId]);
    const image = file.flags[0]?.frames[0]?.image_jpeg_base64 ?? "";
    expect(Buffer.from(image, "base64").equals(TINY_JPEG)).toBe(true);
    expect(file.devices[0]?.device.app_version).toBe("0.0.0-it");

    // The bucket stays private: the same path without the signed token is refused.
    const bare = await fetch(`${url.origin}/storage/v1/object/public/${EXPORTS_BUCKET}/${path}`);
    expect(bare.status).toBeGreaterThanOrEqual(400);

    const audit = await auditRows("data_request.copy", stayer.studentId);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actor_id: world.office.id,
      meta: { data_request_id: id, bytes: Buffer.byteLength(text, "utf8") },
    });
    // Copying changes nothing about the student.
    expect(await stillExists(stayerFlag.paths[0] ?? "")).toBe(true);
    expect(await countRows("events", stayer.sessionId)).toBe(1);
  });
});

describe("data-request: reply with a reason", () => {
  it("stores the reason and closes the request, which can no longer be carried out", async () => {
    const id = await newRequest(stayer, "delete");
    const empty = await call(
      "data-request",
      { request_id: id, action: "reply", reply: " " },
      world.office.token,
    );
    expect(empty.status).toBe(400);
    const reason = "Kept until the committee closes the case.";
    const reply = await call(
      "data-request",
      { request_id: id, action: "reply", reply: reason },
      world.office.token,
    );
    expect(reply.status).toBe(200);
    const body = DataRequestActionOutput.parse(reply.body);
    expect(body.request).toMatchObject({ id, status: "replied", reply: reason, done_by: world.office.id });
    const late = await call("data-request", { request_id: id, action: "delete" }, world.office.token);
    expect(late.status).toBe(409);
    expect(await stillExists(stayerFlag.paths[0] ?? "")).toBe(true);
    const audit = await auditRows("data_request.reply", stayer.studentId);
    expect(audit).toHaveLength(1);
    expect(audit[0]?.meta).toMatchObject({
      data_request_id: id,
      kind: "delete",
      reply_length: reason.length,
    });
    expect(JSON.stringify(audit)).not.toContain("committee");
  });
});
