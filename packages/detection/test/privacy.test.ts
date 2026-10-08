// "Privacy guarantees enforced in code": image bytes leave the worker only through stills.capture,
// called only by the pipeline for a still the rules engine requested (see pipeline.test.ts for the
// runtime half). This file checks the source half.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "../src");
const sources = readdirSync(SRC)
  .filter((name) => name.endsWith(".ts"))
  .map((name) => ({ name, text: readFileSync(join(SRC, name), "utf8") }));

function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

describe("only the pipeline can make image bytes", () => {
  it("stills.ts is imported by pipeline.ts and nothing else", () => {
    const importers = sources
      .filter(({ text }) => /from\s+["']\.\/stills(\.ts)?["']|import\(\s*["']\.\/stills/.test(text))
      .map(({ name }) => name);
    expect(importers).toEqual(["pipeline.ts"]);
  });

  it("the package barrel exports neither stills nor the pipeline that calls it", () => {
    const index = code(sources.find(({ name }) => name === "index.ts")?.text ?? "");
    expect(index).not.toMatch(/["']\.\/(stills|pipeline|worker)\.ts["']/);
  });

  it("pipeline.ts calls capture only from takeStill, which only runs for due stills", () => {
    const pipeline = code(sources.find(({ name }) => name === "pipeline.ts")?.text ?? "");
    const calls = pipeline.match(/\bcapture\(/g) ?? [];
    expect(calls).toHaveLength(1);
    expect(pipeline).toMatch(/for \(const still of schedule\.due\(at\)\) takeStill\(image, still, at\);/);
    expect(pipeline.match(/takeStill\(/g)).toHaveLength(2); // its definition and that one call
  });

  it("no other source encodes pixels", () => {
    const encoders = /\.convertToBlob\(|\.toBlob\(|\.toDataURL\(|transferToImageBitmap\(/;
    const offenders = sources.filter(({ name, text }) => name !== "stills.ts" && encoders.test(code(text)));
    expect(offenders.map(({ name }) => name)).toEqual([]);
  });

  it("nothing records the camera", () => {
    const recorder = ["Media", "Recorder"].join("");
    expect(sources.filter(({ text }) => text.includes(recorder)).map(({ name }) => name)).toEqual([]);
  });

  it("the worker shuts its network to the models' origin before MediaPipe loads", () => {
    const worker = code(sources.find(({ name }) => name === "worker.ts")?.text ?? "");
    const guard = worker.indexOf("restrictNetwork(");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(worker.indexOf("createFaceTracker({"));
    expect(guard).toBeLessThan(worker.indexOf("createPhoneDetector({"));
  });

  it("no model, wasm or worker URL points at a CDN", () => {
    const cdn = /https?:\/\/(cdn\.jsdelivr\.net|unpkg\.com|storage\.googleapis\.com|cdnjs\.)/;
    expect(sources.filter(({ text }) => cdn.test(code(text))).map(({ name }) => name)).toEqual([]);
  });
});
