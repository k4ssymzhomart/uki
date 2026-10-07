// Node-only helpers behind scripts/fetch-models.ts: the list of model files, where each comes from,
// SHA-256 hashing and manifest verification. Tested in test/manifest.test.ts.
import { createHash } from "node:crypto";
import { createReadStream, existsSync, realpathSync } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MODEL_PATHS, ModelManifest, type ModelManifestEntry } from "../src/models.ts";

/** A file to put into the models folder: downloaded from an https URL or copied from an npm package. */
export type ModelSource = { url: string } | { npm: string; file: string };

export interface ModelSpec {
  /** Relative to the models folder. */
  path: string;
  from: ModelSource;
}

const MEDIAPIPE_MODELS = "https://storage.googleapis.com/mediapipe-models";

/**
 * Every file the desktop app ships under resources/models/. Only what the code loads:
 * - tasks-vision: the ES-module loader the detection worker uses (`forVisionTasks(base, true)`) and the
 *   classic SIMD loader as a fallback for a classic worker. The no-SIMD build is left out: Electron 44's
 *   Chromium always has wasm SIMD.
 * - Human: blazeface and faceres, the only two models identity.ts enables.
 * - tesseract.js-core: the three LSTM-only builds (the worker picks one by CPU features).
 */
export const MODEL_SPECS: readonly ModelSpec[] = [
  {
    path: MODEL_PATHS.faceLandmarker,
    from: { url: `${MEDIAPIPE_MODELS}/face_landmarker/face_landmarker/float16/1/face_landmarker.task` },
  },
  {
    path: MODEL_PATHS.objectDetector,
    from: { url: `${MEDIAPIPE_MODELS}/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite` },
  },
  ...[
    "vision_wasm_module_internal.js",
    "vision_wasm_module_internal.wasm",
    "vision_wasm_internal.js",
    "vision_wasm_internal.wasm",
  ].map((name) => ({
    path: `${MODEL_PATHS.visionWasmDir}/${name}`,
    from: { npm: "@mediapipe/tasks-vision", file: `wasm/${name}` },
  })),
  ...["blazeface.json", "blazeface.bin", "faceres.json", "faceres.bin"].map((name) => ({
    path: `${MODEL_PATHS.humanDir}/${name}`,
    from: { npm: "@vladmandic/human", file: `models/${name}` },
  })),
  { path: MODEL_PATHS.tesseractWorker, from: { npm: "tesseract.js", file: "dist/worker.min.js" } },
  ...[
    "tesseract-core-lstm.wasm.js",
    "tesseract-core-simd-lstm.wasm.js",
    "tesseract-core-relaxedsimd-lstm.wasm.js",
  ].map((name) => ({
    path: `${MODEL_PATHS.tesseractCoreDir}/${name}`,
    from: { npm: "tesseract.js-core", file: name },
  })),
  {
    path: `${MODEL_PATHS.tesseractLangDir}/eng.traineddata`,
    from: { url: "https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/eng.traineddata" },
  },
];

export function sourceLabel(from: ModelSource): string {
  return "url" in from ? from.url : `npm:${from.npm}/${from.file}`;
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

export async function describeFile(root: string, path: string, source: string): Promise<ModelManifestEntry> {
  const full = join(root, path);
  const info = await stat(full);
  return { path, bytes: info.size, sha256: await sha256File(full), source };
}

export async function readManifest(file: string): Promise<ModelManifest | null> {
  if (!existsSync(file)) return null;
  return ModelManifest.parse(JSON.parse(await readFile(file, "utf8")));
}

export async function writeManifest(file: string, entries: readonly ModelManifestEntry[]): Promise<void> {
  const manifest: ModelManifest = {
    version: 1,
    files: [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
  };
  await writeFile(file, `${JSON.stringify(ModelManifest.parse(manifest), null, 2)}\n`);
}

export type VerifyProblem =
  | { path: string; problem: "missing" }
  | { path: string; problem: "size"; expected: number; actual: number }
  | { path: string; problem: "sha256"; expected: string; actual: string }
  | { path: string; problem: "unlisted" };

/**
 * Checks every manifest entry against the files under `root`, and that every path in `required` has an
 * entry. Sizes are compared first so a truncated download fails without hashing it.
 */
export async function verifyManifest(
  root: string,
  manifest: ModelManifest,
  required: readonly string[] = [],
): Promise<VerifyProblem[]> {
  const problems: VerifyProblem[] = [];
  const listed = new Set(manifest.files.map((entry) => entry.path));
  for (const path of required) {
    if (!listed.has(path)) problems.push({ path, problem: "unlisted" });
  }
  for (const entry of manifest.files) {
    const full = join(root, entry.path);
    if (!existsSync(full)) {
      problems.push({ path: entry.path, problem: "missing" });
      continue;
    }
    const { size } = await stat(full);
    if (size !== entry.bytes) {
      problems.push({ path: entry.path, problem: "size", expected: entry.bytes, actual: size });
      continue;
    }
    const actual = await sha256File(full);
    if (actual !== entry.sha256) {
      problems.push({ path: entry.path, problem: "sha256", expected: entry.sha256, actual });
    }
  }
  return problems;
}

export function formatProblem(p: VerifyProblem): string {
  switch (p.problem) {
    case "missing":
      return `${p.path}: missing`;
    case "unlisted":
      return `${p.path}: not in manifest.json`;
    case "size":
      return `${p.path}: ${p.actual} bytes, manifest says ${p.expected}`;
    case "sha256":
      return `${p.path}: sha256 ${p.actual}, manifest says ${p.expected}`;
  }
}

/**
 * The directory of an installed package, found the way Node does (each ancestor's node_modules), so it
 * works with pnpm's symlinked layout and for packages that do not export package.json.
 */
export function findPackageDir(name: string, fromDir: string): string {
  let dir = realpathSync(fromDir);
  for (;;) {
    if (basename(dir) !== "node_modules") {
      const candidate = join(dir, "node_modules", name);
      if (existsSync(join(candidate, "package.json"))) return realpathSync(candidate);
    }
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`cannot find package ${name} from ${fromDir}`);
    dir = parent;
  }
}

/** Resolves an npm source: tesseract.js-core is found from tesseract.js, the rest from @uki/detection. */
export function npmSourcePath(detectionDir: string, from: { npm: string; file: string }): string {
  if (from.npm === "tesseract.js-core") {
    const tesseract = findPackageDir("tesseract.js", detectionDir);
    return join(findPackageDir("tesseract.js-core", tesseract), from.file);
  }
  return join(findPackageDir(from.npm, detectionDir), from.file);
}

/** Writes to `<target>.part` and renames on success, so an interrupted run never leaves a half file. */
export async function atomicWrite(target: string, write: (partPath: string) => Promise<void>): Promise<void> {
  await mkdir(dirname(target), { recursive: true });
  const part = `${target}.part`;
  await rm(part, { force: true });
  try {
    await write(part);
    await rename(part, target);
  } catch (error) {
    await rm(part, { force: true });
    throw error;
  }
}

/** packages/detection */
export const DETECTION_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
