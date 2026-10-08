import { describe, expect, it } from "vitest";
import { compact, EXAM_ID, pgTime, SESSION_ID, T0 } from "../test/fixtures.ts";
import { uuidv7 } from "./ids.ts";
import {
  EXAM_BROADCAST,
  examTopic,
  parseExamMessage,
  parseSessionMessage,
  parseTopic,
  SESSION_BROADCAST,
  SessionTileMessage,
  sessionTopic,
} from "./realtime.ts";

describe("topics", () => {
  it("names the two private channels", () => {
    expect(examTopic(EXAM_ID)).toBe(`exam:${EXAM_ID}`);
    expect(sessionTopic(SESSION_ID)).toBe(`session:${SESSION_ID}`);
    expect(parseTopic(examTopic(EXAM_ID))).toEqual({ kind: "exam", id: EXAM_ID });
    expect(parseTopic(sessionTopic(SESSION_ID))).toEqual({ kind: "session", id: SESSION_ID });
    expect(parseTopic("room:1")).toBeNull();
    expect(EXAM_BROADCAST).toEqual({ event: "event", session: "session", frame: "frame", help: "help" });
    expect(SESSION_BROADCAST).toEqual({ command: "command" });
  });
});

describe("exam channel messages", () => {
  it("parses an event", () => {
    const payload = compact("phone.detected", T0, { score: 0.94, held_ms: 800 });
    expect(parseExamMessage("event", payload)).toEqual({ event: "event", payload });
  });

  it("parses a tile update", () => {
    const payload = {
      id: SESSION_ID,
      exam_id: EXAM_ID,
      state: "writing",
      status: { question: 9 },
      last_seen_at: pgTime(T0),
      extra_min: 10,
      paused_s: 42,
    };
    expect(parseExamMessage("session", payload)?.event).toBe("session");
    expect(SessionTileMessage.safeParse({ ...payload, status: {} }).success).toBe(true);
    expect(SessionTileMessage.safeParse({ ...payload, state: "lost" }).success).toBe(false);
  });

  it("parses a frame notice", () => {
    const payload = {
      event_id: uuidv7(),
      session_id: SESSION_ID,
      frame_id: uuidv7(),
      captured_at: pgTime(T0),
    };
    expect(parseExamMessage("frame", payload)).toEqual({ event: "frame", payload });
  });

  it("drops unknown events and bad payloads", () => {
    expect(parseExamMessage("presence", {})).toBeNull();
    expect(parseExamMessage("frame", { event_id: "x" })).toBeNull();
  });
});

describe("session channel messages", () => {
  it("parses a command", () => {
    const payload = {
      id: uuidv7(),
      session_id: SESSION_ID,
      exam_id: EXAM_ID,
      issued_at: pgTime(T0),
      by_name: "Aigerim Sadykova",
      type: "pause",
      payload: {},
    };
    expect(parseSessionMessage("command", payload)?.type).toBe("pause");
    expect(parseSessionMessage("event", payload)).toBeNull();
    expect(parseSessionMessage("command", { ...payload, type: "explode" })).toBeNull();
  });
});

describe("help messages (Phase 1)", () => {
  const help = {
    id: uuidv7(),
    session_id: SESSION_ID,
    exam_id: EXAM_ID,
    student_id: uuidv7(),
    student_name: "Kamila Rakhimova",
    topic: "question",
    text: "Q 8: is the angle in radians or degrees?",
    created_at: pgTime(T0),
    reply: null,
    done_at: null,
    done_by: null,
  };

  it("parses a new request and its closing", () => {
    expect(parseExamMessage("help", help)).toEqual({ event: "help", payload: help });
    const closed = { ...help, reply: "Radians.", done_at: pgTime(T0 + 30_000), done_by: uuidv7() };
    expect(parseExamMessage("help", closed)).toEqual({ event: "help", payload: closed });
  });

  it("drops a request with an unknown topic", () => {
    expect(parseExamMessage("help", { ...help, topic: "lunch" })).toBeNull();
  });
});
