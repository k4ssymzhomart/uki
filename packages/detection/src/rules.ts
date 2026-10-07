// The rules engine: a pure state machine that turns per-frame signals into events, still requests and
// UI cues ("On-device detection" > Pipeline step 4 and "Starting thresholds" in docs/phase-0-plan.md).
// It has no clock and no I/O: every call carries its timestamp, so tests replay recorded traces.
//
// Rules, with numbers from `exams.checks` (ExamChecks) and THRESHOLDS in @uki/contracts:
// - A look away starts on the first frame with head yaw beyond ±yawDeg, pitch above pitchUpDeg, a side
//   look above sideLook (off screen), or pitch below pitchDownDeg or eyeLookDown above lookDown (down).
//   It ends after onScreenEndMs of on-screen frames, so shorter returns do not split it. Held for
//   `gaze_s` it crosses: the event id is made, stills are requested and the `away` cue goes on. The event
//   is sent when the look ends, with its full duration: gaze.down when most of the look until the
//   crossing was down, gaze.off_screen otherwise, with the most frequent of left, right or up.
//   After a look event, gaze.on_screen is sent once the student has been back on screen onScreenEndMs.
//   A look is only measured while a face is tracked: after onScreenEndMs without a face it closes at its
//   last measured frame (sent if it had crossed, dropped if not); a missing face is face.missing's job.
// - face.missing after `face_missing_s` with no face; in app exams session.paused (face_missing) and the
//   `paused` cue follow at once (2.3). A face must be back onScreenEndMs to re-arm it.
// - face.second after secondFaceMs with two or more faces; gaps under onScreenEndMs are bridged.
// - phone.detected on `consecutiveHits` checks in a row at or above `phone_score`, with the `phone` cue
//   on at once (2.2); the cue goes off, and the rule re-arms, after PHONE_WARNING_CLEAR_MS with no hit.
// - camera.lost at once; in app exams session.paused (camera_lost) follows.
// - Browser exams ("Exams in the browser") log face.missing and camera.lost but never pause.
// - While paused, frames only track whether a face is back (`canResume`); nothing else fires. `resume`
//   sends session.resumed when a face is in view and the camera works.
// Every event's `at` is the moment its threshold was crossed, which is also when the first still is
// taken: the server dates still i at `event.at + THRESHOLDS.stills.offsetsMs[i]`.
import {
  type CameraLostReason,
  type EventData,
  type ExamChecks,
  ExamChecks as ExamChecksSchema,
  type ExamMode,
  type GazeDirection,
  THRESHOLDS,
  uuidv7,
} from "@uki/contracts";
import type { z } from "zod";
import { type FaceSignals, sideLook } from "./signals.ts";

/** 2.2 closes after this long with no phone ("Student flow": 2.1 after 2 s with no phone). */
export const PHONE_WARNING_CLEAR_MS = 2_000;

export type FrameSignal = { kind: "frame" } & FaceSignals;
/** One Object Detector check: the best "cell phone" score, 0 when none was found. */
export interface PhoneSignal {
  kind: "phone";
  score: number;
}
export type CameraSignal =
  | { kind: "camera"; state: "lost"; reason: CameraLostReason }
  | { kind: "camera"; state: "ok" };
export type DetectionSignal = FrameSignal | PhoneSignal | CameraSignal;

/** Event types the rules engine sends. */
export const RULE_EVENT_TYPES = [
  "gaze.off_screen",
  "gaze.down",
  "gaze.on_screen",
  "phone.detected",
  "face.missing",
  "face.second",
  "camera.lost",
  "session.paused",
  "session.resumed",
] as const;
export type RuleEventType = (typeof RULE_EVENT_TYPES)[number];

/** An event for the outbox. `at` is laptop time in ms; `frame_count` is the number of stills requested. */
export type RuleEvent = {
  [T in RuleEventType]: { id: string; type: T; at: number; data: EventData<T>; frame_count: number };
}[RuleEventType];

export type SelfPauseReason = "face_missing" | "camera_lost";

export type RuleCue =
  | { kind: "cue"; cue: "phone"; on: boolean; score: number | null }
  | { kind: "cue"; cue: "paused"; on: boolean; reason: SelfPauseReason | null }
  | { kind: "cue"; cue: "away"; on: boolean };

/** Capture stills for `eventId` at `at + offsetsMs[i]`. */
export interface StillRequest {
  kind: "stills";
  eventId: string;
  at: number;
  offsetsMs: readonly number[];
}

export type RuleOutput = { kind: "event"; event: RuleEvent } | StillRequest | RuleCue;

export interface RulesOptions {
  /** `app` pauses on face.missing and camera.lost; `browser` only logs them. Default `app`. */
  mode?: ExamMode;
  /** Event ids; default UUIDv7 from the signal's timestamp. */
  newId?: (atMs: number) => string;
}

export type LookKind = "off_screen" | "down";

export interface RulesState {
  mode: ExamMode;
  /** Timestamp of the last signal. */
  at: number | null;
  faces: number;
  /** `away` while a look is open, `no_face` without a face. */
  gaze: "on" | "away" | "no_face";
  look: { kind: LookKind; heldMs: number; crossed: boolean } | null;
  noFaceMs: number | null;
  twoFacesMs: number | null;
  phone: { hits: number; warning: boolean };
  paused: { reason: SelfPauseReason; since: number } | null;
  cameraLost: boolean;
  /** "I'm here" on 2.3 may resume: paused, the camera works and a face is in view. */
  canResume: boolean;
}

export interface Rules {
  push(signal: DetectionSignal, atMs: number): RuleOutput[];
  /** "I'm here" on 2.3. Returns session.resumed and the `paused` cue off, or nothing when not allowed. */
  resume(atMs: number): RuleOutput[];
  /** Closes an open look (sent if it crossed) and clears the phone cue, for submit or a phase change. */
  finish(atMs: number): RuleOutput[];
  state(): RulesState;
}

type Direction = GazeDirection | "down";
type FrameClass = "on" | Direction;

interface Look {
  start: number;
  lastAwayAt: number;
  counts: Record<Direction, number>;
  crossed: { at: number; id: string; type: "gaze.off_screen" | "gaze.down" } | null;
}

/** Sorts one frame into on screen, off screen (left, right, up) or down. Off screen wins over down. */
export function classifyFrame(s: FaceSignals): FrameClass {
  const g = THRESHOLDS.gaze;
  if (s.yawDeg > g.yawDeg) return "left";
  if (s.yawDeg < -g.yawDeg) return "right";
  if (s.pitchDeg > g.pitchUpDeg) return "up";
  const side = sideLook(s);
  if (side.left > g.sideLook || side.right > g.sideLook) return side.left >= side.right ? "left" : "right";
  if (s.pitchDeg < g.pitchDownDeg || s.lookDown > g.lookDown) return "down";
  return "on";
}

function emptyCounts(): Record<Direction, number> {
  return { left: 0, right: 0, up: 0, down: 0 };
}

function dominantDirection(counts: Record<Direction, number>): GazeDirection {
  const order: GazeDirection[] = ["left", "right", "up"];
  let best: GazeDirection = "left";
  let bestCount = -1;
  for (const direction of order) {
    if (counts[direction] > bestCount) {
      best = direction;
      bestCount = counts[direction];
    }
  }
  return best;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function createRules(
  checksInput: z.input<typeof ExamChecksSchema> | ExamChecks = {},
  options: RulesOptions = {},
): Rules {
  const checks = ExamChecksSchema.parse(checksInput);
  const mode: ExamMode = options.mode ?? "app";
  const newId = options.newId ?? ((atMs: number) => uuidv7(atMs));

  const holdMs = checks.gaze_s * 1000;
  const gapMs = THRESHOLDS.gaze.onScreenEndMs;
  const missingMs = checks.face_missing_s * 1000;
  const secondMs = THRESHOLDS.face.secondFaceMs;
  const phoneScore = checks.phone_score;
  const phoneHits = THRESHOLDS.phone.consecutiveHits;
  const stillOffsets = THRESHOLDS.stills.offsetsMs;
  const stillCount = stillOffsets.length;

  let lastAt: number | null = null;
  let lastFaces = 0;

  // Gaze
  let look: Look | null = null;
  let onSince: number | null = null;
  let awaitingReturn = false;

  // Face presence and face.missing
  let noFaceSince: number | null = null;
  let faceSince: number | null = null;
  let missingFired = false;

  // face.second
  let twoSince: number | null = null;
  let lastTwoAt = 0;
  let twoMax = 0;
  let secondFired = false;

  // Phone
  let run: { firstAt: number; count: number; maxScore: number } | null = null;
  let lastHitAt: number | null = null;
  let warning = false;
  let phoneFired = false;

  // Pause and camera
  let paused: { reason: SelfPauseReason; since: number } | null = null;
  let cameraLost = false;

  function emit<T extends RuleEventType>(
    out: RuleOutput[],
    type: T,
    at: number,
    data: EventData<T>,
    options: { id?: string; stills?: boolean } = {},
  ): string {
    const id = options.id ?? newId(at);
    const event = { id, type, at, data, frame_count: options.stills ? stillCount : 0 } as RuleEvent;
    out.push({ kind: "event", event });
    return id;
  }

  function requestStills(out: RuleOutput[], eventId: string, at: number): void {
    out.push({ kind: "stills", eventId, at, offsetsMs: stillOffsets });
  }

  function closeLook(out: RuleOutput[], endAt: number): void {
    if (!look) return;
    const { crossed } = look;
    if (crossed) {
      const duration_ms = Math.max(0, Math.round(endAt - look.start));
      if (crossed.type === "gaze.off_screen") {
        emit(
          out,
          "gaze.off_screen",
          crossed.at,
          { duration_ms, direction: dominantDirection(look.counts) },
          { id: crossed.id, stills: true },
        );
      } else {
        emit(out, "gaze.down", crossed.at, { duration_ms }, { id: crossed.id, stills: true });
      }
      out.push({ kind: "cue", cue: "away", on: false });
      awaitingReturn = true;
    }
    look = null;
  }

  function clearPhone(out: RuleOutput[]): void {
    run = null;
    if (warning) {
      warning = false;
      out.push({ kind: "cue", cue: "phone", on: false, score: null });
    }
    phoneFired = false;
    lastHitAt = null;
  }

  function resetDetection(): void {
    look = null;
    onSince = null;
    awaitingReturn = false;
    twoSince = null;
    twoMax = 0;
    secondFired = false;
    run = null;
  }

  function pause(out: RuleOutput[], reason: SelfPauseReason, at: number): void {
    if (paused) return;
    paused = { reason, since: at };
    emit(out, "session.paused", at, { reason });
    out.push({ kind: "cue", cue: "paused", on: true, reason });
    clearPhone(out);
    resetDetection();
  }

  function onFrame(out: RuleOutput[], s: FrameSignal, at: number): void {
    cameraLost = false;
    lastFaces = s.faces;

    // Face presence, also while paused: "I'm here" needs it.
    if (s.faces >= 1) {
      faceSince ??= at;
      if (noFaceSince !== null && at - faceSince >= gapMs) {
        noFaceSince = null;
        missingFired = false;
      }
    } else {
      faceSince = null;
      noFaceSince ??= at;
    }
    if (paused) return;

    // face.missing
    if (s.faces === 0 && noFaceSince !== null && !missingFired && at - noFaceSince >= missingMs) {
      missingFired = true;
      closeLook(out, look?.lastAwayAt ?? at);
      const id = emit(
        out,
        "face.missing",
        at,
        { duration_ms: Math.round(at - noFaceSince) },
        { stills: true },
      );
      requestStills(out, id, at);
      if (mode === "app") pause(out, "face_missing", at);
      return;
    }

    // face.second
    if (s.faces >= 2) {
      if (twoSince === null) {
        twoSince = at;
        twoMax = 0;
      }
      lastTwoAt = at;
      twoMax = Math.max(twoMax, s.faces);
      if (!secondFired && at - twoSince >= secondMs) {
        secondFired = true;
        const id = emit(
          out,
          "face.second",
          at,
          { duration_ms: Math.round(at - twoSince), faces: twoMax },
          { stills: true },
        );
        requestStills(out, id, at);
      }
    } else if (twoSince !== null && at - lastTwoAt >= gapMs) {
      twoSince = null;
      twoMax = 0;
      secondFired = false;
    }

    // Gaze
    if (s.faces === 0) {
      onSince = null;
      if (look && at - look.lastAwayAt >= gapMs) closeLook(out, look.lastAwayAt);
      return;
    }
    const cls = classifyFrame(s);
    if (cls !== "on") {
      onSince = null;
      if (!look) look = { start: at, lastAwayAt: at, counts: emptyCounts(), crossed: null };
      look.lastAwayAt = at;
      look.counts[cls] += 1;
      if (!look.crossed && at - look.start >= holdMs) {
        const c = look.counts;
        const type = c.down > c.left + c.right + c.up ? "gaze.down" : "gaze.off_screen";
        const id = newId(at);
        look.crossed = { at, id, type };
        requestStills(out, id, at);
        out.push({ kind: "cue", cue: "away", on: true });
      }
      return;
    }
    onSince ??= at;
    if (at - onSince >= gapMs) {
      if (look) closeLook(out, onSince);
      if (awaitingReturn) {
        emit(out, "gaze.on_screen", onSince, {});
        awaitingReturn = false;
      }
    }
  }

  function onPhone(out: RuleOutput[], s: PhoneSignal, at: number): void {
    if (paused || cameraLost) return;
    if (!(s.score >= phoneScore)) {
      run = null;
      return;
    }
    run = run
      ? { firstAt: run.firstAt, count: run.count + 1, maxScore: Math.max(run.maxScore, s.score) }
      : { firstAt: at, count: 1, maxScore: s.score };
    lastHitAt = at;
    if (!phoneFired && run.count >= phoneHits) {
      phoneFired = true;
      const score = round3(Math.min(1, run.maxScore));
      const id = emit(
        out,
        "phone.detected",
        at,
        { score, held_ms: Math.round(at - run.firstAt) },
        { stills: true },
      );
      requestStills(out, id, at);
      if (!warning) {
        warning = true;
        out.push({ kind: "cue", cue: "phone", on: true, score });
      }
    }
  }

  function onCamera(out: RuleOutput[], s: CameraSignal, at: number): void {
    if (s.state === "ok") {
      cameraLost = false;
      return;
    }
    if (cameraLost) return;
    cameraLost = true;
    lastFaces = 0;
    faceSince = null;
    if (!paused) closeLook(out, look?.lastAwayAt ?? at);
    clearPhone(out);
    resetDetection();
    emit(out, "camera.lost", at, { reason: s.reason });
    if (mode === "app") pause(out, "camera_lost", at);
  }

  function phoneClear(out: RuleOutput[], at: number): void {
    if (warning && lastHitAt !== null && at - lastHitAt >= PHONE_WARNING_CLEAR_MS) clearPhone(out);
  }

  function clamp(atMs: number): number {
    const at = lastAt === null ? atMs : Math.max(atMs, lastAt);
    lastAt = at;
    return at;
  }

  function canResume(): boolean {
    return paused !== null && !cameraLost && lastFaces >= 1;
  }

  return {
    push(signal, atMs) {
      const at = clamp(atMs);
      const out: RuleOutput[] = [];
      if (signal.kind === "frame") onFrame(out, signal, at);
      else if (signal.kind === "phone") onPhone(out, signal, at);
      else onCamera(out, signal, at);
      phoneClear(out, at);
      return out;
    },

    resume(atMs) {
      const at = clamp(atMs);
      const out: RuleOutput[] = [];
      if (!paused || !canResume()) return out;
      emit(out, "session.resumed", at, { paused_ms: Math.round(at - paused.since), by: "student" });
      out.push({ kind: "cue", cue: "paused", on: false, reason: null });
      paused = null;
      resetDetection();
      noFaceSince = null;
      missingFired = false;
      faceSince = at;
      return out;
    },

    finish(atMs) {
      clamp(atMs);
      const out: RuleOutput[] = [];
      if (look) closeLook(out, onSince ?? look.lastAwayAt);
      clearPhone(out);
      resetDetection();
      return out;
    },

    state() {
      const now = lastAt;
      const lookState: RulesState["look"] = look
        ? {
            kind:
              look.counts.down > look.counts.left + look.counts.right + look.counts.up
                ? "down"
                : "off_screen",
            heldMs: Math.max(0, (now ?? look.start) - look.start),
            crossed: look.crossed !== null,
          }
        : null;
      return {
        mode,
        at: now,
        faces: lastFaces,
        gaze: lastFaces === 0 ? "no_face" : look ? "away" : "on",
        look: lookState,
        noFaceMs: noFaceSince !== null && now !== null ? now - noFaceSince : null,
        twoFacesMs: twoSince !== null && now !== null ? now - twoSince : null,
        phone: { hits: run?.count ?? 0, warning },
        paused: paused ? { ...paused } : null,
        cameraLost,
        canResume: canResume(),
      };
    },
  };
}
