// `pnpm guards`: the repository checks that Biome cannot express, run by `pnpm check` and CI.
//   no-media-recorder            MediaRecorder never appears in code (Privacy guarantees enforced in code)
//   no-colour-or-size-literals   component files use token classes only (Conventions)
//   frames-bucket-only           uploads go only to the private frames bucket (CLAUDE.md)
// The JSX-text rule (every string is an i18n key) is the Biome GritQL plugin in biome-plugins/.
// Exit 1 with file:line:column for each problem.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT } from "../lib/paths.ts";
import { colourLiteralsGuard } from "./colour-literals.ts";
import { repositoryFiles } from "./files.ts";
import type { Guard, Violation } from "./guard.ts";
import { mediaRecorderGuard } from "./media-recorder.ts";
import { storageBucketsGuard } from "./storage-buckets.ts";

export const GUARDS: readonly Guard[] = [mediaRecorderGuard, colourLiteralsGuard, storageBucketsGuard];

const MAX_BYTES = 2 * 1024 * 1024;

export function runGuards(
  root: string,
  files: readonly string[],
): { violations: Violation[]; scanned: number } {
  const violations: Violation[] = [];
  let scanned = 0;
  for (const file of files) {
    const guards = GUARDS.filter((guard) => guard.applies(file));
    if (guards.length === 0) continue;
    let text: string;
    try {
      const buffer = readFileSync(join(root, file));
      if (buffer.length > MAX_BYTES || buffer.includes(0)) continue;
      text = buffer.toString("utf8");
    } catch {
      continue;
    }
    scanned += 1;
    for (const guard of guards) violations.push(...guard.check(file, text));
  }
  return { violations, scanned };
}

function main(): void {
  const { violations, scanned } = runGuards(ROOT, repositoryFiles(ROOT));
  for (const v of violations) {
    process.stdout.write(`${v.file}:${v.line}:${v.column}  ${v.rule}  ${v.message}\n    > ${v.excerpt}\n`);
  }
  const titles = GUARDS.map((guard) => guard.title).join("; ");
  if (violations.length > 0) {
    process.stdout.write(`\nguards: ${violations.length} problem(s) in ${scanned} files (${titles})\n`);
    process.exit(1);
  }
  process.stdout.write(`guards: ${scanned} files clean (${titles})\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
