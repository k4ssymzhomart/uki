// The simulator's script: what each simulated student does, as actions at offsets in simulated time.
// The engine divides every offset by --speed, except the No signal silence, which is wall-clock time
// because the wall's 30-second rule is.
//
// Lobby (1.5): students join over the first 45 s and walk through checking, identity and rules to
// ready; three get stuck with a detail (a blocked app, a busy camera, an unreadable card) until the
// exam starts. Live wall (2.4): after the start every student answers questions; the parts in cast.ts
// play the frame's moments in the first three minutes; everyone else adds an occasional look away;
// students submit between minute 55 and 85 (two submit after four to seven minutes).
import {
  formatStatusDetail,
  type GazeDirection,
  type StatusStep,
} from "../../../packages/contracts/src/index.ts";
import type { CastMember } from "./cast.ts";
import type { Rng } from "./rng.ts";

/**
 * `sessions.status.detail` values the simulator writes, in the vocabulary the app uses
 * (packages/contracts/src/status-detail.ts), so the lobby (1.5) shows the frame's three details.
 */
export const STATUS_DETAIL = {
  /** 1.2 Other apps row failed: "Telegram is open". The name comes from blocked-apps.ts. */
  blockedApp: (name: string) => formatStatusDetail({ kind: "app", name }),
  /** 1.2 Camera row failed because another app holds the camera: "Camera blocked by another app". */
  cameraBusy: formatStatusDetail({ kind: "camera", problem: "busy" }),
  /** 1.3 card match failed on try `tries` of 3: "Card unreadable · retry 2 of 3". */
  cardUnreadable: (tries: number) => formatStatusDetail({ kind: "card", problem: "retry", tries }),
} as const;

export type SimAction =
  | { kind: "status"; step: StatusStep; detail?: string }
  | { kind: "identity_matched"; score: number; tries: number }
  | { kind: "start" }
  | { kind: "question"; question: number }
  | {
      kind: "look_away";
      type: "gaze.off_screen" | "gaze.down";
      durationMs: number;
      direction?: GazeDirection;
    }
  | { kind: "phone"; score: number; heldMs: number }
  | { kind: "second_face"; durationMs: number }
  | { kind: "tab_blocked"; host: string }
  | { kind: "self_pause"; cause: "face_missing" | "camera_lost"; pauseSimMs: number }
  | { kind: "resume" }
  | { kind: "go_offline"; realMs: number }
  | { kind: "submit" };

export interface Planned {
  /** Simulated milliseconds after the plan's anchor (the join for the lobby, the start for the exam). */
  atSimMs: number;
  action: SimAction;
}

const S = 1000;
const MIN = 60 * S;

/** The lobby steps in order; a step is reported through `ingest` `status.step`. */
export const LOBBY_STEPS = ["joined", "checking", "identity", "rules", "ready"] as const;
export type LobbyStep = (typeof LOBBY_STEPS)[number];

export function stepRank(step: LobbyStep): number {
  return LOBBY_STEPS.indexOf(step);
}

/** When a student joins, in simulated ms after the simulator starts (null: only after the exam starts). */
export function joinDelay(member: CastMember, rng: Rng): number | null {
  if (member.lobby === "late") return null;
  return Math.round(rng.between(0, 45 * S));
}

/** The lobby from the join: steps until ready, or until the student is stuck with a detail. */
export function planLobby(member: CastMember, rng: Rng): Planned[] {
  const plan: Planned[] = [];
  let t = rng.between(2 * S, 5 * S);
  switch (member.lobby) {
    case "late":
      return plan;
    case "help_app":
      plan.push({
        atSimMs: t,
        action: { kind: "status", step: "checking", detail: STATUS_DETAIL.blockedApp("Telegram") },
      });
      return plan;
    case "help_camera":
      plan.push({
        atSimMs: t,
        action: { kind: "status", step: "checking", detail: STATUS_DETAIL.cameraBusy },
      });
      return plan;
    case "help_identity": {
      plan.push({ atSimMs: t, action: { kind: "status", step: "checking" } });
      t += rng.between(8 * S, 15 * S);
      plan.push({ atSimMs: t, action: { kind: "status", step: "identity" } });
      t += rng.between(10 * S, 15 * S);
      plan.push({
        atSimMs: t,
        action: { kind: "status", step: "identity", detail: STATUS_DETAIL.cardUnreadable(1) },
      });
      t += rng.between(12 * S, 20 * S);
      plan.push({
        atSimMs: t,
        action: { kind: "status", step: "identity", detail: STATUS_DETAIL.cardUnreadable(2) },
      });
      return plan;
    }
    case "slow":
    case "normal": {
      plan.push({ atSimMs: t, action: { kind: "status", step: "checking" } });
      t += rng.between(8 * S, 20 * S);
      plan.push({ atSimMs: t, action: { kind: "status", step: "identity" } });
      t += member.lobby === "slow" ? rng.between(150 * S, 210 * S) : rng.between(6 * S, 15 * S);
      const tries = rng.chance(0.85) ? 1 : 2;
      plan.push({
        atSimMs: t,
        action: { kind: "identity_matched", score: round2(rng.between(0.62, 0.93)), tries },
      });
      t += 500;
      plan.push({ atSimMs: t, action: { kind: "status", step: "rules" } });
      t += member.lobby === "slow" ? rng.between(60 * S, 90 * S) : rng.between(10 * S, 25 * S);
      plan.push({ atSimMs: t, action: { kind: "status", step: "ready" } });
      return plan;
    }
  }
}

/**
 * What a student still has to do once the exam has started, from the last step it reported: the
 * remaining steps in quick succession, then `exam.started`. Stuck students first spend 20 to 45 s
 * fixing their problem; the unreadable card matches on the third try.
 */
export function planCatchUp(member: CastMember, from: LobbyStep, rng: Rng): Planned[] {
  const plan: Planned[] = [];
  if (from === "rules" || from === "ready") {
    // The start command (or the clock) moves 1.4 to 2.1 at once.
    plan.push({ atSimMs: rng.between(300, 3 * S), action: { kind: "start" } });
    return plan;
  }
  const stuck =
    member.lobby === "help_app" || member.lobby === "help_camera" || member.lobby === "help_identity";
  let t = stuck ? rng.between(20 * S, 45 * S) : member.lobby === "slow" ? rng.between(5 * S, 15 * S) : 0;
  const next = () => {
    t += rng.between(3 * S, 8 * S);
    return t;
  };
  if (
    stepRank(from) < stepRank("checking") ||
    member.lobby === "help_app" ||
    member.lobby === "help_camera"
  ) {
    plan.push({ atSimMs: next(), action: { kind: "status", step: "checking" } });
  }
  if (stepRank(from) < stepRank("identity")) {
    plan.push({ atSimMs: next(), action: { kind: "status", step: "identity" } });
  }
  plan.push({
    atSimMs: next(),
    action:
      member.lobby === "help_identity"
        ? { kind: "identity_matched", score: round2(rng.between(0.55, 0.65)), tries: 3 }
        : { kind: "identity_matched", score: round2(rng.between(0.62, 0.93)), tries: 1 },
  });
  plan.push({ atSimMs: t + 500, action: { kind: "status", step: "rules" } });
  plan.push({ atSimMs: next(), action: { kind: "status", step: "ready" } });
  plan.push({ atSimMs: t + rng.between(1 * S, 3 * S), action: { kind: "start" } });
  return plan;
}

export interface ExamPlanOptions {
  /** Questions in the exam (20 for Mathematics 2). */
  questions: number;
  /** The exam's length in minutes; submissions stay inside it. */
  durationMin: number;
}

/** The exam from its start: questions, this student's wall moments, background noise, submit. */
export function planExam(member: CastMember, rng: Rng, options: ExamPlanOptions): Planned[] {
  const plan: Planned[] = [];
  const lastMs = options.durationMin * MIN;
  const submitAt =
    member.wall === "early_submit"
      ? rng.between(4 * MIN, 7 * MIN)
      : Math.min(rng.between(55 * MIN, 85 * MIN), lastMs - 2 * MIN);

  // Questions: the first shows at the start; each later one 1.5 to 4 minutes after the previous.
  let t = 0;
  for (let question = 2; question <= options.questions; question += 1) {
    t += member.wall === "early_submit" ? rng.between(10 * S, 20 * S) : rng.between(90 * S, 240 * S);
    if (t >= submitAt) break;
    plan.push({ atSimMs: t, action: { kind: "question", question } });
  }

  // This student's moment from 2.4.
  switch (member.wall) {
    case "look_away_3x":
      plan.push({
        atSimMs: 40 * S,
        action: { kind: "look_away", type: "gaze.off_screen", durationMs: 2050, direction: "left" },
      });
      plan.push({
        atSimMs: 70 * S,
        action: { kind: "look_away", type: "gaze.off_screen", durationMs: 2020, direction: "right" },
      });
      plan.push({
        atSimMs: 100 * S,
        action: { kind: "look_away", type: "gaze.off_screen", durationMs: 2080, direction: "left" },
      });
      break;
    case "look_away_once":
      plan.push({
        atSimMs: 55 * S,
        action: { kind: "look_away", type: "gaze.off_screen", durationMs: 2400, direction: "right" },
      });
      break;
    case "tab_blocked":
      plan.push({ atSimMs: 85 * S, action: { kind: "tab_blocked", host: "www.google.com" } });
      break;
    case "second_face":
      plan.push({ atSimMs: 120 * S, action: { kind: "second_face", durationMs: 4000 } });
      break;
    case "phone":
      plan.push({ atSimMs: 150 * S, action: { kind: "phone", score: 0.94, heldMs: 800 } });
      break;
    case "face_missing":
      plan.push({
        atSimMs: 60 * S,
        action: { kind: "self_pause", cause: "face_missing", pauseSimMs: rng.between(110 * S, 130 * S) },
      });
      break;
    case "camera_lost":
      plan.push({
        atSimMs: 95 * S,
        action: { kind: "self_pause", cause: "camera_lost", pauseSimMs: rng.between(45 * S, 70 * S) },
      });
      break;
    case "offline":
      plan.push({ atSimMs: 45 * S, action: { kind: "go_offline", realMs: 60 * S } });
      break;
    case "early_submit":
    case "normal":
      break;
  }

  // Background noise across the class: about one look away a minute and a rare phone or empty seat.
  const later = () => rng.between(4 * MIN, Math.max(4 * MIN + 1, submitAt - 30 * S));
  if (rng.chance(0.45)) {
    plan.push({
      atSimMs: later(),
      action: {
        kind: "look_away",
        type: "gaze.off_screen",
        durationMs: Math.round(rng.between(2100, 4500)),
        direction: rng.pick(["left", "right", "up"] as const),
      },
    });
  }
  if (rng.chance(0.12)) {
    plan.push({
      atSimMs: later(),
      action: { kind: "look_away", type: "gaze.down", durationMs: Math.round(rng.between(2100, 3600)) },
    });
  }
  if (rng.chance(0.015)) {
    plan.push({
      atSimMs: later(),
      action: { kind: "phone", score: round2(rng.between(0.86, 0.93)), heldMs: 800 },
    });
  }
  if (rng.chance(0.015)) {
    plan.push({
      atSimMs: later(),
      action: { kind: "self_pause", cause: "face_missing", pauseSimMs: rng.between(20 * S, 60 * S) },
    });
  }

  plan.push({ atSimMs: submitAt, action: { kind: "submit" } });
  return plan.filter((step) => step.atSimMs <= submitAt).sort((a, b) => a.atSimMs - b.atSimMs);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
