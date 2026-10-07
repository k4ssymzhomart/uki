// Test helpers: recorded-style events for the wall and the API tests. Not copied to Edge Functions.
import type { CompactEvent, EventType } from "../src/events.ts";
import { REVIEW } from "../src/events.ts";
import { uuidv7 } from "../src/ids.ts";

export const EXAM_ID = "0199a9d2-4c3e-7a10-8b2c-1d2e3f405162";
export const SESSION_ID = "0199a9d2-4c3e-7a10-8b2c-1d2e3f405163";
export const OTHER_SESSION_ID = "0199a9d2-4c3e-7a10-8b2c-1d2e3f405164";
export const STAFF_ID = "0199a9d2-4c3e-7a10-8b2c-1d2e3f405165";

/** 2026-10-09 10:40:00 UTC, the demo morning. */
export const T0 = Date.UTC(2026, 9, 9, 10, 40, 0);

/** Postgres writes timestamptz like this in JSON. */
export function pgTime(ms: number): string {
  return new Date(ms).toISOString().replace("Z", "+00:00");
}

let counter = 0;

/** One stored event as the wall receives it; `atMs` is when it happened, received 200 ms later. */
export function compact(
  type: EventType,
  atMs: number,
  data: Record<string, unknown> = {},
  overrides: Partial<CompactEvent> = {},
): CompactEvent {
  counter += 1;
  return {
    id: uuidv7(atMs + counter),
    session_id: SESSION_ID,
    exam_id: EXAM_ID,
    type,
    source: type.startsWith("proctor.") ? "proctor" : "app",
    review: REVIEW[type],
    at: pgTime(atMs),
    received_at: pgTime(atMs + 200),
    data,
    frame_count: 0,
    ...overrides,
  };
}
