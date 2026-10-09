// TryRuntime with a fake worker and a fake camera: what it asks the worker for (the desktop's worker,
// stills off), the order of its states, and that the camera always goes off again.
import type { Camera, WorkerLike } from "@uki/detection";
import { describe, expect, it, vi } from "vitest";
import type { TryStatus } from "./try-model.ts";
import { type TryDeps, type TryHandlers, TryRuntime } from "./try-runtime.ts";

class FakeWorker implements WorkerLike {
  posted: Array<Record<string, unknown>> = [];
  private listener: ((event: MessageEvent<unknown>) => void) | null = null;
  terminated = false;
  postMessage(message: unknown): void {
    this.posted.push(message as Record<string, unknown>);
  }
  addEventListener(_type: "message", listener: (event: MessageEvent<unknown>) => void): void {
    this.listener = listener;
  }
  removeEventListener(): void {
    this.listener = null;
  }
  terminate(): void {
    this.terminated = true;
  }
  emit(data: unknown): void {
    this.listener?.({ data } as MessageEvent<unknown>);
  }
}

function fakeCamera(): Camera {
  return {
    stream: { id: "stream" } as unknown as MediaStream,
    track: {} as MediaStreamTrack,
    source: "track-processor",
    start: vi.fn(),
    setInputSize: vi.fn(),
    stop: vi.fn(),
  };
}

function setup(overrides: Partial<TryDeps> = {}) {
  const worker = new FakeWorker();
  const camera = fakeCamera();
  const statuses: TryStatus["kind"][] = [];
  const handlers: TryHandlers = {
    onStatus: vi.fn((status: TryStatus) => {
      statuses.push(status.kind);
    }),
    onStream: vi.fn(),
    onDebug: vi.fn(),
    onState: vi.fn(),
    onEvent: vi.fn(),
    onCue: vi.fn(),
  };
  const deps: TryDeps = {
    createWorker: () => worker,
    openCamera: vi.fn(async () => camera),
    modelsBase: () => "https://uki.test/models/",
    supported: () => true,
    now: () => 1_000,
    ...overrides,
  };
  return { worker, camera, handlers, deps, statuses, runtime: new TryRuntime(handlers, deps) };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("the /try runtime", () => {
  it("starts the desktop's worker with stills off and the models of this site, then runs the exam phase", async () => {
    const { worker, camera, handlers, statuses, runtime } = setup();
    const started = runtime.start();
    await flush();
    expect(worker.posted[0]).toMatchObject({
      type: "init",
      mode: "app",
      debug: true,
      stills: false,
      checks: { gaze_s: 2, phone_score: 0.85, face_missing_s: 10 },
      models: {
        wasmBase: "https://uki.test/models/wasm",
        faceLandmarker: "https://uki.test/models/face_landmarker.task",
        objectDetector: "https://uki.test/models/efficientdet_lite0.tflite",
      },
    });
    expect(handlers.onStream).toHaveBeenCalledWith(camera.stream);
    worker.emit({ type: "ready", delegate: { face: "GPU", phone: "CPU" } });
    await started;
    expect(statuses).toEqual(["camera", "models", "running"]);
    expect(camera.start).toHaveBeenCalledOnce();
    expect(worker.posted.at(-1)).toMatchObject({ type: "phase", phase: "exam" });
    expect(runtime.running).toBe(true);

    worker.emit({
      type: "outputs",
      outputs: [
        {
          kind: "event",
          event: {
            id: "e1",
            type: "face.second",
            at: 4_500,
            data: { duration_ms: 1000, faces: 2 },
            frame_count: 3,
          },
        },
        { kind: "cue", cue: "away", on: true },
      ],
    });
    expect(handlers.onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ id: "e1", elapsedMs: 3_500, review: "flag", stills: 3 }),
    );
    expect(handlers.onCue).toHaveBeenCalledWith({ kind: "cue", cue: "away", on: true });

    runtime.stop();
    expect(camera.stop).toHaveBeenCalled();
    expect(worker.terminated).toBe(true);
    expect(handlers.onStream).toHaveBeenLastCalledWith(null);
    expect(runtime.running).toBe(false);
  });

  it("names the camera problem and loads no model", async () => {
    const { worker, runtime, statuses, handlers } = setup({
      openCamera: async () => {
        throw new DOMException("denied", "NotAllowedError");
      },
    });
    await runtime.start();
    expect(statuses).toEqual(["camera", "failed"]);
    expect(handlers.onStatus).toHaveBeenLastCalledWith({ kind: "failed", problem: "denied" });
    expect(worker.posted).toEqual([]);
  });

  it("says when the browser lacks what the demo needs, before asking for the camera", async () => {
    const { runtime, deps, handlers } = setup({ supported: () => false });
    await runtime.start();
    expect(handlers.onStatus).toHaveBeenCalledWith({ kind: "failed", problem: "unsupported" });
    expect(deps.openCamera).not.toHaveBeenCalled();
  });

  it("turns the camera off when the models fail to load", async () => {
    const { worker, camera, runtime, handlers, statuses } = setup();
    const started = runtime.start();
    await flush();
    worker.emit({ type: "error", stage: "init", message: "404" });
    await started;
    expect(statuses).toEqual(["camera", "models", "failed"]);
    expect(handlers.onStatus).toHaveBeenLastCalledWith({ kind: "failed", problem: "models" });
    expect(camera.stop).toHaveBeenCalled();
    expect(handlers.onStream).toHaveBeenLastCalledWith(null);
  });

  it("stops a camera that opens after Stop was pressed", async () => {
    let open: (camera: Camera) => void = () => {};
    const camera = fakeCamera();
    const { runtime, handlers } = setup({
      openCamera: () =>
        new Promise<Camera>((resolve) => {
          open = resolve;
        }),
    });
    const started = runtime.start();
    runtime.stop();
    open(camera);
    await started;
    expect(camera.stop).toHaveBeenCalled();
    expect(handlers.onStream).not.toHaveBeenCalled();
  });

  it("resumes through the worker after the pause", async () => {
    const { worker, runtime } = setup();
    const started = runtime.start();
    await flush();
    worker.emit({ type: "ready", delegate: { face: "CPU", phone: "CPU" } });
    await started;
    const resumed = runtime.resume();
    const request = worker.posted.at(-1);
    expect(request).toMatchObject({ type: "resume" });
    worker.emit({ type: "resumed", requestId: request?.requestId, ok: true });
    await expect(resumed).resolves.toBe(true);
  });
});

describe("the /try runtime's geometry", () => {
  const geometry = (at: number) => ({
    at,
    faces: [{ box: { x: 0.3, y: 0.2, width: 0.4, height: 0.5 }, yawDeg: 2, pitchDeg: -6, rollDeg: 1 }],
    phone: {
      at: at - 30,
      detections: [{ box: { x: 0.55, y: 0.45, width: 0.12, height: 0.25 }, score: 0.71 }],
    },
  });

  it("passes each frame's geometry to the overlay across Stop and Start, and nothing from a stopped run", async () => {
    const workers: FakeWorker[] = [];
    const { runtime } = setup({
      createWorker: () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      },
    });
    const seen: number[] = [];
    const stop = runtime.onGeometry((g) => seen.push(g.at));
    for (const index of [0, 1]) {
      const started = runtime.start();
      await flush();
      workers[index]?.emit({ type: "ready", delegate: { face: "GPU", phone: "CPU" } });
      await started;
      workers[index]?.emit({ type: "geometry", geometry: geometry(100 * (index + 1)) });
      runtime.stop();
      workers[index]?.emit({ type: "geometry", geometry: geometry(999) });
    }
    expect(seen).toEqual([100, 200]);
    stop();
    const started = runtime.start();
    await flush();
    workers[2]?.emit({ type: "ready", delegate: { face: "GPU", phone: "CPU" } });
    await started;
    workers[2]?.emit({ type: "geometry", geometry: geometry(300) });
    expect(seen).toEqual([100, 200]);
    runtime.stop();
  });
});
