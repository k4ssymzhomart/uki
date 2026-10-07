// Where the local stack is, read from the repository-root .env (written by `pnpm env:local`) with
// process.env taking precedence. Values stay in this module: nothing is copied into process.env, so the
// secret key never reaches the web server Playwright starts (it inherits the runner's environment).
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { z } from "zod";

export const ROOT = fileURLToPath(new URL("../..", import.meta.url));

const E2eEnv = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().startsWith("sb_publishable_"),
  SUPABASE_SECRET_KEY: z.string().startsWith("sb_secret_"),
  SEED_STAFF_PASSWORD: z.string().min(1),
  /** Set to 1 to allow a stack that is not on this machine. The tests write and delete rows. */
  UKI_E2E_ALLOW_REMOTE: z.enum(["0", "1"]).default("0"),
});
export type E2eEnv = z.infer<typeof E2eEnv>;

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

export function isLocalUrl(url: string): boolean {
  return LOCAL_HOSTS.has(new URL(url).hostname);
}

let cached: E2eEnv | null = null;

/** The stack's URL and keys plus the seeded staff password; throws with a fix when one is missing. */
export function readE2eEnv(): E2eEnv {
  if (cached) return cached;
  const file = `${ROOT}.env`;
  const fromFile = existsSync(file) ? parseEnv(readFileSync(file, "utf8")) : {};
  const merged: Record<string, string | undefined> = { ...fromFile };
  for (const key of Object.keys(E2eEnv.shape)) {
    const value = process.env[key];
    if (value !== undefined && value !== "") merged[key] = value;
  }
  const parsed = E2eEnv.safeParse(merged);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(
      `e2e: ${fields} missing or invalid. Run \`supabase start\`, \`pnpm env:local\` and \`pnpm seed:staff\` ` +
        "so the repository-root .env has the local URL, both keys and SEED_STAFF_PASSWORD.",
    );
  }
  if (!isLocalUrl(parsed.data.SUPABASE_URL) && parsed.data.UKI_E2E_ALLOW_REMOTE !== "1") {
    throw new Error(
      "e2e: SUPABASE_URL is not on this machine. The smoke test creates and deletes rows with the secret " +
        "key, so it runs against the local stack only (set UKI_E2E_ALLOW_REMOTE=1 to override).",
    );
  }
  cached = parsed.data;
  return cached;
}
