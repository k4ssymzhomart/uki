// Puts the detection worker's files into apps/web/public/models/ for the in-browser demo on /try:
// the Face Landmarker, the Object Detector and tasks-vision's classic build (WEB_DEMO_MODEL_PATHS).
// `pnpm --filter web build` runs it before `next build`, on Vercel too, so the web app serves the models
// itself and never loads one from a CDN at run time. Run it by hand before `next dev`:
//
//   pnpm --filter web models            fetch what is missing or wrong, then verify everything
//   pnpm --filter web models --verify   change nothing; exit 1 when a file is missing or differs
//
// The lock is the desktop's committed apps/desktop/resources/models/manifest.json: each file must have
// the size and SHA-256 recorded there, or the run fails (and with it the build). Where a file comes
// from, in order: public/models/ itself when it already matches; the desktop's models folder when a
// developer ran `pnpm models` and its copy matches; otherwise the source in packages/detection's
// MODEL_SPECS (copied from node_modules, or downloaded from storage.googleapis.com's mediapipe-models).
// Nothing in public/models/ is committed (.gitignore).
import { copyFile, mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  atomicWrite,
  DESKTOP_MANIFEST,
  DESKTOP_MODELS_DIR,
  DETECTION_DIR,
  downloadFile,
  fileMatches,
  formatProblem,
  MODEL_SPECS,
  npmSourcePath,
  pinnedEntries,
  readManifest,
  sourceLabel,
  verifyManifest,
  WEB_DEMO_MODEL_PATHS,
  writeManifest,
} from "../../../packages/detection/scripts/model-files.ts";
import type { ModelManifestEntry } from "../../../packages/detection/src/models.ts";

const WEB_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
/** Served at /models/ by the web app. */
const PUBLIC_MODELS = join(WEB_DIR, "public/models");

function log(line: string): void {
  process.stdout.write(`${line}\n`);
}

async function obtain(entry: ModelManifestEntry): Promise<void> {
  const target = join(PUBLIC_MODELS, entry.path);
  if (await fileMatches(DESKTOP_MODELS_DIR, entry)) {
    log(`  copy apps/desktop/resources/models/${entry.path}`);
    await atomicWrite(target, (part) => copyFile(join(DESKTOP_MODELS_DIR, entry.path), part));
    return;
  }
  const spec = MODEL_SPECS.find((candidate) => candidate.path === entry.path);
  if (!spec) throw new Error(`${entry.path}: not in MODEL_SPECS`);
  if ("url" in spec.from) {
    log(`  download ${spec.from.url}`);
    await downloadFile(spec.from.url, target, { log });
  } else {
    log(`  copy ${sourceLabel(spec.from)}`);
    const source = npmSourcePath(DETECTION_DIR, spec.from);
    await atomicWrite(target, (part) => copyFile(source, part));
  }
}

async function main(verifyOnly: boolean): Promise<number> {
  const manifest = await readManifest(DESKTOP_MANIFEST);
  if (!manifest) {
    log(`${DESKTOP_MANIFEST} is missing`);
    return 1;
  }
  const entries = pinnedEntries(manifest, WEB_DEMO_MODEL_PATHS);
  let failures = 0;
  if (!verifyOnly) {
    await mkdir(PUBLIC_MODELS, { recursive: true });
    for (const entry of entries) {
      if (await fileMatches(PUBLIC_MODELS, entry)) {
        log(`ok    ${entry.path}`);
        continue;
      }
      log(`fetch ${entry.path}`);
      try {
        await obtain(entry);
        if (!(await fileMatches(PUBLIC_MODELS, entry))) {
          await rm(join(PUBLIC_MODELS, entry.path), { force: true });
          throw new Error(`size or sha256 differs from ${DESKTOP_MANIFEST}`);
        }
        log(`  ${entry.bytes} bytes, sha256 ${entry.sha256}`);
      } catch (error) {
        failures += 1;
        log(`  ERROR ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    // The served subset of the lock file, so a deploy can be checked against it.
    await writeManifest(join(PUBLIC_MODELS, "manifest.json"), entries);
  }
  const problems = await verifyManifest(PUBLIC_MODELS, { version: 1, files: entries }, WEB_DEMO_MODEL_PATHS);
  for (const problem of problems) log(`FAIL  ${formatProblem(problem)}`);
  if (problems.length === 0) {
    const bytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
    log(`verified ${entries.length} files in public/models, ${(bytes / 1048576).toFixed(1)} MB`);
  }
  return failures + problems.length;
}

const failures = await main(process.argv.slice(2).includes("--verify"));
process.exitCode = failures === 0 ? 0 : 1;
