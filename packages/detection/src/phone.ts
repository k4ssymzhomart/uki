// MediaPipe Object Detector for phones ("Pipeline" step 3): EfficientDet-Lite0 (int8, the CPU model),
// categoryAllowlist ["cell phone"], scoreThreshold 0.5, at most PHONE_DETECTIONS_MAX results. The
// pipeline calls it on one frame every 400 ms (1 s in the fallback). Model and wasm URLs are passed in.
import { ObjectDetector } from "@mediapipe/tasks-vision";
import { THRESHOLDS, toBox } from "@uki/contracts";
import type { Delegate } from "./debug.ts";
import type { PhoneDetector } from "./pipeline.ts";
import { PHONE_DETECTIONS_MAX, type PhoneDetection } from "./protocol.ts";
import { monotonic, visionFileset } from "./vision.ts";

export const PHONE_CATEGORY = "cell phone";

/** The parts of MediaPipe's DetectionResult this file reads; the real result is assignable to it. */
export interface DetectionResultLike {
  detections: ReadonlyArray<{
    categories: ReadonlyArray<{ categoryName: string; score: number }>;
    /** In pixels of the input image. */
    boundingBox?: { originX: number; originY: number; width: number; height: number };
  }>;
}

export interface PhoneDetectorOptions {
  wasmBase: string;
  /** efficientdet_lite0.tflite. */
  modelPath: string;
  /** Default CPU: the int8 model has no GPU kernels. GPU falls back to CPU. */
  delegate?: Delegate;
}

export interface PhoneDetectorHandle extends PhoneDetector {
  close(): void;
}

async function create(options: PhoneDetectorOptions, delegate: Delegate): Promise<ObjectDetector> {
  const fileset = await visionFileset(options.wasmBase);
  return ObjectDetector.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: options.modelPath, delegate },
    runningMode: "VIDEO",
    categoryAllowlist: [PHONE_CATEGORY],
    scoreThreshold: THRESHOLDS.phone.detectorScore,
    maxResults: PHONE_DETECTIONS_MAX,
  });
}

function phoneScore(detection: DetectionResultLike["detections"][number]): number {
  let best = 0;
  for (const category of detection.categories) {
    if (category.categoryName === PHONE_CATEGORY && category.score > best) best = category.score;
  }
  return Number.isFinite(best) ? Math.min(1, best) : 0;
}

/** The best "cell phone" score in a detection result, 0 when none. */
export function bestPhoneScore(result: DetectionResultLike): number {
  return result.detections.reduce((best, detection) => Math.max(best, phoneScore(detection)), 0);
}

/**
 * The "cell phone" detections of a result, best first, at most PHONE_DETECTIONS_MAX, each with its box
 * normalised to the `width` × `height` input image. A detection without a box is left out.
 */
export function phoneDetections(
  result: DetectionResultLike,
  width: number,
  height: number,
): PhoneDetection[] {
  if (!(width > 0 && height > 0)) return [];
  const found: PhoneDetection[] = [];
  for (const detection of result.detections) {
    const score = phoneScore(detection);
    const pixels = detection.boundingBox;
    if (score <= 0 || !pixels) continue;
    const box = toBox({
      x: pixels.originX / width,
      y: pixels.originY / height,
      width: pixels.width / width,
      height: pixels.height / height,
    });
    if (box) found.push({ box, score });
  }
  return found.sort((a, b) => b.score - a.score).slice(0, PHONE_DETECTIONS_MAX);
}

export async function createPhoneDetector(options: PhoneDetectorOptions): Promise<PhoneDetectorHandle> {
  let delegate: Delegate = options.delegate ?? "CPU";
  let detector: ObjectDetector;
  try {
    detector = await create(options, delegate);
  } catch (error) {
    if (delegate === "CPU") throw error;
    delegate = "CPU";
    detector = await create(options, delegate);
  }
  const stamp = monotonic();
  return {
    delegate,
    detect(image: ImageBitmap, at: number): PhoneDetection[] {
      return phoneDetections(detector.detectForVideo(image, stamp(at)), image.width, image.height);
    },
    close() {
      detector.close();
    },
  };
}
