// Where the local stack is and which keys it uses. Read from `supabase status -o env` (the CLI that
// runs the stack), falling back to the repository's .env when the CLI is not on PATH.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

export const ROOT = fileURLToPath(new URL("../..", import.meta.url));

export const StackEnv = z.object({
  apiUrl: z.url(),
  publishableKey: z.string().startsWith("sb_publishable_"),
  secretKey: z.string().startsWith("sb_secret_"),
});
export type StackEnv = z.infer<typeof StackEnv>;

/** `KEY="value"` and `KEY=value` lines; anything else (CLI notices) is ignored. */
export function parseEnvLines(text: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (!match) continue;
    const [, key, raw] = match;
    if (key === undefined || raw === undefined) continue;
    vars[key] = raw.replace(/^"(.*)"$/, "$1");
  }
  return vars;
}

function fromCli(): StackEnv | null {
  try {
    const out = execFileSync("supabase", ["status", "-o", "env"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 60_000,
    });
    const vars = parseEnvLines(out);
    const parsed = StackEnv.safeParse({
      apiUrl: vars.API_URL,
      publishableKey: vars.PUBLISHABLE_KEY,
      secretKey: vars.SECRET_KEY,
    });
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function fromDotEnv(): StackEnv | null {
  let vars: Record<string, string> = {};
  try {
    vars = parseEnvLines(readFileSync(`${ROOT}/.env`, "utf8"));
  } catch {
    // no .env
  }
  const env = { ...vars, ...process.env };
  const parsed = StackEnv.safeParse({
    apiUrl: env.SUPABASE_URL,
    publishableKey: env.SUPABASE_PUBLISHABLE_KEY,
    secretKey: env.SUPABASE_SECRET_KEY,
  });
  return parsed.success ? parsed.data : null;
}

export function readStackEnv(): StackEnv {
  const env = fromCli() ?? fromDotEnv();
  if (env === null) {
    throw new Error(
      "integration: no local stack found. Run `supabase start`, or set SUPABASE_URL, " +
        "SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY in .env.",
    );
  }
  return env;
}
