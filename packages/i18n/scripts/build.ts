/**
 * `pnpm i18n:build` (pnpm --filter @uki/i18n build): catalog.json and every dashboard*.json to
 * messages/en.json, kk.json and ru.json. Dashboard messages are `{ "en": "...", "ru": "..." }` and go
 * into en.json and ru.json; kk.json has none, so Kazakh falls back to English (src/messages.ts).
 * Exits 1 and writes nothing when any message has a problem, including a missing or empty Russian
 * or English dashboard message.
 * `--check` writes nothing and also exits 1 when a messages file is out of date.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildMessages, LANGUAGES, serialise } from "./lib/catalog.ts";

export const I18N_ROOT = fileURLToPath(new URL("..", import.meta.url));

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
 * A dashboard file may start with a `"$comment"` string for notes about the whole file (for example
 * that its Russian waits for a native read-through); it is not a message and is not merged.
 */
export const DASHBOARD_COMMENT_KEY = "$comment";

/**
 * Merges the dashboard files into one flat map of `dashboard.*` key to `{ en, ru }` for buildMessages,
 * plus the file each key came from. A file that is not a JSON object, a `$comment` that is not a
 * string, or a key that two files both define, is a problem; values are checked later by
 * buildMessages.
 */
export function mergeDashboard(files: readonly { file: string; data: unknown }[]): {
  merged: Record<string, unknown>;
  sources: Record<string, string>;
  problems: string[];
} {
  const merged: Record<string, unknown> = {};
  const sources: Record<string, string> = {};
  const problems: string[] = [];
  for (const { file, data } of files) {
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      problems.push(`${file}: must be an object of dashboard.* keys to { "en": "...", "ru": "..." }`);
      continue;
    }
    for (const [key, value] of Object.entries(data)) {
      if (key === DASHBOARD_COMMENT_KEY) {
        if (typeof value !== "string") problems.push(`${file}: ${key}: must be a string`);
        continue;
      }
      const first = sources[key];
      if (first !== undefined) {
        problems.push(`${file}: ${key}: duplicate key, already in ${first}`);
        continue;
      }
      sources[key] = file;
      merged[key] = value;
    }
  }
  return { merged, sources, problems };
}

/** The three messages files, by path relative to packages/i18n, or the problems that stop the build. */
export function generateAll(root: string = I18N_ROOT): {
  files: Record<string, string> | null;
  problems: readonly string[];
} {
  const read = (file: string) => JSON.parse(readFileSync(join(root, file), "utf8")) as unknown;
  const dashboard = mergeDashboard(dashboardFiles(root).map((file) => ({ file, data: read(file) })));
  const result = buildMessages(read("catalog.json"), dashboard.merged, dashboard.sources);
  const problems = [...dashboard.problems, ...result.problems];
  if (!result.messages || problems.length > 0) return { files: null, problems };
  const messages = result.messages;
  return {
    files: Object.fromEntries(LANGUAGES.map((l) => [`messages/${l}.json`, serialise(messages[l])])),
    problems: [],
  };
}

/**
 * The build itself: writes the messages files that changed (or, with `check`, only reports them) and
 * prints what it did. Returns the exit code. `pnpm i18n:import` runs it after writing the sheet's edits.
 */
export function runBuild(options: { check?: boolean; root?: string } = {}): number {
  const check = options.check ?? false;
  const root = options.root ?? I18N_ROOT;
  const read = (file: string) => JSON.parse(readFileSync(join(root, file), "utf8")) as unknown;
  const { files, problems } = generateAll(root);
  if (!files) {
    console.error(`@uki/i18n: ${problems.length} problem${problems.length === 1 ? "" : "s"}:`);
    for (const p of problems) console.error(`  - ${p}`);
    return 1;
  }
  const stale: string[] = [];
  for (const [path, content] of Object.entries(files)) {
    let current: string | null;
    try {
      current = readFileSync(join(root, path), "utf8");
    } catch {
      current = null;
    }
    if (current === content) continue;
    stale.push(path);
    if (!check) {
      mkdirSync(join(root, "messages"), { recursive: true });
      writeFileSync(join(root, path), content);
    }
  }
  if (check && stale.length > 0) {
    console.error(`@uki/i18n: out of date, run pnpm i18n:build: ${stale.join(", ")}`);
    return 1;
  }
  const catalog = read("catalog.json") as { keys: unknown[] };
  const sources = dashboardFiles(root);
  const dashboard = sources.reduce(
    (sum, file) =>
      sum + Object.keys(read(file) as object).filter((key) => key !== DASHBOARD_COMMENT_KEY).length,
    0,
  );
  console.log(
    `@uki/i18n: ${catalog.keys.length} catalog keys and ${dashboard} dashboard keys in en and ru (${sources.join(", ")}) checked; ${stale.length === 0 ? "messages up to date" : `wrote ${stale.join(", ")}`}`,
  );
  return 0;
}

function main(): void {
  const code = runBuild({ check: process.argv.includes("--check") });
  if (code !== 0) process.exit(code);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
