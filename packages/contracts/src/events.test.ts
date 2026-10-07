import { describe, expect, it } from "vitest";
import { compact, EXAM_ID, pgTime, SESSION_ID, STAFF_ID, T0 } from "../test/fixtures.ts";
import {
  CLIENT_EVENT_TYPES,
  ClientEventEnvelope,
  CompactEvent,
  EVENT_DATA,
  EVENT_TYPES,
  EventEnvelope,
  type EventType,
  PROCTOR_EVENT_TYPES,
  parseEventData,
  REVIEW,
  serverReview,
} from "./events.ts";
import { uuidv7 } from "./ids.ts";

const QUESTION_ID = uuidv7();

/** One valid `data` per type, from the Event data table. */
const VALID: Record<EventType, Record<string, unknown>> = {
  "gaze.on_screen": {},
  "gaze.off_screen": { duration_ms: 3100, direction: "left" },
  "gaze.down": { duration_ms: 2400 },
  "phone.detected": { score: 0.94, held_ms: 800 },
  "face.missing": { duration_ms: 10_000 },
  "face.second": { duration_ms: 1200, faces: 2 },
  "camera.lost": { reason: "muted" },
  "tab.blocked": { host: "wikipedia.org" },
  "copy.blocked": { kind: "paste" },
  "site.closed": { host: "wikipedia.org" },
  "net.offline": { offline_ms: 30_000, queued: 12 },
  "identity.matched": { score: 0.71, tries: 1 },
  "exam.started": {},
  "browser.locked": {},
  "answer.saved": { question_id: QUESTION_ID },
  "session.paused": { reason: "face_missing" },
  "session.resumed": { paused_ms: 42_000, by: "student" },
  "exam.submitted": { time_used_s: 4980 },
  "exam.time_up": {},
  "proctor.paused": { staff_id: STAFF_ID },
  "proctor.resumed": { staff_id: STAFF_ID },
  "proctor.ended": { staff_id: STAFF_ID, reason: "Left the room twice" },
  "proctor.time_added": { minutes: 10, scope: "group" },
  "proctor.message": { preset: "message.preset.phones_away", scope: "student" },
  "student.help_requested": { topic: "identity" },
  "lock.app_disconnected": { side: "lock" },
  "lock.fullscreen_exit": { count: 2 },
};

/** One invalid `data` per type that carries data. */
const INVALID: Partial<Record<EventType, Record<string, unknown>>> = {
  "gaze.off_screen": { duration_ms: 3100, direction: "down" },
  "gaze.down": { duration_ms: -1 },
  "phone.detected": { score: 1.2, held_ms: 800 },
  "face.missing": {},
  "face.second": { duration_ms: 1200, faces: 1 },
  "camera.lost": { reason: "unplugged" },
  "tab.blocked": { host: "https://wikipedia.org/wiki/Kazakhstan" },
  "copy.blocked": { kind: "drag" },
  "site.closed": { host: "wikipedia.org/wiki" },
  "net.offline": { offline_ms: 30_000 },
  "identity.matched": { score: 0.71, tries: 0 },
  "answer.saved": { question_id: "q7" },
  "session.paused": { reason: "bored" },
  "session.resumed": { paused_ms: 42_000, by: "proctor" },
  "exam.submitted": {},
  "proctor.paused": { staff_id: "dana" },
  "proctor.ended": { staff_id: STAFF_ID, reason: "" },
  "proctor.time_added": { minutes: 61, scope: "group" },
  "proctor.message": { text: "x".repeat(281), scope: "student" },
  "student.help_requested": { topic: "lunch" },
  "lock.app_disconnected": { side: "browser" },
  "lock.fullscreen_exit": { count: 0 },
};

function envelope(overrides: Record<string, unknown> = {}) {
  return {
    id: uuidv7(),
    session_id: SESSION_ID,
    type: "gaze.off_screen",
    source: "app",
    at: new Date(T0).toISOString(),
    seq: 4,
    data: { duration_ms: 3100, direction: "left" },
    app_version: "0.1.0",
    ...overrides,
  };
}

describe("event types and review", () => {
  it("names exactly the plan's 27 events", () => {
    expect(EVENT_TYPES).toHaveLength(27);
    expect(Object.keys(REVIEW).sort()).toEqual([...EVENT_TYPES].sort());
    expect(Object.keys(EVENT_DATA).sort()).toEqual([...EVENT_TYPES].sort());
  });

  it("matches the plan's review map", () => {
    const flags = EVENT_TYPES.filter((t) => REVIEW[t] === "flag");
    expect(flags).toEqual([
      "gaze.off_screen",
      "gaze.down",
      "phone.detected",
      "face.missing",
      "face.second",
      "camera.lost",
      "tab.blocked",
      "proctor.ended",
      "lock.app_disconnected",
    ]);
    expect(REVIEW["lock.fullscreen_exit"]).toBe("log");
    expect(REVIEW["copy.blocked"]).toBe("log");
    expect(REVIEW["gaze.on_screen"]).toBe("none");
  });

  it("flags the third full-screen exit of a session and every later one", () => {
    expect(serverReview("lock.fullscreen_exit", { fullscreenExitCount: 1 })).toBe("log");
    expect(serverReview("lock.fullscreen_exit", { fullscreenExitCount: 2 })).toBe("log");
    expect(serverReview("lock.fullscreen_exit", { fullscreenExitCount: 3 })).toBe("flag");
    expect(serverReview("lock.fullscreen_exit", { fullscreenExitCount: 4 })).toBe("flag");
  });

  it("uses the map for every other type, whatever the count", () => {
    for (const type of EVENT_TYPES) {
      if (type === "lock.fullscreen_exit") continue;
      expect(serverReview(type, { fullscreenExitCount: 5 })).toBe(REVIEW[type]);
    }
  });

  it("keeps proctor events away from clients", () => {
    expect(PROCTOR_EVENT_TYPES.every((t) => t.startsWith("proctor."))).toBe(true);
    expect(CLIENT_EVENT_TYPES).toHaveLength(EVENT_TYPES.length - PROCTOR_EVENT_TYPES.length);
    expect(CLIENT_EVENT_TYPES).not.toContain("proctor.message");
  });
});

describe("EVENT_DATA", () => {
  it.each(EVENT_TYPES)("accepts valid data for %s", (type) => {
    const result = parseEventData(type, VALID[type]);
    expect(result.success).toBe(true);
  });

  it.each(Object.entries(INVALID))("rejects bad data for %s", (type, data) => {
    expect(parseEventData(type as EventType, data).success).toBe(false);
  });

  it("strips unknown keys", () => {
    const result = parseEventData("gaze.down", { duration_ms: 2000, yaw: 31 });
    expect(result).toEqual({ success: true, data: { duration_ms: 2000 } });
  });

  it("takes tab.blocked from the Lock with a host, or null when focus left the browser", () => {
    expect(parseEventData("tab.blocked", { host: "wikipedia.org" }).success).toBe(true);
    expect(parseEventData("tab.blocked", { host: "localhost:5180" }).success).toBe(true);
    expect(parseEventData("tab.blocked", { host: null }).success).toBe(true);
  });

  it("takes tab.blocked from the app with an app name, or null when focus left the window", () => {
    expect(parseEventData("tab.blocked", { app: "Telegram" })).toEqual({
      success: true,
      data: { app: "Telegram" },
    });
    expect(parseEventData("tab.blocked", { app: null }).success).toBe(true);
    expect(parseEventData("tab.blocked", {}).success).toBe(false);
  });

  it("never takes a full URL as a host", () => {
    for (const host of ["https://wikipedia.org", "wikipedia.org/wiki/X", "x.org?q=1", "x.org#a", ""]) {
      expect(parseEventData("site.closed", { host }).success, host).toBe(false);
    }
  });

  it("keeps a group command's group_id on proctor.message and proctor.time_added", () => {
    const groupId = "0199a9d2-4c3e-7a10-8b2c-1d2e3f405199";
    const message = parseEventData("proctor.message", {
      preset: "message.preset.time_15",
      scope: "group",
      group_id: groupId,
      staff_id: groupId,
    });
    expect(message.success && message.data).toEqual({
      preset: "message.preset.time_15",
      scope: "group",
      group_id: groupId,
    });
    const time = parseEventData("proctor.time_added", { minutes: 5, scope: "group", group_id: groupId });
    expect(time.success && time.data.group_id).toBe(groupId);
    expect(parseEventData("proctor.time_added", { minutes: 5, scope: "group", group_id: "g1" }).success).toBe(
      false,
    );
  });

  it("takes proctor.message with a preset or a text", () => {
    expect(parseEventData("proctor.message", { text: "Eyes on your screen", scope: "group" }).success).toBe(
      true,
    );
    expect(parseEventData("proctor.message", { preset: "message.preset.nope", scope: "group" }).success).toBe(
      false,
    );
  });
});

describe("EventEnvelope", () => {
  it("parses the plan's envelope and defaults frame_count to 0", () => {
    const parsed = EventEnvelope.parse(envelope());
    expect(parsed.frame_count).toBe(0);
  });

  it("requires a UTC time from the laptop", () => {
    expect(EventEnvelope.safeParse(envelope({ at: "2026-10-09T15:40:00+05:00" })).success).toBe(false);
    expect(EventEnvelope.safeParse(envelope({ at: "2026-10-09T10:40:00.123Z" })).success).toBe(true);
  });

  it("rejects unknown types, negative seq and more than 3 stills", () => {
    expect(EventEnvelope.safeParse(envelope({ type: "gaze.blink" })).success).toBe(false);
    expect(EventEnvelope.safeParse(envelope({ seq: -1 })).success).toBe(false);
    expect(EventEnvelope.safeParse(envelope({ frame_count: 4 })).success).toBe(false);
    expect(EventEnvelope.safeParse(envelope({ id: "not-a-uuid" })).success).toBe(false);
  });
});

describe("ClientEventEnvelope", () => {
  it("accepts app and lock events with valid data", () => {
    expect(ClientEventEnvelope.safeParse(envelope()).success).toBe(true);
    expect(
      ClientEventEnvelope.safeParse(
        envelope({ type: "copy.blocked", source: "lock", data: { kind: "copy" } }),
      ).success,
    ).toBe(true);
  });

  it("rejects proctor and server sources, proctor events and bad data", () => {
    expect(ClientEventEnvelope.safeParse(envelope({ source: "server" })).success).toBe(false);
    expect(ClientEventEnvelope.safeParse(envelope({ source: "proctor" })).success).toBe(false);
    expect(
      ClientEventEnvelope.safeParse(envelope({ type: "proctor.paused", data: { staff_id: STAFF_ID } }))
        .success,
    ).toBe(false);
    const bad = ClientEventEnvelope.safeParse(envelope({ data: { duration_ms: "long" } }));
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0]?.path).toEqual(["data", "duration_ms"]);
  });

  it("refuses a session.paused that claims a proctor pause: only proctor.paused is one", () => {
    for (const source of ["app", "lock"]) {
      const claimed = ClientEventEnvelope.safeParse(
        envelope({ type: "session.paused", source, data: { reason: "proctor" } }),
      );
      expect(claimed.success).toBe(false);
      expect(claimed.error?.issues[0]?.path).toEqual(["data", "reason"]);
    }
    for (const reason of ["face_missing", "camera_lost"]) {
      expect(
        ClientEventEnvelope.safeParse(envelope({ type: "session.paused", data: { reason } })).success,
      ).toBe(true);
    }
    expect(parseEventData("session.paused", { reason: "proctor" }).success).toBe(false);
  });
});

describe("CompactEvent", () => {
  it("parses a row with Postgres timestamps", () => {
    const event = compact("phone.detected", T0, { score: 0.94, held_ms: 800 });
    expect(CompactEvent.parse(event)).toEqual(event);
    expect(event.at).toBe(pgTime(T0));
  });

  it("accepts microseconds and a +00:00 offset, as to_jsonb writes them", () => {
    const row = {
      ...compact("gaze.down", T0, { duration_ms: 2000 }),
      exam_id: EXAM_ID,
      at: "2026-10-09T10:40:00.123456+00:00",
      received_at: "2026-10-09T10:40:00.323456+00:00",
    };
    expect(CompactEvent.safeParse(row).success).toBe(true);
  });
});
