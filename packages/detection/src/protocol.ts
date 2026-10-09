// Messages between the renderer and the detection worker, checked with Zod on both sides.
//
// Renderer to worker                         Worker to renderer
//   init     checks, mode, model URLs          ready       after the models loaded
//   frame    ImageBitmap (transferred), at      frame-done  after each frame (back-pressure)
//   camera   lost (reason) or ok, at            outputs     events and cues from the rules engine
//   phase    idle | check | exam, at            still       a JPEG Blob for a flagged event
//   resume   "I'm here" on 2.3, at, requestId   resumed     whether the resume was allowed
//   dispose                                     state       rule state for 2.1, 2.2 and 2.3, on change
//                                               geometry    face boxes, head pose and phone boxes, per frame
//                                               camera-check the 1.2 camera row, in the check phase
//                                               degraded    the fallback switched on
//                                               debug       overlay data, with debug: true
//                                               error       init, frame or message failures
//
// Phases: `check` runs face tracking and the camera row (1.2, 1.3); `exam` adds phone checks, the rules
// engine and stills; `idle` ignores frames. `geometry` goes out for every tracked frame in `check` and
// `exam`, for the live overlay: numbers only (boxes normalised to the frame, angles), never pixels. `at` is laptop time in ms from the renderer's clock
// (performance.timeOrigin + performance.now(), monotonic), so events and stills share one clock.
import {
  Box,
  CameraLostReason,
  EVENT_DATA,
  ExamChecks,
  ExamMode,
  FACE_BOXES_MAX,
  STILL,
} from "@uki/contracts";
import { z } from "zod";
import { Delegate, DetectionDebug, DetectionPhase, InputSizeSchema, RulesStateSchema } from "./debug.ts";
import { RULE_EVENT_TYPES } from "./rules.ts";
import type { FaceGeometry } from "./signals.ts";

const Time = z.number().finite();

/** Structured-clone-safe check for an ImageBitmap (or anything drawable with width, height and close). */
export const BitmapLike = z.custom<ImageBitmap>(
  (value) =>
    typeof value === "object" &&
    value !== null &&
    typeof (value as { width?: unknown }).width === "number" &&
    typeof (value as { height?: unknown }).height === "number" &&
    typeof (value as { close?: unknown }).close === "function",
  { message: "expected an ImageBitmap" },
);

export const BlobLike = z.custom<Blob>(
  (value) =>
    typeof value === "object" &&
    value !== null &&
    typeof (value as { size?: unknown }).size === "number" &&
    typeof (value as { type?: unknown }).type === "string",
  { message: "expected a Blob" },
);

export const ModelUrlsSchema = z.strictObject({
  /** Folder of vision_wasm_module_internal.{js,wasm}, no trailing slash. */
  wasmBase: z.string().min(1),
  faceLandmarker: z.string().min(1),
  objectDetector: z.string().min(1),
});
export type DetectionModelUrls = z.infer<typeof ModelUrlsSchema>;

// ---------------------------------------------------------------------------------------------------
// Renderer to worker
// ---------------------------------------------------------------------------------------------------

export const InitMessage = z.strictObject({
  type: z.literal("init"),
  checks: ExamChecks,
  mode: ExamMode,
  models: ModelUrlsSchema,
  /** Face Landmarker GPU with CPU fallback; the int8 phone model runs on CPU. */
  delegate: z.strictObject({ face: Delegate, phone: Delegate }).default({ face: "GPU", phone: "CPU" }),
  debug: z.boolean().default(false),
  /** False: still requests are reported but no JPEG is made (the browser demo on /try). */
  stills: z.boolean().default(true),
});
export type InitMessage = z.input<typeof InitMessage>;

export const FrameMessage = z.strictObject({ type: z.literal("frame"), at: Time, bitmap: BitmapLike });
export type FrameMessage = z.infer<typeof FrameMessage>;

export const CameraMessage = z.discriminatedUnion("state", [
  z.strictObject({ type: z.literal("camera"), at: Time, state: z.literal("lost"), reason: CameraLostReason }),
  z.strictObject({ type: z.literal("camera"), at: Time, state: z.literal("ok") }),
]);
export type CameraMessage = z.infer<typeof CameraMessage>;

export const PhaseMessage = z.strictObject({ type: z.literal("phase"), at: Time, phase: DetectionPhase });
export const ResumeMessage = z.strictObject({
  type: z.literal("resume"),
  at: Time,
  requestId: z.number().int().nonnegative(),
});
export const DisposeMessage = z.strictObject({ type: z.literal("dispose") });

export const MainToWorker = z.union([
  InitMessage,
  FrameMessage,
  CameraMessage,
  PhaseMessage,
  ResumeMessage,
  DisposeMessage,
]);
export type MainToWorker = z.input<typeof MainToWorker>;

// ---------------------------------------------------------------------------------------------------
// Worker to renderer
// ---------------------------------------------------------------------------------------------------

export const RuleEventSchema = z
  .strictObject({
    id: z.string().min(1),
    type: z.enum(RULE_EVENT_TYPES),
    at: Time,
    data: z.record(z.string(), z.unknown()),
    frame_count: z.number().int().min(0).max(STILL.maxCount),
  })
  .superRefine((event, ctx) => {
    const result = EVENT_DATA[event.type].safeParse(event.data);
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({ code: "custom", path: ["data", ...issue.path], message: issue.message });
      }
    }
  });

const SelfPauseReason = z.enum(["face_missing", "camera_lost"]);

export const RuleOutputSchema = z.union([
  z.strictObject({ kind: z.literal("event"), event: RuleEventSchema }),
  z.strictObject({
    kind: z.literal("stills"),
    eventId: z.string().min(1),
    at: Time,
    offsetsMs: z.array(z.number().nonnegative()).readonly(),
  }),
  z.strictObject({
    kind: z.literal("cue"),
    cue: z.literal("phone"),
    on: z.boolean(),
    score: z.number().min(0).max(1).nullable(),
  }),
  z.strictObject({
    kind: z.literal("cue"),
    cue: z.literal("paused"),
    on: z.boolean(),
    reason: SelfPauseReason.nullable(),
  }),
  z.strictObject({ kind: z.literal("cue"), cue: z.literal("away"), on: z.boolean() }),
]);

/** Phone detections kept per check: the Object Detector's maxResults. */
export const PHONE_DETECTIONS_MAX = 3;

const Angle = z.number().min(-180).max(180);

/** One face: its landmark box (min and max of the landmarks) and head pose in degrees. */
export const FaceGeometrySchema = z.strictObject({
  box: Box,
  yawDeg: Angle,
  pitchDeg: Angle,
  rollDeg: Angle,
});

// FaceGeometry (signals.ts) and FaceGeometrySchema must describe the same object.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const faceGeometryMatches: Same<FaceGeometry, z.infer<typeof FaceGeometrySchema>> = true;
void faceGeometryMatches;

/** One "cell phone" detection: its box and score. */
export const PhoneDetectionSchema = z.strictObject({ box: Box, score: z.number().min(0).max(1) });
export type PhoneDetection = z.infer<typeof PhoneDetectionSchema>;

/**
 * What the detectors saw in one frame, for the live overlay (D1). `faces`: every face, the one the
 * rules follow first. `phone`: the last phone check, with its time, up to PHONE_DETECTIONS_MAX
 * detections best first; null in the check phase and before the first check of the exam phase. Phone
 * checks run every 400 ms, so most frames repeat the last check; `phone.at` tells how old it is.
 */
export const DetectionGeometrySchema = z.strictObject({
  at: Time,
  faces: z.array(FaceGeometrySchema).max(FACE_BOXES_MAX),
  phone: z
    .strictObject({ at: Time, detections: z.array(PhoneDetectionSchema).max(PHONE_DETECTIONS_MAX) })
    .nullable(),
});
export type DetectionGeometry = z.infer<typeof DetectionGeometrySchema>;

export const CameraCheckSchema = z.strictObject({
  ready: z.boolean(),
  faces: z.number().int().nonnegative(),
  brightness: z.number().min(0).max(255),
  uniform: z.boolean(),
  problem: z.enum(["no_face", "many_faces", "dark", "covered"]).nullable(),
});

export const WorkerToMain = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("ready"),
    delegate: z.strictObject({ face: Delegate, phone: Delegate.nullable() }),
  }),
  z.strictObject({
    type: z.literal("error"),
    stage: z.enum(["init", "frame", "message", "still"]),
    message: z.string(),
  }),
  z.strictObject({ type: z.literal("frame-done"), at: Time }),
  z.strictObject({ type: z.literal("outputs"), outputs: z.array(RuleOutputSchema) }),
  z.strictObject({
    type: z.literal("still"),
    eventId: z.string().min(1),
    index: z
      .number()
      .int()
      .min(0)
      .max(STILL.maxCount - 1),
    /** When the frame was taken; the server dates it `event.at + offsetsMs[index]`. */
    at: Time,
    blob: BlobLike,
  }),
  z.strictObject({ type: z.literal("state"), state: RulesStateSchema }),
  z.strictObject({ type: z.literal("geometry"), geometry: DetectionGeometrySchema }),
  z.strictObject({ type: z.literal("camera-check"), check: CameraCheckSchema }),
  z.strictObject({
    type: z.literal("degraded"),
    input: InputSizeSchema,
    phoneIntervalMs: z.number().int().positive(),
  }),
  z.strictObject({ type: z.literal("debug"), debug: DetectionDebug }),
  z.strictObject({ type: z.literal("resumed"), requestId: z.number().int().nonnegative(), ok: z.boolean() }),
]);
export type WorkerToMain = z.infer<typeof WorkerToMain>;

/** How often the worker sends the 1.2 camera row while in the check phase (UI refresh, not a rule). */
export const CAMERA_CHECK_INTERVAL_MS = 500;
