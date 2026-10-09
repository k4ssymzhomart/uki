// Phase F, A3: ingest validates the boxes detection events carry, stores them in events.data as sent,
// and the wall's `event` broadcast passes them on. Events without boxes (the released app v0.1.2, the
// demo simulator) are stored as before.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type EventType,
  ExamEventMessage,
  examTopic,
  IngestResponse,
} from "../../packages/contracts/src/index.ts";
import { call, envelope, errorCode, type Listener, listen } from "./api.ts";
import { adminClient, createWorld, type World } from "./world.ts";

let world: World;
let wall: Listener;

beforeAll(async () => {
  world = await createWorld({ students: 1 });
  wall = await listen(world.lead.client, examTopic(world.examId), ["event"]);
});

afterAll(async () => {
  await world?.destroy();
});

const FACE = { x: 0.312, y: 0.18, width: 0.355, height: 0.47 };
const SECOND = { x: 0.74, y: 0.105, width: 0.2, height: 0.31 };
const PHONE = { x: 0.552, y: 0.43, width: 0.118, height: 0.262 };

const WITH_BOXES: ReadonlyArray<[EventType, Record<string, unknown>]> = [
  ["phone.detected", { score: 0.738, held_ms: 412, box: PHONE }],
  ["face.second", { duration_ms: 1003, faces: 2, boxes: [FACE, SECOND] }],
  ["gaze.off_screen", { duration_ms: 3100, direction: "right", face_box: FACE }],
  ["gaze.down", { duration_ms: 7700, face_box: FACE }],
  ["gaze.on_screen", { face_box: FACE }],
];

function student() {
  const first = world.students[0];
  if (!first) throw new Error("no student");
  return first;
}

async function storedData(ids: string[]): Promise<Map<string, unknown>> {
  const rows = await adminClient().from("events").select("id, data").in("id", ids);
  expect(rows.error).toBeNull();
  return new Map((rows.data ?? []).map((row) => [row.id as string, row.data]));
}

describe("ingest with detection boxes", () => {
  it("stores every box in events.data as sent and broadcasts it to the wall", async () => {
    const { sessionId, token } = student();
    const events = WITH_BOXES.map(([type, data]) => envelope(sessionId, type, { data }));
    const reply = await call("ingest", { session_id: sessionId, events }, token);
    expect(reply.status).toBe(200);
    expect([...IngestResponse.parse(reply.body).accepted].sort()).toEqual(events.map((e) => e.id).sort());

    const stored = await storedData(events.map((e) => e.id));
    for (const event of events) expect(stored.get(event.id), String(event.type)).toEqual(event.data);

    const phone = events[0];
    const message = await wall.waitFor((m) => m.event === "event" && m.payload.id === phone?.id, 3000);
    const compact = ExamEventMessage.parse(message.payload);
    expect(compact.type).toBe("phone.detected");
    expect(compact.data).toEqual({ score: 0.738, held_ms: 412, box: PHONE });
  });

  it("still takes events without boxes, as v0.1.2 and the simulator send them", async () => {
    const { sessionId, token } = student();
    const events = [
      envelope(sessionId, "phone.detected", { data: { score: 0.656, held_ms: 401 }, app_version: "0.1.2" }),
      envelope(sessionId, "face.second", { data: { duration_ms: 1200, faces: 2 }, app_version: "0.1.2" }),
      envelope(sessionId, "gaze.down", { data: { duration_ms: 7700 }, app_version: "0.1.2" }),
      envelope(sessionId, "gaze.on_screen", { data: {}, app_version: "0.1.2" }),
    ];
    const reply = await call("ingest", { session_id: sessionId, events }, token);
    expect(reply.status).toBe(200);
    const stored = await storedData(events.map((e) => e.id));
    for (const event of events) expect(stored.get(event.id)).toEqual(event.data);
  });

  it("refuses a batch with a box outside the frame and stores none of it", async () => {
    const { sessionId, token } = student();
    const good = envelope(sessionId, "gaze.down", { data: { duration_ms: 2100, face_box: FACE } });
    for (const data of [
      { score: 0.74, held_ms: 412, box: { ...PHONE, x: 0.95 } }, // reaches past the right edge
      { score: 0.74, held_ms: 412, box: { ...PHONE, width: -0.1 } },
      { score: 0.74, held_ms: 412, box: { ...PHONE, label: "phone" } },
      { score: 0.74, held_ms: 412, box: [0.5, 0.4, 0.1, 0.2] },
    ]) {
      const bad = envelope(sessionId, "phone.detected", { data });
      const reply = await call("ingest", { session_id: sessionId, events: [good, bad] }, token);
      expect(reply.status, JSON.stringify(data)).toBe(400);
      expect(errorCode(reply)).toBe("bad_request");
      const stored = await storedData([good.id, bad.id]);
      expect(stored.size).toBe(0);
    }
    const emptyList = envelope(sessionId, "face.second", {
      data: { duration_ms: 1000, faces: 2, boxes: [] },
    });
    const reply = await call("ingest", { session_id: sessionId, events: [emptyList] }, token);
    expect(reply.status).toBe(400);
  });
});
