// Running apps and screen-sharing tools ("System check on 1.2" in docs/phase-0-plan.md). The process
// list comes from `ps -axo comm=` on macOS, matched on the file name, and from `tasklist /fo csv /nh` on
// Windows; the names live only in packages/contracts/src/blocked-apps.ts. During the exam the same scan
// runs every 15 seconds and reports apps that appeared since the previous scan, so the renderer can send
// tab.blocked with `app` set to the name.
import { execFile } from "node:child_process";
import { statfs } from "node:fs/promises";
import { win32 } from "node:path";
import {
  type BlockedApp,
  type DesktopOs,
  matchBlockedApps,
  parsePsComm,
  parseTasklistCsv,
  type ScanResult,
  splitByKind,
  THRESHOLDS,
} from "@uki/contracts";

export type ExecFileLike = (
  file: string,
  args: readonly string[],
  options: { timeout: number; maxBuffer: number; windowsHide: boolean },
) => Promise<{ stdout: string }>;

/** The process-list command per system, by absolute path so PATH cannot swap it. */
export function processListCommand(
  os: DesktopOs,
  env: NodeJS.ProcessEnv = process.env,
): { file: string; args: readonly string[] } {
  if (os === "macos") return { file: "/bin/ps", args: ["-axo", "comm="] };
  const systemRoot = env.SystemRoot ?? env.windir ?? "C:\\Windows";
  return { file: win32.join(systemRoot, "System32", "tasklist.exe"), args: ["/fo", "csv", "/nh"] };
}

/** Process names from the command's output: full paths on macOS, image names on Windows. */
export function parseProcessList(os: DesktopOs, stdout: string): string[] {
  return os === "macos" ? parsePsComm(stdout) : parseTasklistCsv(stdout);
}

const execFileAsync: ExecFileLike = (file, args, options) =>
  new Promise((resolve, reject) => {
    execFile(file, [...args], { ...options, encoding: "utf8" }, (error, stdout) => {
      if (error) reject(error);
      else resolve({ stdout });
    });
  });

/** A process list of a few hundred lines is well under this. */
const MAX_BUFFER = 8 * 1024 * 1024;
const TIMEOUT_MS = 10_000;

export async function listProcesses(os: DesktopOs, exec: ExecFileLike = execFileAsync): Promise<string[]> {
  const { file, args } = processListCommand(os);
  const { stdout } = await exec(file, args, {
    timeout: TIMEOUT_MS,
    maxBuffer: MAX_BUFFER,
    windowsHide: true,
  });
  return parseProcessList(os, stdout);
}

/** The blocked apps running now, each once, in the contract's list order. */
export async function findBlockedApps(os: DesktopOs, exec?: ExecFileLike): Promise<BlockedApp[]> {
  return matchBlockedApps(await listProcesses(os, exec), os);
}

/** Free space on the volume that holds `path`, in MB (row Storage on 1.2). */
export async function freeMegabytes(path: string): Promise<number> {
  const stats = await statfs(path);
  return Math.floor((stats.bavail * stats.bsize) / (1024 * 1024));
}

/** checks.scan(): the "Other apps", "Screen sharing" and "Storage" rows of 1.2. */
export async function scanSystem(options: {
  os: DesktopOs;
  userDataPath: string;
  findApps?: () => Promise<BlockedApp[]>;
  freeMb?: (path: string) => Promise<number>;
}): Promise<ScanResult> {
  const [found, freeMb] = await Promise.all([
    (options.findApps ?? (() => findBlockedApps(options.os)))(),
    (options.freeMb ?? freeMegabytes)(options.userDataPath),
  ]);
  return { ...splitByKind(found), freeMb };
}

export type BlockedAppWatcherOptions = {
  findApps: () => Promise<BlockedApp[]>;
  /** Apps that appeared since the previous scan; never called with an empty list. */
  onAppeared: (apps: BlockedApp[]) => void;
  /** A scan that failed; the watcher keeps going and compares the next scan with the last good one. */
  onError?: (error: unknown) => void;
  intervalMs?: number;
};

export interface BlockedAppWatcher {
  readonly running: boolean;
  /** Scans at once, then every interval. A second start while running changes nothing. */
  start(): void;
  stop(): void;
  /** One scan now (the interval calls this). Overlapping calls are skipped. */
  tick(): Promise<void>;
}

/**
 * The exam-time scan. The first scan after start reports every blocked app running (1.2 let none
 * through), later scans report the apps that were not running at the previous scan. An app that quits
 * and starts again is reported again.
 */
export function createBlockedAppWatcher(options: BlockedAppWatcherOptions): BlockedAppWatcher {
  const intervalMs = options.intervalMs ?? THRESHOLDS.systemCheck.scanIntervalMs;
  let timer: ReturnType<typeof setInterval> | null = null;
  let previous = new Set<string>();
  let inFlight = false;
  let generation = 0;

  async function tick(): Promise<void> {
    if (inFlight) return;
    inFlight = true;
    const started = generation;
    try {
      const apps = await options.findApps();
      // stop() during the scan: drop the result, the next start begins afresh.
      if (started !== generation) return;
      const appeared = apps.filter((app) => !previous.has(app.id));
      previous = new Set(apps.map((app) => app.id));
      if (appeared.length > 0) options.onAppeared(appeared);
    } catch (error) {
      options.onError?.(error);
    } finally {
      inFlight = false;
    }
  }

  return {
    get running() {
      return timer !== null;
    },
    start() {
      if (timer !== null) return;
      previous = new Set();
      timer = setInterval(() => void tick(), intervalMs);
      void tick();
    },
    stop() {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
      generation += 1;
    },
    tick,
  };
}
