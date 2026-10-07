// Environment for the repository scripts (demo-reset, demo-simulate, local-env). Values come from the
// process environment first, then from the repository's .env (or the file given with --env-file), so
// `SUPABASE_URL=… pnpm demo:reset` and a cloud-only env file both work. Values are never printed.
import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { config } from "dotenv";
import { z } from "zod";
import { ROOT } from "./paths.ts";

/** An empty `KEY=` line in .env means "not set". */
function optional<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => (value === "" ? undefined : value), schema.optional());
}

export const SecretKey = z
  .string()
  .startsWith("sb_secret_", "must be a secret key (sb_secret_…); the legacy service_role key is never used");
export const PublishableKey = z
  .string()
  .startsWith(
    "sb_publishable_",
    "must be a publishable key (sb_publishable_…); the legacy anon key is never used",
  );

export const ScriptEnv = z.object({
  SUPABASE_URL: z.url({ protocol: /^https?$/ }),
  SUPABASE_SECRET_KEY: SecretKey,
  SUPABASE_PUBLISHABLE_KEY: optional(PublishableKey),
  SEED_STAFF_PASSWORD: optional(z.string().min(8)),
  SEED_LMS_URL: optional(z.url({ protocol: /^https?$/ })),
});
export type ScriptEnv = z.infer<typeof ScriptEnv>;

/**
 * Loads `file` (default: the repository's .env) into process.env without overriding values that are
 * already set. Returns the absolute path that was read, or null when there is no such file.
 */
export function loadEnvFile(file?: string): string | null {
  const path =
    file === undefined ? resolve(ROOT, ".env") : isAbsolute(file) ? file : resolve(process.cwd(), file);
  if (!existsSync(path)) {
    if (file !== undefined) throw new Error(`env file not found: ${path}`);
    return null;
  }
  config({ path, quiet: true, override: false });
  return path;
}

/** Problems as "NAME: message" lines; never includes a value. */
export function describeEnvIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.join(".") || "(env)"}: ${issue.message}`);
}

/** Parses the script environment or throws an Error that names each problem (never a value). */
export function readScriptEnv(source: NodeJS.ProcessEnv = process.env): ScriptEnv {
  const parsed = ScriptEnv.safeParse(source);
  if (!parsed.success) {
    throw new Error(
      `the environment is incomplete (set it in .env or pass --env-file):\n  ${describeEnvIssues(parsed.error).join("\n  ")}`,
    );
  }
  return parsed.data;
}

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1", "0.0.0.0", "host.docker.internal"]);

/** True for the local Supabase stack (loopback, *.localhost, *.test). */
export function isLocalUrl(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return LOCAL_HOSTS.has(host) || host.endsWith(".localhost") || host.endsWith(".test");
}

/** "local stack 127.0.0.1:54721" or "cloud project abcd.supabase.co", for log lines. */
export function describeTarget(url: string): string {
  const { host } = new URL(url);
  return isLocalUrl(url) ? `local stack ${host}` : `cloud project ${host}`;
}
