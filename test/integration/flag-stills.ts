// A flag with its stills, sent the way the app does it: ingest the event with a frame count, upload each
// still to its signed URL, confirm them through the frames function. For the privacy tests (WP 1.12),
// which need stills in Storage to delete, copy and expire.
import { expect } from "vitest";
import { type EventType, FramesResponse, IngestResponse } from "../../packages/contracts/src/index.ts";
import { call, envelope, TINY_JPEG } from "./api.ts";
import type { Student } from "./world.ts";

export interface FlagWithStills {
  eventId: string;
  /** Storage paths of the stills, in upload order. */
  paths: string[];
  /** `frames` row ids, in the same order. */
  frameIds: string[];
}

/** One flag of `type` with `count` stills (1 to 3), uploaded and, unless `confirm` is false, confirmed. */
export async function flagWithStills(
  student: Student,
  type: EventType = "phone.detected",
  count = 1,
  confirm = true,
): Promise<FlagWithStills> {
  const event = envelope(student.sessionId, type, { frame_count: count });
  const ingested = await call("ingest", { session_id: student.sessionId, events: [event] }, student.token);
  expect(ingested.status).toBe(200);
  const stills = IngestResponse.parse(ingested.body).uploads[0]?.stills ?? [];
  expect(stills).toHaveLength(count);
  for (const still of stills) {
    const uploaded = await student.client.storage
      .from("frames")
      .uploadToSignedUrl(still.path, still.token, TINY_JPEG, { contentType: "image/jpeg" });
    expect(uploaded.error).toBeNull();
  }
  const paths = stills.map((still) => still.path);
  if (!confirm) return { eventId: event.id, paths, frameIds: [] };
  const confirmed = await call("frames", { event_id: event.id, paths }, student.token);
  expect(confirmed.status).toBe(200);
  return { eventId: event.id, paths, frameIds: FramesResponse.parse(confirmed.body).frame_ids };
}
