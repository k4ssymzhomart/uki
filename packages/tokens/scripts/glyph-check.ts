/**
 * `pnpm --filter @uki/tokens glyphs`: WP 0.1's Kazakh glyph check. Reads the cmap of the font files
 * that @fontsource-variable/geist and geist-mono actually ship and reports, per letter of
 * "ӘҒҚҢӨҰҮҺІ әғқңөұүһі", whether each family draws it. A letter Geist lacks must be drawn by the
 * Inter Variable fallback in src/fonts.css; the check exits 1 when it is not.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { faceCovers, parseFontFaces } from "./lib/font-coverage.ts";
import {
  type FamilyCoverage,
  familyCoverage,
  GEIST,
  GEIST_MONO,
  hex,
  kazakhCodePoints,
  missing,
} from "./lib/glyph-check.ts";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");

function row(c: FamilyCoverage): string[] {
  return c.letters.map((l) => {
    const file = l.drawnBy?.split("/").pop();
    return `  ${l.letter}  ${hex(l.codePoint)}  ${l.drawnBy ? `yes  ${file}` : `NO   (in range of: ${l.inRange.join(", ") || "none"})`}`;
  });
}

function main(): void {
  const codePoints = kazakhCodePoints();
  const reports = [familyCoverage(GEIST, codePoints), familyCoverage(GEIST_MONO, codePoints)];
  for (const r of reports) {
    const lacking = missing(r);
    console.log(
      `${r.family} (${r.pkg}@${r.version}): ${codePoints.length - lacking.length}/${codePoints.length} letters`,
    );
    for (const line of row(r)) console.log(line);
  }

  const geistMissing = missing(reports[0] as FamilyCoverage);
  const monoMissing = missing(reports[1] as FamilyCoverage);
  let ok = true;
  if (geistMissing.length > 0) {
    const fallback = parseFontFaces(readFileSync(join(ROOT, "src/fonts.css"), "utf8")).filter(
      (f) => f.family === "Inter Variable",
    );
    const uncovered = geistMissing.filter((cp) => !fallback.some((f) => faceCovers(f, cp)));
    if (uncovered.length > 0) {
      ok = false;
      console.error(
        `Geist lacks ${uncovered.map(hex).join(" ")} and src/fonts.css has no Inter Variable face for them.`,
      );
    } else {
      console.log(
        `Geist lacks ${geistMissing.length} letters; src/fonts.css draws them with Inter Variable.`,
      );
    }
  }
  if (monoMissing.length > 0) {
    console.log(
      `Geist Mono lacks ${monoMissing.map(hex).join(" ")}: they fall back to ui-monospace. Mono styles hold codes, ids and numbers.`,
    );
  }
  if (!ok) process.exit(1);
  console.log("Kazakh glyph check passed.");
}

main();
