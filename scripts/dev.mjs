#!/usr/bin/env node
// `pnpm dev`: starts the local Supabase if it is not running, copies the contracts into the Edge
// Functions, then runs web (3000), the mock portal (5180), the desktop app and Üki Lock in watch mode.
//
// Only public build values (NEXT_PUBLIC_*, VITE_*, UKI_*, LOCK_*) are read from the root .env and passed
// on; the secret key never reaches an app process.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { constants } from "node:os";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PUBLIC_PREFIXES = ["NEXT_PUBLIC_", "VITE_", "UKI_", "LOCK_"];
// The edge runtime is left out of `supabase start`: `pnpm functions:serve` runs it (see docs/decisions.md).
const SUPABASE_EXCLUDE = "vector,logflare,imgproxy,edge-runtime";
const APPS = ["web", "lms-mock", "desktop", "lock"];
const isWindows = process.platform === "win32";

// No Next.js telemetry: CLAUDE.md allows no third-party analytics.
process.env.NEXT_TELEMETRY_DISABLED ??= "1";

function log(message) {
  console.log(`\x1b[1m[dev]\x1b[0m ${message}`);
}

function fail(message) {
  console.error(`\x1b[1m[dev]\x1b[0m ${message}`);
  process.exit(1);
}

/** Copies public values from the root .env into this process's environment, without overriding. */
function loadPublicEnv() {
  const file = `${ROOT}.env`;
  if (!existsSync(file)) {
    log(".env not found: copy .env.example to .env and fill in the values from `supabase status -o env`");
    return;
  }
  const parsed = parseEnv(readFileSync(file, "utf8"));
  for (const [name, value] of Object.entries(parsed)) {
    if (PUBLIC_PREFIXES.some((prefix) => name.startsWith(prefix)) && process.env[name] === undefined) {
      process.env[name] = value;
    }
  }
}

/** A program from PATH. Windows runs .cmd shims only through a shell, which takes one command string. */
function fromPath(command, args) {
  if (isWindows) return { command: [command, ...args].join(" "), args: [], shell: true };
  return { command, args, shell: false };
}

/**
 * pnpm through the same Node and pnpm that run this script when npm_execpath points at pnpm's JS entry;
 * otherwise pnpm from PATH.
 */
function pnpmCommand(args) {
  // biome-ignore lint/suspicious/noUndeclaredEnvVars: pnpm sets it for this script; it is no task input.
  const execPath = process.env.npm_execpath;
  if (execPath && /pnpm/i.test(execPath) && /\.c?js$/.test(execPath)) {
    return { command: process.execPath, args: [execPath, ...args], shell: false };
  }
  return fromPath("pnpm", args);
}

function runSync({ command, args, shell }, stdio = "inherit") {
  const result = spawnSync(command, args, { cwd: ROOT, stdio, shell });
  return { ok: !result.error && result.status === 0, error: result.error, status: result.status };
}

function ensureSupabase() {
  const status = runSync(fromPath("supabase", ["status"]), "ignore");
  if (status.error || (isWindows && status.status === 9009)) {
    fail(
      "the Supabase CLI is not installed: https://supabase.com/docs/guides/local-development/cli/getting-started",
    );
  }
  if (status.ok) {
    log("local Supabase is running");
    return;
  }
  log(
    `starting local Supabase (without ${SUPABASE_EXCLUDE}); the first start pulls images and takes minutes`,
  );
  if (!runSync(fromPath("supabase", ["start", "-x", SUPABASE_EXCLUDE])).ok) {
    fail("supabase start failed; is Docker running?");
  }
}

function syncFunctions() {
  if (!runSync(pnpmCommand(["functions:sync"])).ok) fail("pnpm functions:sync failed");
}

/** Serves the Edge Functions on the local API (the edge runtime is not part of `supabase start`). */
function serveFunctions() {
  const { command, args, shell } = fromPath("supabase", ["functions", "serve"]);
  log("supabase functions serve");
  const child = spawn(command, args, { cwd: ROOT, stdio: "inherit", shell, env: process.env });
  child.on("error", (error) => log(`could not start supabase functions serve: ${error.message}`));
  return child;
}

function runApps(functions) {
  const filters = APPS.map((app) => `--filter=${app}`);
  const { command, args, shell } = pnpmCommand(["exec", "turbo", "run", "dev", ...filters]);
  log(`turbo run dev ${filters.join(" ")}`);
  const child = spawn(command, args, { cwd: ROOT, stdio: "inherit", shell, env: process.env });
  child.on("exit", () => functions.kill("SIGTERM"));

  const forwarded = new Set();
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
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

loadPublicEnv();
ensureSupabase();
syncFunctions();
runApps(serveFunctions());
