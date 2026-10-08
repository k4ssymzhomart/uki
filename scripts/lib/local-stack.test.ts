import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkLocalStack,
  isListening,
  notRunningMessage,
  STACK_EXCLUDE,
  stackPorts,
  stackWorkdir,
} from "./local-stack.ts";
import { ROOT } from "./paths.ts";

const servers: Server[] = [];
const dirs: string[] = [];

afterEach(() => {
  for (const server of servers.splice(0)) server.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A TCP server on a free port of 127.0.0.1. */
async function listen(): Promise<number> {
  const server = createServer((socket) => socket.destroy());
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no port");
  return address.port;
}

/** A port nothing listens on: taken from the OS, then released. */
async function closedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (address === null || typeof address === "string") throw new Error("no port");
  return address.port;
}

/** A Supabase project folder whose config.toml names these ports, for SUPABASE_WORKDIR. */
function workdir(api: number, db: number): string {
  const dir = mkdtempSync(join(tmpdir(), "uki-stack-check-"));
  dirs.push(dir);
  mkdirSync(join(dir, "supabase"));
  writeFileSync(
    join(dir, "supabase", "config.toml"),
    `project_id = "check"\n\n[api]\nenabled = true\nport = ${api}\n\n[db]\nport = ${db}\nshadow_port = 1\n`,
  );
  return dir;
}

/** `node scripts/lib/local-stack.ts <script>`, as package.json runs it. */
function runCheck(script: string, env: NodeJS.ProcessEnv) {
  const started = Date.now();
  const result = spawnSync(process.execPath, [join(ROOT, "scripts/lib/local-stack.ts"), script], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    encoding: "utf8",
    timeout: 20_000,
  });
  return { ...result, ms: Date.now() - started };
}

describe("stackPorts", () => {
  it("reads the API and database ports of this repository's config.toml", () => {
    const config = readFileSync(join(ROOT, "supabase/config.toml"), "utf8");
    // Not Studio's 54723, Mailpit's 54724, the pooler's 54729 or the shadow database's 54720.
    expect(stackPorts(config)).toEqual({ api: 54721, db: 54722 });
  });

  it("falls back to the CLI's defaults", () => {
    expect(stackPorts("")).toEqual({ api: 54321, db: 54322 });
    expect(stackPorts("[db.pooler]\nport = 1\n[studio]\nport = 2 # comment\n")).toEqual({
      api: 54321,
      db: 54322,
    });
  });

  it("follows SUPABASE_WORKDIR, as the CLI does", () => {
    expect(stackWorkdir({ SUPABASE_WORKDIR: "/tmp/second-stack" })).toBe("/tmp/second-stack");
    expect(stackWorkdir({})).toBe(ROOT);
  });
});

describe("checkLocalStack", () => {
  it("passes when the API and the database answer", async () => {
    expect(await checkLocalStack({ api: 1, db: 2 }, async () => true)).toEqual({ running: true, down: [] });
  });

  it("names each port nothing answers on, in one line that says what to do", async () => {
    const check = await checkLocalStack({ api: 54721, db: 54722 }, async (port) => port === 54721);
    expect(check).toEqual({ running: false, down: ["127.0.0.1:54722 (database)"] });
    expect(notRunningMessage("db:reset", check.down)).toBe(
      "[db:reset] the local Supabase stack is not running (nothing answers on 127.0.0.1:54722 (database)): " +
        "needs pnpm dev:local, or runs in CI",
    );
  });

  it("probes real ports", async () => {
    expect(await isListening(await listen())).toBe(true);
    expect(await isListening(await closedPort())).toBe(false);
  });
});

describe("node scripts/lib/local-stack.ts", () => {
  it("fails fast with one line when the stack is not running", async () => {
    const dir = workdir(await closedPort(), await closedPort());
    const result = runCheck("db:reset", { SUPABASE_WORKDIR: dir });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    const lines = result.stderr.trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^\[db:reset\] the local Supabase stack is not running \(nothing answers on /);
    expect(lines[0]).toMatch(/needs pnpm dev:local, or runs in CI$/);
    expect(result.ms).toBeLessThan(10_000);
  });

  it("passes silently when the stack's ports answer", async () => {
    const dir = workdir(await listen(), await listen());
    const result = runCheck("e2e", { SUPABASE_WORKDIR: dir });
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });
});

describe("package.json", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  const desktop = JSON.parse(readFileSync(join(ROOT, "apps/desktop/package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };

  it.each([
    "db:reset",
    "db:types",
    "db:test",
    "functions:serve",
    "test:integration",
    "test:integration:desktop",
    "e2e",
    "e2e:load",
  ])("%s checks the local stack first", (name) => {
    expect(pkg.scripts[name]).toMatch(new RegExp(`^node scripts/lib/local-stack\\.ts ${name} && `));
  });

  it.each(["e2e", "e2e:realtime", "e2e:cleanup"])("desktop %s checks the local stack first", (name) => {
    expect(desktop.scripts[name]).toMatch(/^node \.\.\/\.\.\/scripts\/lib\/local-stack\.ts desktop:\S+ && /);
  });

  it("starts the slim stack with db:start, the list pnpm dev:local uses", () => {
    expect(pkg.scripts["db:start"]).toBe(`supabase start -x ${STACK_EXCLUDE.join(",")}`);
  });

  it("runs pnpm dev against the cloud and pnpm dev:local against the stack", () => {
    expect(pkg.scripts.dev).toBe("node scripts/dev.ts");
    expect(pkg.scripts["dev:local"]).toBe("node scripts/dev.ts --local");
  });
});
