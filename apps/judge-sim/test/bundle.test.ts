// The VPS bundle: build.mjs makes one folder (judge-sim.mjs, its stills and the PowerShell scripts), and
// the bundle answers --dry-run without the network and without writing anything. On Windows in CI, the
// same folder is installed with deploy/vps/install.ps1 into a scratch root: the Scheduled Tasks are
// registered as the VPS gets them, the simulator starts as LOCAL SERVICE and writes its state and log,
// the watchdog runs, and uninstall.ps1 removes everything.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const pkg = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(pkg, "dist", "judge-sim");
const bundle = join(dist, "judge-sim.mjs");
const scratch = mkdtempSync(join(tmpdir(), "judge-sim-bundle-"));

beforeAll(() => {
  execFileSync(process.execPath, [join(pkg, "build.mjs")], { cwd: pkg, stdio: "pipe" });
});
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

function envFile(name: string, lines: string[]): string {
  const path = join(scratch, name);
  writeFileSync(path, `${lines.join("\n")}\n`);
  return path;
}

describe("the bundle", () => {
  it("is one file with its stills and the VPS scripts", () => {
    expect(statSync(bundle).size).toBeLessThan(2 * 1024 * 1024);
    expect(readdirSync(join(dist, "stills")).sort()).toEqual([
      "empty-seat.jpg",
      "looked-away.jpg",
      "looking-down.jpg",
      "phone.jpg",
      "second-person.jpg",
    ]);
    for (const still of readdirSync(join(dist, "stills"))) {
      expect(statSync(join(dist, "stills", still)).size).toBeLessThan(200 * 1024);
    }
    for (const script of ["install.ps1", "uninstall.ps1", "watchdog.ps1"])
      expect(existsSync(join(dist, script))).toBe(true);
    const source = readFileSync(bundle, "utf8");
    expect(source).not.toContain('require("@supabase');
    expect(source).not.toMatch(/sb_secret_[A-Za-z0-9]{8}/);
  });

  it("prints the plan with --dry-run, talks to nothing and writes nothing", () => {
    const state = join(scratch, "state");
    const logs = join(scratch, "logs");
    const env = envFile("dry.env", [
      "UKI_SUPABASE_URL=https://judge-sim.invalid",
      "UKI_PUBLISHABLE_KEY=sb_publishable_dry_run",
      "UKI_STUDENTS=20249001-20249012",
      `UKI_STATE_DIR=${state}`,
      `UKI_LOG_DIR=${logs}`,
    ]);
    const run = spawnSync(process.execPath, [bundle, "--dry-run", "--env-file", env, "--plan-minutes", "5"], {
      encoding: "utf8",
      timeout: 30_000,
    });
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain("judge-sim dry run: nothing is sent and nothing is written.");
    expect(run.stdout).toContain("12: 20249001, 20249002, 20249003 … 20249012");
    expect(run.stdout).toContain("Free plan, 30 days of 24/7 running");
    expect(run.stdout).toContain("Sample plan, seed 1");
    expect(run.stdout).not.toContain("sb_publishable_dry_run");
    expect(existsSync(state)).toBe(false);
    expect(existsSync(logs)).toBe(false);
  });

  it("refuses a secret key before doing anything", () => {
    const env = envFile("secret.env", [
      "UKI_SUPABASE_URL=https://judge-sim.invalid",
      "UKI_PUBLISHABLE_KEY=sb_secret_never",
    ]);
    const run = spawnSync(process.execPath, [bundle, "--env-file", env], {
      encoding: "utf8",
      timeout: 30_000,
    });
    expect(run.status).toBe(2);
    expect(run.stderr).toContain("a secret key must never reach the simulator");
    expect(run.stderr).not.toContain("sb_secret_never");
  });
});

const windowsCi = process.platform === "win32" && process.env.CI === "true";

describe.runIf(windowsCi)("deploy/vps on Windows", () => {
  const root = `C:\\uki-ci-judge-${process.pid}`;
  const prefix = "uki-ci-";
  // Each PowerShell start costs seconds on a CI runner; every step is timed in the test's output.
  const ps = (args: string[]) => {
    const started = Date.now();
    const run = spawnSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", ...args],
      {
        encoding: "utf8",
        timeout: 240_000,
      },
    );
    console.log(`powershell ${args.slice(0, 2).join(" ")}: exit ${run.status} in ${Date.now() - started} ms`);
    return run;
  };
  const query = (command: string) => ps(["-Command", command]).stdout.trim();

  afterAll(() => {
    if (existsSync(root))
      ps(["-File", join(dist, "uninstall.ps1"), "-InstallRoot", root, "-TaskPrefix", prefix, "-Purge"]);
  }, 300_000);

  it("install.ps1 registers both tasks, the simulator runs as LOCAL SERVICE, uninstall.ps1 removes it all", async () => {
    const install = ps([
      "-File",
      join(dist, "install.ps1"),
      "-SupabaseUrl",
      "https://judge-sim.invalid",
      "-PublishableKey",
      "sb_publishable_ci",
      "-Students",
      "20249001-20249002",
      "-InstallRoot",
      root,
      "-TaskPrefix",
      prefix,
      "-SkipNodeInstall",
      "-NoStart",
    ]);
    expect(install.status, `${install.stdout}\n${install.stderr}`).toBe(0);
    expect(install.stdout).toContain("Dry run passed");

    const env = readFileSync(join(root, "judge-sim.env"));
    expect([env[0], env[1], env[2]]).not.toEqual([0xef, 0xbb, 0xbf]);
    expect(env.toString("utf8")).toContain("UKI_STUDENTS=20249001-20249002");
    expect(existsSync(join(root, "judge-sim", "judge-sim.mjs"))).toBe(true);
    expect(readdirSync(join(root, "judge-sim", "stills"))).toHaveLength(5);

    expect(query(`(Get-ScheduledTask -TaskName ${prefix}judge-sim).Principal.UserId`)).toMatch(
      /LOCAL SERVICE/i,
    );
    expect(query(`(Get-ScheduledTask -TaskName ${prefix}judge-sim).Settings.RestartCount`)).toBe("999");
    expect(query(`(Get-ScheduledTask -TaskName ${prefix}judge-sim).Triggers[0].CimClass.CimClassName`)).toBe(
      "MSFT_TaskBootTrigger",
    );
    expect(query(`(Get-ScheduledTask -TaskName ${prefix}judge-sim-watchdog).Principal.UserId`)).toMatch(
      /SYSTEM/i,
    );

    // The watchdog finds the task stopped and starts it; the simulator then writes alive.json and its log.
    const watchdog = ps([
      "-File",
      join(root, "judge-sim", "watchdog.ps1"),
      "-InstallRoot",
      root,
      "-TaskName",
      `${prefix}judge-sim`,
    ]);
    expect(watchdog.status, watchdog.stderr).toBe(0);
    const alive = join(root, "state", "alive.json");
    for (let i = 0; i < 40 && !existsSync(alive); i += 1)
      await new Promise((resolve) => setTimeout(resolve, 500));
    const info = query(`Get-ScheduledTaskInfo -TaskName ${prefix}judge-sim | Format-List | Out-String`);
    expect(existsSync(alive), info).toBe(true);
    expect(readFileSync(join(root, "logs", "judge-sim.log"), "utf8")).toContain(
      "starting: 2 students on DEMO-LIVE",
    );
    expect(readFileSync(join(root, "logs", "watchdog.log"), "utf8")).toContain("restarting");

    const uninstall = ps([
      "-File",
      join(root, "judge-sim", "uninstall.ps1"),
      "-InstallRoot",
      root,
      "-TaskPrefix",
      prefix,
      "-Purge",
    ]);
    expect(uninstall.status, `${uninstall.stdout}\n${uninstall.stderr}`).toBe(0);
    expect(
      query(
        `Get-ScheduledTask -TaskName ${prefix}judge-sim* -ErrorAction SilentlyContinue | Measure-Object | % Count`,
      ),
    ).toBe("0");
    expect(existsSync(root)).toBe(false);
  }, 900_000);
});
