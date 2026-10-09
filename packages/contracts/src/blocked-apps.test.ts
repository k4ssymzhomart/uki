import { describe, expect, it } from "vitest";
import {
  BLOCKED_APPS,
  BlockedApp,
  blocksBrowsers,
  browserImageNames,
  matchBlockedApps,
  NO_BROWSERS,
  parsePsComm,
  parseTasklistCsv,
  processBasename,
  ScanOptions,
  splitByKind,
} from "./blocked-apps.ts";

const BROWSERS = ["Google Chrome", "Microsoft Edge", "Firefox", "Opera", "Yandex Browser", "Safari"];

describe("the starting list", () => {
  it("names the plan's 13 apps and the finals' 6 browsers, each with names for both systems", () => {
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
        ...BROWSERS,
      ].sort(),
    );
    for (const app of BLOCKED_APPS) {
      expect(app.macos.length, app.id).toBeGreaterThan(0);
      // Safari has no Windows version.
      if (app.id !== "safari") expect(app.windows.length, app.id).toBeGreaterThan(0);
      expect(
        app.windows.every((name) => name.toLowerCase().endsWith(".exe")),
        app.id,
      ).toBe(true);
      expect(BlockedApp.parse({ id: app.id, name: app.name, kind: app.kind }).id).toBe(app.id);
    }
    expect(new Set(BLOCKED_APPS.map((a) => a.id)).size).toBe(BLOCKED_APPS.length);
  });

  it("lists the browsers as kind browser, after the apps they would otherwise hide in the 1.2 row", () => {
    const browsers = BLOCKED_APPS.filter((a) => a.kind === "browser");
    expect(browsers.map((a) => a.name)).toEqual(BROWSERS);
    const firstBrowser = BLOCKED_APPS.findIndex((a) => a.kind === "browser");
    expect(BLOCKED_APPS.slice(firstBrowser).every((a) => a.kind === "browser")).toBe(true);
  });

  it("never lists a helper, the WebView2 runtime or an Electron shell as a browser", () => {
    const names = BLOCKED_APPS.flatMap((a) => [...a.macos, ...a.windows].map((n) => n.toLowerCase()));
    for (const name of [
      "msedgewebview2.exe",
      "electron",
      "electron.exe",
      "uki",
      "uki.exe",
      "google chrome helper",
      "google chrome helper (renderer)",
      "microsoft edge helper",
      "plugin-container",
      "com.apple.webkit.webcontent",
      "browser.exe",
    ]) {
      expect(names, name).not.toContain(name);
    }
  });

  it("blocks browsers in in-app exams only", () => {
    expect(blocksBrowsers("app")).toBe(true);
    expect(blocksBrowsers("browser")).toBe(false);
    expect(NO_BROWSERS).toEqual({ browsers: false });
    expect(ScanOptions.parse({ browsers: true })).toEqual({ browsers: true });
    expect(() => ScanOptions.parse({ browsers: "yes" })).toThrow();
    expect(() => ScanOptions.parse({ browsers: true, apps: false })).toThrow();
    expect(BlockedApp.safeParse({ id: "chrome", name: "Google Chrome", kind: "browser" }).success).toBe(true);
    expect(BlockedApp.safeParse({ id: "chrome", name: "Google Chrome", kind: "web" }).success).toBe(false);
  });

  it("names the browser image names a Windows scan must look closer at", () => {
    expect(browserImageNames("windows")).toEqual([
      "chrome.exe",
      "msedge.exe",
      "firefox.exe",
      "opera.exe",
      "browser.exe",
    ]);
    expect(browserImageNames("macos")).toEqual([
      "google chrome",
      "microsoft edge",
      "firefox",
      "opera",
      "yandex",
      "safari",
    ]);
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

describe("browsers on macOS (C2)", () => {
  // From `ps -axo comm=` on the MacBook (macOS 15.6, 9 October 2026), Chrome 154 and Safari 18.6 running,
  // plus the documented bundle executables of the browsers it does not have.
  const chromeDir = "/Applications/Google Chrome.app/Contents";
  const helpers = `${chromeDir}/Frameworks/Google Chrome Framework.framework/Versions/154.0.8037.98/Helpers`;
  const ps = [
    `${chromeDir}/MacOS/Google Chrome`,
    `${helpers}/Google Chrome Helper (Renderer).app/Contents/MacOS/Google Chrome Helper (Renderer)`,
    `${helpers}/Google Chrome Helper.app/Contents/MacOS/Google Chrome Helper`,
    `${helpers}/chrome_crashpad_handler`,
    "/System/Volumes/Preboot/Cryptexes/App/System/Applications/Safari.app/Contents/MacOS/Safari",
    "/System/Cryptexes/App/usr/libexec/SafariLaunchAgent",
    "/System/Library/PrivateFrameworks/SafariSafeBrowsing.framework/com.apple.Safari.SafeBrowsing.Service",
    "/Applications/Claude.app/Contents/Frameworks/Electron Framework.framework/Helpers/chrome_crashpad_handler",
    "/Applications/Claude.app/Contents/Helpers/chrome-native-host",
    "/Applications/Uki.app/Contents/MacOS/Uki",
    "/Applications/Uki.app/Contents/Frameworks/Uki Helper (GPU).app/Contents/MacOS/Uki Helper (GPU)",
    "/Users/k/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    "/Users/k/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell",
    "/Users/k/dev/uki/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
  ];

  it("finds Chrome and Safari by their own executables only, and only when asked", () => {
    expect(matchBlockedApps(ps, "macos", { browsers: true })).toEqual([
      { id: "chrome", name: "Google Chrome", kind: "browser" },
      { id: "safari", name: "Safari", kind: "browser" },
    ]);
    expect(matchBlockedApps(ps, "macos")).toEqual([]);
    expect(matchBlockedApps(ps, "macos", { browsers: false })).toEqual([]);
    // Helpers, Electron, Üki, Playwright's Chromium and Claude's Chromium bits never count.
    expect(
      matchBlockedApps(
        ps.slice(1).filter((p) => !p.endsWith("/Safari")),
        "macos",
        { browsers: true },
      ),
    ).toEqual([]);
  });

  it("knows the other browsers' bundle executables", () => {
    const found = matchBlockedApps(
      [
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        "/Applications/Microsoft Edge.app/Contents/Frameworks/Microsoft Edge Framework.framework/Helpers/Microsoft Edge Helper (Renderer).app/Contents/MacOS/Microsoft Edge Helper (Renderer)",
        "/Applications/Firefox.app/Contents/MacOS/firefox",
        "/Applications/Firefox.app/Contents/MacOS/plugin-container.app/Contents/MacOS/plugin-container",
        "/Applications/Opera GX.app/Contents/MacOS/Opera",
        "/Applications/Yandex.app/Contents/MacOS/Yandex",
        "/Applications/Yandex Music.app/Contents/MacOS/Yandex Music",
      ],
      "macos",
      { browsers: true },
    );
    expect(found.map((a) => a.id)).toEqual(["edge", "firefox", "opera", "yandex-browser"]);
  });
});

describe("browsers on Windows (C2)", () => {
  // tasklist /fo csv /nh on Windows 11, with the paths the scan's PowerShell call adds for windowed
  // browser processes (apps/desktop/src/main/scan.ts).
  it("matches image names, never the WebView2 runtime, Üki or Electron", () => {
    const names = [
      "chrome.exe",
      "msedge.exe",
      "msedgewebview2.exe",
      "firefox.exe",
      "opera.exe",
      "Uki.exe",
      "electron.exe",
      "steamwebhelper.exe",
    ];
    expect(matchBlockedApps(names, "windows", { browsers: true }).map((a) => a.id)).toEqual([
      "chrome",
      "edge",
      "firefox",
      "opera",
    ]);
    expect(matchBlockedApps(names, "windows")).toEqual([]);
    expect(
      matchBlockedApps(["msedgewebview2.exe", "Uki.exe", "electron.exe"], "windows", { browsers: true }),
    ).toEqual([]);
  });

  it("counts browser.exe as Yandex Browser only in Yandex's folder, per user or per machine", () => {
    const yandex = (path: string) => matchBlockedApps([path], "windows", { browsers: true }).map((a) => a.id);
    expect(yandex("browser.exe")).toEqual([]);
    expect(yandex("C:\\Games\\Launcher\\browser.exe")).toEqual([]);
    expect(
      yandex("C:\\Users\\aliya\\AppData\\Local\\Yandex\\YandexBrowser\\Application\\browser.exe"),
    ).toEqual(["yandex-browser"]);
    expect(yandex("C:\\Program Files (x86)\\Yandex\\YANDEXBROWSER\\Application\\BROWSER.EXE")).toEqual([
      "yandex-browser",
    ]);
    // A folder that only ends like Yandex's does not count.
    expect(yandex("C:\\NotYandex\\YandexBrowser\\Application\\browser.exe")).toEqual([]);
  });

  it("has no Safari, and macOS names do not match on Windows", () => {
    expect(
      matchBlockedApps(["Safari", "Safari.exe", "Google Chrome"], "windows", { browsers: true }),
    ).toEqual([]);
  });

  it("splits browsers into the Other apps row, after the apps", () => {
    const found = matchBlockedApps(["chrome.exe", "Zoom.exe", "Telegram.exe"], "windows", { browsers: true });
    expect(splitByKind(found)).toEqual({
      apps: [
        { id: "telegram", name: "Telegram", kind: "app" },
        { id: "chrome", name: "Google Chrome", kind: "browser" },
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
