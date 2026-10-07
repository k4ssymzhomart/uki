// Context, events and effects of the student flow machine (machine.ts). The machine is pure: it never
// calls a service. It emits FlowEffect events that the runtime (runtime.ts) carries out, and receives
// FlowEvent events from the screens (FlowUiEvent) and from the services.
import type {
  ClientEventType,
  DesktopOs,
  IngestSession,
  JoinExamOutput,
  Locale,
  Question,
  ReleaseReason,
} from "@uki/contracts";
import type { FlowCommand } from "../services/commands.ts";
import type { TimerState } from "./timer.ts";
import type {
  CameraProblem,
  CheckStatus,
  FlowUiEvent,
  IdentityRowState,
  JoinError,
  LogEntry,
  NoticeModel,
} from "./view-model.ts";

/** What the laptop keeps to rejoin after a crash or restart (outbox meta `join`). */
export interface SavedJoin {
  code: string;
  studentNumber: string;
  locale: Locale;
}

/** The question load's input: the join, and whether to retry after 2, 4, 8 and 16 s or try once. */
export interface QuestionsLoad extends SavedJoin {
  ladder: boolean;
}

export type LockLink = "absent" | "connected" | "paired";

/** The 1.2 rows as the services report them. */
export interface CheckRows {
  camera: { status: CheckStatus; faces: number | null; problem: CameraProblem | null };
  network: { status: CheckStatus; ms: number | null };
  lock: LockLink | null;
  apps: { status: CheckStatus; app: string | null };
  screenShare: { status: CheckStatus; app: string | null };
  storage: { status: CheckStatus; freeGb: number | null };
}

export const INITIAL_CHECK_ROWS: CheckRows = {
  camera: { status: "checking", faces: null, problem: null },
  network: { status: "checking", ms: null },
  lock: null,
  apps: { status: "checking", app: null },
  screenShare: { status: "checking", app: null },
  storage: { status: "checking", freeGb: null },
};

export interface IdentityState {
  status: "loading" | "checking" | "matched" | "error";
  rows: { face: IdentityRowState; card: IdentityRowState; person: IdentityRowState };
  tries: number;
  score: number | null;
  /** Server ms when help was requested (1.3a); null on 1.3. */
  helpRequestedAt: number | null;
}

export const INITIAL_IDENTITY: IdentityState = {
  status: "loading",
  rows: { face: "pending", card: "pending", person: "pending" },
  tries: 0,
  score: null,
  helpRequestedAt: null,
};

export interface ExamProgress {
  index: number;
  /** questionId → choice and server ms when saved on the laptop. */
  answers: Record<string, { choiceId: string; savedAt: number }>;
  lastSavedAt: number | null;
  questionsLoading: boolean;
  /**
   * The questions did not come after join_exam's retries, or join_exam refused for good: 2.1 shows
   * exam.questions.failed until they come.
   */
  questionsFailed: boolean;
  /** Üki Lock reported lock.started (tabs it closed). */
  tabsClosed: number | null;
  /** exam.started was sent for this session (or the server already had it). */
  startedSent: boolean;
}

export interface Receipt {
  receiptId: string;
  /** Server ms. */
  at: number;
  timeUsedS: number;
  state: "submitted" | "time_up" | "ended";
  flags: number;
}

export interface FlowContext {
  locale: Locale;
  device: { os: DesktopOs; appVersion: string };
  contactEmail: string | null;
  form: { code: string; studentNumber: string; error: JoinError | null };
  joined: Omit<JoinExamOutput, "questions" | "server_time"> | null;
  questions: Question[] | null;
  /** Server-clock ms from the last TICK. */
  now: number;
  checks: CheckRows;
  rechecking: boolean;
  identity: IdentityState;
  agreed: boolean;
  /** The start command came before the agree box was ticked. */
  startRequested: boolean;
  exam: ExamProgress;
  timer: TimerState | null;
  watch: { faces: number | null; away: boolean; phone: number | null; canResume: boolean };
  selfPause: { reason: "face_missing" | "camera_lost"; since: number } | null;
  proctorPause: { since: number; byName: string | null; text: string | null } | null;
  notice: NoticeModel | null;
  offline: { since: number } | null;
  log: LogEntry[];
  /** Submit pressed or time up; why, for the Lock's release. */
  finishing: ReleaseReason | null;
  receipt: Receipt | null;
  ended: { byName: string | null; at: number; reason: string | null } | null;
  windowHidden: boolean;
  /** The pairing card's code (E.3) while a Lock pairs; server-independent laptop ms for expiry. */
  pairCode: { code: string; expiresAt: number } | null;
}

export interface FlowInput {
  locale: Locale;
  device: { os: DesktopOs; appVersion: string };
  contactEmail?: string | null;
  /** Server-clock ms at start. */
  now: number;
}

/** Events from the services. */
export type ServiceEvent =
  | { type: "TICK"; now: number }
  /** window.uki.app.info() answered. */
  | { type: "SET_DEVICE"; device: { os: DesktopOs; appVersion: string } }
  | { type: "CHECK_ROWS"; rows: Partial<CheckRows> }
  | { type: "RECHECK_DONE" }
  | { type: "IDENTITY_STATUS"; status: "loading" | "checking" | "error" }
  | {
      type: "IDENTITY_VERDICT";
      kind: "matched" | "retry" | "help";
      tries: number;
      rows: IdentityState["rows"];
      score: number | null;
    }
  | { type: "SESSION_SYNC"; session: IngestSession; serverTime: string }
  | { type: "CONNECTIVITY"; offline: boolean; since: number | null }
  | { type: "CUE_PHONE"; on: boolean; score: number | null; at: number }
  | { type: "CUE_PAUSED"; on: boolean; reason: "face_missing" | "camera_lost" | null; at: number }
  | { type: "CUE_AWAY"; on: boolean }
  | { type: "DETECTION_STATE"; faces: number; canResume: boolean }
  /** A rules-engine event the session log shows (gaze.on_screen). */
  | { type: "RULE_EVENT"; eventType: string; at: number }
  | { type: "COMMAND"; command: FlowCommand }
  | { type: "LOCK_STARTED"; tabsClosed: number }
  /** After a restart: the answers this laptop saved for the session (server ms). */
  | { type: "RESTORE_ANSWERS"; answers: Array<{ questionId: string; choiceId: string; savedAt: number }> }
  /** The relay made (or dropped) a pairing code for Üki Lock. */
  | { type: "PAIR_CODE"; code: { code: string; expiresAt: number } | null }
  | { type: "LOCK_SUBMITTED" };

export type FlowEvent = FlowUiEvent | ServiceEvent;

/**
 * One-off work for the runtime. The machine emits these and never calls a service itself; steady
 * state (lockdown, hidden window, detection phase, 1.2 checks, identity check) is derived instead.
 */
export type FlowEffect =
  | { type: "effect.locale"; locale: Locale }
  /** A join worked: start the sync loop, the command channel and the Lock link. */
  | { type: "effect.joined"; output: Omit<JoinExamOutput, "questions">; restored: boolean }
  /** Queue an event from the app (seq, at and app_version are added by the runtime). */
  | { type: "effect.event"; eventType: ClientEventType; data: Record<string, unknown> }
  | { type: "effect.answer"; questionId: string; choiceId: string; savedAt: number }
  /** Check again on 1.2 (the checks themselves run while derive.wantsSystemCheck holds). */
  | { type: "effect.systemCheck"; action: "again" }
  /** Exams in the app: Üki Lock locks the browser when 2.1 opens. */
  | { type: "effect.lockStart" }
  /** "I'm here" on 2.3: ask the detection worker to resume. */
  | { type: "effect.resume" }
  /** 3.1 or 2.1d is up: release the Lock, leave lockdown, stop detection, clear the outbox once empty. */
  | { type: "effect.finish"; reason: ReleaseReason }
  | { type: "effect.saveReceipt" }
  | { type: "effect.quit" }
  | { type: "effect.openCameraSettings" };

/** What the submit actor returns (submit_session after flushing the outbox). */
export interface SubmitResult {
  receiptId: string;
  timeUsedS: number;
  state: "submitted" | "time_up" | "ended";
  /** Flag events this laptop recorded. */
  flags: number;
  /** Server ms when submit_session answered. */
  at: number;
}
