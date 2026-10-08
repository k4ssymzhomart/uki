// Calling the Edge Functions over HTTP the way the apps do, building event envelopes, and listening on
// the private Broadcast channels.
import { performance } from "node:perf_hooks";
import {
  ApiError,
  type EventEnvelopeInput,
  type EventType,
  uuidv7,
} from "../../packages/contracts/src/index.ts";
import type { UkiClient } from "../../packages/db/src/index.ts";
import { stack } from "./world.ts";

export type FunctionName = "ingest" | "frames" | "command" | "stills" | "send-invites";

export interface FunctionReply {
  status: number;
  body: unknown;
  headers: Headers;
}

/** POST /functions/v1/<name> with the publishable key and, when given, the caller's token. */
export async function call(
  name: FunctionName,
  body: unknown,
  token: string | null,
  headers: Record<string, string> = {},
): Promise<FunctionReply> {
  const { apiUrl, publishableKey } = stack();
  const response = await fetch(`${apiUrl}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      "content-type": "application/json",
      ...(token === null ? {} : { authorization: `Bearer ${token}` }),
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // not JSON
  }
  return { status: response.status, body: parsed, headers: response.headers };
}

/** The ApiError code of a failed reply, checked against the contract; throws on any other shape. */
export function errorCode(reply: FunctionReply): string {
  return ApiError.parse(reply.body).error;
}

let seq = 0;

/** A client envelope with a fresh UUIDv7 and a valid `data` for common types. */
export function envelope(
  sessionId: string,
  type: EventType,
  overrides: Partial<EventEnvelopeInput> & Record<string, unknown> = {},
): EventEnvelopeInput & Record<string, unknown> {
  seq += 1;
  return {
    id: uuidv7(),
    session_id: sessionId,
    type,
    source: type === "lock.fullscreen_exit" || type === "site.closed" ? "lock" : "app",
    at: new Date().toISOString(),
    seq,
    data: SAMPLE_DATA[type] ?? {},
    frame_count: 0,
    app_version: "0.0.0-it",
    ...overrides,
  };
}

const SAMPLE_DATA: Partial<Record<EventType, Record<string, unknown>>> = {
  "gaze.off_screen": { duration_ms: 2400, direction: "left" },
  "gaze.down": { duration_ms: 2100 },
  "phone.detected": { score: 0.91, held_ms: 800 },
  "face.missing": { duration_ms: 10_500 },
  "face.second": { duration_ms: 1200, faces: 2 },
  "camera.lost": { reason: "ended" },
  "tab.blocked": { app: "Telegram" },
  "copy.blocked": { kind: "paste" },
  "site.closed": { host: "chat.example.com" },
  "net.offline": { offline_ms: 12_000, queued: 4 },
  "identity.matched": { score: 0.82, tries: 1 },
  "answer.saved": { question_id: "c0000000-0000-4000-8000-000000000007" },
  "student.help_requested": { topic: "technical" },
  "lock.app_disconnected": { side: "lock" },
  "lock.fullscreen_exit": { count: 1 },
};

export interface Received {
  event: string;
  payload: Record<string, unknown>;
  /** performance.now() when the message arrived. */
  at: number;
}

export interface Listener {
  received: Received[];
  /** The first message (already received or still to come) that matches, or a timeout error. */
  waitFor(match: (message: Received) => boolean, timeoutMs?: number): Promise<Received>;
}

/** Joins a private channel as the client's user and records every broadcast of `events`. */
export async function listen(client: UkiClient, topic: string, events: readonly string[]): Promise<Listener> {
  const received: Received[] = [];
  const waiters: Array<{ match: (m: Received) => boolean; resolve: (m: Received) => void }> = [];
  const channel = client.channel(topic, { config: { private: true } });
  for (const event of events) {
    channel.on("broadcast", { event }, (message: { event: string; payload?: unknown }) => {
      const entry: Received = {
        event: message.event,
        payload: (message.payload ?? {}) as Record<string, unknown>,
        at: performance.now(),
      };
      received.push(entry);
      for (const waiter of [...waiters]) {
        if (waiter.match(entry)) {
          waiters.splice(waiters.indexOf(waiter), 1);
          waiter.resolve(entry);
        }
      }
    });
  }
  await new Promise<void>((resolve, reject) => {
    channel.subscribe((status, error) => {
      if (status === "SUBSCRIBED") resolve();
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        reject(new Error(`could not join ${topic}: ${status} ${error?.message ?? ""}`));
      }
    });
  });
  return {
    received,
    waitFor(match, timeoutMs = 3000) {
      const found = received.find(match);
      if (found) return Promise.resolve(found);
      return new Promise((resolve, reject) => {
        const waiter = { match, resolve };
        waiters.push(waiter);
        setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index === -1) return;
          waiters.splice(index, 1);
          reject(new Error(`no matching broadcast on ${topic} within ${timeoutMs} ms`));
        }, timeoutMs);
      });
    },
  };
}

/** A real 64 x 36 JPEG (810 bytes) for still uploads; the bucket accepts image/jpeg only. */
export const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAkAEADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwChRRRX1J88FFFFABRRRQAUUUUAXv7Qtf8AoDWX/fc//wAco/tC1/6A1l/33P8A/HKo0VHIv6bK5mXv7Qtf+gNZf99z/wDxyj+0LX/oDWX/AH3P/wDHKo0Uci/psOZl7+0LX/oDWX/fc/8A8co/tC1/6A1l/wB9z/8AxyqNFHIv6bDmZe/tC1/6A1l/33P/APHKP7Qtf+gNZf8Afc//AMcqjRRyL+mw5mFFFFWSFFFFABRRRQAUUUUAf//Z",
  "base64",
);

/** Median and max of latency samples, rounded to 0.1 ms. */
export function latencySummary(samples: readonly number[]): { median: number; max: number; n: number } {
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
  const round = (n: number) => Math.round(n * 10) / 10;
  return { median: round(mid), max: round(sorted.at(-1) ?? Number.NaN), n: sorted.length };
}
