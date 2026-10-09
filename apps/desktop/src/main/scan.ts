// Running apps and screen-sharing tools ("System check on 1.2" in docs/phase-0-plan.md). The process
// list comes from `ps -axo comm=` on macOS, matched on the file name, and from `tasklist /fo csv /nh` on
// Windows; the names live only in packages/contracts/src/blocked-apps.ts. During the exam the same scan
// runs every 15 seconds and reports apps that appeared since the previous scan, so the renderer can send
// tab.blocked with `app` set to the name.
//
// In-app exams also look for other browsers (C2, ScanOptions). On Windows a browser counts only while it
// has a visible window: Edge's startup boost and Chrome's background apps keep msedge.exe and chrome.exe
// running with no window, which a student could not close. When tasklist shows a browser image, one
// PowerShell Get-Process call lists those of its processes that have a main window, with their paths
// (Yandex Browser's generic browser.exe counts only in its own folder). A failed call fails the scan.
import { execFile } from "node:child_process";
import { statfs } from "node:fs/promises";
import { win32 } from "node:path";
import {
  type BlockedApp,
  browserImageNames,
  type DesktopOs,
  matchBlockedApps,
  NO_BROWSERS,
  parsePsComm,
  parseTasklistCsv,
  processBasename,
  type ScanOptions,
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

/**
 * Windows PowerShell, by absolute path: the processes of these images that have a visible main window,
 * one per line, as the full path (or the image name when Windows withholds the path). MainWindowHandle
 * is 0 for a process with no visible top-level window. `exit 0`: images that are not running are no error.
 */
export function windowedProcessesCommand(
  imageNames: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): { file: string; args: readonly string[] } {
  const names = imageNames.map((image) => {
    const name = image.replace(/\.exe$/i, "");
    // The names come from the contract; anything else never reaches the command line.
    if (!/^[A-Za-z0-9_.-]+$/.test(name)) throw new Error(`not an image name: ${image}`);
    return `'${name}'`;
  });
  const script = [
    `Get-Process -Name ${names.join(",")} -ErrorAction SilentlyContinue`,
    "Where-Object { $_.MainWindowHandle -ne 0 }",
    "ForEach-Object { if ($_.Path) { $_.Path } else { $_.Name + '.exe' } }",
  ].join(" | ");
  const systemRoot = env.SystemRoot ?? env.windir ?? "C:\\Windows";
  return {
    file: win32.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
    args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", `${script}; exit 0`],
  };
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

/**
 * Windows: the process list with each browser image replaced by its processes that have a window, as
 * full paths. No browser image running: no PowerShell call.
 */
export async function keepWindowedBrowsers(
  names: readonly string[],
  exec: ExecFileLike = execFileAsync,
): Promise<string[]> {
  const images = new Set(browserImageNames("windows"));
  const isBrowser = (name: string) => images.has(processBasename(name).toLowerCase());
  const running = [...new Set(names.filter(isBrowser).map((name) => processBasename(name).toLowerCase()))];
  const others = names.filter((name) => !isBrowser(name));
  if (running.length === 0) return others;
  const { file, args } = windowedProcessesCommand(running);
  const { stdout } = await exec(file, args, {
    timeout: TIMEOUT_MS,
    maxBuffer: MAX_BUFFER,
    windowsHide: true,
  });
  return [...others, ...parsePsComm(stdout)];
}

/** The blocked apps running now, each once, in the contract's list order; browsers only when asked. */
export async function findBlockedApps(
  os: DesktopOs,
  options: ScanOptions = NO_BROWSERS,
  exec: ExecFileLike = execFileAsync,
): Promise<BlockedApp[]> {
  let names = await listProcesses(os, exec);
  if (os === "windows" && options.browsers) names = await keepWindowedBrowsers(names, exec);
  return matchBlockedApps(names, os, options);
}

/** Free space on the volume that holds `path`, in MB (row Storage on 1.2). */
export async function freeMegabytes(path: string): Promise<number> {
  const stats = await statfs(path);
  return Math.floor((stats.bavail * stats.bsize) / (1024 * 1024));
}

/** checks.scan(): the "Other apps" (browsers too, when asked), "Screen sharing" and "Storage" rows of 1.2. */
export async function scanSystem(options: {
  os: DesktopOs;
  userDataPath: string;
  scan?: ScanOptions;
  findApps?: (scan: ScanOptions) => Promise<BlockedApp[]>;
  freeMb?: (path: string) => Promise<number>;
}): Promise<ScanResult> {
  const scan = options.scan ?? NO_BROWSERS;
  const [found, freeMb] = await Promise.all([
    (options.findApps ?? ((asked: ScanOptions) => findBlockedApps(options.os, asked)))(scan),
    (options.freeMb ?? freeMegabytes)(options.userDataPath),
  ]);
  return { ...splitByKind(found), freeMb };
}

export type BlockedAppWatcherOptions = {
  /** One scan, with what start() was asked to look for. */
  findApps: (scan: ScanOptions) => Promise<BlockedApp[]>;
  /** Apps that appeared since the previous scan; never called with an empty list. */
  onAppeared: (apps: BlockedApp[]) => void;
  /** A scan that failed; the watcher keeps going and compares the next scan with the last good one. */
  onError?: (error: unknown) => void;
  intervalMs?: number;
};

export interface BlockedAppWatcher {
  readonly running: boolean;
  /**
   * Scans at once, then every interval, for the blocked apps and, when asked, browsers. A second start
   * while running changes nothing.
   */
  start(scan?: ScanOptions): void;
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
  let scan: ScanOptions = NO_BROWSERS;

  async function tick(): Promise<void> {
    if (inFlight) return;
    inFlight = true;
    const started = generation;
    try {
      const apps = await options.findApps(scan);
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
    start(asked = NO_BROWSERS) {
      if (timer !== null) return;
      scan = asked;
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
