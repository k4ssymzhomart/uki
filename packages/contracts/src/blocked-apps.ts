// The apps the system check (1.2) and the exam-time process scan look for. The executable names live
// only in this file. macOS names are the basename of `ps -axo comm=` (the bundle's CFBundleExecutable);
// Windows names are the image name in the first column of `tasklist /fo csv /nh`.
// Names checked on a macOS 15 laptop on 2026-10-07 carry "checked"; every other name is marked
// "verify on day 3" and must be confirmed on the MacBook and on a Windows 11 lab PC. The browsers (C2 in
// docs/finals-plan.md) were added on 2026-10-09: "checked" there means seen in `ps` on the MacBook
// (macOS 15.6); "verify on Monday" means the lab session of 12 October (docs/runbooks/lab-session.md).
import { z } from "zod";
import type { DesktopOs, ExamMode } from "./session.ts";

/**
 * `app`: messengers and AI assistants (row "Other apps"). `screen_share`: remote desktop, meeting and
 * recording tools (row "Screen sharing"). `browser`: other web browsers, looked for in in-app exams only
 * (`blocksBrowsers`) and shown in the "Other apps" row.
 */
export const BlockedAppKind = z.enum(["app", "screen_share", "browser"]);
export type BlockedAppKind = z.infer<typeof BlockedAppKind>;

/** One blocked app found running. `name` is the display name shown in `check.apps.fail` and sent as `tab.blocked` `app`. */
export const BlockedApp = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: BlockedAppKind,
});
export type BlockedApp = z.infer<typeof BlockedApp>;

/**
 * An entry is a process basename on macOS or an image name on Windows, compared case-insensitively. An
 * entry with a path separator in it is a path suffix instead: it matches only a full path that ends with
 * it, for a name other programs use too (Yandex Browser's `browser.exe`). An empty list: no such app on
 * that system.
 */
export interface BlockedAppDefinition extends BlockedApp {
  macos: readonly string[];
  windows: readonly string[];
}

export const BLOCKED_APPS: readonly BlockedAppDefinition[] = [
  {
    id: "telegram",
    name: "Telegram",
    kind: "app",
    macos: ["Telegram"], // checked: running process
    windows: ["Telegram.exe"], // verify on day 3
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    kind: "app",
    macos: ["WhatsApp"], // checked: running process
    windows: ["WhatsApp.exe", "WhatsApp.Root.exe"], // verify on day 3: the Store app's image name changed in 2025
  },
  {
    id: "discord",
    name: "Discord",
    kind: "app",
    macos: ["Discord"], // verify on day 3
    windows: ["Discord.exe"], // verify on day 3
  },
  {
    id: "viber",
    name: "Viber",
    kind: "app",
    macos: ["Viber"], // verify on day 3
    windows: ["Viber.exe"], // verify on day 3
  },
  {
    id: "chatgpt",
    name: "ChatGPT",
    kind: "app",
    macos: ["ChatGPT"], // checked: CFBundleExecutable
    windows: ["ChatGPT.exe"], // verify on day 3
  },
  {
    id: "claude",
    name: "Claude",
    kind: "app",
    // checked: running process. Case-insensitive, so the Claude Code CLI ("claude") matches too.
    macos: ["Claude"],
    windows: ["claude.exe"], // verify on day 3
  },
  {
    id: "anydesk",
    name: "AnyDesk",
    kind: "screen_share",
    macos: ["AnyDesk"], // verify on day 3
    windows: ["AnyDesk.exe"], // verify on day 3
  },
  {
    id: "teamviewer",
    name: "TeamViewer",
    kind: "screen_share",
    // verify on day 3: only the app, not TeamViewer_Service, which runs whenever TeamViewer is installed
    macos: ["TeamViewer"],
    windows: ["TeamViewer.exe"], // verify on day 3
  },
  {
    id: "rustdesk",
    name: "RustDesk",
    kind: "screen_share",
    macos: ["RustDesk"], // verify on day 3
    windows: ["rustdesk.exe"], // verify on day 3
  },
  {
    id: "chrome-remote-desktop",
    name: "Chrome Remote Desktop",
    kind: "screen_share",
    macos: ["remoting_me2me_host"], // verify on day 3: the host process inside ChromeRemoteDesktopHost.app
    windows: ["remoting_desktop.exe", "remote_assistance_host.exe"], // verify on day 3: session processes
  },
  {
    id: "zoom",
    name: "Zoom",
    kind: "screen_share",
    macos: ["zoom.us"], // checked: CFBundleExecutable
    windows: ["Zoom.exe"], // verify on day 3
  },
  {
    id: "microsoft-teams",
    name: "Microsoft Teams",
    kind: "screen_share",
    macos: ["MSTeams", "Microsoft Teams"], // MSTeams checked: CFBundleExecutable; the classic name: verify on day 3
    windows: ["ms-teams.exe", "Teams.exe"], // verify on day 3: new Teams, then classic Teams
  },
  {
    id: "obs-studio",
    name: "OBS Studio",
    kind: "screen_share",
    macos: ["OBS"], // verify on day 3
    windows: ["obs64.exe"], // verify on day 3
  },
  // Browsers. Only the main executable counts, never a helper: "Google Chrome Helper (Renderer)",
  // msedgewebview2.exe (the WebView2 runtime inside Teams, Outlook and Widgets), other apps' Chromium
  // ("Google Chrome for Testing", chrome-headless-shell, Electron, Üki itself) all have other names. On
  // Windows the scan counts a browser only while it has a visible window (apps/desktop/src/main/scan.ts),
  // because Edge's startup boost keeps msedge.exe running with no window and nothing the student can close.
  {
    id: "chrome",
    name: "Google Chrome",
    kind: "browser",
    macos: ["Google Chrome"], // checked: running process (Chrome 154)
    windows: ["chrome.exe"], // verify on Monday
  },
  {
    id: "edge",
    name: "Microsoft Edge",
    kind: "browser",
    macos: ["Microsoft Edge"], // CFBundleExecutable (not installed on the MacBook)
    windows: ["msedge.exe"], // verify on Monday; never msedgewebview2.exe
  },
  {
    id: "firefox",
    name: "Firefox",
    kind: "browser",
    macos: ["firefox"], // CFBundleExecutable (not installed); its children are plugin-container
    windows: ["firefox.exe"], // verify on Monday
  },
  {
    id: "opera",
    name: "Opera",
    kind: "browser",
    macos: ["Opera"], // CFBundleExecutable, also of Opera GX (not installed)
    windows: ["opera.exe"], // verify on Monday: also Opera GX; launcher.exe only starts it
  },
  {
    id: "yandex-browser",
    name: "Yandex Browser",
    kind: "browser",
    macos: ["Yandex"], // CFBundleExecutable of Yandex.app (not installed)
    // verify on Monday: browser.exe is a generic name, so only the default install folder counts, per
    // user (%LOCALAPPDATA%) or per machine (Program Files)
    windows: ["\\Yandex\\YandexBrowser\\Application\\browser.exe"],
  },
  {
    id: "safari",
    name: "Safari",
    kind: "browser",
    // checked: running process, started from /System/Volumes/Preboot/Cryptexes/App/System/Applications
    macos: ["Safari"],
    windows: [], // no Safari for Windows
  },
];

/**
 * In-app exams only: an exam in the browser runs in Chrome or Edge under Üki Lock, so there the scan
 * leaves browsers alone.
 */
export function blocksBrowsers(mode: ExamMode): boolean {
  return mode === "app";
}

/**
 * What the process scan looks for besides the blocked apps and screen-sharing tools: other browsers
 * (`blocksBrowsers`). Sent with `checks.scan` and `checks.watch` (ipc.ts).
 */
export const ScanOptions = z.strictObject({ browsers: z.boolean() });
export type ScanOptions = z.infer<typeof ScanOptions>;

/** Browsers left alone: browser exams, and a caller that does not say. */
export const NO_BROWSERS: ScanOptions = { browsers: false };

/** The last path segment, for both `/` and `\` separators. */
export function processBasename(name: string): string {
  const trimmed = name.trim();
  const cut = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return cut >= 0 ? trimmed.slice(cut + 1) : trimmed;
}

/** Both separators as "/", lower case, no surrounding blanks. */
function normalizePath(name: string): string {
  return name.trim().replace(/\\/g, "/").toLowerCase();
}

const isPathEntry = (entry: string): boolean => /[\\/]/.test(entry);

const lookup: Record<DesktopOs, Map<string, BlockedAppDefinition>> = { macos: new Map(), windows: new Map() };
/** Path-suffix entries, normalised, without a leading separator. */
const suffixes: Record<DesktopOs, Array<[string, BlockedAppDefinition]>> = { macos: [], windows: [] };
for (const app of BLOCKED_APPS) {
  for (const os of ["macos", "windows"] as const) {
    for (const entry of app[os]) {
      if (isPathEntry(entry)) suffixes[os].push([normalizePath(entry).replace(/^\/+/, ""), app]);
      else lookup[os].set(entry.toLowerCase(), app);
    }
  }
}

function findDefinition(processName: string, os: DesktopOs): BlockedAppDefinition | undefined {
  const byName = lookup[os].get(processBasename(processName).toLowerCase());
  if (byName) return byName;
  const path = normalizePath(processName);
  return suffixes[os].find(([suffix]) => path.endsWith(`/${suffix}`))?.[1];
}

/**
 * The blocked apps among running processes, each once, in BLOCKED_APPS order, so the 1.2 row can name
 * the first one found. Names may be full paths; the basename counts, case-insensitively, except for
 * path-suffix entries, which need the full path. Browsers count only with `browsers: true`.
 */
export function matchBlockedApps(
  processNames: readonly string[],
  os: DesktopOs,
  options: ScanOptions = NO_BROWSERS,
): BlockedApp[] {
  const found = new Set<string>();
  for (const name of processNames) {
    const app = findDefinition(name, os);
    if (app && (app.kind !== "browser" || options.browsers)) found.add(app.id);
  }
  return BLOCKED_APPS.filter((app) => found.has(app.id)).map(({ id, name, kind }) => ({ id, name, kind }));
}

/**
 * The browsers' image names on one system (basenames, lower case), for a scan that must look closer at
 * them: on Windows, which of them has a window, and where `browser.exe` lives.
 */
export function browserImageNames(os: DesktopOs): string[] {
  const names = BLOCKED_APPS.filter((app) => app.kind === "browser").flatMap((app) =>
    app[os].map((entry) => processBasename(entry).toLowerCase()),
  );
  return [...new Set(names)];
}

/** Process names from `ps -axo comm=` output: one per line, full paths kept. */
export function parsePsComm(stdout: string): string[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

/** Image names from `tasklist /fo csv /nh` output: the first quoted column of each line. */
export function parseTasklistCsv(stdout: string): string[] {
  const names: string[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const match = /^"((?:[^"]|"")*)"/.exec(line.trim());
    const name = match?.[1]?.replace(/""/g, '"');
    if (name) names.push(name);
  }
  return names;
}

/**
 * Splits matches into the 1.2 rows: "Other apps" (apps, then browsers, in list order) and "Screen
 * sharing". A browser reuses the row's strings: "Google Chrome is open. Close it to continue."
 */
export function splitByKind(apps: readonly BlockedApp[]): { apps: BlockedApp[]; screenShare: BlockedApp[] } {
  return {
    apps: apps.filter((app) => app.kind === "app" || app.kind === "browser"),
    screenShare: apps.filter((app) => app.kind === "screen_share"),
  };
}
