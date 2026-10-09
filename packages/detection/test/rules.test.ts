import { DEFAULT_EXAM_CHECKS, parseEventData, REVIEW, THRESHOLDS } from "@uki/contracts";
import { describe, expect, it } from "vitest";
import { RuleEventSchema } from "../src/protocol.ts";
import { classifyFrame, PHONE_WARNING_CLEAR_MS, type RuleEvent } from "../src/rules.ts";
import {
  FRAME_MS,
  face,
  framesFor,
  loadFixture,
  type Replay,
  replayFixture,
  startReplay,
} from "./support/replay.ts";

const FLAG_TYPES = Object.entries(REVIEW)
  .filter(([, review]) => review === "flag")
  .map(([type]) => type);

function flags(events: RuleEvent[]): RuleEvent[] {
  return events.filter((event) => FLAG_TYPES.includes(event.type));
}

function expectValid(replay: Replay): void {
  for (const event of replay.events) {
    expect(parseEventData(event.type, event.data).success, `${event.type} data`).toBe(true);
    expect(RuleEventSchema.safeParse(event).success, `${event.type} schema`).toBe(true);
  }
}

function only<T extends RuleEvent["type"]>(replay: Replay, type: T): Extract<RuleEvent, { type: T }> {
  const matches = replay.events.filter((event) => event.type === type);
  expect(matches, type).toHaveLength(1);
  return matches[0] as Extract<RuleEvent, { type: T }>;
}

describe("Tuning moments, replayed from recorded traces", () => {
  it("look away for 3 seconds: one gaze.off_screen when the look ends, then gaze.on_screen", () => {
    const replay = replayFixture(loadFixture("look-away-3s"));
    expectValid(replay);
    expect(replay.events.map((event) => event.type)).toEqual(["gaze.off_screen", "gaze.on_screen"]);
    const look = only(replay, "gaze.off_screen");
    expect(look.data.direction).toBe("left");
    expect(look.data.duration_ms).toBeGreaterThanOrEqual(2950);
    expect(look.data.duration_ms).toBeLessThanOrEqual(3150);
    // `at` is the crossing, 2 s into the look, and stills start there.
    expect(look.at).toBeGreaterThanOrEqual(7000);
    expect(look.at).toBeLessThan(7000 + FRAME_MS + 1);
    expect(look.frame_count).toBe(3);
    expect(replay.stills).toEqual([
      { kind: "stills", eventId: look.id, at: look.at, offsetsMs: THRESHOLDS.stills.offsetsMs },
    ]);
    const back = only(replay, "gaze.on_screen");
    // The trace blinks as the student looks back (two frames of eyeLookDown), so allow a few frames.
    expect(back.at).toBeGreaterThanOrEqual(8000);
    expect(back.at).toBeLessThan(8000 + THRESHOLDS.gaze.onScreenEndMs);
    expect(replay.cues.map((cue) => [cue.value.cue, cue.value.on])).toEqual([
      ["away", true],
      ["away", false],
    ]);
  });

  it("phone lifted: phone.detected on the second hit, the 2.2 warning at once, cleared after 2 s", () => {
    const replay = replayFixture(loadFixture("phone-lifted"));
    expectValid(replay);
    expect(replay.events.map((event) => event.type)).toEqual(["phone.detected"]);
    const phone = only(replay, "phone.detected");
    expect(phone.data.score).toBeGreaterThanOrEqual(0.87);
    expect(phone.data.score).toBeLessThanOrEqual(0.95);
    expect(phone.data.held_ms).toBeGreaterThanOrEqual(THRESHOLDS.phone.intervalMs);
    expect(phone.data.held_ms).toBeLessThan(THRESHOLDS.phone.intervalMs + 2 * FRAME_MS);
    expect(phone.frame_count).toBe(3);
    expect(replay.stills.map((still) => still.eventId)).toEqual([phone.id]);
    const on = replay.cues.find((cue) => cue.value.cue === "phone" && cue.value.on);
    const off = replay.cues.find((cue) => cue.value.cue === "phone" && !cue.value.on);
    expect(on?.at).toBe(phone.at);
    // The last hit is at about 7 s; the warning closes 2 s after it.
    expect(off?.at).toBeGreaterThanOrEqual(7000 - THRESHOLDS.phone.intervalMs + PHONE_WARNING_CLEAR_MS);
    expect(off?.at).toBeLessThan(7000 + PHONE_WARNING_CLEAR_MS + FRAME_MS);
  });

  it("leave the seat for 10 seconds (app exam): face.missing, then session.paused and 2.3", () => {
    const replay = replayFixture(loadFixture("leave-seat-10s"));
    expectValid(replay);
    expect(replay.events.map((event) => event.type)).toEqual(["face.missing", "session.paused"]);
    const missing = only(replay, "face.missing");
    expect(missing.data.duration_ms).toBeGreaterThanOrEqual(10_000);
    expect(missing.data.duration_ms).toBeLessThan(10_000 + FRAME_MS + 1);
    expect(missing.at).toBeGreaterThanOrEqual(13_400);
    expect(replay.stills.map((still) => still.eventId)).toEqual([missing.id]);
    const paused = only(replay, "session.paused");
    expect(paused.data).toEqual({ reason: "face_missing" });
    expect(paused.at).toBe(missing.at);
    expect(replay.cues.map((cue) => cue.value)).toContainEqual({
      kind: "cue",
      cue: "paused",
      on: true,
      reason: "face_missing",
    });
    // The face is back at the end of the trace: "I'm here" resumes.
    const state = replay.rules.state();
    expect(state.paused?.reason).toBe("face_missing");
    expect(state.canResume).toBe(true);
    const end = loadFixture("leave-seat-10s").durationMs;
    replay.resume(end);
    const resumed = only(replay, "session.resumed");
    expect(resumed.data.by).toBe("student");
    expect(resumed.data.paused_ms).toBe(Math.round(end - paused.at));
    expect(replay.rules.state().paused).toBeNull();
    expect(replay.cues.at(-1)?.value).toEqual({ kind: "cue", cue: "paused", on: false, reason: null });
  });

  it("leave the seat in a browser exam: face.missing is logged, nothing pauses", () => {
    const replay = replayFixture(loadFixture("leave-seat-10s"), { mode: "browser" });
    expectValid(replay);
    expect(replay.events.map((event) => event.type)).toEqual(["face.missing"]);
    expect(replay.cues.filter((cue) => cue.value.cue === "paused")).toEqual([]);
    expect(replay.rules.state().paused).toBeNull();
  });

  it("a second person: face.second after 1 s of two faces", () => {
    const replay = replayFixture(loadFixture("second-person"));
    expectValid(replay);
    expect(replay.events.map((event) => event.type)).toEqual(["face.second"]);
    const second = only(replay, "face.second");
    expect(second.data.faces).toBe(2);
    expect(second.data.duration_ms).toBeGreaterThanOrEqual(THRESHOLDS.face.secondFaceMs);
    expect(second.data.duration_ms).toBeLessThan(THRESHOLDS.face.secondFaceMs + FRAME_MS + 1);
    expect(second.at).toBeGreaterThanOrEqual(4000);
    expect(replay.stills.map((still) => still.eventId)).toEqual([second.id]);
  });

  it("camera unplugged (app exam): camera.lost and session.paused at once, no stills", () => {
    const replay = replayFixture(loadFixture("camera-unplugged"));
    expectValid(replay);
    expect(replay.events.map((event) => [event.type, event.data])).toEqual([
      ["camera.lost", { reason: "ended" }],
      ["session.paused", { reason: "camera_lost" }],
    ]);
    expect(replay.events.every((event) => event.at === 3000)).toBe(true);
    expect(replay.events[0]?.frame_count).toBe(0);
    expect(replay.stills).toEqual([]);
    expect(replay.rules.state()).toMatchObject({ cameraLost: true, canResume: false });
    expect(replay.resume(9000)).toEqual([]);
  });

  it("camera unplugged in a browser exam: camera.lost only", () => {
    const replay = replayFixture(loadFixture("camera-unplugged"), { mode: "browser" });
    expect(replay.events.map((event) => event.type)).toEqual(["camera.lost"]);
  });

  it("5 minutes of normal writing raise no flag and request no still", () => {
    const fixture = loadFixture("normal-writing-5min");
    expect(fixture.durationMs).toBe(300_000);
    for (const mode of ["app", "browser"] as const) {
      const replay = replayFixture(fixture, { mode });
      expect(flags(replay.events)).toEqual([]);
      expect(replay.events).toEqual([]);
      expect(replay.stills).toEqual([]);
      expect(replay.cues).toEqual([]);
    }
  });
});

describe("jitter around the thresholds", () => {
  const left = (): ReturnType<typeof face> => face({ yawDeg: 40 });

  function look(holdMs: number): Replay {
    const replay = startReplay();
    let at = framesFor(replay, 0, 1000, () => face());
    at = framesFor(replay, at, at + holdMs, left);
    framesFor(replay, at, at + 2000, () => face());
    return replay;
  }

  it("a look shorter than gaze_s never fires; a longer one does", () => {
    expect(look(1900).events).toEqual([]);
    expect(look(2100).events.map((event) => event.type)).toEqual(["gaze.off_screen", "gaze.on_screen"]);
  });

  it("returns to the screen under 300 ms do not split a look", () => {
    const replay = startReplay();
    let at = framesFor(replay, 0, 1000, () => face());
    for (let i = 0; i < 3; i += 1) {
      at = framesFor(replay, at, at + 800, left);
      at = framesFor(replay, at, at + 200, () => face());
    }
    framesFor(replay, at, at + 1000, () => face());
    const events = replay.events.filter((event) => event.type === "gaze.off_screen");
    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event?.type === "gaze.off_screen" && event.data.duration_ms).toBeGreaterThanOrEqual(2700);
  });

  it("300 ms back on screen ends a look, so two 1.5 s looks are two short looks", () => {
    const replay = startReplay();
    let at = framesFor(replay, 0, 1000, () => face());
    at = framesFor(replay, at, at + 1500, left);
    at = framesFor(replay, at, at + 400, () => face());
    at = framesFor(replay, at, at + 1500, left);
    framesFor(replay, at, at + 1000, () => face());
    expect(replay.events).toEqual([]);
  });

  it("head yaw hovering under the limit never fires; hovering over it does", () => {
    const noise = (at: number): number => 4 * Math.sin(at * 1.7) + 3 * Math.sin(at * 0.37);
    const under = startReplay();
    framesFor(under, 0, 20_000, (at) => face({ yawDeg: 19 + noise(at) }));
    expect(under.events).toEqual([]);
    const over = startReplay();
    let at = framesFor(over, 0, 3000, (t) => face({ yawDeg: 31 + noise(t) }));
    at = framesFor(over, at, at + 1000, () => face());
    expect(over.events.map((event) => event.type)).toEqual(["gaze.off_screen", "gaze.on_screen"]);
  });

  it("eyes alone (side look above 0.55) count as off screen, with their direction", () => {
    const replay = startReplay();
    let at = framesFor(replay, 0, 500, () => face());
    at = framesFor(replay, at, at + 2500, () => face({ lookOutR: 0.75, lookInL: 0.62 }));
    framesFor(replay, at, at + 1000, () => face());
    const event = replay.events.find((e) => e.type === "gaze.off_screen");
    expect(event?.type === "gaze.off_screen" && event.data.direction).toBe("right");
    expect(classifyFrame({ ...face(), lookOutL: 0.56, lookInR: 0.56 })).toBe("left");
    expect(classifyFrame({ ...face(), lookOutL: 0.54, lookInR: 0.54 })).toBe("on");
  });

  it("looking up is off screen (up); looking down by head or eyes is gaze.down", () => {
    const up = startReplay();
    let at = framesFor(up, 0, 2500, () => face({ pitchDeg: 25 }));
    framesFor(up, at, at + 500, () => face());
    expect(up.events[0]).toMatchObject({ type: "gaze.off_screen", data: { direction: "up" } });

    for (const down of [face({ pitchDeg: -22 }), face({ lookDown: 0.8 })]) {
      const replay = startReplay();
      at = framesFor(replay, 0, 500, () => face());
      at = framesFor(replay, at, at + 3000, () => down);
      framesFor(replay, at, at + 500, () => face());
      expect(replay.events.map((event) => event.type)).toEqual(["gaze.down", "gaze.on_screen"]);
      const event = replay.events[0];
      expect(event?.type === "gaze.down" && event.data.duration_ms).toBeGreaterThanOrEqual(2950);
    }
  });

  it("phone scores that never hit twice in a row never fire", () => {
    const replay = startReplay();
    let hit = false;
    for (let at = 0; at < 10_000; at += THRESHOLDS.phone.intervalMs) {
      replay.push(at, face());
      // Just under the default phone_score on every other check.
      replay.push(at, { kind: "phone", score: hit ? 0.9 : DEFAULT_EXAM_CHECKS.phone_score - 0.01 });
      hit = !hit;
    }
    expect(replay.events).toEqual([]);
  });

  it("a phone in view for 10 s fires once; it fires again only after 2 s without it", () => {
    const replay = startReplay();
    let at = 0;
    const check = (score: number): void => {
      replay.push(at, face());
      replay.push(at, { kind: "phone", score });
      at += THRESHOLDS.phone.intervalMs;
    };
    for (let i = 0; i < 25; i += 1) check(0.9);
    expect(replay.events.map((event) => event.type)).toEqual(["phone.detected"]);
    for (let i = 0; i < 3; i += 1) check(0); // 1.2 s: same episode
    for (let i = 0; i < 2; i += 1) check(0.9);
    expect(replay.events).toHaveLength(1);
    for (let i = 0; i < 6; i += 1) check(0); // 2.4 s without a phone: the warning clears
    for (let i = 0; i < 2; i += 1) check(0.92);
    expect(replay.events.map((event) => event.type)).toEqual(["phone.detected", "phone.detected"]);
    expect(replay.cues.map((cue) => cue.value.on)).toEqual([true, false, true]);
  });

  it("single-frame second faces never fire; two faces with single-frame drops do", () => {
    const flicker = startReplay();
    framesFor(flicker, 0, 10_000, (at) => face({ faces: Math.round(at / FRAME_MS) % 8 === 0 ? 2 : 1 }));
    expect(flicker.events).toEqual([]);

    const held = startReplay();
    framesFor(held, 0, 1500, (at) => face({ faces: Math.round(at / FRAME_MS) % 6 === 5 ? 1 : 2 }));
    expect(held.events.map((event) => event.type)).toEqual(["face.second"]);
  });

  it("9.9 s without a face is not face.missing; one stray face frame does not restart the count", () => {
    const short = startReplay();
    let at = framesFor(short, 0, 1000, () => face());
    at = framesFor(short, at, at + 9900, () => face({ faces: 0 }));
    framesFor(short, at, at + 1000, () => face());
    expect(short.events).toEqual([]);

    const stray = startReplay();
    at = framesFor(stray, 0, 1000, () => face());
    const absent = at;
    at = framesFor(stray, at, at + 5000, () => face({ faces: 0 }));
    stray.push(Math.round(at), face());
    at = framesFor(stray, at + FRAME_MS, absent + 12_000, () => face({ faces: 0 }));
    const missing = stray.events.find((event) => event.type === "face.missing");
    expect(missing?.at).toBeLessThan(absent + 10_000 + 2 * FRAME_MS);
  });

  it("a look whose face is lost before gaze_s is dropped, not flagged", () => {
    const replay = startReplay();
    let at = framesFor(replay, 0, 1000, () => face());
    at = framesFor(replay, at, at + 800, left);
    at = framesFor(replay, at, at + 3000, () => face({ faces: 0 }));
    framesFor(replay, at, at + 1000, () => face());
    expect(replay.events).toEqual([]);
  });

  it("thresholds come from exams.checks", () => {
    const slow = startReplay({ checks: { gaze_s: 3 } });
    let at = framesFor(slow, 0, 2500, () => face({ yawDeg: 40 }));
    framesFor(slow, at, at + 1000, () => face());
    expect(slow.events).toEqual([]);

    const strict = startReplay({ checks: { phone_score: 0.95 } });
    for (at = 0; at < 4000; at += 400) strict.push(at, { kind: "phone", score: 0.9 });
    expect(strict.events).toEqual([]);

    const quick = startReplay({ checks: { face_missing_s: 5 } });
    at = framesFor(quick, 0, 6000, () => face({ faces: 0 }));
    expect(quick.events[0]).toMatchObject({ type: "face.missing" });
    expect(quick.events[0]?.at).toBeLessThan(5000 + FRAME_MS + 1);
  });
});

describe("pause, resume and finish", () => {
  it("nothing fires while paused, and resume needs a face", () => {
    const replay = startReplay();
    let at = framesFor(replay, 0, 10_100, () => face({ faces: 0 }));
    expect(replay.rules.state().paused?.reason).toBe("face_missing");
    expect(replay.resume(at)).toEqual([]);
    replay.push(Math.round(at), { kind: "phone", score: 0.99 });
    replay.push(Math.round(at), { kind: "phone", score: 0.99 });
    at = framesFor(replay, at, at + 3000, () => face({ faces: 2, yawDeg: 50 }));
    expect(replay.events.map((event) => event.type)).toEqual(["face.missing", "session.paused"]);
    expect(replay.rules.state().canResume).toBe(true);
    expect(replay.resume(at).map((output) => output.kind)).toEqual(["event", "cue"]);
    expect(replay.events.at(-1)?.type).toBe("session.resumed");
  });

  it("finish sends an open look that crossed", () => {
    const replay = startReplay();
    const at = framesFor(replay, 0, 2500, () => face({ yawDeg: -40 }));
    const out = replay.rules.finish(at);
    expect(out[0]).toMatchObject({
      kind: "event",
      event: { type: "gaze.off_screen", data: { direction: "right" } },
    });
  });

  it("timestamps never go backwards", () => {
    const replay = startReplay();
    replay.push(1000, face());
    replay.push(500, face());
    expect(replay.rules.state().at).toBe(1000);
  });

  it("event ids default to UUIDv7", async () => {
    const { createRules } = await import("../src/rules.ts");
    const rules = createRules({}, { mode: "app" });
    const out = rules.push({ kind: "camera", state: "lost", reason: "error" }, Date.now());
    const event = out.find((output) => output.kind === "event");
    expect(event?.kind === "event" && event.event.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
  });
});
