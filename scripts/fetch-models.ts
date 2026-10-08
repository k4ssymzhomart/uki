// Puts every model, wasm and language file the desktop app loads into apps/desktop/resources/models/
// and records each file's size and SHA-256 in manifest.json there. Run from the repo root:
//   pnpm --filter @uki/detection models              (= tsx scripts/fetch-models.ts)
//   pnpm --filter @uki/detection models:verify       (= tsx scripts/fetch-models.ts --verify)
//
//   (no flag)  fetch what is missing or wrong, then write manifest.json
//   --verify   change nothing; exit 1 when a file is missing or differs from manifest.json
//   --update   accept a new hash for a file whose source changed (otherwise that is an error)
//
// manifest.json is committed and acts as the lock file: a fresh clone downloads each file again and
// refuses one whose hash differs from the manifest. A file whose hash already matches is skipped, so a
// slow connection downloads each file once. Downloads come only from Google's storage.googleapis.com
// mediapipe-models bucket and the tessdata_fast GitHub repository; everything else is copied from
// node_modules.
import { copyFile } from "node:fs/promises";
import { join } from "node:path";
import {
  atomicWrite,
  DESKTOP_MANIFEST,
  DESKTOP_MODELS_DIR,
  DETECTION_DIR,
  describeFile,
  downloadFile,
  formatProblem,
  MODEL_SPECS,
  type ModelSpec,
  npmSourcePath,
  readManifest,
  sha256File,
  sourceLabel,
  verifyManifest,
  writeManifest,
} from "../packages/detection/scripts/model-files.ts";
import type { ModelManifestEntry } from "../packages/detection/src/models.ts";

const MODELS_DIR = DESKTOP_MODELS_DIR;
const MANIFEST = DESKTOP_MANIFEST;

function log(line: string): void {
  process.stdout.write(`${line}\n`);
}

async function obtain(spec: ModelSpec, target: string): Promise<void> {
  if ("url" in spec.from) {
    log(`  download ${spec.from.url}`);
    await downloadFile(spec.from.url, target, { log });
  } else {
    const source = npmSourcePath(DETECTION_DIR, spec.from);
    log(`  copy ${sourceLabel(spec.from)}`);
    await atomicWrite(target, (part) => copyFile(source, part));
  }
}

async function fetchAll(update: boolean): Promise<number> {
  const previous = await readManifest(MANIFEST);
  const known = new Map((previous?.files ?? []).map((entry) => [entry.path, entry]));
  const entries: ModelManifestEntry[] = [];
  let failures = 0;
  for (const spec of MODEL_SPECS) {
    const target = join(MODELS_DIR, spec.path);
    const pinned = known.get(spec.path);
    const source = sourceLabel(spec.from);
    try {
      let hash: string | null = null;
      try {
        hash = await sha256File(target);
      } catch {
        hash = null;
      }
      if (hash !== null && pinned && pinned.sha256 === hash && pinned.source === source) {
        log(`ok    ${spec.path}`);
        entries.push(pinned);
        continue;
      }
      log(`fetch ${spec.path}`);
      await obtain(spec, target);
      const entry = await describeFile(MODELS_DIR, spec.path, source);
      if (pinned && pinned.sha256 !== entry.sha256 && !update) {
        log(
          `  ERROR sha256 ${entry.sha256} differs from manifest.json (${pinned.sha256}); rerun with --update`,
        );
        failures += 1;
        entries.push(pinned);
        continue;
      }
      log(`  ${entry.bytes} bytes, sha256 ${entry.sha256}`);
      entries.push(entry);
    } catch (error) {
      failures += 1;
      log(`  ERROR ${error instanceof Error ? error.message : String(error)}`);
      if (pinned) entries.push(pinned);
    }
  }
  await writeManifest(MANIFEST, entries);
  log(`wrote ${MANIFEST} with ${entries.length} files`);
  return failures;
}

async function verifyAll(): Promise<number> {
  const manifest = await readManifest(MANIFEST);
  if (!manifest) {
    log(`${MANIFEST} is missing; run without --verify first`);
    return 1;
  }
  const problems = await verifyManifest(
    MODELS_DIR,
    manifest,
    MODEL_SPECS.map((spec) => spec.path),
  );
  for (const problem of problems) log(`FAIL  ${formatProblem(problem)}`);
  if (problems.length === 0) {
    const bytes = manifest.files.reduce((sum, entry) => sum + entry.bytes, 0);
    log(`verified ${manifest.files.length} files, ${(bytes / 1048576).toFixed(1)} MB`);
  }
  return problems.length;
}

const args = process.argv.slice(2);
const failures = args.includes("--verify") ? await verifyAll() : await fetchAll(args.includes("--update"));
process.exitCode = failures === 0 ? 0 : 1;
