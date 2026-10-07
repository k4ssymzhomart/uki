// Turning simulator actions into the event envelopes the desktop app would send, checked with the
// contracts' Zod schemas, and the shape `ingest_batch` takes and returns.
import { z } from "zod";
import {
  ClientEventEnvelope,
  type ClientEventType,
  type EventSource,
  SessionState,
  serverReview,
  Timestamp,
  Uuid,
  uuidv7,
} from "../../../packages/contracts/src/index.ts";
import type { SimAction } from "./script.ts";

/** `app_version` on every simulated event and in `sessions.device`. */
export const SIM_APP_VERSION = "0.1.0-sim";

export interface EventDraft {
  type: ClientEventType;
  data: Record<string, unknown>;
  /** The laptop-clock time of the event (for a look away: the threshold crossing). */
  atMs: number;
  source?: Extract<EventSource, "app" | "lock">;
}

/** One element of `ingest_batch`'s `p_events`: the envelope plus the review the server would set. */
export interface BatchEvent {
  id: string;
  type: ClientEventType;
  source: "app" | "lock";
  review: "flag" | "log" | "none";
  seq: number;
  at: string;
  data: Record<string, unknown>;
  frame_count: number;
  app_version: string;
}

/**
 * A client envelope for `draft`, validated with ClientEventEnvelope (type, source and data), with
 * the review `ingest` would assign. Simulated students have no camera, so they send no stills.
 */
export function toBatchEvent(sessionId: string, seq: number, draft: EventDraft): BatchEvent {
  const envelope = ClientEventEnvelope.parse({
    id: uuidv7(draft.atMs),
    session_id: sessionId,
    type: draft.type,
    source: draft.source ?? "app",
    at: new Date(draft.atMs).toISOString(),
    seq,
    data: draft.data,
    frame_count: 0,
    app_version: SIM_APP_VERSION,
  });
  return {
    id: envelope.id,
    type: envelope.type as ClientEventType,
    source: envelope.source,
    review: serverReview(envelope.type, { fullscreenExitCount: 0 }),
    seq: envelope.seq,
    at: envelope.at,
    data: envelope.data,
    frame_count: envelope.frame_count,
    app_version: envelope.app_version,
  };
}

export interface DraftContext {
  /** Laptop time now (server-corrected). */
  nowMs: number;
  /** `exams.checks.gaze_s`. */
  gazeS: number;
  /** `exams.checks.face_missing_s`. */
  faceMissingS: number;
}

/**
 * The events an action sends, as the on-device rules would (packages/detection/src/rules.ts): a look
 * away is sent when it ends, with `at` at the threshold crossing, followed by gaze.on_screen; an empty
 * seat sends face.missing and session.paused together.
 */
export function draftsFor(action: SimAction, ctx: DraftContext): EventDraft[] {
  const now = ctx.nowMs;
  switch (action.kind) {
    case "identity_matched":
      return [{ type: "identity.matched", data: { score: action.score, tries: action.tries }, atMs: now }];
    case "start":
      return [{ type: "exam.started", data: {}, atMs: now }];
    case "look_away": {
      const lookEnd = now - 300;
      const crossing = lookEnd - action.durationMs + ctx.gazeS * 1000;
      const data =
        action.type === "gaze.off_screen"
          ? { duration_ms: action.durationMs, direction: action.direction ?? "left" }
          : { duration_ms: action.durationMs };
      return [
        { type: action.type, data, atMs: Math.round(crossing) },
        { type: "gaze.on_screen", data: {}, atMs: now },
      ];
    }
    case "phone":
      return [{ type: "phone.detected", data: { score: action.score, held_ms: action.heldMs }, atMs: now }];
    case "second_face":
      return [
        {
          type: "face.second",
          data: { duration_ms: action.durationMs, faces: 2 },
          atMs: now - action.durationMs + 1000,
        },
      ];
    case "tab_blocked":
      return [{ type: "tab.blocked", source: "lock", data: { host: action.host }, atMs: now }];
    case "self_pause":
      return action.cause === "face_missing"
        ? [
            { type: "face.missing", data: { duration_ms: ctx.faceMissingS * 1000 }, atMs: now },
            { type: "session.paused", data: { reason: "face_missing" }, atMs: now },
          ]
        : [
            { type: "camera.lost", data: { reason: "ended" }, atMs: now },
            { type: "session.paused", data: { reason: "camera_lost" }, atMs: now },
          ];
    case "status":
    case "question":
    case "resume":
    case "go_offline":
    case "submit":
      return [];
  }
}

/** What `ingest_batch` returns (supabase/migrations/*_internals.sql). */
export const IngestBatchResult = z.object({
  accepted: z.array(Uuid),
  duplicates: z.array(Uuid),
  uploads: z.array(z.unknown()),
  session: z.object({
    state: SessionState,
    ends_at: Timestamp,
    extra_min: z.number().int().nonnegative(),
    paused_s: z.number().int().nonnegative(),
  }),
  server_time: Timestamp,
});
export type IngestBatchResult = z.infer<typeof IngestBatchResult>;
