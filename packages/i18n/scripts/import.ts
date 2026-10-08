/**
 * `pnpm i18n:import <file.csv>`: takes the Russian and Kazakh cells of an edited review sheet
 * (strings-review.csv or strings-review-kk.csv from `pnpm i18n:export`, saved as CSV UTF-8) back into
 * catalog.json and the dashboard*.json files, changing only the cells that differ, then runs
 * `pnpm i18n:build`. English is never imported. The whole sheet is refused, and nothing written, when
 * a key is unknown or repeated, or when an edited string fails a check of the build: a placeholder
 * renamed or dropped, a plural arm the language does not have, broken ICU syntax, an empty cell.
 * `--dry-run` lists the changes and writes nothing.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { I18N_ROOT, runBuild } from "./build.ts";
import { importReview, readSources } from "./lib/review.ts";

const PREVIEW = 70;

function preview(text: string): string {
  const flat = text.replaceAll("\n", " ");
  return flat.length > PREVIEW ? `${flat.slice(0, PREVIEW - 1)}…` : flat;
}

/** Imports the sheet at `path` into `root`; returns the exit code. */
export function runImport(path: string, options: { dryRun?: boolean; root?: string } = {}): number {
  const root = options.root ?? I18N_ROOT;
  const text = readFileSync(path, "utf8");
  if (text.includes("�")) {
    console.error(
      `@uki/i18n: ${path} is not UTF-8. Save it as "CSV UTF-8" (Excel) or export it as CSV with Unicode (UTF-8) (Numbers).`,
    );
    return 1;
  }
  const result = importReview(text, readSources(root));
  for (const notice of result.notices) console.log(`@uki/i18n: ${notice}`);
  if (result.problems.length > 0) {
    const n = result.problems.length;
    console.error(`@uki/i18n: refused ${path}, nothing written; ${n} problem${n === 1 ? "" : "s"}:`);
    for (const problem of result.problems) console.error(`  - ${problem}`);
    return 1;
  }
  for (const change of result.changes) {
    console.log(`  ${change.key} [${change.language}] ${preview(change.from)} -> ${preview(change.to)}`);
  }
  const files = Object.keys(result.files);
  const n = result.changes.length;
  console.log(
    `@uki/i18n: ${n} changed cell${n === 1 ? "" : "s"}${files.length > 0 ? ` in ${files.join(", ")}` : ""}${options.dryRun ? " (dry run, nothing written)" : ""}`,
  );
  if (options.dryRun) return 0;
  for (const [file, content] of Object.entries(result.files)) writeFileSync(join(root, file), content);
  return runBuild({ root });
}

function main(): void {
  const args = process.argv.slice(2);
  const file = args.find((arg) => !arg.startsWith("--"));
  if (!file) {
    console.error("usage: pnpm i18n:import <file.csv> [--dry-run]");
    process.exit(2);
  }
  const code = runImport(resolve(process.env.INIT_CWD ?? process.cwd(), file), {
    dryRun: args.includes("--dry-run"),
  });
  if (code !== 0) process.exit(code);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
