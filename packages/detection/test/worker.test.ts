// The worker entry's glue, with MediaPipe replaced by fakes: init, frames (closed and acknowledged),
// phases, camera loss, resume and malformed messages.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { WorkerToMain } from "../src/protocol.ts";
import { faceFrameOf, fakeBitmap } from "./support/fake-pipeline.ts";
import type { FrameRow } from "./support/trace.ts";

vi.mock("../src/face.ts", () => ({
  createFaceTracker: vi.fn(async () => ({ delegate: "GPU", detect: faceFrameOf, close: vi.fn() })),
}));
vi.mock("../src/phone.ts", () => ({
  createPhoneDetector: vi.fn(async () => ({ delegate: "CPU", detect: () => [], close: vi.fn() })),
}));

const posted: unknown[] = [];
let listener: ((event: MessageEvent<unknown>) => void) | null = null;

beforeAll(async () => {
  vi.stubGlobal("postMessage", (message: unknown) => posted.push(message));
  vi.stubGlobal("addEventListener", (_type: string, fn: (event: MessageEvent<unknown>) => void) => {
    listener = fn;
  });
  vi.stubGlobal("close", vi.fn());
  await import("../src/worker.ts");
});
afterAll(() => {
  vi.unstubAllGlobals();
});

async function send(message: unknown): Promise<void> {
  listener?.({ data: message } as MessageEvent<unknown>);
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

const row = (at: number, faces = 1): FrameRow => [at, "f", faces, 0, -5, 0, 0, 0, 0, 0.1];

describe("the detection worker", () => {
  it("answers ready after init and checks every message it posts", async () => {
    await send({
      type: "init",
      checks: {},
      mode: "app",
      models: { wasmBase: "w", faceLandmarker: "f", objectDetector: "o" },
    });
    expect(posted).toContainEqual({ type: "ready", delegate: { face: "GPU", phone: "CPU" } });
    await send({
      type: "init",
      checks: {},
      mode: "app",
      models: { wasmBase: "w", faceLandmarker: "f", objectDetector: "o" },
    });
    expect(posted.at(-1)).toEqual({ type: "error", stage: "init", message: "already initialised" });
  });

  it("closes and acknowledges every frame, also while idle", async () => {
    const bitmap = fakeBitmap(row(10));
    await send({ type: "frame", at: 10, bitmap });
    expect(bitmap.close).toHaveBeenCalled();
    expect(posted.at(-1)).toEqual({ type: "frame-done", at: 10 });
  });

  it("runs the rules in the exam phase and pauses on camera loss", async () => {
    await send({ type: "phase", phase: "exam", at: 20 });
    for (let at = 100; at < 1300; at += 67) await send({ type: "frame", at, bitmap: fakeBitmap(row(at, 2)) });
    await send({ type: "camera", state: "lost", reason: "ended", at: 1400 });
    const events = posted
      .filter(
        (m): m is Extract<WorkerToMain, { type: "outputs" }> => (m as { type: string }).type === "outputs",
      )
      .flatMap((m) => m.outputs.flatMap((o) => (o.kind === "event" ? [o.event.type] : [])));
    expect(events).toEqual(["face.second", "camera.lost", "session.paused"]);
    await send({ type: "resume", at: 1500, requestId: 7 });
    expect(posted.at(-1)).toEqual({ type: "resumed", requestId: 7, ok: false });
    for (const message of posted) {
      if ((message as { type: string }).type === "still") continue; // OffscreenCanvas is not in Node
      expect(WorkerToMain.safeParse(message).success, JSON.stringify(message)).toBe(true);
    }
  });

  it("refuses a malformed message and still closes its bitmap", async () => {
    const bitmap = fakeBitmap(null);
    await send({ type: "frame", at: "soon", bitmap });
    expect(bitmap.close).toHaveBeenCalled();
    expect(posted.at(-1)).toMatchObject({ type: "error", stage: "message" });
  });

  it("closes on dispose", async () => {
    await send({ type: "dispose" });
    expect(globalThis.close).toHaveBeenCalled();
  });
});
