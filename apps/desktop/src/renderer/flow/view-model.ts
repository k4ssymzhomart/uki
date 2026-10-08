// What each student frame shows, as plain data. The flow (useStudentFlow) hands one ScreenModel to the
// screens; a screen renders it with catalog keys and sends FlowUiEvent back. No strings to show live
// here: names, titles and question text come from the server, everything else is an i18n key the
// screen picks from the fields below.
//
// Times are epoch milliseconds on the server's clock (already corrected by the server time offset),
// so a screen formats them with formatTime / formatDate from @uki/i18n in Asia/Almaty. Durations are
// milliseconds.
import type { AskReason, ExamMode, Locale, MessagePreset } from "@uki/contracts";

/** Every student frame of Phase 0 (CLAUDE.md, "Phase 0 frames"). */
export type Frame =
  | "1.1"
  | "1.1a"
  | "1.2"
  | "1.3"
  | "1.3a"
  | "1.4"
  | "2.1"
  | "2.1a"
  | "2.1c"
  | "2.1d"
  | "2.1e"
  | "2.2"
  | "2.3"
  | "3.1";

// ---------------------------------------------------------------------------------------------------
// Shared parts
// ---------------------------------------------------------------------------------------------------

/**
 * App/Title bar. `exam` is null before a join (the bar shows just the product name, as on 1.1).
 * `variant` picks the title key: default `app.title.default`, locked `app.title.locked`, offline
 * `app.title.offline`, proctor_paused `app.title.proctor_paused`, ended `app.title.ended`,
 * submitted `app.title.submitted`. `kind` is `exams.kind` as stored (for example "Midterm"); the
 * screen maps it to `exam.type.<kind in lower case>` when that key exists, otherwise shows it as is.
 */
export interface TitleBarModel {
  exam: { course: string; kind: string } | null;
  variant: "default" | "locked" | "offline" | "proctor_paused" | "ended" | "submitted";
}

/** Fields every frame carries. */
export interface ModelBase {
  /** The student's language; the screen also reads it from useLocale(). */
  locale: Locale;
  titleBar: TitleBarModel;
  /**
   * True while a browser exam runs and the window sits in the tray. Nothing in the window is seen
   * then; pause, message and end commands bring it back with 2.1c, 2.1e or 2.1d.
   */
  windowHidden: boolean;
}

/** The check-in stepper on 1.2 to 1.4 (stepper.join, stepper.check, stepper.identity, stepper.rules). */
export interface StepperModel {
  /** 1 Join, 2 System check, 3 Identity, 4 Rules. Steps before `current` are done. */
  current: 1 | 2 | 3 | 4;
  total: 4;
}

// ---------------------------------------------------------------------------------------------------
// 1.1 Join, 1.1a Wrong code
// ---------------------------------------------------------------------------------------------------

/**
 * Why the last join failed. 1.1a shows `invalid_code` (join.error.title, join.error.body,
 * join.code.format). The others have no frame or catalog key in Phase 0 yet: `invalid_input` is a
 * code or student ID that fails its format before any call, `network` means the server did not reply.
 */
export type JoinError =
  | "invalid_code"
  | "already_joined"
  | "lobby_closed"
  | "rate_limited"
  | "network"
  | "invalid_input";

export interface JoinModel extends ModelBase {
  frame: "1.1" | "1.1a";
  /** "Step 1 of 4" (join.step). */
  step: { n: 1; total: 4 };
  /** The code and student ID last submitted (or restored after a restart), to fill the form. */
  code: string;
  studentNumber: string;
  /** join_exam is running, or the app is restoring a session after a restart: disable Continue. */
  busy: boolean;
  /** Set on 1.1a (`invalid_code`) and after other failures; null otherwise. */
  error: JoinError | null;
}

// ---------------------------------------------------------------------------------------------------
// 1.2 System check
// ---------------------------------------------------------------------------------------------------

/** Chip: checking `status.checking`, ready `status.ready`, fail `status.fix`. */
export type CheckStatus = "checking" | "ready" | "fail";

/**
 * Why the camera row fails: `no_camera` (denied or missing, check.camera.fail), `no_face`,
 * `many_faces`, `dark`, `covered` (lens covered or a uniform picture).
 */
export type CameraProblem = "no_camera" | "no_face" | "many_faces" | "dark" | "covered";

export interface SystemCheckModel extends ModelBase {
  frame: "1.2";
  step: StepperModel;
  /** check.camera.ok / check.camera.fail. `faces` also feeds the preview chip (check.preview.status). */
  camera: { status: CheckStatus; faces: number | null; problem: CameraProblem | null };
  /** check.network.ok with `ms`, check.network.fail. */
  network: { status: CheckStatus; ms: number | null };
  /** check.version.ok with `version`; always ready in Phase 0. */
  version: { status: "ready"; version: string };
  /**
   * check.browser.ok / check.browser.fail. Ready when Üki Lock is paired, or always when the exam
   * does not require it (`required` false). `pairCode` is set while a Lock asks to pair: the app's
   * pairing card (E.3: pair.card.title, pair.card.body) shows the code until it expires (epoch ms).
   */
  browserLock: {
    status: CheckStatus;
    required: boolean;
    link: "absent" | "connected" | "paired";
    /** Added after the first version of this file; absent means no code. */
    pairCode?: { code: string; expiresAt: number } | null;
  };
  /** check.apps.fail with `app` (the first blocked app found); ok has no catalog line in Figma. */
  apps: { status: CheckStatus; app: string | null };
  /** check.screen.ok / check.screen.fail with `app`. */
  screenShare: { status: CheckStatus; app: string | null };
  /** check.storage.running / check.storage.ok with `freeGb` (one decimal) / check.storage.fail. */
  storage: { status: CheckStatus; freeGb: number | null };
  /** Every row is ready: enable Continue. */
  canContinue: boolean;
  /** A Check again run is in progress. */
  rechecking: boolean;
}

// ---------------------------------------------------------------------------------------------------
// 1.3 Identity, 1.3a Proctor help
// ---------------------------------------------------------------------------------------------------

/** identity.face.*, identity.card.*, identity.person.*: ok `status.ready`, pending `status.checking`. */
export type IdentityRowState = "ok" | "fail" | "pending";

/**
 * The lime card frame, normalized (0 to 1) to the camera picture, not mirrored: the identity check
 * reads exactly this box. A screen that shows the preview mirrored (CameraPreview does, as a selfie
 * view) flips x to draw it, which puts it in the lower right as in frame 1.3.
 */
export interface CardRectModel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface IdentityModel extends ModelBase {
  frame: "1.3" | "1.3a";
  step: StepperModel;
  rows: { face: IdentityRowState; card: IdentityRowState; person: IdentityRowState };
  /** Tries finished so far, and the limit (identity.card.failed "{n} of {total} tries"). */
  tries: number;
  maxTries: number;
  /** `loading` while Human and Tesseract load; `error` if they failed to load (ask the proctor). */
  status: "loading" | "checking" | "matched" | "error";
  /** Where the screen draws the lime frame; the check reads the card inside it. */
  cardRect: CardRectModel;
  /** Matched: enable Continue. */
  canContinue: boolean;
  /**
   * 1.3a: when help was requested (identity.help.requested) and the seat's proctor
   * (identity.help.privacy, identity.help.waiting); null on 1.3.
   */
  help: { requestedAt: number; proctorName: string | null } | null;
  /**
   * Phase 1: a proctor's message (a reply or a 1.5b hint) shows as 2.1e's banner over 1.3 and 1.3a
   * (message.title, message.body, Got it). Only `message` is set here; added time waits for 2.1.
   */
  notice?: NoticeModel | null;
}

// ---------------------------------------------------------------------------------------------------
// 1.4 Rules and lobby
// ---------------------------------------------------------------------------------------------------

export interface RulesModel extends ModelBase {
  frame: "1.4";
  step: StepperModel;
  /** rules.eyes.body {seconds}: `exams.checks.gaze_s`. */
  gazeSeconds: number;
  /** The agree box (rules.agree). */
  agreed: boolean;
  /** The exam's start on the server clock; moves earlier when the proctor presses Start exam. */
  startsAt: number;
  /** lobby.countdown.*: time until `startsAt`, never negative. */
  countdownMs: number;
  /** The start has come (clock or Start exam) and only the agree box holds the exam back. */
  startReady: boolean;
  mode: ExamMode;
}

// ---------------------------------------------------------------------------------------------------
// 2.1 Exam and its states 2.1a, 2.1c, 2.1e, 2.2, 2.3
// ---------------------------------------------------------------------------------------------------

export interface ChoiceModel {
  id: string;
  /** "A", "B", ... for exam.option {letter}. */
  letter: string;
  /** In the student's language. */
  body: string;
}

export interface QuestionModel {
  id: string;
  /** 1-based, for exam.counter {n} and the progress bar. */
  n: number;
  total: number;
  /** In the student's language. */
  body: string;
  choices: ChoiceModel[];
  selectedChoiceId: string | null;
}

/**
 * Widget/Live beside the exam:
 * - `watching`: exam.watch.title, exam.watch.status {elapsed} (`elapsedMs` since the exam started)
 * - `away`: a look away is being measured (same text, alert face)
 * - `phone`: exam.phone.title, exam.phone.status {confidence} (`phoneScore`)
 * - `paused`: exam.paused.status_title, exam.paused.status
 * - `offline`: exam.offline.status_title, exam.offline.status {elapsed} (`elapsedMs` offline)
 * - `proctor_paused`: exam.proctor_paused.status_title, exam.proctor_paused.status {elapsed}
 *   (`elapsedMs` since the exam started)
 */
export interface WatchModel {
  state: "watching" | "away" | "phone" | "paused" | "offline" | "proctor_paused";
  elapsedMs: number;
  phoneScore: number | null;
}

export interface TimerModel {
  /** Time left; stands still while paused. */
  remainingMs: number;
  /** duration_min + extra_min, in ms, for the progress track. */
  totalMs: number;
  /** When the session ends, on the server clock (event.time_added.detail {time}). */
  endsAt: number;
  running: boolean;
  /** exam.timer.added "+{minutes} min" while 2.1e is up after add_time; null otherwise. */
  addedMinutes: number | null;
}

/** One line of "This session" (exam.log.title), newest first. */
export type LogEntry =
  /** event.exam_started, detail event.browser_locked {count} when the Lock closed tabs. */
  | { id: string; at: number; kind: "exam_started"; tabsClosed: number | null }
  /** event.on_screen; detail event.face_matched when `faceMatched`. */
  | { id: string; at: number; kind: "on_screen"; faceMatched: boolean }
  /** event.question_saved {n}, detail event.stored_locally. */
  | { id: string; at: number; kind: "question_saved"; n: number }
  /** event.phone.title, detail event.phone.detail {confidence}. */
  | { id: string; at: number; kind: "phone"; confidence: number }
  /** event.no_face, detail event.paused.detail. */
  | { id: string; at: number; kind: "no_face" }
  /** event.network_lost.title, detail event.network_lost.detail. */
  | { id: string; at: number; kind: "network_lost" }
  /** event.proctor_paused.title {proctor}, detail event.proctor_paused.detail. */
  | { id: string; at: number; kind: "proctor_paused"; proctorName: string | null }
  /** event.time_added.title {minutes}, detail event.time_added.detail {proctor} {time = endsAt}. */
  | {
      id: string;
      at: number;
      kind: "time_added";
      minutes: number;
      proctorName: string | null;
      endsAt: number;
    };

/** 2.1e: a proctor message (message.title, message.body) and/or added time, until Got it. */
export interface NoticeModel {
  message:
    | { at: number; proctorName: string | null; text: string; preset: null }
    | { at: number; proctorName: string | null; text: null; preset: MessagePreset }
    | null;
  timeAdded: { at: number; proctorName: string | null; minutes: number; endsAt: number } | null;
}

export type ExamFrame = "2.1" | "2.1a" | "2.1c" | "2.1e" | "2.2" | "2.3";

export interface ExamModel extends ModelBase {
  /**
   * The state on top, by precedence 2.1c > 2.3 > 2.2 > 2.1e > 2.1a > 2.1. The fields below say
   * which of the others also hold, so a screen may combine them (for example the offline banner
   * under a message).
   */
  frame: ExamFrame;
  mode: ExamMode;
  /** The question on screen; null while the questions load and in browser exams. */
  question: QuestionModel | null;
  /** A question load runs: the spinner, or Check again's loading state while `questionsFailed`. */
  questionsLoading: boolean;
  /** The questions did not load: the Error banner exam.questions.failed with Check again (check.again). */
  questionsFailed: boolean;
  /** Questions with a saved answer, of `question.total`. */
  answeredCount: number;
  /** exam.saved {time}, or exam.saved_offline {time} when `savedOffline`. Null before any answer. */
  savedAt: number | null;
  /** Some answers wait on this laptop while offline. */
  savedOffline: boolean;
  canGoBack: boolean;
  /** On the last question the primary button is Submit (exam.submit) instead of Next question. */
  isLast: boolean;
  /** Submit was pressed or time ran out; waiting for the receipt. */
  submitting: boolean;
  watch: WatchModel;
  /** The camera chips: exam.camera.faces {count}, exam.camera.no_face when 0. */
  camera: { faces: number | null };
  timer: TimerModel;
  log: LogEntry[];
  /** Üki Lock locked the browser for this exam (title variant locked, event.browser_locked). */
  browserLocked: { tabsClosed: number } | null;
  /** 2.1a: offline.title, offline.body; since when no reply came. */
  offline: { since: number } | null;
  /** 2.2: exam.phone.toast with the exam.toast.flag tag. */
  phone: { score: number } | null;
  /**
   * 2.3: exam.paused.*; `pausedMs` for exam.paused.timer {duration}; I'm here (exam.paused.resume)
   * works once `canResume` (a face is back and the camera works).
   */
  selfPause: {
    reason: "face_missing" | "camera_lost";
    since: number;
    pausedMs: number;
    canResume: boolean;
  } | null;
  /**
   * 2.1c: proctor_paused.title, proctor_paused.body {proctor} {message} when `text` is set,
   * proctor_paused.timer {duration}, identity.help.waiting {proctor}.
   */
  proctorPause: { proctorName: string | null; text: string | null; since: number; pausedMs: number } | null;
  /** 2.1e: shown until Got it (ACK_NOTICE). */
  notice: NoticeModel | null;
  /**
   * Phase 1: Ask proctor in the footer of 2.1, 2.2 and 2.3 (action.ask_proctor) opens the sheet
   * (lock.ask.*); false on 2.1c and while submitting.
   */
  canAskProctor?: boolean;
  /**
   * Phase 1: the request is queued (identity.help.requested {time}, lock.ask.body) until Got it or the
   * proctor's message.
   */
  help?: { requestedAt: number } | null;
}

// ---------------------------------------------------------------------------------------------------
// 3.1 Submitted, 2.1d Ended by proctor
// ---------------------------------------------------------------------------------------------------

export interface SubmittedModel extends ModelBase {
  frame: "3.1";
  /** done.receipt, UKI-204-0942-MT. */
  receiptId: string;
  /** done.submitted.value {time} {date}. */
  submittedAt: number;
  /** done.time_used.value {used} {total}, whole minutes. */
  timeUsedMin: number;
  totalMin: number;
  /** done.flags.value {count}: flag events this laptop recorded. */
  flags: number;
  /** `time_up` when time ran out (exam.time_up), else `submitted`. */
  state: "submitted" | "time_up";
}

export interface EndedModel extends ModelBase {
  frame: "2.1d";
  /** ended.body {proctor} {time}. */
  proctorName: string | null;
  endedAt: number;
  /** The receipt; null until submit_session answers. */
  receiptId: string | null;
  /** ended.answered.value {answered} {total}. */
  answered: number;
  total: number;
  /** The proctor's reason as typed; the receipt row shows ended.reason.proctor. */
  reason: string | null;
  /** ended.contact {email}; null when the build has no exam office address. */
  contactEmail: string | null;
}

// ---------------------------------------------------------------------------------------------------
// The union and the events screens send
// ---------------------------------------------------------------------------------------------------

export type ScreenModel =
  | JoinModel
  | SystemCheckModel
  | IdentityModel
  | RulesModel
  | ExamModel
  | SubmittedModel
  | EndedModel;

/** Narrow a ScreenModel by frame: `if (isFrame(model, "1.2")) model.camera`. */
export function isFrame<F extends Frame>(
  model: ScreenModel,
  ...frames: F[]
): model is Extract<ScreenModel, { frame: F }> {
  return (frames as Frame[]).includes(model.frame);
}

/** What a screen may send to the flow. */
export type FlowUiEvent =
  /** The language switch (any frame); also kept on the laptop and sent to join_exam. */
  | { type: "SET_LOCALE"; locale: Locale }
  /** 1.1 / 1.1a Continue. */
  | { type: "JOIN"; code: string; studentNumber: string }
  /** 1.2 Check again. */
  | { type: "CHECK_AGAIN" }
  /** 1.2 camera row: open the OS camera settings. */
  | { type: "OPEN_CAMERA_SETTINGS" }
  /** Continue on 1.2 and 1.3. */
  | { type: "CONTINUE" }
  /** 1.3 Ask proctor: opens 1.3a and sends student.help_requested (identity). */
  | { type: "ASK_PROCTOR" }
  /** 1.4 agree box. */
  | { type: "SET_AGREED"; agreed: boolean }
  /** 2.1: pick a choice for the question on screen. */
  | { type: "SELECT_CHOICE"; questionId: string; choiceId: string }
  | { type: "NEXT_QUESTION" }
  | { type: "PREV_QUESTION" }
  /** 2.1 Submit on the last question. */
  | { type: "SUBMIT" }
  /** 2.3 I'm here. */
  | { type: "IM_HERE" }
  /** 2.1e Got it. */
  | { type: "ACK_NOTICE" }
  /** 2.1 to 2.3 Send to proctor on the Ask proctor sheet: queues student.help_requested. */
  | { type: "ASK_HELP"; topic: AskReason; text: string | null }
  /** Got it on the help-requested banner. */
  | { type: "ACK_HELP" }
  /** 2.1 Check again on the exam.questions.failed banner: load the questions now. */
  | { type: "RETRY_QUESTIONS" }
  /** 3.1 / 2.1d Save receipt. */
  | { type: "SAVE_RECEIPT" }
  /** 3.1 / 2.1d Close Üki. */
  | { type: "CLOSE_APP" };
