// The ScreenModel for the frame on screen, from a flow snapshot. Pure: the same snapshot always gives
// the same model, so screens can be rendered from recorded snapshots in tests.
import { DEFAULT_EXAM_CHECKS, THRESHOLDS } from "@uki/contracts";
import { type FlowSnapshot, stageOf, wantsHidden } from "./derive.ts";
import { allChecksReady } from "./machine.ts";
import { effectiveEndsAt, remainingMs, totalMs } from "./timer.ts";
import type { FlowContext } from "./types.ts";
import type {
  ExamFrame,
  ExamModel,
  ModelBase,
  QuestionModel,
  ScreenModel,
  StepperModel,
  SystemCheckModel,
  TimerModel,
  TitleBarModel,
  WatchModel,
} from "./view-model.ts";

/**
 * The lime card frame on 1.3 as the student sees it: normalized to the mirrored (selfie) preview of
 * the 4:3 camera picture. Measured from frame 1.3 (51:2062), where the dashed card box sits in the
 * lower right of the preview. The identity check reads the same box, un-mirrored (cameraCardRect).
 */
export const CARD_RECT = { x: 0.6071, y: 0.5, width: 0.3179, height: 0.2667 } as const;

/** CARD_RECT in camera coordinates (not mirrored), for @uki/detection/identity. */
export function cameraCardRect(): { x: number; y: number; width: number; height: number } {
  return {
    x: 1 - CARD_RECT.x - CARD_RECT.width,
    y: CARD_RECT.y,
    width: CARD_RECT.width,
    height: CARD_RECT.height,
  };
}

const STEPS = { system: 2, identity: 3, rules: 4 } as const;

function stepper(current: 1 | 2 | 3 | 4): StepperModel {
  return { current, total: 4 };
}

function titleBar(context: FlowContext, variant: TitleBarModel["variant"]): TitleBarModel {
  const exam = context.joined?.exam;
  return { exam: exam ? { course: exam.course, kind: exam.kind } : null, variant };
}

function base(snapshot: FlowSnapshot, variant: TitleBarModel["variant"] = "default"): ModelBase {
  const { context } = snapshot;
  return {
    locale: context.locale,
    titleBar: titleBar(context, variant),
    windowHidden: wantsHidden(snapshot),
  };
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function question(context: FlowContext): QuestionModel | null {
  const questions = context.questions;
  if (!questions || questions.length === 0 || context.joined?.exam.mode === "browser") return null;
  const index = Math.min(Math.max(0, context.exam.index), questions.length - 1);
  const q = questions[index];
  if (!q) return null;
  return {
    id: q.id,
    n: index + 1,
    total: questions.length,
    body: q.body[context.locale],
    choices: q.choices.map((choice, i) => ({
      id: choice.id,
      letter: LETTERS[i] ?? String(i + 1),
      body: choice.body[context.locale],
    })),
    selectedChoiceId: context.exam.answers[q.id]?.choiceId ?? null,
  };
}

function timerModel(context: FlowContext): TimerModel {
  const timer = context.timer;
  if (!timer) return { remainingMs: 0, totalMs: 0, endsAt: 0, running: false, addedMinutes: null };
  return {
    remainingMs: remainingMs(timer, context.now),
    totalMs: totalMs(timer),
    endsAt: effectiveEndsAt(timer),
    running: timer.pause === null,
    addedMinutes: context.notice?.timeAdded?.minutes ?? null,
  };
}

function watchModel(context: FlowContext, stage: ReturnType<typeof stageOf>): WatchModel {
  const startsAt = context.timer?.startsAt ?? context.now;
  const sinceStart = Math.max(0, context.now - startsAt);
  if (stage === "proctorPaused") return { state: "proctor_paused", elapsedMs: sinceStart, phoneScore: null };
  if (stage === "selfPaused") return { state: "paused", elapsedMs: sinceStart, phoneScore: null };
  if (context.watch.phone !== null)
    return { state: "phone", elapsedMs: sinceStart, phoneScore: context.watch.phone };
  if (context.offline) {
    return {
      state: "offline",
      elapsedMs: Math.max(0, context.now - context.offline.since),
      phoneScore: null,
    };
  }
  return { state: context.watch.away ? "away" : "watching", elapsedMs: sinceStart, phoneScore: null };
}

function examFrame(context: FlowContext, stage: ReturnType<typeof stageOf>): ExamFrame {
  if (stage === "proctorPaused") return "2.1c";
  if (stage === "selfPaused") return "2.3";
  if (context.watch.phone !== null) return "2.2";
  if (context.notice) return "2.1e";
  if (context.offline) return "2.1a";
  return "2.1";
}

function examModel(snapshot: FlowSnapshot): ExamModel {
  const { context } = snapshot;
  const stage = stageOf(snapshot);
  const frame = examFrame(context, stage);
  const q = question(context);
  const total = context.questions?.length ?? 0;
  const browserLocked = context.exam.tabsClosed !== null ? { tabsClosed: context.exam.tabsClosed } : null;
  let variant: TitleBarModel["variant"] = browserLocked ? "locked" : "default";
  if (frame === "2.1c") variant = "proctor_paused";
  else if (context.offline) variant = "offline";
  return {
    ...base(snapshot, variant),
    frame,
    mode: context.joined?.exam.mode ?? "app",
    question: q,
    questionsLoading: context.exam.questionsLoading,
    questionsFailed: context.exam.questionsFailed,
    answeredCount: Object.keys(context.exam.answers).length,
    savedAt: context.exam.lastSavedAt,
    savedOffline: context.offline !== null && context.exam.lastSavedAt !== null,
    canGoBack: q !== null && q.n > 1,
    isLast: q !== null ? q.n === total : true,
    submitting: stage === "submitting",
    watch: watchModel(context, stage),
    camera: { faces: context.watch.faces },
    timer: timerModel(context),
    log: context.log,
    browserLocked,
    offline: context.offline,
    phone: context.watch.phone !== null ? { score: context.watch.phone } : null,
    selfPause: context.selfPause
      ? {
          reason: context.selfPause.reason,
          since: context.selfPause.since,
          pausedMs: Math.max(0, context.now - context.selfPause.since),
          canResume: context.watch.canResume,
        }
      : null,
    proctorPause: context.proctorPause
      ? {
          proctorName: context.proctorPause.byName,
          text: context.proctorPause.text,
          since: context.proctorPause.since,
          pausedMs: Math.max(0, context.now - context.proctorPause.since),
        }
      : null,
    notice: context.notice,
  };
}

function systemModel(snapshot: FlowSnapshot): SystemCheckModel {
  const { context } = snapshot;
  const { checks } = context;
  const required = context.joined?.exam.checks.lock ?? true;
  const link = checks.lock ?? "absent";
  return {
    ...base(snapshot),
    frame: "1.2",
    step: stepper(STEPS.system),
    camera: checks.camera,
    network: checks.network,
    version: { status: "ready", version: context.device.appVersion },
    browserLock: {
      status: !required || link === "paired" ? "ready" : checks.lock === null ? "checking" : "fail",
      required,
      link,
      pairCode: context.pairCode,
    },
    apps: checks.apps,
    screenShare: checks.screenShare,
    storage: checks.storage,
    canContinue: allChecksReady(context),
    rechecking: context.rechecking,
  };
}

/** The model for the frame the flow is on. */
export function selectScreen(snapshot: FlowSnapshot): ScreenModel {
  const { context } = snapshot;
  const stage = stageOf(snapshot);
  switch (stage) {
    case "boot":
    case "join":
    case "joining":
      return {
        ...base(snapshot),
        titleBar: { exam: null, variant: "default" },
        frame: context.form.error === "invalid_code" ? "1.1a" : "1.1",
        step: { n: 1, total: 4 },
        code: context.form.code,
        studentNumber: context.form.studentNumber,
        busy: stage !== "join",
        error: context.form.error,
      };
    case "system":
      return systemModel(snapshot);
    case "identity":
    case "identityHelp":
    case "identityMatched":
      return {
        ...base(snapshot),
        frame: stage === "identityHelp" ? "1.3a" : "1.3",
        step: stepper(STEPS.identity),
        rows: context.identity.rows,
        tries: context.identity.tries,
        maxTries: THRESHOLDS.identity.maxTries,
        status: stage === "identityMatched" ? "matched" : context.identity.status,
        cardRect: cameraCardRect(),
        canContinue: stage === "identityMatched",
        help:
          stage === "identityHelp" && context.identity.helpRequestedAt !== null
            ? {
                requestedAt: context.identity.helpRequestedAt,
                proctorName: context.joined?.proctor_name ?? null,
              }
            : null,
      };
    case "rules": {
      const startsAt = context.timer?.startsAt ?? context.now;
      return {
        ...base(snapshot),
        frame: "1.4",
        step: stepper(STEPS.rules),
        gazeSeconds: context.joined?.exam.checks.gaze_s ?? DEFAULT_EXAM_CHECKS.gaze_s,
        agreed: context.agreed,
        startsAt,
        countdownMs: Math.max(0, startsAt - context.now),
        startReady: context.startRequested || context.now >= startsAt,
        mode: context.joined?.exam.mode ?? "app",
      };
    }
    case "submitted":
      return {
        ...base(snapshot, "submitted"),
        frame: "3.1",
        receiptId: context.receipt?.receiptId ?? "",
        submittedAt: context.receipt?.at ?? context.now,
        timeUsedMin: Math.round((context.receipt?.timeUsedS ?? 0) / 60),
        totalMin: Math.round((context.timer ? totalMs(context.timer) : 0) / 60_000),
        flags: context.receipt?.flags ?? 0,
        state: context.receipt?.state === "time_up" ? "time_up" : "submitted",
      };
    case "ending":
    case "ended":
      return {
        ...base(snapshot, "ended"),
        frame: "2.1d",
        proctorName: context.ended?.byName ?? context.joined?.proctor_name ?? null,
        endedAt: context.ended?.at ?? context.receipt?.at ?? context.now,
        receiptId: context.receipt?.receiptId ?? null,
        answered: Object.keys(context.exam.answers).length,
        total: context.questions?.length ?? 0,
        reason: context.ended?.reason ?? null,
        contactEmail: context.contactEmail,
      };
    default:
      return examModel(snapshot);
  }
}
