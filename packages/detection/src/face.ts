// MediaPipe Face Landmarker for the detection worker ("Pipeline" step 2): VIDEO mode, up to 2 faces,
// blendshapes and transformation matrices on, GPU delegate with a CPU fallback. Model and wasm URLs
// are passed in; the desktop app serves them from uki://app/resources/models/.
import { FaceLandmarker } from "@mediapipe/tasks-vision";
import type { Delegate } from "./debug.ts";
import type { FaceDetector, FaceFrame } from "./pipeline.ts";
import { faceSignals, landmarkBox, primaryFaceIndex } from "./signals.ts";
import { monotonic, visionFileset } from "./vision.ts";

export interface FaceTrackerOptions {
  /** Folder of vision_wasm_module_internal.{js,wasm}. */
  wasmBase: string;
  /** face_landmarker.task. */
  modelPath: string;
  /** Tried first; GPU falls back to CPU. Default GPU. */
  delegate?: Delegate;
}

export interface FaceTracker extends FaceDetector {
  close(): void;
}

async function create(options: FaceTrackerOptions, delegate: Delegate): Promise<FaceLandmarker> {
  const fileset = await visionFileset(options.wasmBase);
  return FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: options.modelPath, delegate },
    runningMode: "VIDEO",
    numFaces: 2,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
  });
}

export async function createFaceTracker(options: FaceTrackerOptions): Promise<FaceTracker> {
  let delegate: Delegate = options.delegate ?? "GPU";
  let landmarker: FaceLandmarker;
  try {
    landmarker = await create(options, delegate);
  } catch (error) {
    if (delegate === "CPU") throw error;
    delegate = "CPU";
    landmarker = await create(options, delegate);
  }
  const stamp = monotonic();
  return {
    delegate,
    detect(image: ImageBitmap, at: number): FaceFrame {
      const result = landmarker.detectForVideo(image, stamp(at));
      const index = primaryFaceIndex(result);
      const landmarks = index >= 0 ? result.faceLandmarks[index] : undefined;
      return { signals: faceSignals(result), box: landmarks ? landmarkBox(landmarks) : null };
    },
    close() {
      landmarker.close();
    },
  };
}
