import { describe, expect, it } from "vitest";
import { EXAM_ID, pgTime, SESSION_ID, T0 } from "../test/fixtures.ts";
import {
  ApiError,
  CommandRequest,
  FRAMES_BUCKET,
  FramesRequest,
  IngestRequest,
  IngestResponse,
  IngestStatus,
  isStillPathFor,
  JOIN_ERROR_CODES,
  JoinExamInput,
  JoinExamOutput,
  matchErrorCode,
  parseStillPath,
  STILL,
  StillsResponse,
  SubmitSessionOutput,
  stillPath,
} from "./api.ts";
import { DEFAULT_BROWSER_RULES } from "./browser-rules.ts";
import { uuidv7 } from "./ids.ts";

function event(overrides: Record<string, unknown> = {}) {
  return {
    id: uuidv7(),
    session_id: SESSION_ID,
    type: "gaze.down",
    source: "app",
    at: new Date(T0).toISOString(),
    seq: 1,
    data: { duration_ms: 2400 },
    app_version: "0.1.0",
    ...overrides,
  };
}

describe("join_exam", () => {
  it("normalises the code and checks the student number", () => {
    const input = JoinExamInput.parse({
      code: " math2-204-fri ",
      student_number: "20231187",
      locale: "kk",
      device: { os: "macos", app_version: "0.1.0" },
    });
    expect(input.code).toBe("MATH2-204-FRI");
    expect(JoinExamInput.safeParse({ ...input, student_number: "2023118" }).success, "seven digits").toBe(
      false,
    );
    expect(JoinExamInput.safeParse({ ...input, code: "MATH2 204" }).success).toBe(false);
    expect(JoinExamInput.safeParse({ ...input, locale: "de" }).success).toBe(false);
    expect(JoinExamInput.safeParse({ ...input, device: { os: "linux", app_version: "0.1.0" } }).success).toBe(
      false,
    );
  });

  const output = {
    session: {
      id: SESSION_ID,
      state: "joined",
      locale: "kk",
      started_at: null,
      extra_min: 0,
      paused_s: 0,
      joined_at: pgTime(T0),
      receipt_id: null,
    },
    exam: {
      id: EXAM_ID,
      title: "Mathematics 2 · Midterm",
      course: "Mathematics 2",
      kind: "Midterm",
      mode: "app",
      starts_at: pgTime(T0 + 15 * 60_000),
      duration_min: 90,
      lobby_opens_at: pgTime(T0 - 5 * 60_000),
      status: "scheduled",
      checks: { gaze_s: 2, phone_score: 0.85 },
      lms_url: null,
      lms_done_path: null,
      allowed_sites: [],
    },
    student: { id: uuidv7(), full_name: "Madina Tulegenova", student_number: "20231187" },
    proctor_name: "Aigerim Sadykova",
    questions: null,
    server_time: pgTime(T0),
  };

  it("parses the output before the start, filling check defaults", () => {
    const parsed = JoinExamOutput.parse(output);
    expect(parsed.questions).toBeNull();
    expect(parsed.exam.checks).toEqual({
      gaze_s: 2,
      phone_score: 0.85,
      face_missing_s: 10,
      identity: true,
      lock: true,
    });
  });

  it("parses questions once started", () => {
    const parsed = JoinExamOutput.parse({
      ...output,
      questions: [
        {
          id: uuidv7(),
          position: 7,
          body: { kk: "Сұрақ", ru: "Вопрос", en: "Question" },
          choices: [{ id: "a", body: { kk: "А", ru: "А", en: "A" } }],
        },
      ],
    });
    expect(parsed.questions?.[0]?.choices[0]?.id).toBe("a");
  });

  it("parses Phase 1's browser rules, rules language and room, and their absence from an older server", () => {
    const parsed = JoinExamOutput.parse({
      ...output,
      exam: {
        ...output.exam,
        browser_rules: { ...DEFAULT_BROWSER_RULES, print: false },
        rules_locale: "kk",
        room: "204",
      },
    });
    expect(parsed.exam.browser_rules?.print).toBe(false);
    expect(parsed.exam.rules_locale).toBe("kk");
    expect(JoinExamOutput.parse(output).exam.browser_rules).toBeUndefined();
    expect(
      JoinExamOutput.safeParse({ ...output, exam: { ...output.exam, browser_rules: { copy_paste: true } } })
        .success,
    ).toBe(false);
  });

  it("finds join error codes in a PostgREST error", () => {
    expect(matchErrorCode({ message: "invalid_code", code: "P0001" }, JOIN_ERROR_CODES)).toBe("invalid_code");
    expect(matchErrorCode({ message: "boom", hint: "lobby_closed" }, JOIN_ERROR_CODES)).toBe("lobby_closed");
    expect(matchErrorCode({ message: "invalid_codes" }, JOIN_ERROR_CODES)).toBeNull();
    expect(matchErrorCode(null, JOIN_ERROR_CODES)).toBeNull();
  });
});

describe("ingest", () => {
  it("takes 0 to 50 events of the caller's session", () => {
    expect(IngestRequest.safeParse({ session_id: SESSION_ID, events: [] }).success).toBe(true);
    const fifty = Array.from({ length: 50 }, () => event());
    expect(IngestRequest.safeParse({ session_id: SESSION_ID, events: fifty }).success).toBe(true);
    expect(IngestRequest.safeParse({ session_id: SESSION_ID, events: [...fifty, event()] }).success).toBe(
      false,
    );
  });

  it("rejects an event of another session", () => {
    const result = IngestRequest.safeParse({
      session_id: SESSION_ID,
      events: [event(), event({ session_id: uuidv7() })],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["events", 1, "session_id"]);
  });

  it("rejects proctor events and invalid data", () => {
    expect(
      IngestRequest.safeParse({ session_id: SESSION_ID, events: [event({ type: "proctor.message" })] })
        .success,
    ).toBe(false);
    expect(
      IngestRequest.safeParse({ session_id: SESSION_ID, events: [event({ data: { duration_ms: -5 } })] })
        .success,
    ).toBe(false);
  });

  it("takes an optional status", () => {
    expect(
      IngestRequest.safeParse({
        session_id: SESSION_ID,
        events: [],
        status: { step: "checking", detail: "app:Telegram" },
      }).success,
    ).toBe(true);
    expect(
      IngestRequest.safeParse({
        session_id: SESSION_ID,
        events: [],
        status: { step: "identity", detail: "card:retry:2" },
      }).success,
    ).toBe(true);
    expect(
      IngestRequest.safeParse({ session_id: SESSION_ID, events: [], status: { question: 9 } }).success,
    ).toBe(true);
    expect(
      IngestRequest.safeParse({ session_id: SESSION_ID, events: [], status: { step: "writing" } }).success,
    ).toBe(false);
  });

  it("takes only details of the status-detail vocabulary", () => {
    for (const detail of ["Telegram", "camera_blocked", "card_retry:2", "card_unreadable:2", "help", ""]) {
      expect(
        IngestRequest.safeParse({ session_id: SESSION_ID, events: [], status: { step: "checking", detail } })
          .success,
        detail,
      ).toBe(false);
    }
  });

  it("parses a response with uploads and the session's timing", () => {
    const eventId = uuidv7();
    const response = IngestResponse.parse({
      accepted: [eventId],
      duplicates: [],
      uploads: [
        {
          event_id: eventId,
          stills: [0, 1, 2].map((index) => ({
            index,
            path: stillPath(EXAM_ID, SESSION_ID, eventId, index),
            token: "t",
            signed_url: "https://x.supabase.co/storage/v1/object/upload/sign/frames/a?token=t",
          })),
        },
      ],
      session: { state: "writing", ends_at: pgTime(T0 + 90 * 60_000), extra_min: 0, paused_s: 0 },
      server_time: pgTime(T0),
    });
    expect(response.uploads[0]?.stills).toHaveLength(3);
    expect(response.pending_commands).toBeUndefined();
  });

  it("carries the session's unacked commands, at most 20, in the broadcast's shape", () => {
    const command = (n: number) => ({
      id: uuidv7(T0 + n),
      session_id: SESSION_ID,
      exam_id: EXAM_ID,
      type: "message",
      payload: { preset: "message.preset.phones_away", scope: "student" },
      issued_at: pgTime(T0 + n),
      by_name: "Aigerim Sadykova",
    });
    const base = {
      accepted: [],
      duplicates: [],
      uploads: [],
      session: { state: "writing", ends_at: pgTime(T0 + 90 * 60_000), extra_min: 0, paused_s: 0 },
      server_time: pgTime(T0),
    };
    const one = IngestResponse.parse({ ...base, pending_commands: [command(1)] });
    expect(one.pending_commands?.[0]).toMatchObject({ type: "message", by_name: "Aigerim Sadykova" });
    expect(IngestResponse.safeParse({ ...base, pending_commands: [] }).success).toBe(true);
    expect(
      IngestResponse.safeParse({
        ...base,
        pending_commands: Array.from({ length: 20 }, (_, i) => command(i)),
      }).success,
    ).toBe(true);
    expect(
      IngestResponse.safeParse({
        ...base,
        pending_commands: Array.from({ length: 21 }, (_, i) => command(i)),
      }).success,
    ).toBe(false);
    expect(
      IngestResponse.safeParse({ ...base, pending_commands: [{ ...command(1), payload: { minutes: 5 } }] })
        .success,
      "a payload that does not fit its type",
    ).toBe(false);
    const { by_name: _name, ...nameless } = command(1);
    expect(IngestResponse.safeParse({ ...base, pending_commands: [nameless] }).success).toBe(false);
  });
});

describe("frames, submit, stills, errors", () => {
  it("takes 1 to 3 paths", () => {
    const id = uuidv7();
    expect(FramesRequest.safeParse({ event_id: id, paths: [] }).success).toBe(false);
    expect(FramesRequest.safeParse({ event_id: id, paths: ["a", "b", "c"] }).success).toBe(true);
    expect(FramesRequest.safeParse({ event_id: id, paths: ["a", "b", "c", "d"] }).success).toBe(false);
  });

  it("parses submit_session output with a receipt id", () => {
    expect(
      SubmitSessionOutput.safeParse({ receipt_id: "UKI-204-0942-MT", time_used_s: 4980, state: "submitted" })
        .success,
    ).toBe(true);
    expect(
      SubmitSessionOutput.safeParse({ receipt_id: "", time_used_s: 4980, state: "submitted" }).success,
    ).toBe(false);
    expect(
      SubmitSessionOutput.safeParse({ receipt_id: "UKI-204-0942-MT", time_used_s: 1, state: "writing" })
        .success,
    ).toBe(false);
  });

  it("parses stills output and API errors", () => {
    expect(
      StillsResponse.safeParse({ urls: [{ frame_id: uuidv7(), url: "https://x", captured_at: pgTime(T0) }] })
        .success,
    ).toBe(true);
    expect(ApiError.safeParse({ error: "forbidden" }).success).toBe(true);
    expect(ApiError.safeParse({ error: "teapot" }).success).toBe(false);
  });
});

describe("command request", () => {
  it("takes a session command", () => {
    expect(CommandRequest.safeParse({ session_id: SESSION_ID, type: "pause", payload: {} }).success).toBe(
      true,
    );
    expect(
      CommandRequest.safeParse({
        session_id: SESSION_ID,
        type: "message",
        payload: { text: "Eyes on screen", scope: "student" },
      }).success,
    ).toBe(true);
  });

  it("takes an optional request id for safe retries", () => {
    const requestId = uuidv7();
    const parsed = CommandRequest.parse({
      session_id: SESSION_ID,
      type: "pause",
      payload: {},
      request_id: requestId,
    });
    expect(parsed).toMatchObject({ request_id: requestId });
    expect(
      CommandRequest.safeParse({
        exam_id: EXAM_ID,
        scope: "group",
        type: "message",
        payload: { preset: "message.preset.time_15", scope: "group" },
        request_id: requestId,
      }).success,
    ).toBe(true);
    expect(
      CommandRequest.safeParse({ session_id: SESSION_ID, type: "pause", payload: {}, request_id: "r-1" })
        .success,
    ).toBe(false);
  });

  it("takes a group command", () => {
    expect(
      CommandRequest.safeParse({
        exam_id: EXAM_ID,
        scope: "group",
        type: "add_time",
        payload: { minutes: 10, scope: "group" },
      }).success,
    ).toBe(true);
  });

  it("refuses both targets, no target, a wrong scope and start", () => {
    expect(
      CommandRequest.safeParse({ session_id: SESSION_ID, exam_id: EXAM_ID, type: "pause", payload: {} })
        .success,
    ).toBe(false);
    expect(CommandRequest.safeParse({ type: "pause", payload: {} }).success).toBe(false);
    expect(CommandRequest.safeParse({ exam_id: EXAM_ID, type: "pause", payload: {} }).success).toBe(false);
    expect(
      CommandRequest.safeParse({
        session_id: SESSION_ID,
        type: "add_time",
        payload: { minutes: 10, scope: "group" },
      }).success,
    ).toBe(false);
    expect(
      CommandRequest.safeParse({
        exam_id: EXAM_ID,
        scope: "group",
        type: "message",
        payload: { preset: "message.preset.time_15", scope: "student" },
      }).success,
    ).toBe(false);
    expect(CommandRequest.safeParse({ session_id: SESSION_ID, type: "start", payload: {} }).success).toBe(
      false,
    );
  });
});

describe("still paths", () => {
  const eventId = uuidv7();

  it("builds <exam_id>/<session_id>/<event_id>-<index>.jpg", () => {
    expect(FRAMES_BUCKET).toBe("frames");
    expect(stillPath(EXAM_ID, SESSION_ID, eventId, 2)).toBe(`${EXAM_ID}/${SESSION_ID}/${eventId}-2.jpg`);
    expect(() => stillPath(EXAM_ID, SESSION_ID, eventId, 3)).toThrow(RangeError);
    expect(STILL).toMatchObject({ width: 640, height: 360, quality: 0.7, maxCount: 3, maxBytes: 204_800 });
  });

  it("parses and checks paths", () => {
    const path = stillPath(EXAM_ID, SESSION_ID, eventId, 0);
    expect(parseStillPath(path)).toEqual({ examId: EXAM_ID, sessionId: SESSION_ID, eventId, index: 0 });
    expect(isStillPathFor(path, EXAM_ID, SESSION_ID)).toBe(true);
    expect(isStillPathFor(path, EXAM_ID, uuidv7())).toBe(false);
    expect(isStillPathFor(path, uuidv7(), SESSION_ID)).toBe(false);
  });

  it("refuses anything else", () => {
    const bad = [
      `${EXAM_ID}/${SESSION_ID}/${eventId}-3.jpg`,
      `${EXAM_ID}/${SESSION_ID}/${eventId}-0.png`,
      `${EXAM_ID}/${SESSION_ID}/../${eventId}-0.jpg`,
      `/${EXAM_ID}/${SESSION_ID}/${eventId}-0.jpg`,
      `frames/${EXAM_ID}/${SESSION_ID}/${eventId}-0.jpg`,
      `${EXAM_ID}/${SESSION_ID}/${eventId}-0.jpg/x`,
    ];
    for (const path of bad) expect(isStillPathFor(path, EXAM_ID, SESSION_ID), path).toBe(false);
  });
});

describe("ingest status (Phase 1)", () => {
  it("carries the rules language with step ready", () => {
    expect(IngestStatus.parse({ step: "ready", rules_locale: "ru" })).toEqual({
      step: "ready",
      rules_locale: "ru",
    });
    expect(IngestStatus.safeParse({ step: "ready", rules_locale: "de" }).success).toBe(false);
  });
});
