// A small, seeded trace builder. It writes the signal traces under test/fixtures/ (see generate.ts) in
// the shape the worker feeds the rules engine: a face frame every 1000/15 ms and a phone check every
// 400 ms, with sensor noise, blinks, short glances, single false phone hits and single-frame face
// dropouts, so replays meet the jitter a real camera produces.
import type { CameraLostReason, ExamMode } from "@uki/contracts";
import type { DetectionSignal } from "../../src/rules.ts";

export type FrameRow = [
  at: number,
  kind: "f",
  faces: number,
  yawDeg: number,
  pitchDeg: number,
  lookOutL: number,
  lookOutR: number,
  lookInL: number,
  lookInR: number,
  lookDown: number,
];
export type PhoneRow = [at: number, kind: "p", score: number];
export type CameraRow =
  | [at: number, kind: "c", state: "lost", reason: CameraLostReason]
  | [at: number, kind: "c", state: "ok"];
export type SignalRow = FrameRow | PhoneRow | CameraRow;

export interface TraceFixture {
  name: string;
  description: string;
  mode: ExamMode;
  fps: number;
  durationMs: number;
  signals: SignalRow[];
}

export function rowToSignal(row: SignalRow): { at: number; signal: DetectionSignal } {
  if (row[1] === "f") {
    const [at, , faces, yawDeg, pitchDeg, lookOutL, lookOutR, lookInL, lookInR, lookDown] = row;
    return {
      at,
      signal: { kind: "frame", faces, yawDeg, pitchDeg, lookOutL, lookOutR, lookInL, lookInR, lookDown },
    };
  }
  if (row[1] === "p") return { at: row[0], signal: { kind: "phone", score: row[2] } };
  if (row[2] === "lost") return { at: row[0], signal: { kind: "camera", state: "lost", reason: row[3] } };
  return { at: row[0], signal: { kind: "camera", state: "ok" } };
}

/** What the student does at a moment of a segment. Angles in degrees; eyes from 0 to 1. */
export interface Pose {
  faces: number;
  yaw?: number;
  pitch?: number;
  /** A side look with the eyes only, to the student's left or right. */
  eyes?: "left" | "right";
  /** Mean eyeLookDown. */
  lookDown?: number;
}

/** Deterministic PRNG (mulberry32). */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  const rounded = Math.round(value * factor) / factor;
  return rounded === 0 ? 0 : rounded; // no -0: JSON writes it as 0
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export interface TraceBuilder {
  /**
   * Frames for `durationMs`. `pose` gets the time since the segment started; `phone` the same, returning
   * the detector's best score (0 when it finds nothing above its own 0.5 threshold).
   */
  segment(durationMs: number, pose: (t: number) => Pose, phone?: (t: number) => number): TraceBuilder;
  /** The camera track ends or mutes; no frames follow until `cameraOk`. */
  cameraLost(reason: CameraLostReason): TraceBuilder;
  cameraOk(): TraceBuilder;
  /** Time passes with no frames. */
  gap(durationMs: number): TraceBuilder;
  readonly now: number;
  build(name: string, description: string, mode?: ExamMode): TraceFixture;
}

export function createTraceBuilder(
  seed: number,
  options: { fps?: number; phoneIntervalMs?: number } = {},
): TraceBuilder {
  const fps = options.fps ?? 15;
  const phoneIntervalMs = options.phoneIntervalMs ?? 400;
  const frameMs = 1000 / fps;
  const random = prng(seed);
  const gauss = (sd: number): number => {
    const u = Math.max(random(), 1e-9);
    const v = random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * sd;
  };
  const rows: SignalRow[] = [];
  let frameIndex = 0;
  let clock = 0;
  let lastPhone = Number.NEGATIVE_INFINITY;

  function frameRow(at: number, pose: Pose): FrameRow {
    if (pose.faces === 0) return [at, "f", 0, 0, 0, 0, 0, 0, 0, 0];
    const noise = (): number => Math.abs(gauss(0.05));
    let outL = noise();
    let outR = noise();
    let inL = noise();
    let inR = noise();
    if (pose.eyes === "left") {
      outL = 0.7 + gauss(0.04);
      inR = 0.66 + gauss(0.04);
    } else if (pose.eyes === "right") {
      outR = 0.7 + gauss(0.04);
      inL = 0.66 + gauss(0.04);
    }
    return [
      at,
      "f",
      pose.faces,
      round((pose.yaw ?? 0) + gauss(1.5), 2),
      round((pose.pitch ?? -6) + gauss(1.2), 2),
      round(clamp01(outL), 3),
      round(clamp01(outR), 3),
      round(clamp01(inL), 3),
      round(clamp01(inR), 3),
      round(clamp01((pose.lookDown ?? 0.15) + gauss(0.04)), 3),
    ];
  }

  const builder: TraceBuilder = {
    segment(durationMs, pose, phone) {
      const start = clock;
      const end = clock + durationMs;
      for (;;) {
        const at = Math.round(frameIndex * frameMs);
        if (at >= end) break;
        frameIndex += 1;
        if (at < start) continue;
        rows.push(frameRow(at, pose(at - start)));
        if (at - lastPhone >= phoneIntervalMs) {
          lastPhone = at;
          rows.push([at, "p", round(clamp01(phone ? phone(at - start) : 0), 3)]);
        }
      }
      clock = end;
      return builder;
    },
    cameraLost(reason) {
      rows.push([clock, "c", "lost", reason]);
      return builder;
    },
    cameraOk() {
      rows.push([clock, "c", "ok"]);
      return builder;
    },
    gap(durationMs) {
      clock += durationMs;
      while (Math.round(frameIndex * frameMs) < clock) frameIndex += 1;
      return builder;
    },
    get now() {
      return clock;
    },
    build(name, description, mode = "app") {
      return { name, description, mode, fps, durationMs: clock, signals: rows.slice() };
    },
  };
  return builder;
}

// ---------------------------------------------------------------------------------------------------
// Poses
// ---------------------------------------------------------------------------------------------------

/** Writing at the screen: small head drift, a blink every ~4 s (eyeLookDown spikes for 2 frames). */
export function writing(seed: number): (t: number) => Pose {
  const random = prng(seed);
  const blinkEvery = 3600 + Math.floor(random() * 1200);
  return (t) => {
    const blinking = t % blinkEvery < 130;
    return {
      faces: 1,
      yaw: 6 * Math.sin(t / 7000) + 3 * Math.sin(t / 1900),
      pitch: -6 + 2 * Math.sin(t / 5000),
      lookDown: blinking ? 0.72 : 0.15,
    };
  };
}

/** A phone check that finds nothing, except a phone held in view. */
export const noPhone = (): number => 0;
