import { describe, expect, it } from "vitest";
import { DEFAULT_EXAM_CHECKS, ExamChecks, retryDelayMs, THRESHOLDS } from "./checks.ts";

describe("ExamChecks", () => {
  it("fills the plan's defaults, as in the column default", () => {
    expect(ExamChecks.parse({})).toEqual({
      gaze_s: 2,
      phone_score: 0.55,
      face_missing_s: 10,
      identity: true,
      lock: true,
    });
    expect(ExamChecks.parse({})).toEqual(DEFAULT_EXAM_CHECKS);
  });

  it("keeps tuned values and refuses nonsense", () => {
    expect(ExamChecks.parse({ phone_score: 0.9, identity: false }).phone_score).toBe(0.9);
    expect(ExamChecks.safeParse({ phone_score: 1.5 }).success).toBe(false);
    expect(ExamChecks.safeParse({ gaze_s: 0 }).success).toBe(false);
    expect(ExamChecks.safeParse({ lock: "yes" }).success).toBe(false);
  });
});

describe("THRESHOLDS", () => {
  it("holds the plan's numbers", () => {
    expect(THRESHOLDS.gaze).toEqual({
      yawDeg: 25,
      pitchUpDeg: 20,
      pitchDownDeg: -15,
      sideLook: 0.55,
      lookDown: 0.6,
      onScreenEndMs: 300,
    });
    expect(THRESHOLDS.face.secondFaceMs).toBe(1000);
    expect(THRESHOLDS.phone).toMatchObject({ intervalMs: 400, consecutiveHits: 2 });
    expect(THRESHOLDS.stills.offsetsMs).toEqual([0, 1000, 2000]);
    expect(THRESHOLDS.pause.selfGiveBackCapS).toBe(300);
    expect(THRESHOLDS.wall).toMatchObject({ noSignalMs: 30_000, warningWindowMs: 300_000, liveFeedCap: 100 });
    expect(THRESHOLDS.outbox).toEqual({
      ingestHeartbeatMs: 10_000,
      flushIntervalMs: 2_000,
      retryBackoffS: [2, 4, 8, 16, 30],
      offlineBannerMs: 5_000,
      maxBatch: 50,
    });
    expect(THRESHOLDS.performance).toMatchObject({ lowFps: 10, lowFpsWindowMs: 5_000 });
  });

  it("retries after 2, 4, 8, 16, then every 30 seconds", () => {
    expect([0, 1, 2, 3, 4, 5, 50].map(retryDelayMs)).toEqual([2000, 4000, 8000, 16000, 30000, 30000, 30000]);
    expect(retryDelayMs(-3)).toBe(2000);
  });
});
