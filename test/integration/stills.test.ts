// The flagged-still round trip: ingest hands out a signed upload URL, the app uploads a JPEG, frames
// confirms it (and the trigger broadcasts `frame`), stills signs a 5-minute URL that works and audits
// it. Plus the path, owner and rights checks of frames and stills.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  examTopic,
  FrameMessage,
  FramesResponse,
  IngestResponse,
  STILL_VIEW_URL_TTL_S,
  StillsResponse,
  stillPath,
} from "../../packages/contracts/src/index.ts";
import { call, envelope, errorCode, type Listener, listen, TINY_JPEG } from "./api.ts";
import { adminClient, createWorld, type Student, stack, type World } from "./world.ts";

let world: World;
let owner: Student;
let other: Student;
let wall: Listener;

beforeAll(async () => {
  world = await createWorld({ students: 2 });
  const [a, b] = world.students;
  if (!a || !b) throw new Error("need two students");
  [owner, other] = [a, b];
  wall = await listen(world.lead.client, examTopic(world.examId), ["frame"]);
});

afterAll(async () => {
  await world?.destroy();
});

async function flag(student: Student, frameCount: number) {
  const event = envelope(student.sessionId, "phone.detected", { frame_count: frameCount });
  const reply = await call("ingest", { session_id: student.sessionId, events: [event] }, student.token);
  expect(reply.status).toBe(200);
  return { event, reply: IngestResponse.parse(reply.body) };
}

async function upload(student: Student, path: string, token: string) {
  const { error } = await student.client.storage
    .from("frames")
    .uploadToSignedUrl(path, token, TINY_JPEG, { contentType: "image/jpeg" });
  expect(error).toBeNull();
}

describe("stills", () => {
  it("uploads through ingest's URL, confirms with frames, and opens through stills with an audit row", async () => {
    const { event, reply } = await flag(owner, 1);
    expect(reply.uploads).toHaveLength(1);
    const still = reply.uploads[0]?.stills[0];
    if (!still) throw new Error("no upload URL");
    expect(still.index).toBe(0);
    expect(still.path).toBe(stillPath(world.examId, owner.sessionId, event.id, 0));
    // The URL is reachable from the laptop: the public API origin, not the Docker-internal gateway.
    expect(new URL(still.signed_url).origin).toBe(new URL(stack().apiUrl).origin);

    await upload(owner, still.path, still.token);

    const confirmed = await call("frames", { event_id: event.id, paths: [still.path] }, owner.token);
    expect(confirmed.status).toBe(200);
    const { frame_ids } = FramesResponse.parse(confirmed.body);
    expect(frame_ids).toHaveLength(1);
    const frameId = frame_ids[0];

    const notice = FrameMessage.parse((await wall.waitFor((m) => m.payload.frame_id === frameId)).payload);
    expect(notice).toMatchObject({ event_id: event.id, session_id: owner.sessionId });

    const again = await call("frames", { event_id: event.id, paths: [still.path] }, owner.token);
    expect(FramesResponse.parse(again.body).frame_ids).toEqual(frame_ids);

    const resent = await call("ingest", { session_id: owner.sessionId, events: [event] }, owner.token);
    const resentReply = IngestResponse.parse(resent.body);
    expect(resentReply.duplicates).toEqual([event.id]);
    expect(resentReply.uploads).toEqual([]);

    const opened = await call("stills", { event_id: event.id }, world.lead.token);
    expect(opened.status).toBe(200);
    const { urls } = StillsResponse.parse(opened.body);
    expect(urls).toHaveLength(1);
    expect(urls[0]?.frame_id).toBe(frameId);
    const url = new URL(urls[0]?.url ?? "");
    expect(url.origin).toBe(new URL(stack().apiUrl).origin);

    const image = await fetch(url);
    expect(image.status).toBe(200);
    expect(image.headers.get("content-type")).toContain("image/jpeg");
    expect(Buffer.from(await image.arrayBuffer()).equals(TINY_JPEG)).toBe(true);

    const audit = await adminClient()
      .from("audit_log")
      .select("actor_id, actor_kind, object_type, object_id, meta")
      .eq("action", "still.viewed")
      .eq("object_id", frameId ?? "");
    expect(audit.data).toHaveLength(1);
    expect(audit.data?.[0]).toMatchObject({
      actor_id: world.lead.id,
      actor_kind: "staff",
      object_type: "frame",
      meta: { event_id: event.id, session_id: owner.sessionId, ttl_s: STILL_VIEW_URL_TTL_S },
    });

    const byOffice = await call("stills", { event_id: event.id }, world.office.token);
    expect(byOffice.status).toBe(200);
  });

  it("hands out fresh URLs for the stills not yet confirmed, and only those", async () => {
    const { event, reply } = await flag(owner, 2);
    const stills = reply.uploads[0]?.stills ?? [];
    expect(stills.map((s) => s.index)).toEqual([0, 1]);
    const first = stills[0];
    if (!first) throw new Error("no upload URL");
    await upload(owner, first.path, first.token);
    const confirmed = await call("frames", { event_id: event.id, paths: [first.path] }, owner.token);
    expect(confirmed.status).toBe(200);

    const resent = IngestResponse.parse(
      (await call("ingest", { session_id: owner.sessionId, events: [event] }, owner.token)).body,
    );
    expect(resent.uploads).toHaveLength(1);
    expect(resent.uploads[0]?.stills.map((s) => s.index)).toEqual([1]);
  });

  it("frames refuses paths outside the session folder, missing objects, and other callers", async () => {
    const { event, reply } = await flag(owner, 1);
    const still = reply.uploads[0]?.stills[0];
    if (!still) throw new Error("no upload URL");

    const outside = stillPath(world.examId, other.sessionId, event.id, 0);
    const wrongFolder = await call("frames", { event_id: event.id, paths: [outside] }, owner.token);
    expect(wrongFolder.status).toBe(400);
    expect(errorCode(wrongFolder)).toBe("bad_request");

    const traversal = `${world.examId}/${owner.sessionId}/../${other.sessionId}/${event.id}-0.jpg`;
    expect((await call("frames", { event_id: event.id, paths: [traversal] }, owner.token)).status).toBe(400);

    const beyond = stillPath(world.examId, owner.sessionId, event.id, 1);
    expect((await call("frames", { event_id: event.id, paths: [beyond] }, owner.token)).status).toBe(400);

    const notUploaded = await call("frames", { event_id: event.id, paths: [still.path] }, owner.token);
    expect(notUploaded.status).toBe(404);
    expect(errorCode(notUploaded)).toBe("not_found");

    await upload(owner, still.path, still.token);
    const byOther = await call("frames", { event_id: event.id, paths: [still.path] }, other.token);
    expect(byOther.status).toBe(403);
    const byProctor = await call("frames", { event_id: event.id, paths: [still.path] }, world.lead.token);
    expect(byProctor.status).toBe(403);
    const unknown = await call("frames", { event_id: crypto.randomUUID(), paths: [still.path] }, owner.token);
    expect(unknown.status).toBe(404);

    const { count } = await adminClient()
      .from("frames")
      .select("id", { count: "exact", head: true })
      .eq("event_id", event.id);
    expect(count).toBe(0);
  });

  it("stills is for the exam's staff only", async () => {
    const { event } = await flag(owner, 0);
    const empty = await call("stills", { event_id: event.id }, world.lead.token);
    expect(StillsResponse.parse(empty.body).urls).toEqual([]);

    const otherProctor = await call("stills", { event_id: event.id }, world.otherProctor.token);
    expect(otherProctor.status).toBe(403);
    expect(errorCode(otherProctor)).toBe("forbidden");
    const student = await call("stills", { event_id: event.id }, owner.token);
    expect(student.status).toBe(403);
    const unknown = await call("stills", { event_id: crypto.randomUUID() }, world.lead.token);
    expect(unknown.status).toBe(404);
  });
});
