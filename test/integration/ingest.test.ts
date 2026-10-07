// ingest: idempotency, the server's review map, owner checks, status steps, rate limit, and the
// `event` broadcast reaching a staff client on exam:{exam_id} within 1 s.
import { performance } from "node:perf_hooks";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type EventType,
  ExamEventMessage,
  examTopic,
  IngestResponse,
  REVIEW,
} from "../../packages/contracts/src/index.ts";
import { call, envelope, errorCode, type Listener, latencySummary, listen } from "./api.ts";
import { adminClient, createWorld, stack, type World } from "./world.ts";

let world: World;
let wall: Listener;

beforeAll(async () => {
  world = await createWorld({ students: 3 });
  wall = await listen(world.lead.client, examTopic(world.examId), ["event", "session"]);
});

afterAll(async () => {
  await world?.destroy();
});

/** Every type a client may send, with a review the client would like to have (always the wrong one). */
const CLIENT_TYPES: EventType[] = [
  "gaze.on_screen",
  "gaze.off_screen",
  "gaze.down",
  "phone.detected",
  "face.missing",
  "face.second",
  "camera.lost",
  "tab.blocked",
  "copy.blocked",
  "site.closed",
  "net.offline",
  "identity.matched",
  "browser.locked",
  "answer.saved",
  "student.help_requested",
  "lock.app_disconnected",
];
const WRONG_REVIEW = { flag: "none", log: "flag", none: "flag" } as const;

describe("ingest", () => {
  it("refuses a call without a token", async () => {
    const student = world.students[0];
    if (!student) throw new Error("no student");
    const reply = await call("ingest", { session_id: student.sessionId, events: [] }, null);
    expect(reply.status).toBe(401);
  });

  it("refuses a body that breaks the contract, and proctor events", async () => {
    const student = world.students[0];
    if (!student) throw new Error("no student");
    const bad = await call(
      "ingest",
      { session_id: student.sessionId, events: [{ id: "nope" }] },
      student.token,
    );
    expect(bad.status).toBe(400);
    expect(errorCode(bad)).toBe("bad_request");

    const proctor = envelope(student.sessionId, "proctor.paused", { data: { staff_id: world.lead.id } });
    const forged = await call("ingest", { session_id: student.sessionId, events: [proctor] }, student.token);
    expect(forged.status).toBe(400);

    const notJson = await call("ingest", "{", student.token);
    expect(notJson.status).toBe(400);
    expect(errorCode(notJson)).toBe("bad_request");

    const tooMany = Array.from({ length: 51 }, () => envelope(student.sessionId, "gaze.on_screen"));
    const big = await call("ingest", { session_id: student.sessionId, events: tooMany }, student.token);
    expect(big.status).toBe(400);

    const { apiUrl, publishableKey } = stack();
    const get = await fetch(`${apiUrl}/functions/v1/ingest`, {
      headers: { apikey: publishableKey, authorization: `Bearer ${student.token}` },
    });
    expect(get.status).toBe(405);
    expect(errorCode({ status: get.status, body: await get.json(), headers: get.headers })).toBe(
      "method_not_allowed",
    );
  });

  it("refuses anyone but the session owner", async () => {
    const [owner, other] = world.students;
    if (!owner || !other) throw new Error("need two students");
    const body = { session_id: owner.sessionId, events: [envelope(owner.sessionId, "gaze.on_screen")] };

    const byOtherStudent = await call("ingest", body, other.token);
    expect(byOtherStudent.status).toBe(403);
    expect(errorCode(byOtherStudent)).toBe("forbidden");

    const byProctor = await call("ingest", body, world.lead.token);
    expect(byProctor.status).toBe(403);

    const unknown = await call("ingest", { session_id: crypto.randomUUID(), events: [] }, owner.token);
    expect(unknown.status).toBe(404);
    expect(errorCode(unknown)).toBe("not_found");

    const { count } = await adminClient()
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("id", body.events[0]?.id ?? "");
    expect(count).toBe(0);
  });

  it("stores 50 events once, with the server's review whatever the client sent", async () => {
    const student = world.students[0];
    if (!student) throw new Error("no student");
    const events = Array.from({ length: 50 }, (_, i) => {
      const type = CLIENT_TYPES[i % CLIENT_TYPES.length] as EventType;
      return envelope(student.sessionId, type, { review: WRONG_REVIEW[REVIEW[type]] });
    });
    const ids = events.map((e) => e.id);

    const first = await call("ingest", { session_id: student.sessionId, events }, student.token);
    expect(first.status).toBe(200);
    const stored = IngestResponse.parse(first.body);
    expect([...stored.accepted].sort()).toEqual([...ids].sort());
    expect(stored.duplicates).toEqual([]);

    const resend = await call("ingest", { session_id: student.sessionId, events }, student.token);
    expect(resend.status).toBe(200);
    const again = IngestResponse.parse(resend.body);
    expect(again.accepted).toEqual([]);
    expect([...again.duplicates].sort()).toEqual([...ids].sort());

    const rows = await adminClient().from("events").select("id, type, review, source, seq").in("id", ids);
    expect(rows.error).toBeNull();
    expect(rows.data).toHaveLength(50);
    for (const row of rows.data ?? []) {
      expect(row.review).toBe(REVIEW[row.type as EventType]);
      const sent = events.find((e) => e.id === row.id);
      expect(row.source).toBe(sent?.source);
      expect(row.seq).toBe(sent?.seq);
    }
  });

  it("flags the third fullscreen exit, counted on the server", async () => {
    const student = world.students[1];
    if (!student) throw new Error("no student");
    // The Lock says every exit is its first; the server counts for itself.
    const exits = [1, 2, 3].map(() => envelope(student.sessionId, "lock.fullscreen_exit"));
    const first = await call(
      "ingest",
      { session_id: student.sessionId, events: exits.slice(0, 2) },
      student.token,
    );
    expect(first.status).toBe(200);
    const second = await call(
      "ingest",
      { session_id: student.sessionId, events: exits.slice(1) },
      student.token,
    );
    expect(second.status).toBe(200);
    expect(IngestResponse.parse(second.body).duplicates).toEqual([exits[1]?.id]);

    const rows = await adminClient()
      .from("events")
      .select("id, review")
      .in(
        "id",
        exits.map((e) => e.id),
      );
    const review = (id: string | undefined) => rows.data?.find((row) => row.id === id)?.review;
    expect(exits.map((e) => review(e.id))).toEqual(["log", "log", "flag"]);
  });

  it("moves the session forward with status.step and to writing on exam.started", async () => {
    const student = world.students[2];
    if (!student) throw new Error("no student");
    const checking = await call(
      "ingest",
      { session_id: student.sessionId, events: [], status: { step: "checking", detail: "camera" } },
      student.token,
    );
    expect(checking.status).toBe(200);
    const reply = IngestResponse.parse(checking.body);
    expect(reply.session.state).toBe("checking");
    expect(Date.parse(reply.server_time)).toBeGreaterThan(Date.now() - 60_000);

    const backwards = await call(
      "ingest",
      { session_id: student.sessionId, events: [], status: { step: "checking" } },
      student.token,
    );
    expect(IngestResponse.parse(backwards.body).session.state).toBe("checking");

    const started = await call(
      "ingest",
      { session_id: student.sessionId, events: [envelope(student.sessionId, "exam.started")] },
      student.token,
    );
    expect(IngestResponse.parse(started.body).session.state).toBe("writing");

    const row = await adminClient()
      .from("sessions")
      .select("state, last_seen_at, status")
      .eq("id", student.sessionId)
      .single();
    expect(row.data?.state).toBe("writing");
    expect(row.data?.last_seen_at).not.toBeNull();
    const tile = await wall.waitFor(
      (m) => m.event === "session" && m.payload.id === student.sessionId && m.payload.state === "writing",
    );
    expect(tile.payload.exam_id).toBe(world.examId);
  });

  it("delivers the stored event to a staff client on exam:{exam_id} within 1 s", async () => {
    const student = world.students[0];
    if (!student) throw new Error("no student");
    const samples: number[] = [];
    for (let i = 0; i < 5; i++) {
      const event = envelope(student.sessionId, "gaze.off_screen", { review: "none" });
      const sentAt = performance.now();
      const reply = await call("ingest", { session_id: student.sessionId, events: [event] }, student.token);
      expect(reply.status).toBe(200);
      const message = await wall.waitFor((m) => m.event === "event" && m.payload.id === event.id, 2000);
      samples.push(message.at - sentAt);
      const compact = ExamEventMessage.parse(message.payload);
      expect(compact).toMatchObject({
        session_id: student.sessionId,
        exam_id: world.examId,
        type: "gaze.off_screen",
        source: "app",
        review: "flag",
        frame_count: 0,
      });
    }
    const summary = latencySummary(samples);
    console.log(`[latency] ingest call -> staff 'event' broadcast, ms: ${JSON.stringify(summary)}`);
    expect(summary.max).toBeLessThan(1000);
  });

  it("allows at most 10 calls a second per session", async () => {
    const student = world.students[1];
    if (!student) throw new Error("no student");
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const replies = await Promise.all(
      Array.from({ length: 25 }, () =>
        call("ingest", { session_id: student.sessionId, events: [] }, student.token),
      ),
    );
    const statuses = replies.map((r) => r.status);
    const limited = replies.filter((r) => r.status === 429);
    console.log(
      `[rate-limit] 25 parallel calls: ${statuses.filter((s) => s === 200).length} ok, ${limited.length} limited`,
    );
    expect(statuses.every((s) => s === 200 || s === 429)).toBe(true);
    expect(limited.length).toBeGreaterThan(0);
    expect(errorCode(limited[0] as (typeof replies)[number])).toBe("rate_limited");
    await new Promise((resolve) => setTimeout(resolve, 1100));
  });
});
