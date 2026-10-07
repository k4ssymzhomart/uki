// @vitest-environment node
import type { BlockedApp } from "@uki/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createBlockedAppWatcher,
  type ExecFileLike,
  findBlockedApps,
  freeMegabytes,
  parseProcessList,
  processListCommand,
  scanSystem,
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
    await expect(findBlockedApps("macos", exec)).resolves.toEqual([
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
    await expect(findBlockedApps("windows", fakeExec(TASKLIST_OUTPUT))).resolves.toEqual([
      { id: "discord", name: "Discord", kind: "app" },
      { id: "anydesk", name: "AnyDesk", kind: "screen_share" },
    ]);
  });

  it("passes a failing command on to the caller", async () => {
    const exec = vi.fn<ExecFileLike>(async () => {
      throw new Error("spawn ps ENOENT");
    });
    await expect(findBlockedApps("macos", exec)).rejects.toThrow(/ENOENT/);
  });
});

describe("scanSystem", () => {
  it("splits the apps into the 1.2 rows and adds the free space", async () => {
    const freeMb = vi.fn(async () => 51_200);
    const result = await scanSystem({
      os: "macos",
      userDataPath: "/Users/aliya/Library/Application Support/Üki",
      findApps: () => findBlockedApps("macos", fakeExec(PS_OUTPUT)),
      freeMb,
    });
    expect(result.apps.map((app) => app.name)).toEqual(["Telegram"]);
    expect(result.screenShare.map((app) => app.name)).toEqual(["Zoom", "Microsoft Teams"]);
    expect(result.freeMb).toBe(51_200);
    expect(freeMb).toHaveBeenCalledWith("/Users/aliya/Library/Application Support/Üki");
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
