// The detection worker entry. The desktop renderer starts it as a MODULE worker:
//
//   // apps/desktop/src/renderer/detection.worker.ts
//   import "@uki/detection/worker";
//
//   // renderer
//   const worker = new Worker(new URL("./detection.worker.ts", import.meta.url), { type: "module" });
//   const detection = createDetectionClient(worker, handlers);
//
// MediaPipe runs here through vision.ts, which makes tasks-vision 1.1 load its ES-module wasm loader in a
// module worker (see the comment there). Messages are the Zod schemas in protocol.ts. Image bytes leave
// this worker only as stills from pipeline.ts, and its fetch reaches only the models' origin
// (network-guard.ts: tasks-vision's usage logs to Google are refused).
import type { Delegate } from "./debug.ts";
import { createFaceTracker, type FaceTracker } from "./face.ts";
import { restrictNetwork } from "./network-guard.ts";
import { createPhoneDetector, type PhoneDetectorHandle } from "./phone.ts";
import { createPipeline, type Pipeline } from "./pipeline.ts";
import { MainToWorker, type WorkerToMain } from "./protocol.ts";
import { type Box, type LumaStats, lumaStats } from "./signals.ts";

interface WorkerScope {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void;
  close(): void;
}

const scope = globalThis as unknown as WorkerScope;

/** Frame errors are reported at most this often, so a broken GPU context does not flood the renderer. */
const FRAME_ERROR_INTERVAL_MS = 1_000;
/** The camera row samples luma on a copy this small. */
const LUMA_WIDTH = 64;
const LUMA_HEIGHT = 48;

let pipeline: Pipeline | null = null;
let face: FaceTracker | null = null;
let phone: PhoneDetectorHandle | null = null;
let lastFrameErrorAt = Number.NEGATIVE_INFINITY;
let lumaContext: OffscreenCanvasRenderingContext2D | null = null;

function post(message: WorkerToMain): void {
  scope.postMessage(message);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sampleLuma(image: ImageBitmap, box: Box | null): LumaStats {
  if (!lumaContext) {
    lumaContext = new OffscreenCanvas(LUMA_WIDTH, LUMA_HEIGHT).getContext("2d", { willReadFrequently: true });
  }
  if (!lumaContext) return { mean: 0, std: 0, boxMean: null };
  lumaContext.drawImage(image, 0, 0, LUMA_WIDTH, LUMA_HEIGHT);
  const pixels = lumaContext.getImageData(0, 0, LUMA_WIDTH, LUMA_HEIGHT).data;
  return lumaStats(pixels, LUMA_WIDTH, LUMA_HEIGHT, box);
}

function closeIfBitmap(raw: unknown): void {
  const bitmap = (raw as { bitmap?: { close?: unknown } } | null)?.bitmap;
  if (bitmap && typeof bitmap.close === "function") (bitmap as ImageBitmap).close();
}

function dispose(): void {
  face?.close();
  phone?.close();
  face = null;
  phone = null;
  pipeline = null;
}

async function handle(raw: unknown): Promise<void> {
  const parsed = MainToWorker.safeParse(raw);
  if (!parsed.success) {
    closeIfBitmap(raw);
    post({ type: "error", stage: "message", message: parsed.error.message });
    return;
  }
  const msg = parsed.data;
  switch (msg.type) {
    case "init": {
      if (pipeline || face) {
        post({ type: "error", stage: "init", message: "already initialised" });
        return;
      }
      // Before MediaPipe loads: its usage logs to Google are refused, the model files are not.
      restrictNetwork([msg.models.wasmBase, msg.models.faceLandmarker, msg.models.objectDetector]);
      try {
        face = await createFaceTracker({
          wasmBase: msg.models.wasmBase,
          modelPath: msg.models.faceLandmarker,
          delegate: msg.delegate.face,
        });
        phone = await createPhoneDetector({
          wasmBase: msg.models.wasmBase,
          modelPath: msg.models.objectDetector,
          delegate: msg.delegate.phone,
        });
        pipeline = createPipeline(
          { face, phone, luma: sampleLuma },
          { checks: msg.checks, mode: msg.mode, debug: msg.debug, stills: msg.stills },
          post,
        );
        const phoneDelegate: Delegate = phone.delegate;
        post({ type: "ready", delegate: { face: face.delegate, phone: phoneDelegate } });
      } catch (error) {
        dispose();
        post({ type: "error", stage: "init", message: message(error) });
      }
      return;
    }
    case "frame": {
      try {
        pipeline?.frame(msg.bitmap, msg.at);
      } catch (error) {
        if (msg.at - lastFrameErrorAt >= FRAME_ERROR_INTERVAL_MS) {
          lastFrameErrorAt = msg.at;
          post({ type: "error", stage: "frame", message: message(error) });
        }
      } finally {
        msg.bitmap.close();
        post({ type: "frame-done", at: msg.at });
      }
      return;
    }
    case "camera":
      pipeline?.camera(
        msg.state === "lost"
          ? { kind: "camera", state: "lost", reason: msg.reason }
          : { kind: "camera", state: "ok" },
        msg.at,
      );
      return;
    case "phase":
      pipeline?.setPhase(msg.phase, msg.at);
      return;
    case "resume":
      post({ type: "resumed", requestId: msg.requestId, ok: pipeline?.resume(msg.at) ?? false });
      return;
    case "dispose":
      dispose();
      scope.close();
      return;
  }
}

scope.addEventListener("message", (event) => {
  void handle(event.data);
});
