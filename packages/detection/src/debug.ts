// What the developer overlay shows (Ctrl+Shift+D in development builds, "Tuning" in the plan): fps,
// head angles, look scores, face count, phone score, the rule state and the fallback flag. The worker
// sends one every DEBUG_INTERVAL_MS when it was started with `debug: true`.
import { ExamMode } from "@uki/contracts";
import { z } from "zod";
import type { RulesState } from "./rules.ts";

export const DEBUG_INTERVAL_MS = 500;

export const Delegate = z.enum(["GPU", "CPU"]);
export type Delegate = z.infer<typeof Delegate>;

export const InputSizeSchema = z.strictObject({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export const DetectionPhase = z.enum(["idle", "check", "exam"]);
export type DetectionPhase = z.infer<typeof DetectionPhase>;

const SelfPauseReason = z.enum(["face_missing", "camera_lost"]);

export const RulesStateSchema = z.strictObject({
  mode: ExamMode,
  at: z.number().nullable(),
  faces: z.number().int().nonnegative(),
  gaze: z.enum(["on", "away", "no_face"]),
  look: z
    .strictObject({
      kind: z.enum(["off_screen", "down"]),
      heldMs: z.number().nonnegative(),
      crossed: z.boolean(),
    })
    .nullable(),
  noFaceMs: z.number().nonnegative().nullable(),
  twoFacesMs: z.number().nonnegative().nullable(),
  phone: z.strictObject({ hits: z.number().int().nonnegative(), warning: z.boolean() }),
  paused: z.strictObject({ reason: SelfPauseReason, since: z.number() }).nullable(),
  cameraLost: z.boolean(),
  canResume: z.boolean(),
});

// RulesState (rules.ts) and RulesStateSchema must describe the same object.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const rulesStateMatches: Same<RulesState, z.infer<typeof RulesStateSchema>> = true;
void rulesStateMatches;

export const FrameClassSchema = z.enum(["on", "left", "right", "up", "down", "no_face"]);

export const DetectionDebug = z.strictObject({
  at: z.number(),
  phase: DetectionPhase,
  /** Face-tracking frames in the last second. */
  fps: z.number().nullable(),
  /** Mean Face Landmarker time per frame since the last debug message, ms. */
  faceMs: z.number().nullable(),
  /** Mean Object Detector time per check since the last debug message, ms. */
  phoneMs: z.number().nullable(),
  phoneChecksPerS: z.number().nullable(),
  degraded: z.boolean(),
  /** Size of the last frame the worker received. */
  input: InputSizeSchema.nullable(),
  delegate: z.strictObject({ face: Delegate, phone: Delegate.nullable() }).nullable(),
  faces: z.number().int().nonnegative(),
  head: z.strictObject({ yawDeg: z.number(), pitchDeg: z.number() }).nullable(),
  /** Side-look means and eyeLookDown mean, 0 to 1. */
  look: z.strictObject({ left: z.number(), right: z.number(), down: z.number() }).nullable(),
  frameClass: FrameClassSchema,
  /** The last phone check's best score. */
  phoneScore: z.number().nullable(),
  rules: RulesStateSchema.nullable(),
});
export type DetectionDebug = z.infer<typeof DetectionDebug>;
