// DetectionRuntime's geometry subscription (Phase F, A3): the live overlay listens once and keeps
// receiving each frame's geometry when 1.2's Check again restarts the worker.
import type { Camera, DetectionGeometry, WorkerLike } from "@uki/detection";
import { describe, expect, it, vi } from "vitest";
import { DetectionRuntime } from "./runtime.ts";

class FakeWorker implements WorkerLike {
  posted: Array<{ type: string }> = [];
  private listener: ((event: MessageEvent<unknown>) => void) | null = null;
  postMessage(message: unknown): void {
    this.posted.push(message as { type: string });
    if ((message as { type: string }).type === "init") {
      queueMicrotask(() => this.emit({ type: "ready", delegate: { face: "GPU", phone: "CPU" } }));
    }
  }
  addEventListener(_type: "message", listener: (event: MessageEvent<unknown>) => void): void {
    this.listener = listener;
  }
  removeEventListener(): void {
    this.listener = null;
  }
  terminate = vi.fn();
  emit(data: unknown): void {
    this.listener?.({ data } as MessageEvent<unknown>);
  }
}

function fakeCamera(): Camera {
  return {
    stream: {} as MediaStream,
    track: {} as MediaStreamTrack,
    source: "track-processor",
    start: vi.fn(),
    setInputSize: vi.fn(),
    stop: vi.fn(),
  };
}

const geometry = (at: number): DetectionGeometry => ({
  at,
  faces: [{ box: { x: 0.3, y: 0.2, width: 0.4, height: 0.5 }, yawDeg: 2, pitchDeg: -6, rollDeg: 1 }],
  phone: null,
});

describe("DetectionRuntime geometry", () => {
  it("passes every frame's geometry to its listeners, across a worker restart, until they stop", async () => {
    const workers: FakeWorker[] = [];
    const onError = vi.fn();
    const runtime = new DetectionRuntime({
      checks: { gaze_s: 2, phone_score: 0.55, face_missing_s: 10, identity: false, lock: false },
      mode: "app",
      handlers: { onError },
      createWorker: () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      },
      openCamera: async () => fakeCamera(),
      checkModels: async () => ({}),
    });
    const seen: number[] = [];
    const stop = runtime.onGeometry((g) => seen.push(g.at));
    await runtime.setPhase("check");
    workers[0]?.emit({ type: "geometry", geometry: geometry(10) });
    expect(seen).toEqual([10]);

    // Check again on 1.2 after the worker died: a new worker, the same listener.
    workers[0]?.emit({ type: "error", stage: "init", message: "context lost" });
    await runtime.setPhase("off");
    await runtime.setPhase("check");
    expect(workers).toHaveLength(2);
    workers[1]?.emit({ type: "geometry", geometry: geometry(20) });
    expect(seen).toEqual([10, 20]);

    stop();
    workers[1]?.emit({ type: "geometry", geometry: geometry(30) });
    expect(seen).toEqual([10, 20]);
    runtime.dispose();
  });
});
