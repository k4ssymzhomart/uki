// @vitest-environment node
// The real process scan on Windows only (the Windows CI job runs it inside pnpm check): tasklist, then
// C2's PowerShell call that keeps only the browser processes with a visible window. A window the test
// opens itself (Notepad, then Edge with a fresh profile) must count; Edge started headless, as its
// startup boost runs it, must not. Every process the test starts is stopped again, pass or fail.
import { type ChildProcess, execFile, spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findBlockedApps, listProcesses, windowedProcessesCommand } from "./scan.ts";

const EDGE = [
  join(
    process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)",
    "Microsoft\\Edge\\Application\\msedge.exe",
  ),
  join(process.env.ProgramFiles ?? "C:\\Program Files", "Microsoft\\Edge\\Application\\msedge.exe"),
].find((path) => existsSync(path));

const started: ChildProcess[] = [];
const profiles: string[] = [];

function run(file: string, args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, [...args], { encoding: "utf8", timeout: 30_000, windowsHide: true }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

/** The windowed processes of these images, as the scan's PowerShell call lists them. */
async function windowed(images: string[], constrained = false): Promise<string[]> {
  const { file, args } = windowedProcessesCommand(images);
  const script = args.at(-1) ?? "";
  // Constrained Language Mode, which a locked-down lab PC may enforce, must give the same answer.
  const command = constrained
    ? `$ExecutionContext.SessionState.LanguageMode = 'ConstrainedLanguage'; ${script}`
    : script;
  const stdout = await run(file, [...args.slice(0, -1), command]);
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

async function until<T>(read: () => Promise<T>, done: (value: T) => boolean, ms: number): Promise<T> {
  const deadline = Date.now() + ms;
  let value = await read();
  while (!done(value) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    value = await read();
  }
  return value;
}

function startEdge(args: string[]): ChildProcess {
  if (!EDGE) throw new Error("no Edge");
  const profile = mkdtempSync(join(tmpdir(), "uki-c2-edge-"));
  profiles.push(profile);
  const child = spawn(
    EDGE,
    [`--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", ...args, "about:blank"],
    { stdio: "ignore" },
  );
  started.push(child);
  return child;
}

afterEach(async () => {
  for (const child of started.splice(0)) {
    if (child.pid !== undefined)
      await run("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"]).catch(() => {});
  }
  for (const profile of profiles.splice(0)) {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  }
});

describe.runIf(process.platform === "win32")("the real process scan on Windows (C2)", () => {
  it("lists running images with tasklist", async () => {
    const names = (await listProcesses("windows")).map((name) => name.toLowerCase());
    expect(names).toContain("svchost.exe");
    expect(names).toContain("node.exe");
  });

  it("lists a process with a visible window, in Full and Constrained Language Mode", async () => {
    const notepad = spawn(join(process.env.SystemRoot ?? "C:\\Windows", "System32\\notepad.exe"), [], {
      stdio: "ignore",
    });
    started.push(notepad);
    const seen = await until(
      () => windowed(["notepad.exe"]),
      (lines) => lines.length > 0,
      20_000,
    );
    console.log("[c2] windowed notepad:", seen);
    expect(seen.some((line) => line.toLowerCase().endsWith("notepad.exe"))).toBe(true);
    const constrained = await windowed(["notepad.exe"], true);
    console.log("[c2] windowed notepad, Constrained Language Mode:", constrained);
    expect(constrained.some((line) => line.toLowerCase().endsWith("notepad.exe"))).toBe(true);
  }, 60_000);

  it.runIf(EDGE !== undefined)(
    "does not count Edge without a window, and counts it once it shows one",
    async () => {
      const before = await windowed(["msedge.exe"]);
      console.log("[c2] windowed Edge before the test:", before);
      expect(before, "an Edge window was open before the test").toEqual([]);

      startEdge(["--headless=new", "--remote-debugging-port=0"]);
      const images = await until(
        async () => (await listProcesses("windows")).map((name) => name.toLowerCase()),
        (names) => names.includes("msedge.exe"),
        20_000,
      );
      expect(images).toContain("msedge.exe");
      expect(await windowed(["msedge.exe"])).toEqual([]);
      const headless = await findBlockedApps("windows", { browsers: true });
      console.log("[c2] scan with headless Edge:", headless);
      expect(headless.map((app) => app.id)).not.toContain("edge");

      startEdge(["--new-window"]);
      const found = await until(
        () => findBlockedApps("windows", { browsers: true }),
        (apps) => apps.some((app) => app.id === "edge"),
        45_000,
      );
      console.log("[c2] scan with an Edge window:", found, await windowed(["msedge.exe"]));
      expect(found).toContainEqual({ id: "edge", name: "Microsoft Edge", kind: "browser" });
      // Not asked for browsers (a browser exam): Edge is left alone.
      expect((await findBlockedApps("windows")).map((app) => app.id)).not.toContain("edge");
    },
    120_000,
  );
});
