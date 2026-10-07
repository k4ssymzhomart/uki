// Shared helpers for renderer tests: a fresh outbox database per test (fake-indexeddb), envelopes for
// any event type, and a clock that moves with Vitest's fake timers while IndexedDB keeps its real
// setImmediate scheduling.
import "fake-indexeddb/auto";
import { ClientEventEnvelope, type EventType, uuidv7 } from "@uki/contracts";
import { vi } from "vitest";
import { OutboxDb } from "../outbox/db.ts";
import { Outbox } from "../outbox/outbox.ts";

export const EXAM_ID = "e0000000-0000-4000-8000-000000000001";
export const SESSION_ID = "0199a000-0000-7000-8000-000000000001";
export const QUESTION_IDS = Array.from(
  { length: 20 },
  (_, i) => `c0000000-0000-4000-8000-0000000000${String(i + 1).padStart(2, "0")}`,
);

let dbSerial = 0;

/** A new, empty outbox on its own database name. */
export function freshOutbox(name = `uki-outbox-test-${Date.now()}-${++dbSerial}`): Outbox {
  return new Outbox(new OutboxDb(name), () => Date.now());
}

/** Fake setTimeout, setInterval and Date only; IndexedDB's setImmediate stays real. */
export function useFakeClock(start = Date.parse("2026-10-09T10:00:00.000Z")): void {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  vi.setSystemTime(start);
}

// Node's setImmediate (the renderer's types have no Node globals); fake-indexeddb schedules on it.
const realSetImmediate = (globalThis as unknown as { setImmediate: (callback: () => void) => void })
  .setImmediate;

/** Lets pending IndexedDB work and promise chains finish (real macrotask turns). */
export async function flushIo(turns = 40): Promise<void> {
  for (let i = 0; i < turns; i += 1) {
    await new Promise<void>((resolve) => realSetImmediate(resolve));
  }
}

/** Moves fake time forward in steps, letting IndexedDB work run between them. */
export async function advance(ms: number, step = 250): Promise<void> {
  let left = ms;
  while (left > 0) {
    const next = Math.min(step, left);
    vi.advanceTimersByTime(next);
    left -= next;
    await flushIo();
  }
}

const DATA: Partial<Record<EventType, Record<string, unknown>>> = {
  "gaze.off_screen": { duration_ms: 2400, direction: "left" },
  "gaze.down": { duration_ms: 2100 },
  "phone.detected": { score: 0.94, held_ms: 400 },
  "face.missing": { duration_ms: 10_000 },
  "face.second": { duration_ms: 1000, faces: 2 },
  "camera.lost": { reason: "ended" },
  "tab.blocked": { app: null },
  "copy.blocked": { kind: "copy" },
  "net.offline": { offline_ms: 1000, queued: 0 },
  "identity.matched": { score: 0.8, tries: 1 },
  "session.paused": { reason: "face_missing" },
  "session.resumed": { paused_ms: 1000, by: "student" },
  "answer.saved": { question_id: QUESTION_IDS[0] },
};

/** A valid envelope of `type` for SESSION_ID, at the fake clock's now. */
export function envelopeFor(
  type: EventType,
  seq: number,
  overrides: Partial<ClientEventEnvelope> = {},
): ClientEventEnvelope {
  return ClientEventEnvelope.parse({
    id: uuidv7(),
    session_id: SESSION_ID,
    type,
    source: "app",
    at: new Date().toISOString(),
    seq,
    data: DATA[type] ?? {},
    frame_count: 0,
    app_version: "0.0.0",
    ...overrides,
  });
}

/** A tiny stand-in for a JPEG still. */
export function jpegBytes(size = 64): ArrayBuffer {
  const bytes = new Uint8Array(size);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  return bytes.buffer;
}
