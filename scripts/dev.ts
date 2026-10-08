#!/usr/bin/env node
// `pnpm dev`: web (3000), the mock portal (5180), the desktop app and Üki Lock in watch mode against the
// cloud demo backend. It reads only the public values of the repository's .env.cloud (the Supabase
// address, the publishable key, NEXT_PUBLIC_*, VITE_* and LOCK_*) and starts no Docker, no local
// Supabase and no `functions serve`: the cloud project's own Edge Functions answer.
//
// `pnpm dev:local` (`--local`): the local stack instead. Starts it without the containers Üki does not
// use (STACK_EXCLUDE) when it is not running, copies the contracts into the Edge Functions and serves
// them with supabase/functions/local.env, then runs the same four apps with .env's public values.
//
// `--only web,lock` runs a subset of the apps (web, lms-mock, desktop, lock).
//
// Either way no secret name (scripts/lib/dev-env.ts) reaches a child process, and no value is printed.
// Runs on Node's own type stripping (Node 24), like a plain .mjs: no build step, no tsx.
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { constants } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { cloudDevEnv, DevEnvError, localDevEnv, MISSING_CLOUD_ENV } from "./lib/dev-env.ts";
import { checkConfiguredStack, STACK_EXCLUDE } from "./lib/local-stack.ts";
import { ROOT } from "./lib/paths.ts";

const APPS = ["web", "lms-mock", "desktop", "lock"] as const;
const isWindows = process.platform === "win32";

interface Command {
  command: string;
  args: string[];
  shell: boolean;
}

function log(message: string): void {
  console.log(`\x1b[1m[dev]\x1b[0m ${message}`);
}

function fail(message: string): never {
  console.error(`\x1b[1m[dev]\x1b[0m ${message}`);
  process.exit(1);
}

function readIfExists(file: string): string | null {
  return existsSync(file) ? readFileSync(file, "utf8") : null;
}

function parseCommandLine(): { local: boolean; apps: string[] } {
  let values: { local?: boolean | undefined; only?: string | undefined };
  try {
    values = parseArgs({
      args: process.argv.slice(2),
      options: { local: { type: "boolean" }, only: { type: "string" } },
      strict: true,
      allowPositionals: false,
    }).values;
  } catch (error) {
    fail(`${error instanceof Error ? error.message : String(error)} (usage: pnpm dev [--only web,lock])`);
  }
  const known: readonly string[] = APPS;
  const apps = values.only === undefined ? [...APPS] : values.only.split(",").map((app) => app.trim());
  const unknown = apps.filter((app) => !known.includes(app));
  if (unknown.length > 0 || apps.length === 0) {
    fail(`--only takes a comma-separated list of ${APPS.join(", ")}; got "${values.only ?? ""}"`);
  }
  return { local: values.local === true, apps };
}

/** A program from PATH. Windows runs .cmd shims only through a shell, which takes one command string. */
function fromPath(command: string, args: string[]): Command {
  if (isWindows) return { command: [command, ...args].join(" "), args: [], shell: true };
  return { command, args, shell: false };
}

/**
 * pnpm through the same Node and pnpm that run this script when npm_execpath points at pnpm's JS entry;
 * otherwise pnpm from PATH.
 */
function pnpmCommand(args: string[]): Command {
  // biome-ignore lint/suspicious/noUndeclaredEnvVars: pnpm sets it for this script; it is no task input.
  const execPath = process.env.npm_execpath;
  if (execPath && /pnpm/i.test(execPath) && /\.c?js$/.test(execPath)) {
    return { command: process.execPath, args: [execPath, ...args], shell: false };
  }
  return fromPath("pnpm", args);
}

function runSync(
  { command, args, shell }: Command,
  env: Record<string, string>,
  stdio: "inherit" | "ignore",
) {
  const result = spawnSync(command, args, { cwd: ROOT, stdio, shell, env });
  return { ok: !result.error && result.status === 0, error: result.error, status: result.status };
}

/** The local stack: running, or started without the containers Üki does not use. */
async function ensureLocalStack(env: Record<string, string>): Promise<void> {
  if ((await checkConfiguredStack(env)).running) {
    log("local Supabase is running");
    return;
  }
  const version = runSync(fromPath("supabase", ["--version"]), env, "ignore");
  if (version.error || (isWindows && version.status === 9009)) {
    fail(
      "the Supabase CLI is not installed: https://supabase.com/docs/guides/local-development/cli/getting-started",
    );
  }
  const exclude = STACK_EXCLUDE.join(",");
  log(`starting local Supabase without ${exclude}; the first start pulls images and takes minutes`);
  if (!runSync(fromPath("supabase", ["start", "-x", exclude]), env, "inherit").ok) {
    fail("supabase start failed; is Docker running?");
  }
}

/**
 * Serves the Edge Functions on the local API (the edge runtime is not part of the slim stack), with
 * supabase/functions/local.env: Resend points at the local stub, so no real email leaves `pnpm dev:local`.
 */
function serveFunctions(env: Record<string, string>): ChildProcess {
  const { command, args, shell } = fromPath("supabase", [
    "functions",
    "serve",
    "--env-file",
    "supabase/functions/local.env",
  ]);
  log("supabase functions serve --env-file supabase/functions/local.env");
  const child = spawn(command, args, { cwd: ROOT, stdio: "inherit", shell, env });
  child.on("error", (error) => log(`could not start supabase functions serve: ${error.message}`));
  return child;
}

function runApps(apps: readonly string[], env: Record<string, string>, functions: ChildProcess | null): void {
  const filters = apps.map((app) => `--filter=${app}`);
  const { command, args, shell } = pnpmCommand(["exec", "turbo", "run", "dev", ...filters]);
  log(`turbo run dev ${filters.join(" ")}`);
  const child = spawn(command, args, { cwd: ROOT, stdio: "inherit", shell, env });
  child.on("exit", () => functions?.kill("SIGTERM"));

  const forwarded = new Set<NodeJS.Signals>();
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.on(signal, () => {
      if (forwarded.has(signal) || child.exitCode !== null) return;
      forwarded.add(signal);
      child.kill(signal);
    });
  }
  child.on("error", (error) => fail(`could not start turbo: ${error.message}`));
  child.on("exit", (code, signal) => {
    process.exit(signal ? 128 + (constants.signals[signal] ?? 0) : (code ?? 0));
  });
}

/** The app environment for the mode, or a clean exit naming what is wrong (never a value). */
function appEnvironment(local: boolean): Record<string, string> {
  const dotEnv = readIfExists(join(ROOT, ".env"));
  try {
    if (local) {
      if (dotEnv === null)
        log(".env not found: run pnpm env:local once the stack is up (or copy .env.example)");
      return localDevEnv(process.env, dotEnv);
    }
    const cloud = readIfExists(join(ROOT, ".env.cloud"));
    if (cloud === null) fail(MISSING_CLOUD_ENV);
    return cloudDevEnv(process.env, cloud, dotEnv);
  } catch (error) {
    if (error instanceof DevEnvError) {
      fail(`${local ? ".env" : ".env.cloud"} is not usable:\n  ${error.problems.join("\n  ")}`);
    }
    throw error;
  }
}

async function main(): Promise<void> {
  const { local, apps } = parseCommandLine();
  const env = appEnvironment(local);
  // No Next.js telemetry: CLAUDE.md allows no third-party analytics.
  env.NEXT_TELEMETRY_DISABLED ??= "1";

  if (!local) {
    log(
      "cloud demo backend (.env.cloud): this is the shared, live demo data everyone sees; " +
        "pnpm dev:local runs against a local stack",
    );
    runApps(apps, env, null);
    return;
  }
  await ensureLocalStack(env);
  if (!runSync(pnpmCommand(["functions:sync"]), env, "inherit").ok) fail("pnpm functions:sync failed");
  runApps(apps, env, serveFunctions(env));
}

await main();
