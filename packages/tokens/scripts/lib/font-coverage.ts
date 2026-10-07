import { brotliDecompressSync, inflateSync } from "node:zlib";

/**
 * Reads which code points a font file can draw, straight from its `cmap` table. Supports WOFF2
 * (what Fontsource ships), WOFF and plain TrueType/OpenType. Also parses the `unicode-range` of
 * the @font-face rules in a Fontsource stylesheet. No dependencies: the decompressors come with Node.
 */

// WOFF2 "known table tags", in the order of the spec (https://www.w3.org/TR/WOFF2/#table_dir_format).
const WOFF2_KNOWN_TAGS = [
  "cmap",
  "head",
  "hhea",
  "hmtx",
  "maxp",
  "name",
  "OS/2",
  "post",
  "cvt ",
  "fpgm",
  "glyf",
  "loca",
  "prep",
  "CFF ",
  "VORG",
  "EBDT",
  "EBLC",
  "gasp",
  "hdmx",
  "kern",
  "LTSH",
  "PCLT",
  "VDMX",
  "vhea",
  "vmtx",
  "BASE",
  "GDEF",
  "GPOS",
  "GSUB",
  "EBSC",
  "JSTF",
  "MATH",
  "CBDT",
  "CBLC",
  "COLR",
  "CPAL",
  "SVG ",
  "sbix",
  "acnt",
  "avar",
  "bdat",
  "bloc",
  "bsln",
  "cvar",
  "fdsc",
  "feat",
  "fmtx",
  "fvar",
  "gvar",
  "hsty",
  "just",
  "lcar",
  "mort",
  "morx",
  "opbd",
  "prop",
  "trak",
  "Zapf",
  "Silf",
  "Glat",
  "Gloc",
  "Feat",
  "Sill",
] as const;

function tagAt(buf: Buffer, offset: number): string {
  return buf.toString("latin1", offset, offset + 4);
}

function readBase128(buf: Buffer, start: number): { value: number; next: number } {
  let value = 0;
  for (let i = 0; i < 5; i += 1) {
    const byte = buf[start + i];
    if (byte === undefined) throw new Error("WOFF2: truncated UIntBase128");
    if (i === 0 && byte === 0x80) throw new Error("WOFF2: UIntBase128 with leading zero");
    value = value * 128 + (byte & 0x7f);
    if ((byte & 0x80) === 0) return { value, next: start + i + 1 };
  }
  throw new Error("WOFF2: UIntBase128 longer than 5 bytes");
}

/** Returns the raw bytes of one table, or undefined when the font has none. */
export function readTable(font: Buffer, wanted: string): Buffer | undefined {
  const signature = tagAt(font, 0);
  if (signature === "wOF2") return readWoff2Table(font, wanted);
  if (signature === "wOFF") return readWoffTable(font, wanted);
  if (signature === "\u0000\u0001\u0000\u0000" || signature === "OTTO" || signature === "true") {
    return readSfntTable(font, wanted);
  }
  throw new Error(`unknown font format (signature ${JSON.stringify(signature)})`);
}

function readSfntTable(font: Buffer, wanted: string): Buffer | undefined {
  const numTables = font.readUInt16BE(4);
  for (let i = 0; i < numTables; i += 1) {
    const rec = 12 + i * 16;
    if (tagAt(font, rec) === wanted) {
      const offset = font.readUInt32BE(rec + 8);
      const length = font.readUInt32BE(rec + 12);
      return font.subarray(offset, offset + length);
    }
  }
  return undefined;
}

function readWoffTable(font: Buffer, wanted: string): Buffer | undefined {
  const numTables = font.readUInt16BE(12);
  for (let i = 0; i < numTables; i += 1) {
    const rec = 44 + i * 20;
    if (tagAt(font, rec) !== wanted) continue;
    const offset = font.readUInt32BE(rec + 4);
    const compLength = font.readUInt32BE(rec + 8);
    const origLength = font.readUInt32BE(rec + 12);
    const data = font.subarray(offset, offset + compLength);
    return compLength < origLength ? inflateSync(data) : data;
  }
  return undefined;
}

function readWoff2Table(font: Buffer, wanted: string): Buffer | undefined {
  const flavor = tagAt(font, 4);
  if (flavor === "ttcf") throw new Error("WOFF2 font collections are not supported");
  const numTables = font.readUInt16BE(12);
  const totalCompressedSize = font.readUInt32BE(20);
  let pos = 48;
  const tables: { tag: string; length: number }[] = [];
  for (let i = 0; i < numTables; i += 1) {
    const flags = font[pos];
    if (flags === undefined) throw new Error("WOFF2: truncated table directory");
    pos += 1;
    const tagIndex = flags & 0x3f;
    const transform = (flags >> 6) & 0x03;
    let tag: string;
    if (tagIndex === 63) {
      tag = tagAt(font, pos);
      pos += 4;
    } else {
      const known = WOFF2_KNOWN_TAGS[tagIndex];
      if (known === undefined) throw new Error(`WOFF2: unknown known-tag index ${tagIndex}`);
      tag = known;
    }
    const orig = readBase128(font, pos);
    pos = orig.next;
    // glyf and loca are transformed unless the version is 3; any other table only with a version other than 0.
    const transformed = tag === "glyf" || tag === "loca" ? transform !== 3 : transform !== 0;
    let length = orig.value;
    if (transformed) {
      const t = readBase128(font, pos);
      pos = t.next;
      length = t.value;
    }
    tables.push({ tag, length });
  }
  const stream = brotliDecompressSync(font.subarray(pos, pos + totalCompressedSize));
  let offset = 0;
  for (const t of tables) {
    if (t.tag === wanted) {
      if (wanted === "glyf" || wanted === "loca" || wanted === "hmtx") {
        throw new Error(`WOFF2: ${wanted} may be transformed; only untransformed tables can be read`);
      }
      return stream.subarray(offset, offset + t.length);
    }
    offset += t.length;
  }
  return undefined;
}

/** Code points mapped to a real glyph (glyph id other than 0) by the best Unicode subtable of `cmap`. */
export function cmapCodePoints(cmap: Buffer): Set<number> {
  const numTables = cmap.readUInt16BE(2);
  const subtables: { platform: number; encoding: number; offset: number }[] = [];
  for (let i = 0; i < numTables; i += 1) {
    const rec = 4 + i * 8;
    subtables.push({
      platform: cmap.readUInt16BE(rec),
      encoding: cmap.readUInt16BE(rec + 2),
      offset: cmap.readUInt32BE(rec + 4),
    });
  }
  const isUnicode = (s: { platform: number; encoding: number }) =>
    s.platform === 0 || (s.platform === 3 && (s.encoding === 1 || s.encoding === 10));
  const result = new Set<number>();
  for (const s of subtables.filter(isUnicode)) {
    const format = cmap.readUInt16BE(s.offset);
    if (format === 4) readFormat4(cmap, s.offset, result);
    else if (format === 12) readFormat12(cmap, s.offset, result);
  }
  return result;
}

function readFormat4(cmap: Buffer, base: number, out: Set<number>): void {
  const segCountX2 = cmap.readUInt16BE(base + 6);
  const segCount = segCountX2 / 2;
  const endCodes = base + 14;
  const startCodes = endCodes + segCountX2 + 2;
  const idDeltas = startCodes + segCountX2;
  const idRangeOffsets = idDeltas + segCountX2;
  for (let i = 0; i < segCount; i += 1) {
    const end = cmap.readUInt16BE(endCodes + i * 2);
    const start = cmap.readUInt16BE(startCodes + i * 2);
    const delta = cmap.readInt16BE(idDeltas + i * 2);
    const rangeOffsetPos = idRangeOffsets + i * 2;
    const rangeOffset = cmap.readUInt16BE(rangeOffsetPos);
    for (let c = start; c <= end && c !== 0xffff; c += 1) {
      let glyph: number;
      if (rangeOffset === 0) {
        glyph = (c + delta) & 0xffff;
      } else {
        const glyphPos = rangeOffsetPos + rangeOffset + (c - start) * 2;
        const raw = cmap.readUInt16BE(glyphPos);
        glyph = raw === 0 ? 0 : (raw + delta) & 0xffff;
      }
      if (glyph !== 0) out.add(c);
    }
  }
}

function readFormat12(cmap: Buffer, base: number, out: Set<number>): void {
  const numGroups = cmap.readUInt32BE(base + 12);
  for (let i = 0; i < numGroups; i += 1) {
    const g = base + 16 + i * 12;
    const start = cmap.readUInt32BE(g);
    const end = cmap.readUInt32BE(g + 4);
    const startGlyph = cmap.readUInt32BE(g + 8);
    for (let c = start; c <= end; c += 1) {
      if (startGlyph + (c - start) !== 0) out.add(c);
    }
  }
}

export function fontCodePoints(font: Buffer): Set<number> {
  const cmap = readTable(font, "cmap");
  if (!cmap) throw new Error("font has no cmap table");
  return cmapCodePoints(cmap);
}

// ---------------------------------------------------------------------------------------------
// @font-face rules

export interface FontFace {
  readonly family: string;
  readonly style: string;
  /** The first url() of `src`, as written in the stylesheet. */
  readonly url: string;
  /** Inclusive [start, end] code point ranges; empty means every code point. */
  readonly ranges: readonly (readonly [number, number])[];
}

/** Parses `U+0000-00FF, U+0131, U+4??` into inclusive ranges. */
export function parseUnicodeRange(value: string): [number, number][] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => {
      const m = /^U\+([0-9A-F?]{1,6})(?:-([0-9A-F]{1,6}))?$/i.exec(part);
      if (!m?.[1]) throw new Error(`bad unicode-range part "${part}"`);
      if (m[1].includes("?")) {
        return [
          Number.parseInt(m[1].replaceAll("?", "0"), 16),
          Number.parseInt(m[1].replaceAll("?", "F"), 16),
        ];
      }
      const start = Number.parseInt(m[1], 16);
      return [start, m[2] ? Number.parseInt(m[2], 16) : start];
    });
}

export function parseFontFaces(css: string): FontFace[] {
  const faces: FontFace[] = [];
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of noComments.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const body = m[1] ?? "";
    const prop = (name: string) =>
      new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, "i").exec(body)?.[1]?.trim();
    const family = prop("font-family")?.replace(/^["']|["']$/g, "");
    const src = prop("src");
    const url = src ? /url\(\s*["']?([^"')]+)["']?\s*\)/.exec(src)?.[1] : undefined;
    if (!family || !url) continue;
    const range = prop("unicode-range");
    faces.push({
      family,
      style: prop("font-style") ?? "normal",
      url,
      ranges: range ? parseUnicodeRange(range) : [],
    });
  }
  return faces;
}

export function faceCovers(face: FontFace, cp: number): boolean {
  return face.ranges.length === 0 || face.ranges.some(([a, b]) => cp >= a && cp <= b);
}
