import { describe, expect, it } from "vitest";
import { draftsFor, IngestBatchResult, SIM_APP_VERSION, toBatchEvent } from "./events.ts";

const SESSION = "0199b8f0-0000-7000-8000-000000000001";
const ctx = { nowMs: Date.parse("2026-10-16T05:47:10.000Z"), gazeS: 2, faceMissingS: 10 };

describe("draftsFor", () => {
  it("sends a look away at its end, with `at` at the 2 s crossing, then gaze.on_screen", () => {
    const [look, back] = draftsFor(
      { kind: "look_away", type: "gaze.off_screen", durationMs: 2400, direction: "right" },
      ctx,
    );
    expect(look).toMatchObject({ type: "gaze.off_screen", data: { duration_ms: 2400, direction: "right" } });
    expect(look?.atMs).toBe(ctx.nowMs - 300 - 2400 + 2000);
    expect(back).toMatchObject({ type: "gaze.on_screen", atMs: ctx.nowMs });
  });

  it("pauses an empty seat with face.missing and session.paused together", () => {
    const drafts = draftsFor({ kind: "self_pause", cause: "face_missing", pauseSimMs: 60_000 }, ctx);
    expect(drafts.map((d) => [d.type, d.data])).toEqual([
      ["face.missing", { duration_ms: 10_000 }],
      ["session.paused", { reason: "face_missing" }],
    ]);
  });

  it("sends tab.blocked from Üki Lock with the host only", () => {
    expect(draftsFor({ kind: "tab_blocked", host: "www.google.com" }, ctx)).toEqual([
      { type: "tab.blocked", source: "lock", data: { host: "www.google.com" }, atMs: ctx.nowMs },
    ]);
  });
});

describe("draftsFor help", () => {
  it("asks the proctor with student.help_requested, a log event the help_from_event trigger turns into a request", () => {
    const [draft] = draftsFor(
      { kind: "help", topic: "question", text: "Q 8: is the angle in radians or degrees?" },
      ctx,
    );
    expect(draft).toEqual({
      type: "student.help_requested",
      data: { topic: "question", text: "Q 8: is the angle in radians or degrees?" },
      atMs: ctx.nowMs,
    });
    if (draft === undefined) return;
    expect(toBatchEvent(SESSION, 9, draft)).toMatchObject({ source: "app", review: "log" });
  });
});

describe("toBatchEvent", () => {
  it("sets the server's review and no stills", () => {
    const phone = toBatchEvent(SESSION, 4, {
      type: "phone.detected",
      data: { score: 0.94, held_ms: 800 },
      atMs: ctx.nowMs,
    });
    expect(phone).toMatchObject({
      type: "phone.detected",
      source: "app",
      review: "flag",
      seq: 4,
      frame_count: 0,
      app_version: SIM_APP_VERSION,
      at: "2026-10-16T05:47:10.000Z",
    });
    expect(phone.id[14]).toBe("7");
    const saved = toBatchEvent(SESSION, 5, {
      type: "answer.saved",
      data: { question_id: SESSION },
      atMs: ctx.nowMs,
    });
    expect(saved.review).toBe("none");
  });

  it("refuses data the contract refuses", () => {
    expect(() =>
      toBatchEvent(SESSION, 1, {
        type: "phone.detected",
        data: { score: 1.4, held_ms: 800 },
        atMs: ctx.nowMs,
      }),
    ).toThrow();
    expect(() =>
      toBatchEvent(SESSION, 1, {
        type: "tab.blocked",
        source: "lock",
        data: { host: "https://x.org/a" },
        atMs: 0,
      }),
    ).toThrow();
  });
});

describe("IngestBatchResult", () => {
  it("reads what ingest_batch returns", () => {
    const parsed = IngestBatchResult.parse({
      accepted: [SESSION],
      duplicates: [],
      uploads: [],
      session: { state: "writing", ends_at: "2026-10-16T07:27:00+00:00", extra_min: 10, paused_s: 42 },
      server_time: "2026-10-16T05:47:10.123456+00:00",
    });
    expect(parsed.session.state).toBe("writing");
  });
});
