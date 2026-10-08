import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ConfigError, DEFAULT_STUDENTS, parseStudents, readConfig } from "../src/config.ts";
import { RotatingLog, rotationNames } from "../src/log.ts";
import { newStudentFile, StateStore, signInAllowed } from "../src/state.ts";

const dirs: string[] = [];
function tmp(): string {
  const dir = mkdtempSync(join(tmpdir(), "judge-sim-"));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("state", () => {
  it("stores a student's sign-in and session, and reads them back after a restart", () => {
    const store = new StateStore(tmp());
    store.init();
    const file = {
      ...newStudentFile("20249001"),
      auth: { user_id: "u1", access_token: "a", refresh_token: "r", expires_at: 2_000_000_000 },
      session_id: "s1",
      exam_starts_at: "2026-10-12T09:00:00+00:00",
      seq: 7,
      checked_in: true,
      question: 4,
    };
    store.saveStudent(file);
    expect(new StateStore(store.dir).loadStudent("20249001")).toEqual(file);
    expect(readdirSync(join(store.dir, "students"))).toEqual(["20249001.json"]);
  });

  it("starts a student afresh from a damaged or someone else's file", () => {
    const store = new StateStore(tmp());
    store.init();
    writeFileSync(join(store.dir, "students", "20249002.json"), "{ not json");
    expect(store.loadStudent("20249002")).toEqual(newStudentFile("20249002"));
    store.saveStudent(newStudentFile("20249003"));
    writeFileSync(
      join(store.dir, "students", "20249004.json"),
      readFileSync(join(store.dir, "students", "20249003.json")),
    );
    expect(store.loadStudent("20249004").number).toBe("20249004");
  });

  it("paces new anonymous users: 10 s apart, at most 25 an hour", () => {
    const now = 10_000_000;
    expect(signInAllowed([], now).allowed).toBe(true);
    expect(signInAllowed([now - 5_000], now)).toMatchObject({ allowed: false, retryAtMs: now + 5_000 });
    const hour = Array.from({ length: 25 }, (_, i) => now - 3_500_000 + i * 60_000);
    const full = signInAllowed(hour, now);
    expect(full.allowed).toBe(false);
    expect(full.retryAtMs).toBe(now - 3_500_000 + 3_600_000);
    expect(signInAllowed(hour, now + 100_001).allowed).toBe(true);
    expect(signInAllowed([now - 25 * 3_600_000], now).ledger).toEqual([]);
  });
});

describe("log", () => {
  it("rotates by size and keeps a fixed number of files", () => {
    const dir = tmp();
    const log = new RotatingLog({ dir, maxBytes: 200, files: 3, stdout: false, now: () => new Date(0) });
    for (let i = 0; i < 40; i += 1) log.info(`line ${i} ${"x".repeat(20)}`);
    expect(readdirSync(dir).sort()).toEqual(["judge-sim.1.log", "judge-sim.2.log", "judge-sim.log"]);
    for (const name of rotationNames("judge-sim", 3)) {
      expect(readFileSync(join(dir, name)).length).toBeLessThanOrEqual(200);
    }
    expect(readFileSync(join(dir, "judge-sim.log"), "utf8")).toContain("line 39");
  });
});

describe("config", () => {
  const bundle = "/opt/uki/judge-sim";

  it("reads student lists and ranges", () => {
    expect(parseStudents("20249001-20249003, 20249010")).toEqual([
      "20249001",
      "20249002",
      "20249003",
      "20249010",
    ]);
    expect(() => parseStudents("2024901")).toThrow(ConfigError);
    expect(() => parseStudents("20249001-20249040")).toThrow(ConfigError);
    expect(DEFAULT_STUDENTS).toHaveLength(24);
  });

  it("refuses a secret key, and runs only with a URL and the publishable key", () => {
    const dir = tmp();
    const file = join(dir, "judge-sim.env");
    writeFileSync(file, "UKI_SUPABASE_URL=https://abc.supabase.co\nUKI_PUBLISHABLE_KEY=sb_secret_xyz\n");
    expect(() => readConfig(["--env-file", file], bundle, {})).toThrow(/secret key must never reach/);
    expect(() => readConfig([], bundle, {})).toThrow(/UKI_SUPABASE_URL and UKI_PUBLISHABLE_KEY are required/);
    expect(readConfig(["--dry-run"], bundle, {})).toMatchObject({ dryRun: true, url: null, seed: 1 });
  });

  it("takes the env file over the environment and puts state and logs beside the app", () => {
    const dir = tmp();
    const file = join(dir, "judge-sim.env");
    writeFileSync(
      file,
      "# a comment\r\nUKI_SUPABASE_URL=https://abc.supabase.co\r\nUKI_PUBLISHABLE_KEY=sb_publishable_test\r\nUKI_STUDENTS=20249001-20249005\r\nUKI_DAILY_MESSAGE_BUDGET=20000\r\n",
    );
    const config = readConfig(["--env-file", file], bundle, { UKI_STUDENTS: "20249030" });
    if (config === "help") throw new Error("help");
    expect(config.students).toHaveLength(5);
    expect(config.url).toBe("https://abc.supabase.co");
    expect(config.dailyMessageBudget).toBe(20_000);
    expect(config.stateDir).toBe(resolve("/opt/uki", "state"));
    expect(config.logDir).toBe(resolve("/opt/uki", "logs"));
    expect(existsSync(config.stateDir)).toBe(false);
  });
});
