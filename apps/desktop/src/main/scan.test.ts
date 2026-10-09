// @vitest-environment node
import type { BlockedApp } from "@uki/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createBlockedAppWatcher,
  type ExecFileLike,
  findBlockedApps,
  freeMegabytes,
  keepWindowedBrowsers,
  parseProcessList,
  processListCommand,
  scanSystem,
  windowedProcessesCommand,
} from "./scan.ts";

// Trimmed from `ps -axo comm=` on a macOS 15 laptop: full paths, spaces in names, a CLI by basename.
const PS_OUTPUT = [
  "/sbin/launchd",
  "/usr/libexec/logd",
  "/System/Library/CoreServices/Dock.app/Contents/MacOS/Dock",
  "/Applications/Telegram.app/Contents/MacOS/Telegram",
  "/Applications/zoom.us.app/Contents/MacOS/zoom.us",
  "/Applications/Microsoft Teams.app/Contents/MacOS/MSTeams",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "  /Applications/Telegram.app/Contents/MacOS/Telegram  ",
  "-zsh",
  "",
].join("\n");

// `tasklist /fo csv /nh` on Windows 11: CRLF lines, quoted columns, thousands separators in memory.
const TASKLIST_OUTPUT = [
  '"System Idle Process","0","Services","0","8 K"',
  '"System","4","Services","0","2,132 K"',
  '"explorer.exe","5120","Console","1","98,412 K"',
  '"Discord.exe","7344","Console","1","156,220 K"',
  '"Discord.exe","7352","Console","1","88,004 K"',
  '"AnyDesk.exe","912","Console","1","24,600 K"',
  '"chrome.exe","8812","Console","1","210,512 K"',
  "",
].join("\r\n");

describe("process list parsing", () => {
  it("reads ps output on macOS and tasklist CSV on Windows", () => {
    expect(parseProcessList("macos", PS_OUTPUT)).toContain(
      "/Applications/Telegram.app/Contents/MacOS/Telegram",
    );
    expect(parseProcessList("macos", PS_OUTPUT)).toHaveLength(9);
    expect(parseProcessList("windows", TASKLIST_OUTPUT)).toEqual([
      "System Idle Process",
      "System",
      "explorer.exe",
      "Discord.exe",
      "Discord.exe",
      "AnyDesk.exe",
      "chrome.exe",
    ]);
  });

  it("runs ps and tasklist by absolute path", () => {
    expect(processListCommand("macos")).toEqual({ file: "/bin/ps", args: ["-axo", "comm="] });
    expect(processListCommand("windows", { SystemRoot: "D:\\Windows" })).toEqual({
      file: "D:\\Windows\\System32\\tasklist.exe",
      args: ["/fo", "csv", "/nh"],
    });
    expect(processListCommand("windows", {}).file).toBe("C:\\Windows\\System32\\tasklist.exe");
  });
});

function fakeExec(stdout: string) {
  return vi.fn<ExecFileLike>(async () => ({ stdout }));
}

describe("findBlockedApps", () => {
  it("matches the macOS process list on the file name, once per app, in list order", async () => {
    const exec = fakeExec(PS_OUTPUT);
    await expect(findBlockedApps("macos", undefined, exec)).resolves.toEqual([
      { id: "telegram", name: "Telegram", kind: "app" },
      { id: "zoom", name: "Zoom", kind: "screen_share" },
      { id: "microsoft-teams", name: "Microsoft Teams", kind: "screen_share" },
    ]);
    expect(exec).toHaveBeenCalledWith(
      "/bin/ps",
      ["-axo", "comm="],
      expect.objectContaining({ windowsHide: true }),
    );
  });

  it("matches the Windows image names", async () => {
    const exec = fakeExec(TASKLIST_OUTPUT);
    await expect(findBlockedApps("windows", undefined, exec)).resolves.toEqual([
      { id: "discord", name: "Discord", kind: "app" },
      { id: "anydesk", name: "AnyDesk", kind: "screen_share" },
    ]);
    // chrome.exe runs, but browsers were not asked for: no second command.
    expect(exec).toHaveBeenCalledOnce();
  });

  it("passes a failing command on to the caller", async () => {
    const exec = vi.fn<ExecFileLike>(async () => {
      throw new Error("spawn ps ENOENT");
    });
    await expect(findBlockedApps("macos", undefined, exec)).rejects.toThrow(/ENOENT/);
  });
});

const chrome: BlockedApp = { id: "chrome", name: "Google Chrome", kind: "browser" };

describe("findBlockedApps with browsers (in-app exams, C2)", () => {
  // The browsers' processes beside things that must never count: Edge's WebView2 runtime, Üki itself,
  // Electron in development, and a game launcher's own browser.exe.
  const tasklist = [
    '"System Idle Process","0","Services","0","8 K"',
    '"explorer.exe","5120","Console","1","98,412 K"',
    '"chrome.exe","8812","Console","1","210,512 K"',
    '"chrome.exe","8840","Console","1","98,100 K"',
    '"msedge.exe","9120","Console","1","120,004 K"',
    '"msedge.exe","9188","Console","1","40,512 K"',
    '"msedgewebview2.exe","10220","Console","1","60,000 K"',
    '"browser.exe","11002","Console","1","70,000 K"',
    '"Uki.exe","12001","Console","1","180,000 K"',
    '"electron.exe","12002","Console","1","150,000 K"',
    '"Telegram.exe","4321","Console","1","182,344 K"',
    "",
  ].join("\r\n");

  /** tasklist, then PowerShell answering with these windowed processes. */
  function windowsExec(windowed: string[]) {
    return vi.fn<ExecFileLike>(async (file) => ({
      stdout: file.endsWith("powershell.exe") ? windowed.map((line) => `${line}\r\n`).join("") : tasklist,
    }));
  }

  it("macOS: the browser's own executable counts, none of its helpers or other apps' Chromium", async () => {
    const ps = [
      "/Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Framework.framework/Versions/154.0.8037.98/Helpers/Google Chrome Helper (Renderer).app/Contents/MacOS/Google Chrome Helper (Renderer)",
      "/Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Framework.framework/Versions/154.0.8037.98/Helpers/chrome_crashpad_handler",
      "/Users/k/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
      "/Applications/Uki.app/Contents/MacOS/Uki",
      "/Applications/Uki.app/Contents/Frameworks/Uki Helper (Renderer).app/Contents/MacOS/Uki Helper (Renderer)",
      "/System/Library/Frameworks/WebKit.framework/Versions/A/XPCServices/com.apple.WebKit.WebContent.xpc/Contents/MacOS/com.apple.WebKit.WebContent",
      "/System/Cryptexes/App/usr/libexec/SafariLaunchAgent",
    ];
    await expect(findBlockedApps("macos", { browsers: true }, fakeExec(ps.join("\n")))).resolves.toEqual([]);
    const withChrome = [...ps, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
    await expect(
      findBlockedApps("macos", { browsers: true }, fakeExec(withChrome.join("\n"))),
    ).resolves.toEqual([chrome]);
  });

  it("Windows: one PowerShell call for the browser images running; only windowed ones count", async () => {
    const exec = windowsExec(["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"]);
    await expect(findBlockedApps("windows", { browsers: true }, exec)).resolves.toEqual([
      { id: "telegram", name: "Telegram", kind: "app" },
      chrome,
    ]);
    expect(exec).toHaveBeenCalledTimes(2);
    const [file, args, options] = exec.mock.calls[1] ?? [];
    expect(file).toBe(windowedProcessesCommand(["chrome.exe"]).file);
    // The images found, each once, never msedgewebview2.exe.
    expect(args?.at(-1)).toMatch(
      /^Get-Process -Name 'chrome','msedge','browser' -ErrorAction SilentlyContinue \| /,
    );
    expect(options).toEqual(expect.objectContaining({ windowsHide: true }));
  });

  it("Windows: Edge with no window (startup boost) does not count; with a window it does", async () => {
    await expect(findBlockedApps("windows", { browsers: true }, windowsExec([]))).resolves.toEqual([
      { id: "telegram", name: "Telegram", kind: "app" },
    ]);
    // Windows withholds the path of an elevated process: the image name still counts.
    await expect(
      findBlockedApps("windows", { browsers: true }, windowsExec(["msedge.exe"])),
    ).resolves.toEqual([
      { id: "telegram", name: "Telegram", kind: "app" },
      { id: "edge", name: "Microsoft Edge", kind: "browser" },
    ]);
  });

  it("Windows: browser.exe counts as Yandex Browser only from Yandex's folder", async () => {
    const yandex = "C:\\Users\\Мадина\\AppData\\Local\\Yandex\\YandexBrowser\\Application\\browser.exe";
    const other = "C:\\Games\\Launcher\\browser.exe";
    const found = async (windowed: string[]) =>
      (await findBlockedApps("windows", { browsers: true }, windowsExec(windowed))).map((app) => app.id);
    await expect(found([other])).resolves.toEqual(["telegram"]);
    await expect(found(["browser.exe"])).resolves.toEqual(["telegram"]);
    await expect(found([other, yandex])).resolves.toEqual(["telegram", "yandex-browser"]);
  });

  it("Windows: no browser image running, no PowerShell", async () => {
    const exec = vi.fn<ExecFileLike>(async () => ({
      stdout: TASKLIST_OUTPUT.replace(/"chrome\.exe".*\r\n/, ""),
    }));
    await expect(findBlockedApps("windows", { browsers: true }, exec)).resolves.toEqual([
      { id: "discord", name: "Discord", kind: "app" },
      { id: "anydesk", name: "AnyDesk", kind: "screen_share" },
    ]);
    expect(exec).toHaveBeenCalledOnce();
  });

  it("Windows: a PowerShell call that fails fails the scan (1.2 stays red; the watch keeps its last scan)", async () => {
    const exec = vi.fn<ExecFileLike>(async (file) => {
      if (file.endsWith("powershell.exe")) throw new Error("powershell.exe was blocked by group policy");
      return { stdout: tasklist };
    });
    await expect(findBlockedApps("windows", { browsers: true }, exec)).rejects.toThrow(/group policy/);
  });

  it("keepWindowedBrowsers replaces the browser images by the windowed processes", async () => {
    const exec = windowsExec(["C:\\Program Files\\Mozilla Firefox\\firefox.exe"]);
    await expect(keepWindowedBrowsers(["Telegram.exe", "FIREFOX.EXE", "firefox.exe"], exec)).resolves.toEqual(
      ["Telegram.exe", "C:\\Program Files\\Mozilla Firefox\\firefox.exe"],
    );
    expect(exec.mock.calls[0]?.[1].at(-1)).toMatch(/^Get-Process -Name 'firefox' /);
  });

  it("runs Windows PowerShell by absolute path, with names from the contract only", () => {
    const { file, args } = windowedProcessesCommand(["chrome.exe", "msedge.exe"], {
      SystemRoot: "D:\\Windows",
    });
    expect(file).toBe("D:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");
    expect(args.slice(0, 4)).toEqual(["-NoLogo", "-NoProfile", "-NonInteractive", "-Command"]);
    expect(args[4]).toBe(
      "Get-Process -Name 'chrome','msedge' -ErrorAction SilentlyContinue | " +
        "Where-Object { $_.MainWindowHandle -ne 0 } | " +
        "ForEach-Object { if ($_.Path) { $_.Path } else { $_.Name + '.exe' } }; exit 0",
    );
    expect(windowedProcessesCommand(["chrome.exe"], {}).file).toBe(
      "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    );
    expect(() => windowedProcessesCommand(["chrome'; Remove-Item x; '.exe"])).toThrow(/image name/);
  });
});

describe("scanSystem", () => {
  it("splits the apps into the 1.2 rows and adds the free space", async () => {
    const freeMb = vi.fn(async () => 51_200);
    const result = await scanSystem({
      os: "macos",
      userDataPath: "/Users/aliya/Library/Application Support/Üki",
      findApps: (scan) => findBlockedApps("macos", scan, fakeExec(PS_OUTPUT)),
      freeMb,
    });
    expect(result.apps.map((app) => app.name)).toEqual(["Telegram"]);
    expect(result.screenShare.map((app) => app.name)).toEqual(["Zoom", "Microsoft Teams"]);
    expect(result.freeMb).toBe(51_200);
    expect(freeMb).toHaveBeenCalledWith("/Users/aliya/Library/Application Support/Üki");
  });

  it("puts browsers, when asked for, into the Other apps row after the apps", async () => {
    const findApps = vi.fn((scan) => findBlockedApps("macos", scan, fakeExec(PS_OUTPUT)));
    const asked = await scanSystem({
      os: "macos",
      userDataPath: "/tmp",
      scan: { browsers: true },
      findApps,
      freeMb: async () => 1,
    });
    expect(asked.apps.map((app) => app.name)).toEqual(["Telegram", "Google Chrome"]);
    expect(asked.screenShare.map((app) => app.name)).toEqual(["Zoom", "Microsoft Teams"]);
    const notAsked = await scanSystem({ os: "macos", userDataPath: "/tmp", findApps, freeMb: async () => 1 });
    expect(notAsked.apps.map((app) => app.name)).toEqual(["Telegram"]);
    expect(findApps.mock.calls).toEqual([[{ browsers: true }], [{ browsers: false }]]);
  });

  it("measures real free space with statfs", async () => {
    const mb = await freeMegabytes(process.cwd());
    expect(Number.isInteger(mb)).toBe(true);
    expect(mb).toBeGreaterThan(0);
  });
});

const telegram: BlockedApp = { id: "telegram", name: "Telegram", kind: "app" };
const zoom: BlockedApp = { id: "zoom", name: "Zoom", kind: "screen_share" };
const discord: BlockedApp = { id: "discord", name: "Discord", kind: "app" };

describe("createBlockedAppWatcher", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(scans: BlockedApp[][]) {
    let index = 0;
    const findApps = vi.fn(async () => {
      const next = scans[Math.min(index, scans.length - 1)] ?? [];
      index += 1;
      return next;
    });
    const onAppeared = vi.fn();
    const onError = vi.fn();
    const watcher = createBlockedAppWatcher({ findApps, onAppeared, onError });
    return { watcher, findApps, onAppeared, onError };
  }

  it("scans at once and every 15 s, reporting only apps that appeared since the previous scan", async () => {
    const { watcher, findApps, onAppeared } = setup([[], [telegram], [telegram], [telegram, zoom], [zoom]]);
    watcher.start();
    expect(watcher.running).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(findApps).toHaveBeenCalledTimes(1);
    expect(onAppeared).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(14_999);
    expect(findApps).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(findApps).toHaveBeenCalledTimes(2);
    expect(onAppeared).toHaveBeenLastCalledWith([telegram]);

    await vi.advanceTimersByTimeAsync(15_000);
    expect(onAppeared).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(15_000);
    expect(onAppeared).toHaveBeenLastCalledWith([zoom]);

    await vi.advanceTimersByTimeAsync(15_000);
    expect(onAppeared).toHaveBeenCalledTimes(2);
    watcher.stop();
  });

  it("reports what is already running at the first scan, since 1.2 let nothing through", async () => {
    const { watcher, onAppeared } = setup([[discord, telegram]]);
    watcher.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(onAppeared).toHaveBeenCalledWith([discord, telegram]);
    watcher.stop();
  });

  it("reports an app again when it quits and starts again", async () => {
    const { watcher, onAppeared } = setup([[telegram], [], [telegram]]);
    watcher.start();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(onAppeared.mock.calls).toEqual([[[telegram]], [[telegram]]]);
    watcher.stop();
  });

  it("keeps going after a failed scan and compares with the last good one", async () => {
    let call = 0;
    const findApps = vi.fn(async () => {
      call += 1;
      if (call === 2) throw new Error("tasklist timed out");
      return call === 1 ? [telegram] : [telegram, zoom];
    });
    const onAppeared = vi.fn();
    const onError = vi.fn();
    const watcher = createBlockedAppWatcher({ findApps, onAppeared, onError });
    watcher.start();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(onError).toHaveBeenCalledOnce();
    expect(onAppeared.mock.calls).toEqual([[[telegram]], [[zoom]]]);
    watcher.stop();
  });

  it("stops scanning on stop, ignores a second start, and starts afresh after a restart", async () => {
    const { watcher, findApps, onAppeared } = setup([[telegram]]);
    watcher.start();
    watcher.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(findApps).toHaveBeenCalledTimes(1);
    watcher.stop();
    expect(watcher.running).toBe(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(findApps).toHaveBeenCalledTimes(1);

    watcher.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(onAppeared).toHaveBeenCalledTimes(2);
    watcher.stop();
  });

  it("scans for what start() was asked to look for: browsers in in-app exams", async () => {
    const { watcher, findApps, onAppeared } = setup([[telegram, chrome]]);
    watcher.start({ browsers: true });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(findApps.mock.calls).toEqual([[{ browsers: true }], [{ browsers: true }]]);
    expect(onAppeared).toHaveBeenCalledExactlyOnceWith([telegram, chrome]);
    watcher.stop();
    watcher.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(findApps).toHaveBeenLastCalledWith({ browsers: false });
    watcher.stop();
  });

  it("skips a tick while the previous scan is still running", async () => {
    let release: (apps: BlockedApp[]) => void = () => {};
    const findApps = vi.fn(
      () =>
        new Promise<BlockedApp[]>((resolve) => {
          release = resolve;
        }),
    );
    const watcher = createBlockedAppWatcher({ findApps, onAppeared: vi.fn() });
    watcher.start();
    await vi.advanceTimersByTimeAsync(45_000);
    expect(findApps).toHaveBeenCalledTimes(1);
    release([]);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(findApps).toHaveBeenCalledTimes(2);
    watcher.stop();
  });
});
