import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Camera, type CameraHandlers, cameraFromStream } from "../src/camera.ts";
import { createDetectionClient, type DetectionHandlers, type WorkerLike } from "../src/client.ts";
import type { WorkerToMain } from "../src/protocol.ts";

class FakeWorker implements WorkerLike {
  sent: { message: unknown; transfer?: Transferable[] }[] = [];
  listeners = new Set<(event: MessageEvent<unknown>) => void>();
  terminated = false;
  postMessage(message: unknown, transfer?: Transferable[]): void {
    this.sent.push(transfer ? { message, transfer } : { message });
  }
  addEventListener(_type: "message", listener: (event: MessageEvent<unknown>) => void): void {
    this.listeners.add(listener);
  }
  removeEventListener(_type: "message", listener: (event: MessageEvent<unknown>) => void): void {
    this.listeners.delete(listener);
  }
  terminate(): void {
    this.terminated = true;
  }
  reply(message: WorkerToMain | Record<string, unknown>): void {
    for (const listener of this.listeners) listener({ data: message } as MessageEvent<unknown>);
  }
  types(): string[] {
    return this.sent.map(({ message }) => (message as { type: string }).type);
  }
}

class FakeCamera implements Camera {
  stream = {} as MediaStream;
  track = {} as MediaStreamTrack;
  source = "track-processor" as const;
  handlers: CameraHandlers | null = null;
  input = { width: 640, height: 480 };
  stopped = false;
  start(handlers: CameraHandlers): void {
    this.handlers = handlers;
  }
  setInputSize(size: { width: number; height: number }): void {
    this.input = size;
  }
  stop(): void {
    this.stopped = true;
  }
}

const models = { wasmBase: "w", faceLandmarker: "f", objectDetector: "o" };

function setup(handlers: DetectionHandlers = {}) {
  const worker = new FakeWorker();
  let clock = 1000;
  const client = createDetectionClient(worker, handlers, { now: () => clock });
  return { worker, client, tick: (ms: number) => (clock += ms) };
}

describe("the detection client", () => {
  it("init resolves on ready and rejects on an init error", async () => {
    const ok = setup();
    const ready = ok.client.init({ checks: {}, mode: "app", models });
    expect(ok.worker.types()).toEqual(["init"]);
    ok.worker.reply({ type: "ready", delegate: { face: "GPU", phone: "CPU" } });
    await expect(ready).resolves.toEqual({ face: "GPU", phone: "CPU" });
    expect(ok.client.ready).toBe(true);

    const early = setup();
    early.client.setPhase("check");
    const earlyReady = early.client.init({ checks: {}, mode: "app", models });
    early.worker.reply({ type: "ready", delegate: { face: "GPU", phone: "CPU" } });
    await earlyReady;
    expect(early.worker.types()).toEqual(["phase", "init", "phase"]);

    const bad = setup();
    const failed = bad.client.init({ checks: {}, mode: "app", models });
    bad.worker.reply({ type: "error", stage: "init", message: "no WebGL" });
    await expect(failed).rejects.toThrow("no WebGL");
  });

  it("sends one frame at a time and only outside the idle phase", async () => {
    const { worker, client } = setup();
    const camera = new FakeCamera();
    client.attach(camera);
    const want = (): boolean => camera.handlers?.wantFrame() ?? false;
    expect(want()).toBe(false); // not ready
    const ready = client.init({ checks: {}, mode: "app", models });
    worker.reply({ type: "ready", delegate: { face: "CPU", phone: "CPU" } });
    await ready;
    expect(want()).toBe(false); // idle
    client.setPhase("exam");
    expect(want()).toBe(true);
    const bitmap = { width: 640, height: 480, close: vi.fn() } as unknown as ImageBitmap;
    camera.handlers?.onFrame(bitmap, 1234);
    expect(want()).toBe(false); // one in flight
    const frame = worker.sent.at(-1);
    expect(frame?.message).toEqual({ type: "frame", at: 1234, bitmap });
    expect(frame?.transfer).toEqual([bitmap]);
    worker.reply({ type: "frame-done", at: 1234 });
    expect(want()).toBe(true);
  });

  it("forwards camera loss and applies the fallback input size", () => {
    const onDegraded = vi.fn();
    const { worker, client } = setup({ onDegraded });
    const camera = new FakeCamera();
    client.attach(camera);
    camera.handlers?.onLost("muted", 2000);
    camera.handlers?.onRestored?.(2500);
    expect(worker.sent.map(({ message }) => message)).toEqual([
      { type: "camera", state: "lost", reason: "muted", at: 2000 },
      { type: "camera", state: "ok", at: 2500 },
    ]);
    worker.reply({ type: "degraded", input: { width: 480, height: 360 }, phoneIntervalMs: 1000 });
    expect(camera.input).toEqual({ width: 480, height: 360 });
    expect(onDegraded).toHaveBeenCalledWith({ input: { width: 480, height: 360 }, phoneIntervalMs: 1000 });
  });

  it("routes events, cues, stills and state, and drops malformed messages", () => {
    const onEvent = vi.fn();
    const onCue = vi.fn();
    const onStill = vi.fn();
    const onError = vi.fn();
    const { worker } = setup({ onEvent, onCue, onStill, onError });
    worker.reply({
      type: "outputs",
      outputs: [
        {
          kind: "event",
          event: {
            id: "e1",
            type: "phone.detected",
            at: 5,
            data: { score: 0.9, held_ms: 400 },
            frame_count: 3,
          },
        },
        { kind: "stills", eventId: "e1", at: 5, offsetsMs: [0, 1000, 2000] },
        { kind: "cue", cue: "phone", on: true, score: 0.9 },
      ],
    });
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ id: "e1", type: "phone.detected" }));
    expect(onCue).toHaveBeenCalledWith({ kind: "cue", cue: "phone", on: true, score: 0.9 });
    const blob = new Blob([new Uint8Array([1])], { type: "image/jpeg" });
    worker.reply({ type: "still", eventId: "e1", index: 0, at: 5, blob });
    expect(onStill).toHaveBeenCalledWith({ eventId: "e1", index: 0, at: 5, blob });
    worker.reply({
      type: "outputs",
      outputs: [
        { kind: "event", event: { id: "x", type: "phone.detected", at: 1, data: {}, frame_count: 0 } },
      ],
    });
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ stage: "message" }));
  });

  it("resume resolves with the worker's answer; dispose closes everything", async () => {
    const { worker, client } = setup();
    const answer = client.resume();
    const sent = worker.sent.at(-1)?.message as { requestId: number };
    worker.reply({ type: "resumed", requestId: sent.requestId, ok: true });
    await expect(answer).resolves.toBe(true);
    const pending = client.resume();
    const camera = new FakeCamera();
    client.attach(camera);
    client.dispose();
    await expect(pending).resolves.toBe(false);
    expect(worker.types().at(-1)).toBe("dispose");
    expect(worker.terminated).toBe(true);
    expect(camera.stopped).toBe(true);
  });
});

describe("the camera frame pump", () => {
  class FakeTrack extends EventTarget {
    readyState: "live" | "ended" = "live";
    muted = false;
    stop = vi.fn();
    getSettings() {
      return { frameRate: 30 };
    }
  }

  let frames: ReadableStreamDefaultController<VideoFrame> | null = null;
  const created: unknown[] = [];

  beforeEach(() => {
    created.length = 0;
    vi.stubGlobal(
      "MediaStreamTrackProcessor",
      class {
        readable = new ReadableStream<VideoFrame>({
          start(controller) {
            frames = controller;
          },
        });
      },
    );
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async (frame: unknown, options?: ImageBitmapOptions) => {
        created.push(options ?? null);
        return {
          width: options?.resizeWidth ?? 640,
          height: options?.resizeHeight ?? 480,
          close: vi.fn(),
          frame,
        };
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function videoFrame(width = 640, height = 480) {
    return { displayWidth: width, displayHeight: height, close: vi.fn() } as unknown as VideoFrame;
  }

  async function flush(): Promise<void> {
    for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  }

  function start(wantFrame = (): boolean => true) {
    const track = new FakeTrack();
    const stream = { getTracks: () => [track] } as unknown as MediaStream;
    const camera = cameraFromStream(stream, track as unknown as MediaStreamTrack, { now: () => 42 });
    const onFrame = vi.fn((bitmap: ImageBitmap, _at: number) => bitmap.close());
    const onLost = vi.fn();
    const onRestored = vi.fn();
    camera.start({ wantFrame, onFrame, onLost, onRestored });
    return { camera, track, onFrame, onLost, onRestored };
  }

  it("hands every second frame to detection and closes every VideoFrame", async () => {
    const { camera, onFrame } = start();
    expect(camera.source).toBe("track-processor");
    const sent = Array.from({ length: 6 }, () => videoFrame());
    for (const frame of sent) frames?.enqueue(frame);
    await flush();
    expect(onFrame).toHaveBeenCalledTimes(3);
    expect(onFrame.mock.calls[0]?.[1]).toBe(42);
    for (const frame of sent) expect(frame.close).toHaveBeenCalled();
    expect(created).toEqual([null, null, null]);
  });

  it("makes no bitmap while the worker is busy, and resizes for the fallback keeping the aspect", async () => {
    let busy = true;
    const { camera, onFrame } = start(() => !busy);
    for (let i = 0; i < 4; i += 1) frames?.enqueue(videoFrame());
    await flush();
    expect(onFrame).not.toHaveBeenCalled();
    busy = false;
    camera.setInputSize({ width: 480, height: 360 });
    frames?.enqueue(videoFrame(1280, 720));
    frames?.enqueue(videoFrame(1280, 720));
    await flush();
    expect(onFrame).toHaveBeenCalledTimes(1);
    expect(created.at(-1)).toEqual({ resizeWidth: 480, resizeHeight: 270, resizeQuality: "low" });
  });

  it("reports an ended or muted track once, a restored one, and nothing after stop", async () => {
    const { camera, track, onLost, onRestored } = start();
    track.dispatchEvent(new Event("mute"));
    track.dispatchEvent(new Event("mute"));
    expect(onLost).toHaveBeenCalledTimes(1);
    expect(onLost).toHaveBeenCalledWith("muted", 42);
    track.dispatchEvent(new Event("unmute"));
    expect(onRestored).toHaveBeenCalledTimes(1);
    track.dispatchEvent(new Event("ended"));
    expect(onLost).toHaveBeenLastCalledWith("ended", 42);
    camera.stop();
    expect(track.stop).toHaveBeenCalled();
    track.dispatchEvent(new Event("ended"));
    frames?.error(new Error("gone"));
    await flush();
    expect(onLost).toHaveBeenCalledTimes(2);
  });

  it("a reader error is camera.lost with reason error", async () => {
    const { onLost } = start();
    frames?.error(new Error("device lost"));
    await flush();
    expect(onLost).toHaveBeenCalledWith("error", 42);
  });
});
