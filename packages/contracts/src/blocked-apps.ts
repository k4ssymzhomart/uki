// The apps the system check (1.2) and the exam-time process scan look for. The executable names live
// only in this file. macOS names are the basename of `ps -axo comm=` (the bundle's CFBundleExecutable);
// Windows names are the image name in the first column of `tasklist /fo csv /nh`.
// Names checked on a macOS 15 laptop on 2026-10-07 carry "checked"; every other name is marked
// "verify on day 3" and must be confirmed on the MacBook and on a Windows 11 lab PC.
import { z } from "zod";
import type { DesktopOs } from "./session.ts";

/** `app`: messengers and AI assistants (row "Other apps"). `screen_share`: remote desktop, meeting and recording tools (row "Screen sharing"). */
export const BlockedAppKind = z.enum(["app", "screen_share"]);
export type BlockedAppKind = z.infer<typeof BlockedAppKind>;

/** One blocked app found running. `name` is the display name shown in `check.apps.fail` and sent as `tab.blocked` `app`. */
export const BlockedApp = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: BlockedAppKind,
});
export type BlockedApp = z.infer<typeof BlockedApp>;

export interface BlockedAppDefinition extends BlockedApp {
  /** Process basenames on macOS, compared case-insensitively. */
  macos: readonly string[];
  /** Image names on Windows, compared case-insensitively. */
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
];

/** The last path segment, for both `/` and `\` separators. */
export function processBasename(name: string): string {
  const trimmed = name.trim();
  const cut = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return cut >= 0 ? trimmed.slice(cut + 1) : trimmed;
}

const lookup: Record<DesktopOs, Map<string, BlockedAppDefinition>> = { macos: new Map(), windows: new Map() };
for (const app of BLOCKED_APPS) {
  for (const os of ["macos", "windows"] as const) {
    for (const exe of app[os]) lookup[os].set(exe.toLowerCase(), app);
  }
}

/**
 * The blocked apps among running processes, each once, in BLOCKED_APPS order, so the 1.2 row can name
 * the first one found. Names may be full paths; only the basename counts, case-insensitively.
 */
export function matchBlockedApps(processNames: readonly string[], os: DesktopOs): BlockedApp[] {
  const found = new Set<string>();
  for (const name of processNames) {
    const app = lookup[os].get(processBasename(name).toLowerCase());
    if (app) found.add(app.id);
  }
  return BLOCKED_APPS.filter((app) => found.has(app.id)).map(({ id, name, kind }) => ({ id, name, kind }));
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

/** Splits matches into the 1.2 rows: "Other apps" and "Screen sharing". */
export function splitByKind(apps: readonly BlockedApp[]): { apps: BlockedApp[]; screenShare: BlockedApp[] } {
  return {
    apps: apps.filter((app) => app.kind === "app"),
    screenShare: apps.filter((app) => app.kind === "screen_share"),
  };
}
