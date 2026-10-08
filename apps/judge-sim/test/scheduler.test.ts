import { describe, expect, it } from "vitest";
import { INCIDENT_KINDS } from "../src/episodes.ts";
import { createRng } from "../src/rng.ts";
import {
  CADENCE,
  chooseIncident,
  chooseStudent,
  heartbeatDue,
  heartbeatPeriodMs,
  INCIDENT_WEIGHTS,
  NO_SIGNAL_MS,
  nextAnswerDelayMs,
  nextIncidentDelayMs,
} from "../src/scheduler.ts";

describe("cadence", () => {
  it("keeps a watched tile well inside the wall's 30 s No signal rule, whatever the jitter", () => {
    for (const jitter of [0, 0.25, 0.5, 0.75, 1]) {
      const period = heartbeatPeriodMs(CADENCE.watched, jitter);
      expect(period).toBeLessThanOrEqual(20_000);
      expect(period).toBeGreaterThanOrEqual(18_000);
      expect(period + 5_000).toBeLessThan(NO_SIGNAL_MS);
    }
  });

  it("spreads idle heartbeats over 255 to 300 s, so tiles that joined together drift apart", () => {
    expect(heartbeatPeriodMs(CADENCE.idle, 0)).toBe(300_000);
    expect(heartbeatPeriodMs(CADENCE.idle, 1)).toBe(255_000);
    expect(heartbeatPeriodMs(CADENCE.idle, 9)).toBe(255_000);
  });

  it("a heartbeat is due at once without a write, then after its period", () => {
    expect(heartbeatDue(null, 0, 20_000)).toBe(true);
    expect(heartbeatDue(1000, 20_999, 20_000)).toBe(false);
    expect(heartbeatDue(1000, 21_000, 20_000)).toBe(true);
  });

  it("idle never asks the proctor or answers; watched answers about every 6 minutes per student", () => {
    expect(CADENCE.idle.askMinGapS).toBeNull();
    expect(CADENCE.idle.answerEveryS).toBeNull();
    expect(nextAnswerDelayMs(createRng(1), CADENCE.idle, 24)).toBeNull();
    const rng = createRng(2);
    const delays = Array.from({ length: 2000 }, () => nextAnswerDelayMs(rng, CADENCE.watched, 24) as number);
    const mean = delays.reduce((a, b) => a + b, 0) / delays.length;
    expect(mean).toBeGreaterThan(13_000);
    expect(mean).toBeLessThan(17_000);
    expect(nextAnswerDelayMs(rng, CADENCE.watched, 0)).toBeNull();
  });

  it("incident delays are the mean spread 0.5 to 1.5 times", () => {
    const rng = createRng(3);
    for (let i = 0; i < 500; i += 1) {
      const idle = nextIncidentDelayMs(rng, CADENCE.idle);
      expect(idle).toBeGreaterThanOrEqual(150_000);
      expect(idle).toBeLessThanOrEqual(450_000);
      const watched = nextIncidentDelayMs(rng, CADENCE.watched);
      expect(watched).toBeGreaterThanOrEqual(15_000);
      expect(watched).toBeLessThanOrEqual(45_000);
    }
  });
});

describe("chooseIncident", () => {
  it("draws every incident kind, about as often as its weight, and never Ask proctor while idle", () => {
    const rng = createRng(4);
    const counts = new Map<string, number>();
    for (let i = 0; i < 20_000; i += 1) {
      const kind = chooseIncident(rng, CADENCE.idle, null, i);
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
    expect(counts.has("ask_proctor")).toBe(false);
    const total = INCIDENT_KINDS.reduce((sum, kind) => sum + INCIDENT_WEIGHTS[kind], 0);
    for (const kind of INCIDENT_KINDS) {
      const share = (counts.get(kind) ?? 0) / 20_000;
      expect(share).toBeGreaterThan((INCIDENT_WEIGHTS[kind] / total) * 0.85);
      expect(share).toBeLessThan((INCIDENT_WEIGHTS[kind] / total) * 1.15);
    }
  });

  it("asks the proctor only after the gap since the last request", () => {
    const rng = createRng(5);
    const lastAsk = 1_000_000;
    for (let i = 0; i < 2000; i += 1) {
      expect(chooseIncident(rng, CADENCE.watched, lastAsk, lastAsk + 599_000)).not.toBe("ask_proctor");
    }
    const after = Array.from({ length: 2000 }, () =>
      chooseIncident(rng, CADENCE.watched, lastAsk, lastAsk + 600_000),
    );
    const asks = after.filter((kind) => kind === "ask_proctor").length / after.length;
    expect(asks).toBeGreaterThan(0.15);
    expect(asks).toBeLessThan(0.25);
  });
});

describe("chooseStudent", () => {
  it("picks one of the five who played longest ago", () => {
    const rng = createRng(6);
    const students = Array.from({ length: 24 }, (_, i) => ({
      number: String(20249001 + i),
      lastEpisodeAtMs: i * 1000,
    }));
    for (let i = 0; i < 200; i += 1) {
      const chosen = chooseStudent(rng, students);
      expect(Number(chosen?.number)).toBeLessThanOrEqual(20249005);
    }
    expect(chooseStudent(rng, [])).toBeNull();
  });

  it("spreads episodes over the whole class", () => {
    const rng = createRng(7);
    const last = new Map<string, number>();
    const numbers = Array.from({ length: 24 }, (_, i) => String(20249001 + i));
    for (let t = 1; t <= 240; t += 1) {
      const chosen = chooseStudent(
        rng,
        numbers.map((number) => ({ number, lastEpisodeAtMs: last.get(number) ?? 0 })),
      );
      if (chosen) last.set(chosen.number, t);
    }
    expect(last.size).toBe(24);
  });
});
