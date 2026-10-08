import { THRESHOLDS } from "@uki/contracts";
import { describe, expect, it } from "vitest";
import { DEGRADED_INPUT } from "../src/perf.ts";
import { WorkerToMain } from "../src/protocol.ts";
import { eventsOf, fakeBitmap, fakePipeline, stillsOf } from "./support/fake-pipeline.ts";
import { loadFixture } from "./support/replay.ts";
import type { FrameRow } from "./support/trace.ts";

describe("the stills gate", () => {
  it("5 minutes of normal writing capture nothing", async () => {
    const run = fakePipeline();
    run.run(loadFixture("normal-writing-5min"));
    await run.settle();
    expect(run.capture).not.toHaveBeenCalled();
    expect(stillsOf(run.posted)).toEqual([]);
    expect(eventsOf(run.posted)).toEqual([]);
  });

  for (const [name, type] of [
    ["look-away-3s", "gaze.off_screen"],
    ["phone-lifted", "phone.detected"],
    ["second-person", "face.second"],
    ["leave-seat-10s", "face.missing"],
  ] as const) {
    it(`${name}: three stills for ${type}, at the crossing, 1 s and 2 s later`, async () => {
      const run = fakePipeline();
      run.run(loadFixture(name));
      await run.settle();
      const event = eventsOf(run.posted).find((e) => e.type === type);
      expect(event).toBeDefined();
      if (!event) return;
      expect(run.capture).toHaveBeenCalledTimes(THRESHOLDS.stills.offsetsMs.length);
      run.capturedAt.forEach((at, index) => {
        const due = event.at + (THRESHOLDS.stills.offsetsMs[index] ?? 0);
        expect(at).toBeGreaterThanOrEqual(due);
        expect(at).toBeLessThan(due + 1000 / 15 + 1);
      });
      const stills = stillsOf(run.posted);
      expect(stills.map((still) => [still.eventId, still.index])).toEqual([
        [event.id, 0],
        [event.id, 1],
        [event.id, 2],
      ]);
      for (const message of run.posted) expect(WorkerToMain.safeParse(message).success).toBe(true);
    });
  }

  it("with stills off (the /try demo) the requests still arrive but no JPEG is made", async () => {
    const run = fakePipeline({ stills: false });
    run.run(loadFixture("look-away-3s"));
    await run.settle();
    const event = eventsOf(run.posted).find((e) => e.type === "gaze.off_screen");
    expect(event).toBeDefined();
    const requests = run.posted.flatMap((message) =>
      message.type === "outputs" ? message.outputs.filter((output) => output.kind === "stills") : [],
    );
    expect(requests.map((request) => request.eventId)).toEqual([event?.id]);
    expect(run.capture).not.toHaveBeenCalled();
    expect(stillsOf(run.posted)).toEqual([]);
    expect(run.pipeline.pendingStills).toBe(0);
  });

  it("a lost camera cancels stills still waiting for a frame", async () => {
    const run = fakePipeline();
    const row = (at: number, faces: number): FrameRow => [at, "f", faces, 0, -5, 0, 0, 0, 0, 0.1];
    let at = 0;
    for (; at <= 1100; at += 67) run.pipeline.frame(fakeBitmap(row(at, 2)), at);
    expect(run.pipeline.pendingStills).toBe(2);
    run.pipeline.camera({ kind: "camera", state: "lost", reason: "ended" }, at);
    expect(run.pipeline.pendingStills).toBe(0);
    await run.settle();
    expect(run.capture).toHaveBeenCalledTimes(1);
  });

  it("the check phase runs no rules and captures nothing, and reports the camera row", async () => {
    const run = fakePipeline({ phase: "check" });
    run.run(loadFixture("phone-lifted"));
    await run.settle();
    expect(run.capture).not.toHaveBeenCalled();
    expect(run.phoneDetect).not.toHaveBeenCalled();
    expect(eventsOf(run.posted)).toEqual([]);
    const checks = run.posted.filter((message) => message.type === "camera-check");
    expect(checks.length).toBeGreaterThan(10);
    expect(checks[0]).toMatchObject({ check: { ready: true, faces: 1, brightness: 110 } });
  });

  it("frames close nothing themselves and run no detector while idle", () => {
    const run = fakePipeline();
    run.pipeline.setPhase("idle", 0);
    run.pipeline.frame(fakeBitmap(null), 10);
    expect(run.faceDetect).not.toHaveBeenCalled();
  });
});

describe("phone checks and the performance fallback", () => {
  it("checks a phone every 400 ms at 15 fps", () => {
    const run = fakePipeline();
    run.run(loadFixture("look-away-3s"));
    const seconds = loadFixture("look-away-3s").durationMs / 1000;
    const perSecond = run.phoneDetect.mock.calls.length / seconds;
    expect(perSecond).toBeGreaterThanOrEqual(2);
    expect(perSecond).toBeLessThanOrEqual(2.6);
  });

  it("under 10 fps for 5 s: 480 × 360 input and one phone check a second", () => {
    const run = fakePipeline();
    const row = (at: number): FrameRow => [at, "f", 1, 0, -5, 0, 0, 0, 0, 0.1];
    const slowMs = 125; // 8 fps
    let at = 0;
    for (; at < 5_900; at += slowMs) run.pipeline.frame(fakeBitmap(row(at)), at);
    expect(run.posted.filter((message) => message.type === "degraded")).toEqual([]);
    for (; at < 7_000; at += slowMs) run.pipeline.frame(fakeBitmap(row(at)), at);
    const degraded = run.posted.filter((message) => message.type === "degraded");
    expect(degraded).toEqual([
      {
        type: "degraded",
        input: DEGRADED_INPUT,
        phoneIntervalMs: THRESHOLDS.performance.lowFpsPhoneIntervalMs,
      },
    ]);
    run.phoneDetect.mockClear();
    const from = at;
    for (; at < from + 10_000; at += slowMs) run.pipeline.frame(fakeBitmap(row(at), 480, 360), at);
    expect(run.phoneDetect.mock.calls.length).toBeGreaterThanOrEqual(9);
    expect(run.phoneDetect.mock.calls.length).toBeLessThanOrEqual(10);
    const debug = run.posted.filter((message) => message.type === "debug").at(-1);
    expect(debug?.type === "debug" && debug.debug).toMatchObject({
      degraded: true,
      input: { width: 480, height: 360 },
    });
  });

  it("sends debug stats every 500 ms with the overlay fields", () => {
    const run = fakePipeline();
    run.run(loadFixture("look-away-3s"));
    const debug = run.posted.filter((message) => message.type === "debug");
    expect(debug.length).toBeGreaterThanOrEqual(25);
    expect(debug.length).toBeLessThanOrEqual(27);
    const sample = debug.find((message) => message.type === "debug" && message.debug.frameClass === "left");
    expect(sample?.type === "debug" && sample.debug).toMatchObject({
      faces: 1,
      delegate: { face: "GPU", phone: "CPU" },
      rules: { gaze: "away" },
    });
    const last = debug.at(-1);
    const rate = last?.type === "debug" ? last.debug.phoneChecksPerS : null;
    expect(rate).toBeGreaterThanOrEqual(2);
    expect(rate).toBeLessThanOrEqual(2.5);
    expect(last?.type === "debug" && last.debug.fps).toBeGreaterThanOrEqual(14);
  });

  it("posts the rule state only when it changes", () => {
    const run = fakePipeline();
    run.run(loadFixture("phone-lifted"));
    const states = run.posted.filter((message) => message.type === "state");
    expect(states.length).toBeLessThan(40);
    expect(states.some((message) => message.type === "state" && message.state.phone.warning)).toBe(true);
  });

  it("resume answers whether session.resumed was sent", () => {
    const run = fakePipeline();
    run.run(loadFixture("leave-seat-10s"));
    expect(run.pipeline.resume(18_400)).toBe(true);
    expect(run.pipeline.resume(18_500)).toBe(false);
  });
});
