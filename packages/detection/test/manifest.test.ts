import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DETECTION_DIR,
  describeFile,
  findPackageDir,
  formatProblem,
  MODEL_SPECS,
  npmSourcePath,
  readManifest,
  sha256File,
  verifyManifest,
  writeManifest,
} from "../scripts/model-files.ts";
import { MODEL_PATHS, ModelManifest, modelUrls } from "../src/models.ts";

describe("manifest verify", () => {
  let dir = "";
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "uki-models-"));
    await writeFile(join(dir, "a.task"), "model a");
    await writeFile(join(dir, "b.wasm"), "wasm b");
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function manifest() {
    const entries = [
      await describeFile(dir, "b.wasm", "npm:x/b.wasm"),
      await describeFile(dir, "a.task", "https://x/a"),
    ];
    await writeManifest(join(dir, "manifest.json"), entries);
    const read = await readManifest(join(dir, "manifest.json"));
    if (!read) throw new Error("no manifest");
    return read;
  }

  it("hashes with SHA-256 and writes entries sorted by path", async () => {
    const m = await manifest();
    expect(m.files.map((entry) => entry.path)).toEqual(["a.task", "b.wasm"]);
    expect(m.files[0]).toEqual({
      path: "a.task",
      bytes: 7,
      sha256: createHash("sha256").update("model a").digest("hex"),
      source: "https://x/a",
    });
    expect(await sha256File(join(dir, "a.task"))).toBe(m.files[0]?.sha256);
    expect(await verifyManifest(dir, m, ["a.task", "b.wasm"])).toEqual([]);
  });

  it("fails on a changed byte, a truncated file, a missing file and an unlisted one", async () => {
    const m = await manifest();
    await writeFile(join(dir, "a.task"), "model A");
    await truncate(join(dir, "b.wasm"), 2);
    let problems = await verifyManifest(dir, m, ["a.task", "b.wasm", "c.tflite"]);
    expect(problems.map((p) => [p.path, p.problem])).toEqual([
      ["c.tflite", "unlisted"],
      ["a.task", "sha256"],
      ["b.wasm", "size"],
    ]);
    expect(problems.map(formatProblem).join("\n")).toMatch(/b\.wasm: 2 bytes, manifest says 6/);
    await rm(join(dir, "a.task"));
    problems = await verifyManifest(dir, m);
    expect(problems.find((p) => p.path === "a.task")?.problem).toBe("missing");
  });

  it("refuses a manifest with a path that climbs out of the folder", () => {
    const bad = { version: 1, files: [{ path: "../x", bytes: 1, sha256: "0".repeat(64), source: "s" }] };
    expect(ModelManifest.safeParse(bad).success).toBe(false);
  });
});

describe("the committed model list", () => {
  const modelsDir = resolve(DETECTION_DIR, "../../apps/desktop/resources/models");

  it("covers every file the code loads", () => {
    const paths = MODEL_SPECS.map((spec) => spec.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toEqual(
      expect.arrayContaining([
        MODEL_PATHS.faceLandmarker,
        MODEL_PATHS.objectDetector,
        `${MODEL_PATHS.visionWasmDir}/vision_wasm_module_internal.js`,
        `${MODEL_PATHS.visionWasmDir}/vision_wasm_module_internal.wasm`,
        `${MODEL_PATHS.humanDir}/blazeface.json`,
        `${MODEL_PATHS.humanDir}/blazeface.bin`,
        `${MODEL_PATHS.humanDir}/faceres.json`,
        `${MODEL_PATHS.humanDir}/faceres.bin`,
        MODEL_PATHS.tesseractWorker,
        `${MODEL_PATHS.tesseractCoreDir}/tesseract-core-simd-lstm.wasm.js`,
        `${MODEL_PATHS.tesseractLangDir}/eng.traineddata`,
      ]),
    );
    for (const spec of MODEL_SPECS) {
      if ("url" in spec.from) {
        expect(spec.from.url).toMatch(
          /^https:\/\/(storage\.googleapis\.com\/mediapipe-models\/|raw\.githubusercontent\.com\/tesseract-ocr\/tessdata_fast\/)/,
        );
      }
    }
  });

  it("finds every npm source in node_modules", () => {
    for (const spec of MODEL_SPECS) {
      if ("npm" in spec.from)
        expect(existsSync(npmSourcePath(DETECTION_DIR, spec.from)), spec.path).toBe(true);
    }
    expect(() => findPackageDir("no-such-package-uki", DETECTION_DIR)).toThrow(/cannot find package/);
  });

  it("manifest.json lists every spec with its source", async () => {
    const m = await readManifest(join(modelsDir, "manifest.json"));
    expect(m).not.toBeNull();
    for (const spec of MODEL_SPECS) {
      const entry = m?.files.find((file) => file.path === spec.path);
      expect(entry, spec.path).toBeDefined();
      expect(entry?.source).toBe(
        "url" in spec.from ? spec.from.url : `npm:${spec.from.npm}/${spec.from.file}`,
      );
    }
  });

  it.skipIf(!existsSync(join(modelsDir, MODEL_PATHS.faceLandmarker)))(
    "the fetched files match manifest.json",
    async () => {
      const m = await readManifest(join(modelsDir, "manifest.json"));
      if (!m) throw new Error("no manifest");
      const problems = await verifyManifest(
        modelsDir,
        m,
        MODEL_SPECS.map((spec) => spec.path),
      );
      expect(problems).toEqual([]);
    },
    60_000,
  );

  it("builds the runtime URLs under one base", () => {
    expect(modelUrls()).toEqual({
      wasmBase: "uki://app/resources/models/wasm",
      faceLandmarker: "uki://app/resources/models/face_landmarker.task",
      objectDetector: "uki://app/resources/models/efficientdet_lite0.tflite",
      humanBase: "uki://app/resources/models/human/",
      tesseract: {
        workerPath: "uki://app/resources/models/tesseract/worker.min.js",
        corePath: "uki://app/resources/models/tesseract/core",
        langPath: "uki://app/resources/models/tesseract/lang",
      },
    });
    expect(modelUrls("http://localhost:5173/models").faceLandmarker).toBe(
      "http://localhost:5173/models/face_landmarker.task",
    );
  });
});
