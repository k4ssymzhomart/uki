import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { faceCovers, fontCodePoints, parseFontFaces } from "./font-coverage.ts";

/** The Kazakh letters that Russian Cyrillic lacks, upper and lower case (plan: Fonts, icons and art). */
export const KAZAKH_LETTERS = "ӘҒҚҢӨҰҮҺІ әғқңөұүһі";

export function kazakhCodePoints(): number[] {
  return [...KAZAKH_LETTERS].filter((ch) => ch.trim() !== "").map((ch) => ch.codePointAt(0) as number);
}

export interface FontPackage {
  /** npm package, for example "@fontsource-variable/geist". */
  readonly pkg: string;
  /** The family name its stylesheet declares, for example "Geist Variable". */
  readonly family: string;
}

export const GEIST: FontPackage = { pkg: "@fontsource-variable/geist", family: "Geist Variable" };
export const GEIST_MONO: FontPackage = {
  pkg: "@fontsource-variable/geist-mono",
  family: "Geist Mono Variable",
};
export const INTER: FontPackage = { pkg: "@fontsource-variable/inter", family: "Inter Variable" };

export interface LetterCoverage {
  readonly letter: string;
  readonly codePoint: number;
  /** Subset files whose @font-face unicode-range includes the letter. */
  readonly inRange: readonly string[];
  /** The subset file that both lists the letter in its unicode-range and has a glyph for it. */
  readonly drawnBy: string | null;
}

export interface FamilyCoverage {
  readonly pkg: string;
  readonly family: string;
  readonly version: string;
  /** Absolute path of the package directory. */
  readonly dir: string;
  readonly letters: readonly LetterCoverage[];
}

const require = createRequire(import.meta.url);

/** Finds an installed package's directory from packages/tokens. */
export function packageDir(pkg: string): string {
  return dirname(require.resolve(`${pkg}/package.json`));
}

/**
 * Checks each code point against the actual font files a package ships: the default stylesheet
 * (index.css, the one `@import "<pkg>"` loads) picks the subset by unicode-range, and the subset's
 * cmap must map the code point to a glyph. That is the same test a browser makes.
 */
export function familyCoverage(font: FontPackage, codePoints: readonly number[]): FamilyCoverage {
  const dir = packageDir(font.pkg);
  const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { version?: string };
  const faces = parseFontFaces(readFileSync(join(dir, "index.css"), "utf8")).filter(
    (f) => f.family === font.family && f.style === "normal",
  );
  if (faces.length === 0) throw new Error(`${font.pkg}/index.css declares no normal "${font.family}" face`);
  const cmaps = new Map<string, Set<number>>();
  const cmapOf = (url: string) => {
    let set = cmaps.get(url);
    if (!set) {
      set = fontCodePoints(readFileSync(join(dir, url)));
      cmaps.set(url, set);
    }
    return set;
  };
  const letters = codePoints.map((cp) => {
    const inRange = faces.filter((f) => faceCovers(f, cp));
    const drawnBy = inRange.find((f) => cmapOf(f.url).has(cp));
    return {
      letter: String.fromCodePoint(cp),
      codePoint: cp,
      inRange: inRange.map((f) => f.url),
      drawnBy: drawnBy ? drawnBy.url : null,
    };
  });
  return { pkg: font.pkg, family: font.family, version: manifest.version ?? "unknown", dir, letters };
}

export function missing(coverage: FamilyCoverage): number[] {
  return coverage.letters.filter((l) => l.drawnBy === null).map((l) => l.codePoint);
}

/**
 * The url() of the Inter Variable subset file that draws every given code point, relative to
 * packages/tokens/src. It goes through the package's own node_modules link, which pnpm always
 * creates for a direct dependency, so the path does not carry a store version.
 */
export function interFallbackUrl(codePoints: readonly number[], tokensRoot: string): string {
  const coverage = familyCoverage(INTER, codePoints);
  const files = new Set(coverage.letters.map((l) => l.drawnBy));
  const [file] = [...files];
  if (files.size !== 1 || !file) {
    throw new Error(`Inter Variable does not draw these letters from one subset: ${[...files].join(", ")}`);
  }
  const relativeFile = file.replace(/^\.\//, "");
  if (!existsSync(join(tokensRoot, "node_modules", INTER.pkg, relativeFile))) {
    throw new Error(`${INTER.pkg} is not linked in packages/tokens/node_modules`);
  }
  return `../node_modules/${INTER.pkg}/${relativeFile}`;
}

export function hex(cp: number): string {
  return `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
}
