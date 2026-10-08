// The local Supabase stack: how `pnpm db:start` and `pnpm dev:local` start it, and the check that the
// scripts needing it run first:
//
//   node scripts/lib/local-stack.ts db:reset && supabase db reset
//
// It exits at once with one line when the stack is not running, instead of letting the script hang on
// a missing database or wait minutes for Edge Functions that never come. The check is a TCP connect to
// the API and database ports of supabase/config.toml (SUPABASE_WORKDIR's config when set, as the CLI
// reads it), so it needs neither Docker nor the Supabase CLI. A running stack passes silently.
import { readFileSync } from "node:fs";
import { createConnection } from "node:net";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT } from "./paths.ts";

/**
 * Containers `pnpm db:start` and `pnpm dev:local` leave out (the CLI matches image names; `supabase
 * start --help` lists them). Üki uses the database, auth (gotrue), PostgREST, Realtime, Storage and
 * the Kong gateway. Left out: Studio and postgres-meta (the dashboard UI and its schema service;
 * `supabase gen types` runs its own one-off postgres-meta), imgproxy (no image transforms), Mailpit
 * (staff sign in with a password and email confirmation is off; invites go through the Resend stub),
 * logflare and vector (logs), supavisor (the pooler is off in config.toml), and the edge runtime,
 * which `supabase functions serve` runs instead (docs/decisions.md, 2026-10-07).
 */
export const STACK_EXCLUDE = [
  "studio",
  "postgres-meta",
  "imgproxy",
  "mailpit",
  "logflare",
  "vector",
  "supavisor",
  "edge-runtime",
] as const;

export interface StackPorts {
  api: number;
  db: number;
}

/** The Supabase CLI's defaults, for a config.toml without the keys. */
const DEFAULT_PORTS: StackPorts = { api: 54321, db: 54322 };

/** `port` of the [api] and [db] tables of a config.toml (other tables' ports are ignored). */
export function stackPorts(configToml: string): StackPorts {
  const ports = { ...DEFAULT_PORTS };
  let table = "";
  for (const raw of configToml.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const header = /^\[([^\]]+)\]$/.exec(line);
    if (header?.[1] !== undefined) {
      table = header[1].trim();
      continue;
    }
    const port = /^port\s*=\s*(\d+)$/.exec(line)?.[1];
    if (port === undefined) continue;
    if (table === "api") ports.api = Number(port);
    if (table === "db") ports.db = Number(port);
  }
  return ports;
}

/** The project folder the Supabase CLI uses: SUPABASE_WORKDIR when set (a second stack), else this repo. */
export function stackWorkdir(env: NodeJS.ProcessEnv = process.env): string {
  const workdir = env.SUPABASE_WORKDIR?.trim();
  return workdir ? workdir : ROOT;
}

/** True when something accepts a TCP connection on 127.0.0.1:`port` within `timeoutMs`. */
export function isListening(port: number, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    const done = (listening: boolean) => {
      socket.destroy();
      resolve(listening);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

export interface StackCheck {
  running: boolean;
  /** "127.0.0.1:54722 (database)" for each port nothing answers on. */
  down: string[];
}

export async function checkLocalStack(
  ports: StackPorts,
  probe: (port: number) => Promise<boolean> = isListening,
): Promise<StackCheck> {
  const [api, db] = await Promise.all([probe(ports.api), probe(ports.db)]);
  const down: string[] = [];
  if (!api) down.push(`127.0.0.1:${ports.api} (API)`);
  if (!db) down.push(`127.0.0.1:${ports.db} (database)`);
  return { running: down.length === 0, down };
}

/** The one line a script prints when the stack is not running. */
export function notRunningMessage(script: string, down: readonly string[]): string {
  return (
    `[${script}] the local Supabase stack is not running (nothing answers on ${down.join(" or ")}): ` +
    "needs pnpm dev:local, or runs in CI"
  );
}

/** The stack the CLI would use, checked. */
export async function checkConfiguredStack(env: NodeJS.ProcessEnv = process.env): Promise<StackCheck> {
  const config = join(stackWorkdir(env), "supabase", "config.toml");
  let text = "";
  try {
    text = readFileSync(config, "utf8");
  } catch {
    // No config: the CLI's default ports.
  }
  return checkLocalStack(stackPorts(text));
}

async function main(argv: readonly string[]): Promise<void> {
  const script = argv[0] ?? "local stack";
  const { running, down } = await checkConfiguredStack();
  if (!running) {
    process.stderr.write(`${notRunningMessage(script, down)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.argv.slice(2));
}
