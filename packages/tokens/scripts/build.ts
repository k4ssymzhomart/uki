/**
 * `pnpm tokens` (pnpm --filter @uki/tokens build): turns figma-variables.json into
 * src/tokens.css, src/theme.css, src/type.css, src/fonts.css and src/tokens.json.
 * `--check` writes nothing and exits 1 when a generated file is out of date.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFigmaVariables } from "./lib/figma-variables.ts";
import {
  buildModel,
  type FontFallback,
  generateFontsCss,
  generateThemeCss,
  generateTokensCss,
  generateTokensJson,
  generateTypeCss,
} from "./lib/generate.ts";
import { familyCoverage, GEIST, interFallbackUrl, kazakhCodePoints, missing } from "./lib/glyph-check.ts";

export const TOKENS_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The Kazakh letters Geist cannot draw, and the Inter Variable file that draws them; null when Geist has them all. */
export function fontFallback(root: string = TOKENS_ROOT): FontFallback | null {
  const lacking = missing(familyCoverage(GEIST, kazakhCodePoints()));
  if (lacking.length === 0) return null;
  return { codePoints: lacking, url: interFallbackUrl(lacking, root) };
}

/** Every generated file, by path relative to packages/tokens. */
export function generateAll(root: string = TOKENS_ROOT): Record<string, string> {
  const vars = parseFigmaVariables(JSON.parse(readFileSync(join(root, "figma-variables.json"), "utf8")));
  const model = buildModel(vars);
  return {
    "src/tokens.css": generateTokensCss(model),
    "src/theme.css": generateThemeCss(model),
    "src/type.css": generateTypeCss(),
    "src/fonts.css": generateFontsCss(fontFallback(root)),
    "src/tokens.json": generateTokensJson(model),
  };
}

function main(): void {
  const check = process.argv.includes("--check");
  const files = generateAll();
  const stale: string[] = [];
  for (const [path, content] of Object.entries(files)) {
    const target = join(TOKENS_ROOT, path);
    let current: string | null = null;
    try {
      current = readFileSync(target, "utf8");
    } catch {
      current = null;
    }
    if (current === content) continue;
    stale.push(path);
    if (!check) writeFileSync(target, content);
  }
  if (check && stale.length > 0) {
    console.error(`@uki/tokens: out of date, run pnpm tokens: ${stale.join(", ")}`);
    process.exit(1);
  }
  console.log(`@uki/tokens: ${stale.length === 0 ? "up to date" : `wrote ${stale.join(", ")}`}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
