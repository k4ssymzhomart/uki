// `pnpm env:local`: writes the local stack's URL and keys into the repository's .env (from .env.example
// when there is no .env yet), so a fresh clone needs no copying of values by hand. Run it after
// `supabase start`. It sets only the Supabase lines below and a generated SEED_STAFF_PASSWORD when
// that is empty; every other line, comment and value stays. It refuses to touch a .env that points at
// a cloud project unless --force is given. No value is printed.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import { z } from "zod";
import { createLogger, parseCli, UsageError } from "./cli.ts";
import { isLocalUrl, PublishableKey, SecretKey } from "./env.ts";
import { ROOT } from "./paths.ts";

const log = createLogger("env:local");

const StackStatus = z.object({
  API_URL: z.url(),
  PUBLISHABLE_KEY: PublishableKey,
  SECRET_KEY: SecretKey,
});

/** The .env lines this script owns, from the `supabase status -o env` values. */
export function localValues(status: z.infer<typeof StackStatus>): Record<string, string> {
  return {
    SUPABASE_URL: status.API_URL,
    SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: status.SECRET_KEY,
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
    VITE_SUPABASE_URL: status.API_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
  };
}

/**
 * `template` with each `KEY=value` line of `values` replaced in place (commented lines are left
 * alone) and keys the template lacks appended. Returns the new text and the keys that changed.
 */
export function mergeEnv(
  template: string,
  values: Record<string, string>,
): { text: string; changed: string[] } {
  const pending = new Map(Object.entries(values));
  const changed: string[] = [];
  const lines = template.split("\n").map((line) => {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match) return line;
    const [, key, current] = match;
    if (key === undefined || !pending.has(key)) return line;
    const value = pending.get(key) ?? "";
    pending.delete(key);
    if (current !== value) changed.push(key);
    return `${key}=${value}`;
  });
  const appended = [...pending].map(([key, value]) => {
    changed.push(key);
    return `${key}=${value}`;
  });
  let text = lines.join("\n");
  if (appended.length > 0) text = `${text.replace(/\n*$/, "\n")}${appended.join("\n")}\n`;
  return { text, changed };
}

function stackStatus(): z.infer<typeof StackStatus> {
  let out: string;
  try {
    out = execFileSync("supabase", ["status", "-o", "env"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 60_000,
    });
  } catch {
    throw new Error(
      "`supabase status` failed: start the local stack first (pnpm db:start, or pnpm dev:local)",
    );
  }
  const vars: Record<string, string> = {};
  for (const line of out.split(/\r?\n/)) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (match?.[1] && match[2] !== undefined) vars[match[1]] = match[2].replace(/^"(.*)"$/, "$1");
  }
  const parsed = StackStatus.safeParse(vars);
  if (!parsed.success)
    throw new Error("`supabase status -o env` did not list API_URL, PUBLISHABLE_KEY and SECRET_KEY");
  return parsed.data;
}

function main(): void {
  const args = parseCli(
    process.argv.slice(2),
    { force: { type: "boolean" }, "dry-run": { type: "boolean" }, help: { type: "boolean", short: "h" } },
    z.object({
      force: z.boolean().default(false),
      "dry-run": z.boolean().default(false),
      help: z.boolean().default(false),
    }),
  );
  if (args.help) {
    process.stdout.write(
      "Usage: pnpm env:local [--force] [--dry-run]   (writes the local stack's URL and keys into .env)\n",
    );
    return;
  }
  const envPath = join(ROOT, ".env");
  const examplePath = join(ROOT, ".env.example");
  const hasEnv = existsSync(envPath);
  const template = readFileSync(hasEnv ? envPath : examplePath, "utf8");
  const currentUrl = parseEnv(template).SUPABASE_URL;
  if (hasEnv && currentUrl && !isLocalUrl(currentUrl) && !args.force) {
    throw new UsageError(
      ".env points at a cloud project; keep it, or pass --force to switch it to the local stack",
    );
  }
  const values = localValues(stackStatus());
  const password = parseEnv(template).SEED_STAFF_PASSWORD;
  if (!password) values.SEED_STAFF_PASSWORD = randomBytes(18).toString("base64url");
  const { text, changed } = mergeEnv(template, values);
  if (!args["dry-run"]) writeFileSync(envPath, text, { mode: 0o600 });
  const verb = args["dry-run"] ? "would write" : hasEnv ? "updated" : "created";
  log.info(
    `${verb} .env from ${hasEnv ? ".env" : ".env.example"}: ` +
      (changed.length > 0 ? `set ${changed.join(", ")}` : "already up to date"),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    log.error(error instanceof Error ? error.message : String(error));
    process.exit(error instanceof UsageError ? 2 : 1);
  }
}
