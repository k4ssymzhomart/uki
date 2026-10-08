import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Config } from "../src/config.ts";
import { STILL_FILES, type StillName } from "../src/episodes.ts";
import type { Logger } from "../src/log.ts";
import { createRng } from "../src/rng.ts";
import { Simulator } from "../src/runner.ts";
import { StateStore } from "../src/state.ts";
import { FakeServer } from "./fake-server.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const STILLS = Object.fromEntries(
  Object.keys(STILL_FILES).map((name) => [name, new Uint8Array([0xff, 0xd8, 0xff])]),
) as Record<StillName, Uint8Array>;

function world(students = ["20249001", "20249002", "20249003"]) {
  const dir = mkdtempSync(join(tmpdir(), "judge-sim-run-"));
  dirs.push(dir);
  const clock = { ms: Date.UTC(2026, 9, 12, 9, 0, 0) };
  const server = new FakeServer(() => clock.ms);
  const lines: string[] = [];
  const log: Logger = {
    info: (m) => lines.push(`info ${m}`),
    warn: (m) => lines.push(`warn ${m}`),
    error: (m) => lines.push(`error ${m}`),
  };
  const config: Config = {
    dryRun: false,
    url: "https://x.supabase.co",
    publishableKey: "sb_publishable_test",
    examCode: "DEMO-LIVE",
    students,
    stateDir: join(dir, "state"),
    logDir: join(dir, "logs"),
    dailyMessageBudget: 35_000,
    logMaxBytes: 1_000_000,
    logFiles: 3,
    seed: 1,
    planMinutes: 1,
    envFile: null,
  };
  const make = () =>
    new Simulator({
      api: server,
      store: new StateStore(config.stateDir),
      log,
      config,
      stills: STILLS,
      rng: createRng(1),
      now: () => clock.ms,
    });
  /** `seconds` ticks, one second apart, letting every call finish in between. */
  const run = async (sim: Simulator, seconds: number) => {
    for (let i = 0; i < seconds; i += 1) {
      sim.tick();
      for (let j = 0; j < 12; j += 1) await new Promise((resolve) => setImmediate(resolve));
      clock.ms += 1000;
    }
  };
  return { server, clock, lines, make, run, config };
}

describe("the simulator against a fake project", () => {
  it("signs each student in once, joins, checks in and keeps the tiles seen", async () => {
    const w = world();
    const sim = w.make();
    await w.run(sim, 90);
    expect(w.server.signUps).toBe(3);
    for (const number of w.config.students) {
      expect(w.server.sessionOf(number)?.state).toBe("writing");
      const types = w.server.events.filter((e) => e.number === number).map((e) => e.type);
      expect(types.slice(0, 2)).toEqual(["identity.matched", "exam.started"]);
    }
    expect(sim.mode).toBe("idle");
    await w.run(sim, 400);
    // Idle heartbeats every 255 to 300 s.
    expect(w.server.heartbeats).toBeGreaterThanOrEqual(3);
    for (const number of w.config.students) {
      expect(w.clock.ms - (w.server.sessionOf(number)?.lastSeenMs ?? 0)).toBeLessThanOrEqual(300_000);
    }
  });

  it("a restart and a rollover make no new anonymous user", async () => {
    const w = world();
    await w.run(w.make(), 60);
    expect(w.server.signUps).toBe(3);
    const before = w.server.sessionOf("20249001")?.id;

    const restarted = w.make();
    await w.run(restarted, 30);
    expect(w.server.signUps).toBe(3);
    expect(w.server.sessionOf("20249001")?.id).toBe(before);

    w.server.rollover();
    await w.run(restarted, 60);
    expect(w.server.signUps).toBe(3);
    expect(w.server.sessionOf("20249001")?.id).not.toBe(before);
    expect(w.server.sessionOf("20249001")?.state).toBe("writing");
    expect(w.lines.some((line) => line.includes("rollover"))).toBe(true);
  });

  it("plays the full cadence while a wall is open: 20 s heartbeats, incidents with stills, answers", async () => {
    const w = world();
    const sim = w.make();
    await w.run(sim, 60);
    w.server.viewers = 1;
    const heartbeats = w.server.heartbeats;
    await w.run(sim, 600);
    expect(sim.mode).toBe("watched");
    // 3 students, about every 19 s, less the writes ingest calls made.
    expect(w.server.heartbeats - heartbeats).toBeGreaterThan(60);
    for (const number of w.config.students) {
      expect(w.clock.ms - (w.server.sessionOf(number)?.lastSeenMs ?? 0)).toBeLessThan(25_000);
    }
    const incidents = w.server.events.filter(
      (e) => !["identity.matched", "exam.started", "gaze.on_screen", "answer.saved"].includes(e.type),
    );
    expect(incidents.length).toBeGreaterThan(8);
    expect(w.server.answers).toBeGreaterThanOrEqual(2);
    const stills = w.server.events.reduce((sum, e) => sum + e.frames, 0);
    expect(w.server.uploads).toHaveLength(stills);
    expect(w.server.confirmed).toHaveLength(stills);

    w.server.viewers = 0;
    await w.run(sim, 30);
    expect(sim.mode).toBe("idle");
  });

  it("a lost refresh token: a new user, held off the seat until the next run", async () => {
    const w = world(["20249001"]);
    const sim = w.make();
    await w.run(sim, 30);
    const session = w.server.sessionOf("20249001");
    expect(session?.state).toBe("writing");
    w.server.revoke(session?.uid as string);
    // Let the access token come close to its expiry so the student refreshes.
    w.clock.ms += 3500 * 1000;
    await w.run(sim, 30);
    expect(w.server.signUps).toBe(2);
    expect(w.lines.some((line) => line.includes("sign-in lost"))).toBe(true);
    expect(w.server.sessionOf("20249001")?.uid).toBe(session?.uid);
    expect(sim.students[0]?.hold).toMatchObject({ kind: "until_rollover", reason: "already_joined" });

    w.server.rollover();
    await w.run(sim, 30);
    expect(w.server.sessionOf("20249001")?.uid).not.toBe(session?.uid);
    expect(w.server.sessionOf("20249001")?.state).toBe("writing");
  });

  it("waits while the exam is cancelled (the off switch)", async () => {
    const w = world(["20249001"]);
    w.server.examStatus = "cancelled";
    const sim = w.make();
    await w.run(sim, 60);
    expect(w.server.joins).toBe(0);
    expect(w.server.events).toHaveLength(0);
  });
});
