// The two private Broadcast channels and every message on them. Only database triggers send, with
// `realtime.send(payload, event, topic, true)`; clients listen. A client reads the payload from the
// broadcast message's `payload` field and checks it with the schema for its event name.
import { z } from "zod";
import { CommandBroadcast } from "./commands.ts";
import { CompactEvent } from "./events.ts";
import { Timestamp, Uuid } from "./primitives.ts";
import { HelpRequest } from "./review.ts";
import { SessionState, SessionStatus } from "./session.ts";

/** `exam:{exam_id}`: proctors of the exam and the exam office. */
export function examTopic(examId: string): string {
  return `exam:${examId}`;
}

/** `session:{session_id}`: the student app of that session. */
export function sessionTopic(sessionId: string): string {
  return `session:${sessionId}`;
}

export type ParsedTopic = { kind: "exam"; id: string } | { kind: "session"; id: string };

/** Splits a topic made by examTopic or sessionTopic, or returns null. */
export function parseTopic(topic: string): ParsedTopic | null {
  const match = /^(exam|session):([0-9a-f-]{36})$/.exec(topic);
  if (!match) return null;
  const [, kind, id] = match;
  if (id === undefined) return null;
  return kind === "exam" ? { kind: "exam", id } : { kind: "session", id };
}

/** Broadcast event names on `exam:{exam_id}`. */
export const EXAM_BROADCAST = {
  /** A stored event (`events_broadcast`); payload ExamEventMessage. */
  event: "event",
  /** New fields of one session (`sessions_broadcast`); payload SessionTileMessage. */
  session: "session",
  /** A confirmed still (`frames` function); payload FrameMessage. */
  frame: "frame",
  /**
   * Phase 1: a help request (`help_from_event`), and again when it closes (`close_help_request`, with
   * done_at); payload HelpMessage.
   */
  help: "help",
} as const;

/** Broadcast event names on `session:{session_id}`. */
export const SESSION_BROADCAST = {
  /** A proctor command (`commands_broadcast`); payload CommandMessage. */
  command: "command",
} as const;

export type ExamBroadcastEvent = (typeof EXAM_BROADCAST)[keyof typeof EXAM_BROADCAST];
export type SessionBroadcastEvent = (typeof SESSION_BROADCAST)[keyof typeof SESSION_BROADCAST];

/** `event` on `exam:{exam_id}`. */
export const ExamEventMessage = CompactEvent;
export type ExamEventMessage = z.infer<typeof ExamEventMessage>;

/**
 * `session` on `exam:{exam_id}`, sent after an update that changed `state`, `status`, `last_seen_at`,
 * `extra_min` or `paused_s`. Carries all six fields every time; the wall derives the tile with wall.ts.
 */
export const SessionTileMessage = z.object({
  id: Uuid,
  exam_id: Uuid,
  state: SessionState,
  status: SessionStatus,
  last_seen_at: Timestamp.nullable(),
  extra_min: z.number().int().nonnegative(),
  paused_s: z.number().int().nonnegative(),
});
export type SessionTileMessage = z.infer<typeof SessionTileMessage>;

/** `frame` on `exam:{exam_id}`, once `frames` confirms a still. */
export const FrameMessage = z.object({
  event_id: Uuid,
  session_id: Uuid,
  frame_id: Uuid,
  captured_at: Timestamp,
});
export type FrameMessage = z.infer<typeof FrameMessage>;

/** `help` on `exam:{exam_id}`: 2.4d and the Requests badge on 2.4. */
export const HelpMessage = HelpRequest;
export type HelpMessage = z.infer<typeof HelpMessage>;

/** `command` on `session:{session_id}`. */
export const CommandMessage = CommandBroadcast;
export type CommandMessage = z.infer<typeof CommandMessage>;

/** Payload schema for each exam channel event name. */
export const EXAM_MESSAGES = {
  event: ExamEventMessage,
  session: SessionTileMessage,
  frame: FrameMessage,
  help: HelpMessage,
} as const satisfies Record<ExamBroadcastEvent, z.ZodType>;

/** Payload schema for each session channel event name. */
export const SESSION_MESSAGES = {
  command: CommandMessage,
} as const satisfies Record<SessionBroadcastEvent, z.ZodType>;

export type ExamMessage =
  | { event: "event"; payload: ExamEventMessage }
  | { event: "session"; payload: SessionTileMessage }
  | { event: "frame"; payload: FrameMessage }
  | { event: "help"; payload: HelpMessage };

/** Checks a broadcast received on an exam channel; null for an unknown event or a bad payload. */
export function parseExamMessage(event: string, payload: unknown): ExamMessage | null {
  switch (event) {
    case EXAM_BROADCAST.event: {
      const result = ExamEventMessage.safeParse(payload);
      return result.success ? { event: "event", payload: result.data } : null;
    }
    case EXAM_BROADCAST.session: {
      const result = SessionTileMessage.safeParse(payload);
      return result.success ? { event: "session", payload: result.data } : null;
    }
    case EXAM_BROADCAST.frame: {
      const result = FrameMessage.safeParse(payload);
      return result.success ? { event: "frame", payload: result.data } : null;
    }
    case EXAM_BROADCAST.help: {
      const result = HelpMessage.safeParse(payload);
      return result.success ? { event: "help", payload: result.data } : null;
    }
    default:
      return null;
  }
}

/** Checks a broadcast received on a session channel; null for an unknown event or a bad payload. */
export function parseSessionMessage(event: string, payload: unknown): CommandMessage | null {
  if (event !== SESSION_BROADCAST.command) return null;
  const result = CommandMessage.safeParse(payload);
  return result.success ? result.data : null;
}
