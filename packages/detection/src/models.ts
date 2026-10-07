// Where the model, wasm and language files live under apps/desktop/resources/models/, and the URLs the
// detection code loads them from. Browser-safe: no Node imports. The files are put there by
// `pnpm --filter @uki/detection models` (scripts/fetch-models.ts), which also writes manifest.json.
import { z } from "zod";

/** Paths relative to the models folder. Directories have no trailing slash. */
export const MODEL_PATHS = {
  /** MediaPipe Face Landmarker, float16. */
  faceLandmarker: "face_landmarker.task",
  /** MediaPipe Object Detector, EfficientDet-Lite0 int8 (the CPU model in Google's latency table). */
  objectDetector: "efficientdet_lite0.tflite",
  /** tasks-vision wasm: the ES-module loader the detection worker uses, plus the classic loader. */
  visionWasmDir: "wasm",
  /** Human: blazeface (face detector) and faceres (face description) only. */
  humanDir: "human",
  /** tesseract.js browser worker script. */
  tesseractWorker: "tesseract/worker.min.js",
  /** tesseract.js-core LSTM builds; the worker picks relaxed SIMD, SIMD or plain. */
  tesseractCoreDir: "tesseract/core",
  /** eng.traineddata (tessdata_fast). */
  tesseractLangDir: "tesseract/lang",
} as const;

/** Where the desktop app serves resources/models/ (the privileged uki:// scheme, see the plan's Hardening). */
export const DEFAULT_MODELS_BASE = "uki://app/resources/models/";

export interface ModelUrls {
  /** Folder holding vision_wasm_module_internal.{js,wasm}; FilesetResolver wants no trailing slash. */
  wasmBase: string;
  faceLandmarker: string;
  objectDetector: string;
  /** Human's `modelBasePath`, with a trailing slash. */
  humanBase: string;
  tesseract: { workerPath: string; corePath: string; langPath: string };
}

/** Every URL the detection code loads, under one base (default `uki://app/resources/models/`). */
export function modelUrls(base: string = DEFAULT_MODELS_BASE): ModelUrls {
  const root = base.endsWith("/") ? base : `${base}/`;
  return {
    wasmBase: `${root}${MODEL_PATHS.visionWasmDir}`,
    faceLandmarker: `${root}${MODEL_PATHS.faceLandmarker}`,
    objectDetector: `${root}${MODEL_PATHS.objectDetector}`,
    humanBase: `${root}${MODEL_PATHS.humanDir}/`,
    tesseract: {
      workerPath: `${root}${MODEL_PATHS.tesseractWorker}`,
      corePath: `${root}${MODEL_PATHS.tesseractCoreDir}`,
      langPath: `${root}${MODEL_PATHS.tesseractLangDir}`,
    },
  };
}

const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);

export const ModelManifestEntry = z.strictObject({
  /** Relative to the models folder, forward slashes. */
  path: z
    .string()
    .min(1)
    .regex(/^(?!\/)(?!.*\.\.)[A-Za-z0-9_./-]+$/),
  bytes: z.number().int().nonnegative(),
  sha256: Sha256,
  /** Where the file came from: an https URL or `npm:<package>/<file>`. */
  source: z.string().min(1),
});
export type ModelManifestEntry = z.infer<typeof ModelManifestEntry>;

/** apps/desktop/resources/models/manifest.json. Entries are sorted by path. */
export const ModelManifest = z.strictObject({
  version: z.literal(1),
  files: z.array(ModelManifestEntry),
});
export type ModelManifest = z.infer<typeof ModelManifest>;
