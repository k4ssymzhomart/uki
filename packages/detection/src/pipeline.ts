// The worker-side pipeline for one frame: face tracking, the phone check every 400 ms (1 s in the
// fallback), the rules engine, the still schedule and the fps meter. Detectors and the clock are passed
// in, so tests run it with recorded signals and a fake capture. It is the only caller of
// `stills.capture`, and it calls it only for a still the rules engine requested.
import type { ExamChecks, ExamMode } from "@uki/contracts";
import { DEBUG_INTERVAL_MS, type Delegate, type DetectionDebug, type DetectionPhase } from "./debug.ts";
import { createPerfMonitor } from "./perf.ts";
import { CAMERA_CHECK_INTERVAL_MS, type WorkerToMain } from "./protocol.ts";
import {
  type CameraSignal,
  classifyFrame,
  createRules,
  type RuleOutput,
  type Rules,
  type RulesState,
} from "./rules.ts";
import { type Box, cameraCheck, type FaceSignals, type LumaStats, NO_FACE, sideLook } from "./signals.ts";
import { createStillSchedule, type DueStill } from "./still-schedule.ts";
import { stills } from "./stills.ts";

export interface FaceFrame {
  signals: FaceSignals;
  /** The primary face's box, normalized; null without a face. */
  box: Box | null;
}

export interface FaceDetector {
  readonly delegate: Delegate;
  detect(image: ImageBitmap, at: number): FaceFrame;
}

export interface PhoneDetector {
  readonly delegate: Delegate;
  /** Best "cell phone" score in the frame, 0 when none. */
  detect(image: ImageBitmap, at: number): number;
}

export interface PipelineDeps {
  face: FaceDetector;
  /** Null in phases or builds without phone checks. */
  phone: PhoneDetector | null;
  /** Luma of a downscaled copy of the frame, for the 1.2 camera row. */
  luma?: (image: ImageBitmap, box: Box | null) => LumaStats;
  /** Only tests replace this; production uses stills.capture. */
  capture?: (image: ImageBitmap) => Promise<Blob>;
  /** Monotonic ms for timing the detectors (performance.now). */
  now?: () => number;
}

export interface PipelineOptions {
  checks: ExamChecks;
  mode: ExamMode;
  debug: boolean;
  newId?: (atMs: number) => string;
}

export interface Pipeline {
  readonly phase: DetectionPhase;
  /** Runs one frame synchronously; the caller may close `image` as soon as this returns. */
  frame(image: ImageBitmap, at: number): void;
  camera(signal: CameraSignal, at: number): void;
  setPhase(phase: DetectionPhase, at: number): void;
  /** "I'm here" on 2.3. True when session.resumed was sent. */
  resume(at: number): boolean;
  /** Stills still waiting for their frame. */
  readonly pendingStills: number;
}

/** The overlay's phone-check rate is counted over this window. */
const PHONE_RATE_WINDOW_MS = 2_000;

function stateDigest(state: RulesState): string {
  return JSON.stringify([
    state.faces,
    state.gaze,
    state.look?.kind ?? null,
    state.look?.crossed ?? null,
    state.phone.warning,
    state.paused?.reason ?? null,
    state.cameraLost,
    state.canResume,
  ]);
}

export function createPipeline(
  deps: PipelineDeps,
  options: PipelineOptions,
  post: (message: WorkerToMain) => void,
): Pipeline {
  const capture = deps.capture ?? stills.capture;
  const now = deps.now ?? (() => performance.now());
  const perf = createPerfMonitor();
  const schedule = createStillSchedule();

  let phase: DetectionPhase = "idle";
  let rules: Rules | null = null;
  let lastPhoneAt = Number.NEGATIVE_INFINITY;
  let lastCheckAt = Number.NEGATIVE_INFINITY;
  let lastDebugAt: number | null = null;
  let firstFrameAt: number | null = null;
  let lastDigest = "";
  let lastSignals: FaceSignals = NO_FACE;
  let lastPhoneScore: number | null = null;
  let lastInput: { width: number; height: number } | null = null;
  let faceTime = { sum: 0, count: 0 };
  let phoneTime = { sum: 0, count: 0 };
  /** Phone checks in the last PHONE_RATE_WINDOW_MS, for a steady rate on the overlay. */
  let phoneChecks: number[] = [];

  function postOutputs(outputs: RuleOutput[]): void {
    if (outputs.length === 0) return;
    for (const output of outputs) {
      if (output.kind === "stills") schedule.request(output);
    }
    post({ type: "outputs", outputs });
  }

  function postState(): void {
    if (!rules) return;
    const state = rules.state();
    const digest = stateDigest(state);
    if (digest === lastDigest) return;
    lastDigest = digest;
    post({ type: "state", state });
  }

  function takeStill(image: ImageBitmap, still: DueStill, at: number): void {
    let pending: Promise<Blob>;
    try {
      pending = capture(image);
    } catch (error) {
      post({ type: "error", stage: "still", message: String(error) });
      return;
    }
    pending.then(
      (blob) => post({ type: "still", eventId: still.eventId, index: still.index, at, blob }),
      (error: unknown) => post({ type: "error", stage: "still", message: String(error) }),
    );
  }

  function postDebug(at: number): void {
    phoneChecks = phoneChecks.filter((t) => t > at - PHONE_RATE_WINDOW_MS);
    const seen = firstFrameAt === null ? 0 : at - firstFrameAt;
    const side = lastSignals.faces > 0 ? sideLook(lastSignals) : null;
    const debug: DetectionDebug = {
      at,
      phase,
      fps: perf.fps,
      faceMs: faceTime.count > 0 ? Math.round((faceTime.sum / faceTime.count) * 10) / 10 : null,
      phoneMs: phoneTime.count > 0 ? Math.round((phoneTime.sum / phoneTime.count) * 10) / 10 : null,
      phoneChecksPerS:
        seen >= PHONE_RATE_WINDOW_MS
          ? Math.round((phoneChecks.length / PHONE_RATE_WINDOW_MS) * 10_000) / 10
          : null,
      degraded: perf.degraded,
      input: lastInput,
      delegate: { face: deps.face.delegate, phone: deps.phone?.delegate ?? null },
      faces: lastSignals.faces,
      head: lastSignals.faces > 0 ? { yawDeg: lastSignals.yawDeg, pitchDeg: lastSignals.pitchDeg } : null,
      look: side ? { left: side.left, right: side.right, down: lastSignals.lookDown } : null,
      frameClass: lastSignals.faces > 0 ? classifyFrame(lastSignals) : "no_face",
      phoneScore: lastPhoneScore,
      rules: rules ? rules.state() : null,
    };
    lastDebugAt = at;
    faceTime = { sum: 0, count: 0 };
    phoneTime = { sum: 0, count: 0 };
    post({ type: "debug", debug });
  }

  return {
    get phase() {
      return phase;
    },
    get pendingStills() {
      return schedule.pending;
    },

    frame(image, at) {
      if (phase === "idle") return;
      firstFrameAt ??= at;
      lastInput = { width: image.width, height: image.height };
      const sample = perf.frame(at);
      if (sample.changed) {
        post({ type: "degraded", input: perf.input, phoneIntervalMs: perf.phoneIntervalMs });
      }

      const t0 = now();
      const face = deps.face.detect(image, at);
      faceTime.sum += now() - t0;
      faceTime.count += 1;
      lastSignals = face.signals;

      if (phase === "check" && deps.luma && at - lastCheckAt >= CAMERA_CHECK_INTERVAL_MS) {
        lastCheckAt = at;
        post({ type: "camera-check", check: cameraCheck(face.signals.faces, deps.luma(image, face.box)) });
      }

      if (phase === "exam" && rules) {
        const outputs = rules.push({ kind: "frame", ...face.signals }, at);
        if (deps.phone && !rules.state().paused && at - lastPhoneAt >= perf.phoneIntervalMs) {
          lastPhoneAt = at;
          const t1 = now();
          const score = deps.phone.detect(image, at);
          phoneTime.sum += now() - t1;
          phoneTime.count += 1;
          phoneChecks.push(at);
          lastPhoneScore = score;
          outputs.push(...rules.push({ kind: "phone", score }, at));
        }
        postOutputs(outputs);
        for (const still of schedule.due(at)) takeStill(image, still, at);
        postState();
      }

      if (options.debug && (lastDebugAt === null || at - lastDebugAt >= DEBUG_INTERVAL_MS)) postDebug(at);
    },

    camera(signal, at) {
      if (signal.state === "lost") schedule.cancel();
      if (!rules) return;
      postOutputs(rules.push(signal, at));
      postState();
    },

    setPhase(next, at) {
      if (next === phase) return;
      if (phase === "exam" && rules) {
        postOutputs(rules.finish(at));
        schedule.cancel();
      }
      if (next === "exam" && !rules) {
        rules = createRules(
          options.checks,
          options.newId ? { mode: options.mode, newId: options.newId } : { mode: options.mode },
        );
      }
      phase = next;
      postState();
    },

    resume(at) {
      if (!rules) return false;
      const outputs = rules.resume(at);
      postOutputs(outputs);
      postState();
      return outputs.some((output) => output.kind === "event" && output.event.type === "session.resumed");
    },
  };
}
