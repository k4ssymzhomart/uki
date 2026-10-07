/**
 * `pnpm i18n:build` (pnpm --filter @uki/i18n build): catalog.json and dashboard.json to
 * messages/en.json, kk.json and ru.json. Exits 1 and writes nothing when any message has a problem.
 * `--check` writes nothing and also exits 1 when a messages file is out of date.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildMessages, LANGUAGES, serialise } from "./lib/catalog.ts";

export const I18N_ROOT = fileURLToPath(new URL("..", import.meta.url));

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(join(I18N_ROOT, file), "utf8"));
}

/** The three messages files, by path relative to packages/i18n, or the problems that stop the build. */
export function generateAll(root: string = I18N_ROOT): {
  files: Record<string, string> | null;
  problems: readonly string[];
} {
  const read = (file: string) => JSON.parse(readFileSync(join(root, file), "utf8")) as unknown;
  const result = buildMessages(read("catalog.json"), read("dashboard.json"));
  if (!result.messages) return { files: null, problems: result.problems };
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
  const dashboard = Object.keys(readJson("dashboard.json") as object).length;
  console.log(
    `@uki/i18n: ${catalog.keys.length} catalog keys and ${dashboard} dashboard keys checked; ${stale.length === 0 ? "messages up to date" : `wrote ${stale.join(", ")}`}`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
