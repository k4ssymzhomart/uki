// Runs a recorded trace through the real pipeline with fake detectors that return the trace's signals,
// a spy in place of stills.capture and a list of posted messages.
import type { ExamMode } from "@uki/contracts";
import { ExamChecks } from "@uki/contracts";
import { vi } from "vitest";
import { createPipeline, type FaceFrame, type Pipeline } from "../../src/pipeline.ts";
import type { WorkerToMain } from "../../src/protocol.ts";
import { NO_FACE } from "../../src/signals.ts";
import { counterIds } from "./replay.ts";
import { type FrameRow, rowToSignal, type TraceFixture } from "./trace.ts";

/** A stand-in ImageBitmap that carries the trace row it was made from. */
export interface FakeBitmap {
  width: number;
  height: number;
  row: FrameRow | null;
  close(): void;
}

export function fakeBitmap(row: FrameRow | null, width = 640, height = 480): ImageBitmap {
  const bitmap: FakeBitmap = { width, height, row, close: vi.fn() };
  return bitmap as unknown as ImageBitmap;
}

export function faceFrameOf(bitmap: ImageBitmap): FaceFrame {
  const row = (bitmap as unknown as FakeBitmap).row;
  if (!row) return { signals: NO_FACE, box: null };
  const signal = rowToSignal(row).signal;
  if (signal.kind !== "frame") return { signals: NO_FACE, box: null };
  const { kind: _kind, ...signals } = signal;
  return { signals, box: signals.faces > 0 ? { x: 0.3, y: 0.2, width: 0.4, height: 0.5 } : null };
}

export interface FakeRun {
  pipeline: Pipeline;
  posted: WorkerToMain[];
  capture: ReturnType<typeof vi.fn<(image: ImageBitmap) => Promise<Blob>>>;
  faceDetect: ReturnType<typeof vi.fn<(image: ImageBitmap, at: number) => FaceFrame>>;
  phoneDetect: ReturnType<typeof vi.fn<(image: ImageBitmap, at: number) => number>>;
  /** Frames handed to capture, as their `at`. */
  capturedAt: number[];
  run(fixture: TraceFixture): void;
  settle(): Promise<void>;
}

export function fakePipeline(
  options: { mode?: ExamMode; phase?: "check" | "exam"; phoneScores?: Map<number, number> } = {},
): FakeRun {
  const posted: WorkerToMain[] = [];
  const capturedAt: number[] = [];
  let currentAt = 0;
  let phoneScores = options.phoneScores ?? new Map<number, number>();
  const capture = vi.fn(async (_image: ImageBitmap) => {
    capturedAt.push(currentAt);
    return new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" });
  });
  const faceDetect = vi.fn((image: ImageBitmap, _at: number) => faceFrameOf(image));
  const phoneDetect = vi.fn((_image: ImageBitmap, at: number) => phoneScores.get(at) ?? 0);
  const pipeline = createPipeline(
    {
      face: { delegate: "GPU", detect: faceDetect },
      phone: { delegate: "CPU", detect: phoneDetect },
      luma: () => ({ mean: 120, std: 30, boxMean: 110 }),
      capture,
      now: () => 0,
    },
    { checks: ExamChecks.parse({}), mode: options.mode ?? "app", debug: true, newId: counterIds() },
    (message) => posted.push(message),
  );
  pipeline.setPhase(options.phase ?? "exam", 0);
  return {
    pipeline,
    posted,
    capture,
    faceDetect,
    phoneDetect,
    capturedAt,
    run(fixture) {
      phoneScores = new Map(
        fixture.signals.filter((row) => row[1] === "p").map((row) => [row[0], row[2] as number]),
      );
      for (const row of fixture.signals) {
        const { at, signal } = rowToSignal(row);
        currentAt = at;
        if (row[1] === "f") pipeline.frame(fakeBitmap(row), at);
        else if (signal.kind === "camera") pipeline.camera(signal, at);
      }
    },
    async settle() {
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
  };
}

export function eventsOf(posted: WorkerToMain[]) {
  return posted.flatMap((message) =>
    message.type === "outputs"
      ? message.outputs.flatMap((output) => (output.kind === "event" ? [output.event] : []))
      : [],
  );
}

export function stillsOf(posted: WorkerToMain[]) {
  return posted.flatMap((message) => (message.type === "still" ? [message] : []));
}
