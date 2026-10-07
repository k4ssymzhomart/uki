import { describe, expect, it } from "vitest";
import {
  BLOCKED_APPS,
  matchBlockedApps,
  parsePsComm,
  parseTasklistCsv,
  processBasename,
  splitByKind,
} from "./blocked-apps.ts";

describe("the starting list", () => {
  it("names the plan's 13 apps, each with names for both systems", () => {
    expect(BLOCKED_APPS.map((a) => a.name).sort()).toEqual(
      [
        "Telegram",
        "WhatsApp",
        "Discord",
        "Viber",
        "AnyDesk",
        "TeamViewer",
        "RustDesk",
        "Chrome Remote Desktop",
        "Zoom",
        "Microsoft Teams",
        "OBS Studio",
        "ChatGPT",
        "Claude",
      ].sort(),
    );
    for (const app of BLOCKED_APPS) {
      expect(app.macos.length, app.id).toBeGreaterThan(0);
      expect(app.windows.length, app.id).toBeGreaterThan(0);
      expect(
        app.windows.every((name) => name.toLowerCase().endsWith(".exe")),
        app.id,
      ).toBe(true);
    }
    expect(new Set(BLOCKED_APPS.map((a) => a.id)).size).toBe(BLOCKED_APPS.length);
  });

  it("sorts messengers and AI assistants as apps, the rest as screen sharing", () => {
    const kinds = Object.fromEntries(BLOCKED_APPS.map((a) => [a.name, a.kind]));
    for (const name of ["Telegram", "WhatsApp", "Discord", "Viber", "ChatGPT", "Claude"]) {
      expect(kinds[name], name).toBe("app");
    }
    for (const name of [
      "AnyDesk",
      "TeamViewer",
      "RustDesk",
      "Chrome Remote Desktop",
      "Zoom",
      "Microsoft Teams",
      "OBS Studio",
    ]) {
      expect(kinds[name], name).toBe("screen_share");
    }
  });
});

describe("matchBlockedApps on macOS", () => {
  const ps = [
    "/sbin/launchd",
    "/Applications/Telegram.app/Contents/MacOS/Telegram",
    "/Applications/Telegram.app/Contents/Helpers/crashpad_handler",
    "/Applications/Claude.app/Contents/Frameworks/Claude Helper (Renderer).app/Contents/MacOS/Claude Helper (Renderer)",
    "/Applications/zoom.us.app/Contents/MacOS/zoom.us",
    "/Applications/WhatsApp.app/Contents/PlugIns/ServiceExtension.appex/Contents/MacOS/ServiceExtension",
    "/Applications/Microsoft Teams.app/Contents/MacOS/MSTeams",
  ].join("\n");

  it("matches basenames of ps -axo comm= output, in list order, once each", () => {
    const found = matchBlockedApps(
      [...parsePsComm(ps), "/Applications/Telegram.app/Contents/MacOS/Telegram"],
      "macos",
    );
    expect(found).toEqual([
      { id: "telegram", name: "Telegram", kind: "app" },
      { id: "zoom", name: "Zoom", kind: "screen_share" },
      { id: "microsoft-teams", name: "Microsoft Teams", kind: "screen_share" },
    ]);
  });

  it("does not match helpers or extensions of an app", () => {
    expect(matchBlockedApps(["Claude Helper", "ServiceExtension", "Discord Helper (GPU)"], "macos")).toEqual(
      [],
    );
  });

  it("is case-insensitive", () => {
    expect(matchBlockedApps(["/usr/local/bin/claude"], "macos").map((a) => a.id)).toEqual(["claude"]);
    expect(matchBlockedApps(["rustdesk"], "macos").map((a) => a.id)).toEqual(["rustdesk"]);
  });

  it("does not use Windows names on macOS", () => {
    expect(matchBlockedApps(["Telegram.exe"], "macos")).toEqual([]);
  });
});

describe("matchBlockedApps on Windows", () => {
  const tasklist = [
    '"System Idle Process","0","Services","0","8 K"',
    '"Telegram.exe","4321","Console","1","182,344 K"',
    '"obs64.exe","5120","Console","1","210,000 K"',
    '"svchost.exe","1012","Services","0","12,000 K"',
    '"ms-teams.exe","7001","Console","1","300,111 K"',
    "",
  ].join("\r\n");

  it("parses tasklist /fo csv /nh and matches image names", () => {
    const names = parseTasklistCsv(tasklist);
    expect(names).toEqual([
      "System Idle Process",
      "Telegram.exe",
      "obs64.exe",
      "svchost.exe",
      "ms-teams.exe",
    ]);
    expect(matchBlockedApps(names, "windows").map((a) => a.id)).toEqual([
      "telegram",
      "microsoft-teams",
      "obs-studio",
    ]);
  });

  it("is case-insensitive and takes full paths", () => {
    expect(matchBlockedApps(["C:\\Program Files\\AnyDesk\\ANYDESK.EXE"], "windows").map((a) => a.id)).toEqual(
      ["anydesk"],
    );
  });

  it("splits matches into the two 1.2 rows", () => {
    const found = matchBlockedApps(["Telegram.exe", "Zoom.exe", "ChatGPT.exe"], "windows");
    expect(splitByKind(found)).toEqual({
      apps: [
        { id: "telegram", name: "Telegram", kind: "app" },
        { id: "chatgpt", name: "ChatGPT", kind: "app" },
      ],
      screenShare: [{ id: "zoom", name: "Zoom", kind: "screen_share" }],
    });
  });
});

describe("processBasename", () => {
  it("takes the last segment for both separators", () => {
    expect(processBasename("/a/b/zoom.us")).toBe("zoom.us");
    expect(processBasename("C:\\x\\Zoom.exe")).toBe("Zoom.exe");
    expect(processBasename("  Telegram  ")).toBe("Telegram");
  });
});
