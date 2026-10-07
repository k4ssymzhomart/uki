/**
 * `pnpm i18n:build` (pnpm --filter @uki/i18n build): catalog.json and every dashboard*.json to
 * messages/en.json, kk.json and ru.json. Exits 1 and writes nothing when any message has a problem.
 * `--check` writes nothing and also exits 1 when a messages file is out of date.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildMessages, LANGUAGES, serialise } from "./lib/catalog.ts";

export const I18N_ROOT = fileURLToPath(new URL("..", import.meta.url));

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(join(I18N_ROOT, file), "utf8"));
}

/**
 * The dashboard string files: dashboard.json plus any dashboard-<part>.json next to it (for example
 * dashboard-wall.json), so each dashboard feature keeps its own file. Sorted, so the merge is stable.
 */
export const DASHBOARD_FILE = /^dashboard(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?\.json$/;

export function dashboardFiles(root: string = I18N_ROOT): string[] {
  return readdirSync(root)
    .filter((file) => DASHBOARD_FILE.test(file))
    .sort();
}

/**
 * Merges the dashboard files into one flat map for buildMessages. A file that is not a JSON object,
 * or a key that two files both define, is a problem; values are checked later by buildMessages.
 */
export function mergeDashboard(files: readonly { file: string; data: unknown }[]): {
  merged: Record<string, unknown>;
  problems: string[];
} {
  const merged: Record<string, unknown> = {};
  const owner = new Map<string, string>();
  const problems: string[] = [];
  for (const { file, data } of files) {
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      problems.push(`${file}: must be an object of dashboard.* keys to English text`);
      continue;
    }
    for (const [key, value] of Object.entries(data)) {
      const first = owner.get(key);
      if (first !== undefined) {
        problems.push(`${file}: ${key}: duplicate key, already in ${first}`);
        continue;
      }
      owner.set(key, file);
      merged[key] = value;
    }
  }
  return { merged, problems };
}

/** The three messages files, by path relative to packages/i18n, or the problems that stop the build. */
export function generateAll(root: string = I18N_ROOT): {
  files: Record<string, string> | null;
  problems: readonly string[];
} {
  const read = (file: string) => JSON.parse(readFileSync(join(root, file), "utf8")) as unknown;
  const dashboard = mergeDashboard(dashboardFiles(root).map((file) => ({ file, data: read(file) })));
  const result = buildMessages(read("catalog.json"), dashboard.merged);
  const problems = [...dashboard.problems, ...result.problems];
  if (!result.messages || problems.length > 0) return { files: null, problems };
  const messages = result.messages;
  return {
    files: Object.fromEntries(LANGUAGES.map((l) => [`messages/${l}.json`, serialise(messages[l])])),
    problems: [],
  };
}

function main(): void {
  const check = process.argv.includes("--check");
  const { files, problems } = generateAll();
  if (!files) {
    console.error(`@uki/i18n: ${problems.length} problem${problems.length === 1 ? "" : "s"}:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  const stale: string[] = [];
  for (const [path, content] of Object.entries(files)) {
    let current: string | null;
    try {
      current = readFileSync(join(I18N_ROOT, path), "utf8");
    } catch {
      current = null;
    }
    if (current === content) continue;
    stale.push(path);
    if (!check) {
      mkdirSync(join(I18N_ROOT, "messages"), { recursive: true });
      writeFileSync(join(I18N_ROOT, path), content);
    }
  }
  if (check && stale.length > 0) {
    console.error(`@uki/i18n: out of date, run pnpm i18n:build: ${stale.join(", ")}`);
    process.exit(1);
  }
  const catalog = readJson("catalog.json") as { keys: unknown[] };
  const sources = dashboardFiles();
  const dashboard = sources.reduce((sum, file) => sum + Object.keys(readJson(file) as object).length, 0);
  console.log(
    `@uki/i18n: ${catalog.keys.length} catalog keys and ${dashboard} dashboard keys (${sources.join(", ")}) checked; ${stale.length === 0 ? "messages up to date" : `wrote ${stale.join(", ")}`}`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
