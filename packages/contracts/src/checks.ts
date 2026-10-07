// `exams.checks` and every fixed number from "Starting thresholds", "Flagged stills", "Offline queue",
// "Live wall (2.4)", "System check on 1.2" and "Identity check on 1.3" in docs/phase-0-plan.md.
// Tuning changes `exams.checks` defaults, not these constants.
import { z } from "zod";

/** Defaults of the `exams.checks` column. */
export const DEFAULT_EXAM_CHECKS = {
  gaze_s: 2,
  phone_score: 0.85,
  face_missing_s: 10,
  identity: true,
  lock: true,
} as const;

/**
 * `exams.checks`. Missing keys take the defaults, so `ExamChecks.parse({})` equals DEFAULT_EXAM_CHECKS.
 * - `gaze_s`: seconds a look must hold before gaze.off_screen or gaze.down fires.
 * - `phone_score`: the detector score at or above which a check counts as a phone hit.
 * - `face_missing_s`: seconds without a face before face.missing and the pause (2.3).
 * - `identity`: run the card match on 1.3.
 * - `lock`: require a paired Üki Lock on 1.2.
 */
export const ExamChecks = z.object({
  gaze_s: z.number().positive().max(60).default(DEFAULT_EXAM_CHECKS.gaze_s),
  phone_score: z.number().min(0).max(1).default(DEFAULT_EXAM_CHECKS.phone_score),
  face_missing_s: z.number().positive().max(600).default(DEFAULT_EXAM_CHECKS.face_missing_s),
  identity: z.boolean().default(DEFAULT_EXAM_CHECKS.identity),
  lock: z.boolean().default(DEFAULT_EXAM_CHECKS.lock),
});
export type ExamChecks = z.infer<typeof ExamChecks>;

export const THRESHOLDS = {
  /** Starting thresholds: gaze. Angles in degrees, look scores are blendshape means from 0 to 1. */
  gaze: {
    /** Head yaw beyond ±25° is off screen. */
    yawDeg: 25,
    /** Head pitch above +20° is off screen (looking up). */
    pitchUpDeg: 20,
    /** Head pitch below −15° is looking down. */
    pitchDownDeg: -15,
    /** Mean of `eyeLookOut` on one eye and `eyeLookIn` on the other above this is a side look. */
    sideLook: 0.55,
    /** Mean `eyeLookDown` above this is looking down. */
    lookDown: 0.6,
    /** 300 ms back on screen ends an off-screen look. */
    onScreenEndMs: 300,
  },
  face: {
    /** Two faces held this long fire face.second. */
    secondFaceMs: 1000,
  },
  phone: {
    /** One Object Detector check every 400 ms. */
    intervalMs: 400,
    /** Two checks in a row at or above `phone_score` fire phone.detected. */
    consecutiveHits: 2,
    /** The detector's own `scoreThreshold`. */
    detectorScore: 0.5,
    /** 2.2 closes, and the rule re-arms, after this long with no phone ("Student flow": 2.1 after 2 s). */
    warningClearMs: 2_000,
  },
  /** Flagged stills: JPEG, 640 × 360 centre-cropped, quality 0.7, at the crossing, 1 s and 2 s later. */
  stills: {
    offsetsMs: [0, 1000, 2000],
  },
  pause: {
    /** Self-pauses give back at most 300 s per session in total; proctor pauses give back all. */
    selfGiveBackCapS: 300,
  },
  wall: {
    /** A tile shows No signal when `last_seen_at` is older than this. */
    noSignalMs: 30_000,
    /** gaze.off_screen, gaze.down or tab.blocked this recent makes a Warning tile. */
    warningWindowMs: 5 * 60_000,
    /** The Live events column keeps this many events. */
    liveFeedCap: 100,
    /** The page renders with flag and log events from the last 60 minutes. */
    initialEventsWindowMs: 60 * 60_000,
  },
  outbox: {
    /** The app calls `ingest` at least this often, with an empty batch if needed. */
    ingestHeartbeatMs: 10_000,
    /** The sync loop runs after each answer and every 2 s. */
    flushIntervalMs: 2_000,
    /** A failed call retries after 2, 4, 8, 16, then every 30 seconds. */
    retryBackoffS: [2, 4, 8, 16, 30],
    /** With no reply for 5 s, 2.1a shows. */
    offlineBannerMs: 5_000,
    /** `ingest` takes 0 to 50 events. */
    maxBatch: 50,
  },
  performance: {
    /** Face tracking target. */
    targetFps: 15,
    /** Under 10 fps for 5 s, the worker drops to 480 × 360 and phone checks to 1 per second. */
    lowFps: 10,
    lowFpsWindowMs: 5_000,
    lowFpsPhoneIntervalMs: 1_000,
    /** The fallback input size. */
    lowFpsInput: { width: 480, height: 360 },
  },
  systemCheck: {
    /** Network row: `GET /auth/v1/health` must reply under 1,000 ms. */
    networkMaxMs: 1_000,
    /** Storage row: 1 GB free or more. */
    minFreeMb: 1024,
    /** Camera row: mean face brightness 70 of 255 or more. */
    minFaceBrightness: 70,
    /** Process scan interval during the exam. */
    scanIntervalMs: 15_000,
    /**
     * Camera row: a frame whose luma standard deviation is below this is uniform (a covered lens or a
     * blank picture). Not in the plan's tables; tune it on the demo laptops.
     */
    uniformMaxStd: 6,
  },
  identity: {
    /** `human.match.similarity` of 0.5 or more is a match. */
    minSimilarity: 0.5,
    /** After 3 failed tries the app shows 1.3a. */
    maxTries: 3,
  },
} as const;

/** Delay before retry number `attempt` (0-based): 2, 4, 8, 16, then 30 s forever. */
export function retryDelayMs(attempt: number): number {
  const steps = THRESHOLDS.outbox.retryBackoffS;
  const index = Math.min(Math.max(0, Math.floor(attempt)), steps.length - 1);
  return (steps[index] ?? 30) * 1000;
}
