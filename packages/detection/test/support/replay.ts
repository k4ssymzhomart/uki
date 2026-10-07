// Replays a recorded trace through the rules engine and collects what came out, with the time of the
// signal that produced each output.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExamChecks, ExamMode } from "@uki/contracts";
import type { z } from "zod";
import {
  createRules,
  type DetectionSignal,
  type RuleCue,
  type RuleEvent,
  type RuleOutput,
  type Rules,
  type StillRequest,
} from "../../src/rules.ts";
import { rowToSignal, type TraceFixture } from "./trace.ts";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "../fixtures");

export function loadFixture(name: string): TraceFixture {
  return JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), "utf8")) as TraceFixture;
}

export interface Timed<T> {
  at: number;
  value: T;
}

export interface Replay {
  rules: Rules;
  outputs: Timed<RuleOutput>[];
  events: RuleEvent[];
  cues: Timed<RuleCue>[];
  stills: StillRequest[];
  /** Feeds more signals into the same engine. */
  push(at: number, signal: DetectionSignal): RuleOutput[];
  resume(at: number): RuleOutput[];
}

export function counterIds(prefix = "evt"): (at: number) => string {
  let n = 0;
  return () => {
    n += 1;
    return `${prefix}-${n}`;
  };
}

export function startReplay(options: { mode?: ExamMode; checks?: z.input<typeof ExamChecks> } = {}): Replay {
  const rules = createRules(options.checks ?? {}, { mode: options.mode ?? "app", newId: counterIds() });
  const replay: Replay = {
    rules,
    outputs: [],
    events: [],
    cues: [],
    stills: [],
    push(at, signal) {
      const out = rules.push(signal, at);
      record(at, out);
      return out;
    },
    resume(at) {
      const out = rules.resume(at);
      record(at, out);
      return out;
    },
  };
  function record(at: number, out: RuleOutput[]): void {
    for (const output of out) {
      replay.outputs.push({ at, value: output });
      if (output.kind === "event") replay.events.push(output.event);
      else if (output.kind === "stills") replay.stills.push(output);
      else replay.cues.push({ at, value: output });
    }
  }
  return replay;
}

export function replayFixture(
  fixture: TraceFixture,
  options: { mode?: ExamMode; checks?: z.input<typeof ExamChecks> } = {},
): Replay {
  const replay = startReplay({ mode: options.mode ?? fixture.mode, checks: options.checks ?? {} });
  for (const row of fixture.signals) {
    const { at, signal } = rowToSignal(row);
    replay.push(at, signal);
  }
  return replay;
}

/** A clean face frame: on screen unless overridden. */
export function face(overrides: Partial<Omit<Extract<DetectionSignal, { kind: "frame" }>, "kind">> = {}) {
  return {
    kind: "frame" as const,
    faces: 1,
    yawDeg: 0,
    pitchDeg: -5,
    lookOutL: 0.05,
    lookOutR: 0.05,
    lookInL: 0.05,
    lookInR: 0.05,
    lookDown: 0.1,
    ...overrides,
  };
}

export const FRAME_MS = 1000 / 15;

/** Pushes one frame every 1000/15 ms from `from` (inclusive) to `to` (exclusive). Returns the next time. */
export function framesFor(
  replay: Replay,
  from: number,
  to: number,
  signal: (at: number) => DetectionSignal,
): number {
  let at = from;
  while (at < to) {
    replay.push(Math.round(at), signal(Math.round(at)));
    at += FRAME_MS;
  }
  return at;
}
