import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * A small CSS reader for the flat files this package generates and the plan prints: top-level
 * statements (`@import ...;`) and one level of blocks (`selector { prop: value; }`). Enough to compare
 * declaration by declaration; not a general CSS parser.
 */

export const TOKENS_ROOT = fileURLToPath(new URL("..", import.meta.url));
export const REPO_ROOT = join(TOKENS_ROOT, "..", "..");

export interface CssSheet {
  /** Statements outside blocks, normalised, in order. */
  readonly statements: string[];
  /** Normalised block prelude to its declarations (normalised property to normalised value). */
  readonly blocks: Map<string, Map<string, string>>;
  /** Declarations seen twice in the same block. */
  readonly duplicates: string[];
}

/** Lowercases and drops formatting differences: spaces around `/ , ( )`, quotes in attribute selectors. */
export function normalise(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\s*([/,()])\s*/g, "$1")
    .replace(/\[([a-z-]+)="([^"]*)"\]/g, "[$1=$2]")
    .trim()
    .toLowerCase();
}

export function parseCss(css: string): CssSheet {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const statements: string[] = [];
  const blocks = new Map<string, Map<string, string>>();
  const duplicates: string[] = [];
  let i = 0;
  while (i < text.length) {
    const semi = text.indexOf(";", i);
    const open = text.indexOf("{", i);
    if (open === -1 && semi === -1) {
      if (text.slice(i).trim() !== "") throw new Error(`trailing CSS: ${text.slice(i)}`);
      break;
    }
    if (semi !== -1 && (open === -1 || semi < open)) {
      statements.push(normalise(text.slice(i, semi)));
      i = semi + 1;
      continue;
    }
    const close = text.indexOf("}", open);
    if (close === -1) throw new Error("unclosed block");
    const prelude = normalise(text.slice(i, open));
    const decls = blocks.get(prelude) ?? new Map<string, string>();
    for (const raw of text.slice(open + 1, close).split(";")) {
      if (raw.trim() === "") continue;
      const colon = raw.indexOf(":");
      if (colon === -1) throw new Error(`bad declaration "${raw.trim()}" in ${prelude}`);
      const prop = normalise(raw.slice(0, colon));
      if (decls.has(prop)) duplicates.push(`${prelude} ${prop}`);
      decls.set(prop, normalise(raw.slice(colon + 1)));
    }
    blocks.set(prelude, decls);
    i = close + 1;
  }
  return { statements, blocks, duplicates };
}

/** The ```css block of docs/phase-0-plan.md whose first line names `file`. */
export function planBlock(file: string): string {
  const plan = readFileSync(join(REPO_ROOT, "docs", "phase-0-plan.md"), "utf8");
  for (const m of plan.matchAll(/```css\n([\s\S]*?)```/g)) {
    const body = m[1] ?? "";
    const firstLine = body.split("\n", 1)[0] ?? "";
    if (firstLine.includes(file)) return body;
  }
  throw new Error(`docs/phase-0-plan.md prints no css block for ${file}`);
}

export function readSrc(file: string): string {
  return readFileSync(join(TOKENS_ROOT, "src", file), "utf8");
}

export function block(sheet: CssSheet, prelude: string): Map<string, string> {
  const b = sheet.blocks.get(normalise(prelude));
  if (!b) throw new Error(`no block ${prelude}; have ${[...sheet.blocks.keys()].join(" | ")}`);
  return b;
}
