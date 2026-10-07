import { describe, expect, it } from "vitest";
import { fontFallback } from "../scripts/build.ts";
import { faceCovers, parseFontFaces, parseUnicodeRange } from "../scripts/lib/font-coverage.ts";
import { generateFontsCss } from "../scripts/lib/generate.ts";
import {
  familyCoverage,
  GEIST,
  GEIST_MONO,
  KAZAKH_LETTERS,
  kazakhCodePoints,
  missing,
} from "../scripts/lib/glyph-check.ts";

describe("Kazakh glyph check (WP 0.1)", () => {
  const codePoints = kazakhCodePoints();

  it("checks the 18 letters of ӘҒҚҢӨҰҮҺІ әғқңөұүһі", () => {
    expect(KAZAKH_LETTERS).toBe("ӘҒҚҢӨҰҮҺІ әғқңөұүһі");
    expect(codePoints).toHaveLength(18);
  });

  it("finds every letter in the Geist files Fontsource ships", () => {
    const geist = familyCoverage(GEIST, codePoints);
    expect(missing(geist)).toEqual([]);
    // І і Ұ ұ sit in the cyrillic subset; the other fourteen in cyrillic-ext.
    const byFile = new Set(geist.letters.map((l) => l.drawnBy?.split("/").pop()));
    expect(byFile).toEqual(
      new Set(["geist-cyrillic-ext-wght-normal.woff2", "geist-cyrillic-wght-normal.woff2"]),
    );
  });

  it("finds every letter in the Geist Mono files", () => {
    expect(missing(familyCoverage(GEIST_MONO, codePoints))).toEqual([]);
  });

  it("needs no Inter fallback, so fonts.css only imports Geist", () => {
    expect(fontFallback()).toBeNull();
  });

  it("would add an Inter Variable face for exactly the missing letters", () => {
    const css = generateFontsCss({
      codePoints: [0x4d9, 0x4d8, 0x492],
      url: "../node_modules/@fontsource-variable/inter/files/inter-cyrillic-ext-wght-normal.woff2",
    });
    const [face] = parseFontFaces(css);
    expect(face?.family).toBe("Inter Variable");
    expect(face?.ranges).toEqual([
      [0x492, 0x492],
      [0x4d8, 0x4d9],
    ]);
    expect(face && faceCovers(face, 0x49a)).toBe(false);
  });
});

describe("unicode-range parsing", () => {
  it("reads single points, ranges and wildcards", () => {
    expect(parseUnicodeRange("U+0460-052F,U+20B4, U+4??")).toEqual([
      [0x460, 0x52f],
      [0x20b4, 0x20b4],
      [0x400, 0x4ff],
    ]);
  });
});
