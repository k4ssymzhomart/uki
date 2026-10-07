// The shape every repository guard shares, plus helpers to report a match by line and column.

export interface Violation {
  file: string;
  line: number;
  column: number;
  rule: string;
  message: string;
  excerpt: string;
}

export interface Guard {
  /** Short id printed with each violation, e.g. "no-media-recorder". */
  id: string;
  /** What the guard protects, for the summary line. */
  title: string;
  /** True for repository-relative paths (forward slashes) this guard reads. */
  applies(path: string): boolean;
  check(path: string, text: string): Violation[];
}

/** 1-based line and column of `index` in `text`. */
export function position(text: string, index: number): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < index && i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) {
      line += 1;
      lineStart = i + 1;
    }
  }
  return { line, column: index - lineStart + 1 };
}

/** The trimmed source line that holds `index`, cut to 160 characters. */
export function lineAt(text: string, index: number): string {
  const start = text.lastIndexOf("\n", index - 1) + 1;
  const end = text.indexOf("\n", index);
  const line = text.slice(start, end === -1 ? undefined : end).trim();
  return line.length > 160 ? `${line.slice(0, 157)}...` : line;
}

export function violation(
  file: string,
  text: string,
  index: number,
  rule: string,
  message: string,
): Violation {
  const { line, column } = position(text, index);
  return { file, line, column, rule, message, excerpt: lineAt(text, index) };
}

/**
 * `text` with JavaScript comments replaced by spaces (newlines kept), so a pattern never matches a
 * comment and every index still points at the same line and column. String and template literals are
 * skipped intact, so `"https://…"` is not taken for a comment.
 */
export function maskComments(text: string): string {
  const out = text.split("");
  let i = 0;
  const blank = (from: number, to: number) => {
    for (let k = from; k < to && k < out.length; k += 1) {
      if (out[k] !== "\n") out[k] = " ";
    }
  };
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if (c === "/" && next === "/") {
      const end = text.indexOf("\n", i);
      const stop = end === -1 ? text.length : end;
      blank(i, stop);
      i = stop;
    } else if (c === "/" && next === "*") {
      const end = text.indexOf("*/", i + 2);
      const stop = end === -1 ? text.length : end + 2;
      blank(i, stop);
      i = stop;
    } else if (c === '"' || c === "'" || c === "`") {
      i += 1;
      while (i < text.length && text[i] !== c) {
        if (text[i] === "\\") i += 1;
        else if (c !== "`" && text[i] === "\n") break;
        i += 1;
      }
      i += 1;
    } else {
      i += 1;
    }
  }
  return out.join("");
}

/** Matches `path` against simple globs: `**` (any depth), `*` (within a segment), literal text. */
export function globToRegExp(glob: string): RegExp {
  let source = "";
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i] ?? "";
    if (c === "*" && glob[i + 1] === "*") {
      const slash = glob[i + 2] === "/";
      source += slash ? "(?:.*/)?" : ".*";
      i += slash ? 2 : 1;
    } else if (c === "*") {
      source += "[^/]*";
    } else {
      source += c.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${source}$`);
}

export function matchesAny(path: string, globs: readonly RegExp[]): boolean {
  return globs.some((glob) => glob.test(path));
}
