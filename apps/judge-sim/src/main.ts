// Entry point of judge-sim.mjs (built by build.mjs into one file next to its stills/ folder). On the VPS
// the Scheduled Task "uki-judge-sim" runs `node judge-sim.mjs --env-file C:\apps\uki\judge-sim.env`
// (deploy/vps/install.ps1). `--dry-run` prints the plan and talks to nothing.
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { STILL } from "@uki/contracts";
import { SupabaseApi } from "./api.ts";
import { ConfigError, readConfig, USAGE } from "./config.ts";
import { STILL_FILES, type StillName } from "./episodes.ts";
import { RotatingLog } from "./log.ts";
import { renderPlan } from "./plan.ts";
import { createRng } from "./rng.ts";
import { Simulator } from "./runner.ts";
import { StateStore } from "./state.ts";

export const VERSION = "0.1.0";

/** The stills next to the bundle (dist/judge-sim/stills), or the package's own when run from source. */
export function stillsDir(bundleDir: string): string {
  const beside = join(bundleDir, "stills");
  return existsSync(beside) ? beside : join(bundleDir, "..", "stills");
}

export function loadStills(dir: string): Record<StillName, Uint8Array> {
  const entries = Object.entries(STILL_FILES).map(([name, file]) => {
    const path = join(dir, file);
    const size = statSync(path).size;
    if (size > STILL.maxBytes)
      throw new Error(`${file} is ${size} bytes; stills are ${STILL.maxBytes} at most`);
    return [name, new Uint8Array(readFileSync(path))] as const;
  });
  return Object.fromEntries(entries) as Record<StillName, Uint8Array>;
}

export async function main(argv: readonly string[], bundleDir: string): Promise<number> {
  let config: ReturnType<typeof readConfig>;
  try {
    config = readConfig(argv, bundleDir);
  } catch (error) {
    if (error instanceof ConfigError) {
      process.stderr.write(`judge-sim: ${error.message}\n\n${USAGE}\n`);
      return 2;
    }
    throw error;
  }
  if (config === "help") {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  const stills = loadStills(stillsDir(bundleDir));
  if (config.dryRun) {
    process.stdout.write(renderPlan(config));
    process.stdout.write(
      `\nStills: ${Object.values(STILL_FILES).join(", ")} from ${stillsDir(bundleDir)}, ` +
        `${Object.values(stills).reduce((sum, bytes) => sum + bytes.length, 0)} bytes in all.\n`,
    );
    return 0;
  }

  const log = new RotatingLog({ dir: config.logDir, maxBytes: config.logMaxBytes, files: config.logFiles });
  process.on("uncaughtException", (error) => {
    log.error(`uncaught: ${error.stack ?? error.message}`);
    process.exit(1);
  });
  process.on("unhandledRejection", (reason) => {
    log.error(
      `unhandled rejection: ${reason instanceof Error ? (reason.stack ?? reason.message) : String(reason)}`,
    );
    process.exit(1);
  });
  const simulator = new Simulator({
    api: new SupabaseApi({ url: config.url as string, publishableKey: config.publishableKey as string }),
    store: new StateStore(config.stateDir),
    log,
    config,
    stills,
    rng: createRng(config.seed),
    version: VERSION,
  });
  simulator.start();
  await new Promise<void>((resolve) => {
    const stop = () => {
      simulator.stop().then(resolve, resolve);
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    process.once("SIGBREAK", stop);
  });
  return 0;
}

/** True when this module is the script Node was started with (the bundle), not an import (tests). */
export function isEntry(moduleUrl: string, argv1: string | undefined): boolean {
  if (argv1 === undefined) return false;
  const norm = (path: string) => (process.platform === "win32" ? resolve(path).toLowerCase() : resolve(path));
  return norm(fileURLToPath(moduleUrl)) === norm(argv1);
}

if (isEntry(import.meta.url, process.argv[1])) {
  main(process.argv.slice(2), dirname(fileURLToPath(import.meta.url))).then(
    (code) => process.exit(code),
    (error: unknown) => {
      process.stderr.write(
        `judge-sim: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
      );
      process.exit(1);
    },
  );
}
