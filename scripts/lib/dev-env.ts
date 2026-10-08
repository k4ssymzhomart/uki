// The environment `pnpm dev` and `pnpm dev:local` hand to the app processes (scripts/dev.ts). Pure, so
// dev-env.test.ts can check that no secret reaches an app, whatever the shell, .env or .env.cloud hold.
//
// `pnpm dev` (cloud): the Supabase address and publishable key come from .env.cloud, always; the apps'
//   other build values (Lock id and key, exam office address, capture flag) from the shell, then
//   .env.cloud, then .env. Only public lines of .env.cloud are ever parsed: a secret line is skipped
//   before its value is read, so no secret of that file enters the process.
// `pnpm dev:local`: the public build values from the shell, then .env, as before.
// Both: every secret name is removed from the inherited environment, so an exported
// SUPABASE_SECRET_KEY does not reach Next.js, Vite, Electron, WXT or the CLI either.
import { parseEnv } from "node:util";
import { z } from "zod";
import { isLocalUrl, PublishableKey } from "./env.ts";

/** Never handed to an app process, from any source. */
export const SECRET_NAMES: readonly string[] = [
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_DB_PASSWORD",
  "SUPABASE_ACCESS_TOKEN",
  "RESEND_API_KEY",
];
/** SEED_STAFF_PASSWORD, SEED_LMS_URL and the judge's account: seed scripts only. */
const SECRET_PREFIXES = ["SEED_"];
/** A secret-looking name is refused even under a public prefix (a LOCK_PRIVATE_KEY, say). */
const SECRET_PATTERN = /SECRET|PASSWORD|PRIVATE|TOKEN|SERVICE_ROLE|API_KEY/;

export function isSecretName(name: string): boolean {
  const upper = name.toUpperCase();
  return (
    SECRET_NAMES.includes(upper) ||
    SECRET_PREFIXES.some((prefix) => upper.startsWith(prefix)) ||
    SECRET_PATTERN.test(upper)
  );
}

/** The six names that say which Supabase the apps talk to. In cloud mode .env.cloud sets all six. */
export const TARGET_NAMES = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
] as const;
const TARGETS: ReadonlySet<string> = new Set(TARGET_NAMES);

/** What `pnpm dev` reads from .env.cloud: the address, the publishable key and build values. */
export function isCloudPublicName(name: string): boolean {
  if (isSecretName(name)) return false;
  return (
    name === "SUPABASE_URL" ||
    name === "SUPABASE_PUBLISHABLE_KEY" ||
    ["NEXT_PUBLIC_", "VITE_", "LOCK_"].some((prefix) => name.startsWith(prefix))
  );
}

/** What both modes read from .env: the apps' build values. */
export function isLocalPublicName(name: string): boolean {
  if (isSecretName(name)) return false;
  return ["NEXT_PUBLIC_", "VITE_", "UKI_", "LOCK_"].some((prefix) => name.startsWith(prefix));
}

const ASSIGNMENT = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;

/** The quote a value opens and does not close on its own line (a multi-line value), or null. */
function openQuote(rest: string): string | null {
  const quote = rest[0];
  if (quote !== '"' && quote !== "'" && quote !== "`") return null;
  return rest.indexOf(quote, 1) === -1 ? quote : null;
}

/**
 * The `NAME=value` lines of an env file whose name `accept` allows, parsed one line at a time with
 * node:util's parseEnv. Other lines are skipped before their value is parsed, and so are the
 * continuation lines of a multi-line value, so a secret line never becomes a value here.
 */
export function pickEnv(text: string, accept: (name: string) => boolean): Record<string, string> {
  const picked: Record<string, string> = {};
  let inside: string | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (inside !== null) {
      if (line.includes(inside)) inside = null;
      continue;
    }
    const match = ASSIGNMENT.exec(line);
    const name = match?.[1];
    if (name === undefined) continue;
    const open = openQuote(match?.[2] ?? "");
    if (open !== null) {
      inside = open;
      continue;
    }
    if (!accept(name)) continue;
    const value = parseEnv(line)[name];
    if (value !== undefined) picked[name] = value;
  }
  return picked;
}

export class DevEnvError extends Error {
  readonly problems: readonly string[];
  constructor(problems: readonly string[]) {
    super(problems.join("\n"));
    this.problems = problems;
  }
}

const NOT_CLOUD =
  "must be the cloud project's address, https://<project-ref>.supabase.co (pnpm dev:local is for a local stack)";
const CloudUrl = z.string().refine((value) => {
  try {
    return new URL(value).protocol === "https:" && !isLocalUrl(value);
  } catch {
    return false;
  }
}, NOT_CLOUD);

const CloudTarget = z.object({
  SUPABASE_URL: CloudUrl,
  SUPABASE_PUBLISHABLE_KEY: PublishableKey,
  NEXT_PUBLIC_SUPABASE_URL: CloudUrl.optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PublishableKey.optional(),
  VITE_SUPABASE_URL: CloudUrl.optional(),
  VITE_SUPABASE_PUBLISHABLE_KEY: PublishableKey.optional(),
});

/** "NAME: problem" lines for public values that hold a secret key; never the value. */
function secretValues(values: Record<string, string>, source: string): string[] {
  return Object.entries(values)
    .filter(([, value]) => value.startsWith("sb_secret_"))
    .map(
      ([name]) => `${name} in ${source} holds a secret key (sb_secret_…); the apps take only public values`,
    );
}

/** The inherited environment without any secret name, then `fallback` where unset, then `forced`. */
function appEnv(
  inherited: NodeJS.ProcessEnv,
  fallback: Record<string, string>,
  forced: Record<string, string>,
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(inherited)) {
    if (value !== undefined && !isSecretName(name)) env[name] = value;
  }
  for (const [name, value] of Object.entries(fallback)) {
    if (env[name] === undefined && !isSecretName(name)) env[name] = value;
  }
  for (const [name, value] of Object.entries(forced)) {
    if (!isSecretName(name)) env[name] = value;
  }
  return env;
}

/**
 * The app environment for `pnpm dev`: the cloud demo backend from `cloudText` (.env.cloud). Throws
 * DevEnvError naming each problem, never a value.
 */
export function cloudDevEnv(
  inherited: NodeJS.ProcessEnv,
  cloudText: string,
  dotEnvText: string | null,
): Record<string, string> {
  // An empty `NAME=` line means "not set", as in .env.example.
  const cloud = Object.fromEntries(
    Object.entries(pickEnv(cloudText, isCloudPublicName)).filter(([, value]) => value !== ""),
  );
  const problems = secretValues(cloud, ".env.cloud");
  const parsed = CloudTarget.safeParse(cloud);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const name = issue.path.join(".");
      problems.push(
        issue.code === "invalid_type" && cloud[name] === undefined
          ? `${name} is missing from .env.cloud`
          : `${name} in .env.cloud ${issue.message}`,
      );
    }
  }
  if (problems.length > 0 || !parsed.success) throw new DevEnvError(problems);
  const target = parsed.data;
  const forced: Record<string, string> = {
    SUPABASE_URL: target.SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: target.SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SUPABASE_URL: target.NEXT_PUBLIC_SUPABASE_URL ?? target.SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      target.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? target.SUPABASE_PUBLISHABLE_KEY,
    VITE_SUPABASE_URL: target.VITE_SUPABASE_URL ?? target.SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: target.VITE_SUPABASE_PUBLISHABLE_KEY ?? target.SUPABASE_PUBLISHABLE_KEY,
  };
  // .env's other build values (the Lock id and key, say) still apply; its Supabase lines never do.
  const local =
    dotEnvText === null ? {} : pickEnv(dotEnvText, (name) => isLocalPublicName(name) && !TARGETS.has(name));
  const fromLocal = secretValues(local, ".env");
  if (fromLocal.length > 0) throw new DevEnvError(fromLocal);
  const others = Object.fromEntries(Object.entries(cloud).filter(([name]) => !TARGETS.has(name)));
  return appEnv(inherited, { ...local, ...others }, forced);
}

/** The app environment for `pnpm dev:local`: the shell first, then .env's public build values. */
export function localDevEnv(inherited: NodeJS.ProcessEnv, dotEnvText: string | null): Record<string, string> {
  const local = dotEnvText === null ? {} : pickEnv(dotEnvText, isLocalPublicName);
  const problems = secretValues(local, ".env");
  if (problems.length > 0) throw new DevEnvError(problems);
  return appEnv(inherited, local, {});
}

/** What `pnpm dev` says when there is no .env.cloud. */
export const MISSING_CLOUD_ENV = [
  "pnpm dev runs against the cloud demo backend and reads its public values from .env.cloud in the",
  "repository root, which is missing. Create it with these two lines (Supabase dashboard, Project",
  "Settings, API Keys; or ask whoever runs the demo project):",
  "",
  "  SUPABASE_URL=https://<project-ref>.supabase.co",
  "  SUPABASE_PUBLISHABLE_KEY=sb_publishable_...",
  "",
  "pnpm dev reads only those and any NEXT_PUBLIC_*, VITE_* and LOCK_* lines; it never passes a secret",
  "key or password to an app. git ignores the file. More in docs/runbooks/cloud-setup.md, step 4.",
  "For a local Supabase stack instead (Docker), run pnpm dev:local.",
].join("\n");
