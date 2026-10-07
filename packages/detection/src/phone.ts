// MediaPipe Object Detector for phones ("Pipeline" step 3): EfficientDet-Lite0 (int8, the CPU model),
// categoryAllowlist ["cell phone"], scoreThreshold 0.5. The pipeline calls it on one frame every 400 ms
// (1 s in the fallback). Model and wasm URLs are passed in.
import { ObjectDetector } from "@mediapipe/tasks-vision";
import { THRESHOLDS } from "@uki/contracts";
import type { Delegate } from "./debug.ts";
import type { PhoneDetector } from "./pipeline.ts";
import { monotonic, visionFileset } from "./vision.ts";

export const PHONE_CATEGORY = "cell phone";

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
    maxResults: 3,
  });
}

/** The best "cell phone" score in a detection result, 0 when none. */
export function bestPhoneScore(result: {
  detections: ReadonlyArray<{ categories: ReadonlyArray<{ categoryName: string; score: number }> }>;
}): number {
  let best = 0;
  for (const detection of result.detections) {
    for (const category of detection.categories) {
      if (category.categoryName === PHONE_CATEGORY && category.score > best) best = category.score;
    }
  }
  return Math.min(1, best);
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
    detect(image: ImageBitmap, at: number): number {
      return bestPhoneScore(detector.detectForVideo(image, stamp(at)));
    },
    close() {
      detector.close();
    },
  };
}
