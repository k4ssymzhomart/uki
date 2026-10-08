/**
 * `pnpm i18n:export`: every student, Üki Lock, email, dashboard and landing string in one sheet for a
 * read-through (P.18). Writes, in docs/i18n/:
 * - strings-review.csv: key, where, en, ru, kk, source, notes; one row per message, sorted by where,
 *   then key.
 * - strings-review-kk.csv: key, where, en, kk, ru, notes; only the rows that have Kazakh.
 * - strings-review.xlsx: the same two tables as the sheets "Russian review" and "Kazakh review".
 * The CSVs are UTF-8 with a byte order mark, so Excel and Numbers read Cyrillic correctly.
 * `--out <dir>` writes somewhere else. Edited cells come back with `pnpm i18n:import <file.csv>`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { I18N_ROOT } from "./build.ts";
import { exportReview, readSources } from "./lib/review.ts";
import { xlsx } from "./lib/xlsx.ts";

export const REPO_ROOT = resolve(I18N_ROOT, "../..");
export const REVIEW_DIR = join(REPO_ROOT, "docs/i18n");

function main(): void {
  const at = process.argv.indexOf("--out");
  const out =
    at >= 0 && process.argv[at + 1]
      ? resolve(process.env.INIT_CWD ?? process.cwd(), process.argv[at + 1] as string)
      : REVIEW_DIR;
  const review = exportReview(readSources(I18N_ROOT));
  mkdirSync(out, { recursive: true });
  const written = [
    ["strings-review.csv", review.full],
    ["strings-review-kk.csv", review.kazakh],
    ["strings-review.xlsx", xlsx(review.sheets)],
  ] as const;
  for (const [name, content] of written) writeFileSync(join(out, name), content);
  const kazakh = review.rows.filter((row) => row.kk.trim() !== "").length;
  const where = new Map<string, number>();
  for (const row of review.rows) where.set(row.where, (where.get(row.where) ?? 0) + 1);
  console.log(
    `@uki/i18n: ${review.rows.length} strings (${[...where].map(([w, n]) => `${w} ${n}`).join(", ")}), ${kazakh} with Kazakh; wrote ${written.map(([name]) => relative(REPO_ROOT, join(out, name))).join(", ")}`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
