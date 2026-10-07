// The files the guards read: everything git tracks or would track (untracked files that .gitignore
// does not exclude), so build output, node_modules and model binaries are never scanned. Without git
// (an exported tarball) it walks the tree with a fixed ignore list.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const WALK_IGNORE = new Set([
  ".git",
  "node_modules",
  "dist",
  "out",
  ".next",
  ".output",
  ".wxt",
  ".turbo",
  "coverage",
  "release",
  "playwright-report",
  "test-results",
  ".figma-cache",
]);

function walk(root: string, dir: string, files: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (WALK_IGNORE.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(root, full, files);
    else if (entry.isFile()) files.push(relative(root, full).split(sep).join("/"));
  }
}

/** Repository-relative paths with forward slashes, sorted. */
export function repositoryFiles(root: string): string[] {
  try {
    const out = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const files = out
      .split("\0")
      .filter(Boolean)
      // A tracked file deleted in the working tree is not there to read.
      .filter((path) => existsSync(join(root, path)) && statSync(join(root, path)).isFile());
    return [...new Set(files)].sort();
  } catch {
    const files: string[] = [];
    walk(root, root, files);
    return files.sort();
  }
}
