// The flow runtime: runs the machine, carries out its effects and keeps every service in step with the
// snapshot (derive.ts). It owns the sync loop, the command channel, the Lock link, the detection
// runtime, the identity check, the 1.2 checks and the exam guard for the joined session.
import {
  ClientEventEnvelope,
  type ClientEventType,
  ClockOffset,
  type DesktopOs,
  type EventEnvelope,
  type JoinExamOutput,
  type Locale,
  type LockEvent,
  lockEventToEnvelope,
  type Question,
  type ReleaseReason,
  retryDelayMs,
  type UkiBridge,
  uuidv7,
} from "@uki/contracts";
import { type DetectionDebug, toEnvelope } from "@uki/detection";
import { type Actor, createActor, fromPromise } from "xstate";
import { IdentityRunner, type IdentityRunnerOptions } from "../detection/identity-runner.ts";
import {
  DetectionRuntime,
  type DetectionRuntimeOptions,
  type DetectionWantPhase,
} from "../detection/runtime.ts";
import type { Outbox } from "../outbox/outbox.ts";
import { SyncLoop } from "../outbox/sync.ts";
import { CommandRouter, type FlowCommand } from "../services/commands.ts";
import { storeLocale } from "../services/config.ts";
import { ServiceError, toServiceError } from "../services/errors.ts";
import { ExamGuard } from "../services/exam-guard.ts";
import { LockLink } from "../services/lock-link.ts";
import { ValueStore } from "../services/store.ts";
import { JoinFailure, type StudentApi } from "../services/student-api.ts";
import { CAMERA_UNAVAILABLE, cameraRow, SystemCheck } from "../services/system-check.ts";
import {
  type DetectionWant,
  type FlowSnapshot,
  type FlowStage,
  ingestStatus,
  lockExamState,
  stageOf,
  wantsDetection,
  wantsExamWatch,
  wantsHidden,
  wantsIdentity,
  wantsLockdown,
  wantsSystemCheck,
} from "./derive.ts";
import { studentFlowMachine } from "./machine.ts";
import { cameraCardRect } from "./select.ts";
import type { FlowEffect, FlowEvent, QuestionsLoad, SavedJoin, SubmitResult } from "./types.ts";

/** Outbox meta keys. */
export const META_JOIN = "join";
export const metaLocked = (sessionId: string) => `locked:${sessionId}`;

/** The TICK rate: the timer and the countdowns move twice a second. */
export const TICK_MS = 500;
/** Submit waits this long for the outbox to empty before it calls submit_session anyway. */
export const SUBMIT_FLUSH_MS = 10_000;
/** After the receipt, the outbox is checked this often until it is empty, then cleared. */
export const DRAIN_POLL_MS = 2_000;
/** retryDelayMs at this attempt (and every later one) is the longest step, 30 s. */
const LAST_RETRY_STEP = 4;

/** The questions did not come: after the retries, or join_exam refused for good (`cause`). */
export class QuestionsUnavailable extends Error {
  override readonly name = "QuestionsUnavailable";
  constructor(cause: unknown) {
    super("the questions did not load", { cause });
  }
}

export function parseSavedJoin(value: unknown): SavedJoin | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.code !== "string" || typeof v.studentNumber !== "string") return null;
  if (v.locale !== "kk" && v.locale !== "ru" && v.locale !== "en") return null;
  return { code: v.code, studentNumber: v.studentNumber, locale: v.locale };
}

export interface DetectionLike {
  readonly stream: MediaStream | null;
  setPhase(phase: DetectionWantPhase): Promise<void>;
  retry(): Promise<void>;
  resume(): Promise<boolean>;
  dispose(): void;
}

export interface IdentityLike {
  start(): void;
  stop(): Promise<void>;
}

export interface FlowRuntimeDeps {
  bridge: UkiBridge;
  /** Null when the build has no Supabase settings: joins then fail as offline. */
  api: StudentApi | null;
  /** Signs in anonymously once; the session is kept on the laptop. */
  ensureSignedIn: () => Promise<void>;
  outbox: Outbox;
  locale: Locale;
  contactEmail: string | null;
  clock?: ClockOffset;
  /** Developer overlay data from the worker (development builds). */
  debug?: boolean;
  createDetection?: (options: DetectionRuntimeOptions) => DetectionLike;
  createIdentity?: (options: IdentityRunnerOptions) => IdentityLike;
  /** Laptop clock, default Date.now. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

interface ActiveSession {
  id: string;
  examId: string;
  output: Omit<JoinExamOutput, "questions">;
  saved: SavedJoin;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function guessOs(): DesktopOs {
  return typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent) ? "windows" : "macos";
}

export class FlowRuntime {
  readonly actor: Actor<typeof studentFlowMachine>;
  readonly clock: ClockOffset;
  /** The camera stream for the previews on 1.2, 1.3 and 2.1. */
  readonly camera = new ValueStore<MediaStream | null>(null);
  /** The developer overlay's numbers. */
  readonly debug = new ValueStore<DetectionDebug | null>(null);

  private readonly deps: FlowRuntimeDeps;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private appVersion = "0.0.0";
  private session: ActiveSession | null = null;
  private pendingSave: SavedJoin | null = null;
  private sync: SyncLoop | null = null;
  private commands: CommandRouter | null = null;
  private detection: DetectionLike | null = null;
  private identity: IdentityLike | null = null;
  private systemCheck: SystemCheck | null = null;
  private readonly guard: ExamGuard;
  private readonly lockLink: LockLink;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private started = false;
  private stopped = false;
  private draining = false;
  private restoredSelfPauseSince: number | null = null;
  private rulesPaused = false;
  private lastStage: FlowStage | null = null;
  private lastDetectionState = "";
  private lastCameraRow = "";
  private lastStatusKey = "";
  private unsubscribePairCode: (() => void) | null = null;
  private readonly applied: {
    lockdown: boolean;
    watch: boolean;
    hidden: boolean;
    detection: DetectionWant;
    systemCheck: boolean;
    identity: boolean;
  } = {
    lockdown: false,
    watch: false,
    hidden: false,
    detection: "off",
    systemCheck: false,
    identity: false,
  };
  private readonly onOnline = () => this.sync?.nudge();
  private readonly onOffline = () => this.sync?.probe();

  constructor(deps: FlowRuntimeDeps) {
    this.deps = deps;
    this.now = deps.now ?? Date.now;
    this.sleep = deps.sleep ?? defaultSleep;
    this.clock = deps.clock ?? new ClockOffset();
    this.guard = new ExamGuard({
      bridge: deps.bridge,
      onBlocked: (app) => void this.queueEvent("tab.blocked", { app }),
    });
    this.lockLink = new LockLink({
      bridge: deps.bridge,
      onStarted: (tabsClosed) => {
        this.send({ type: "LOCK_STARTED", tabsClosed });
        if (this.session) void this.deps.outbox.setMeta(metaLocked(this.session.id), true);
      },
      onSubmitted: () => this.send({ type: "LOCK_SUBMITTED" }),
      // E.5a: the Lock's Ask proctor is queued as the app's own event; help.queued tells its sheet.
      onEvent: (event) =>
        void this.queueLockEvent(event).then((queued) => {
          if (queued && event.type === "student.help_requested") this.lockLink.helpQueued(event.id);
        }),
      onDisconnected: () => void this.queueEvent("lock.app_disconnected", { side: "lock" }),
      // The Lock reads the exam's server times through it (its deadline and countdowns).
      clockOffsetMs: () => this.clock.offsetMs,
    });
    const machine = studentFlowMachine.provide({
      actors: {
        restore: fromPromise(() => this.restore()),
        joinExam: fromPromise(({ input }: { input: SavedJoin }) => this.join(input)),
        loadQuestions: fromPromise(({ input }: { input: QuestionsLoad }) => this.loadQuestions(input)),
        submit: fromPromise(({ input }: { input: { sessionId: string; reason: ReleaseReason } }) =>
          this.submit(input.sessionId),
        ),
      },
    });
    this.actor = createActor(machine, {
      input: {
        locale: deps.locale,
        device: { os: guessOs(), appVersion: this.appVersion },
        contactEmail: deps.contactEmail,
        now: this.clock.now(this.now()),
      },
    });
  }

  /** Starts the machine, the clock tick and the Lock link. Call once. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.actor.on("*", (effect) => this.handle(effect as FlowEffect));
    this.actor.subscribe((snapshot) => this.reconcile(snapshot));
    this.actor.start();
    this.lockLink.start();
    this.unsubscribePairCode = this.deps.bridge.lock.onPairCode((code) =>
      this.send({
        type: "PAIR_CODE",
        code: code ? { code: code.code, expiresAt: Date.parse(code.expires_at) } : null,
      }),
    );
    this.ticker = setInterval(() => this.send({ type: "TICK", now: this.serverNow() }), TICK_MS);
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.onOnline);
      window.addEventListener("offline", this.onOffline);
    }
    this.deps.bridge.app
      .info()
      .then((info) => {
        this.appVersion = info.version;
        this.send({ type: "SET_DEVICE", device: { os: info.os, appVersion: info.version } });
      })
      .catch(() => {});
  }

  stop(): void {
    this.stopped = true;
    if (this.ticker !== null) clearInterval(this.ticker);
    this.ticker = null;
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.onOnline);
      window.removeEventListener("offline", this.onOffline);
    }
    this.sync?.stop();
    this.commands?.stop();
    this.lockLink.stop();
    this.unsubscribePairCode?.();
    this.guard.stop();
    this.systemCheck?.stop();
    void this.identity?.stop();
    this.detection?.dispose();
    this.actor.stop();
  }

  send(event: FlowEvent): void {
    if (!this.stopped) this.actor.send(event);
  }

  /** Server-clock ms. */
  serverNow(): number {
    return this.clock.now(this.now());
  }

  // -------------------------------------------------------------------------------------------------
  // Actors
  // -------------------------------------------------------------------------------------------------

  private async restore(): Promise<SavedJoin | null> {
    try {
      return await this.deps.outbox.getMeta(META_JOIN, parseSavedJoin);
    } catch {
      return null;
    }
  }

  private async joinOnce(input: SavedJoin): Promise<JoinExamOutput> {
    const api = this.deps.api;
    if (!api) throw new ServiceError("network", "no Supabase settings in this build");
    await this.deps.ensureSignedIn();
    const snapshot = this.actor.getSnapshot();
    const sentAt = this.now();
    const output = await api.joinExam({
      code: input.code,
      student_number: input.studentNumber,
      locale: input.locale,
      device: { os: snapshot.context.device.os, app_version: snapshot.context.device.appVersion },
    });
    this.clock.update(output.server_time, sentAt, this.now());
    return output;
  }

  private async join(input: SavedJoin): Promise<JoinExamOutput> {
    const output = await this.joinOnce(input);
    this.pendingSave = input;
    await this.deps.outbox.setMeta(META_JOIN, input).catch(() => {});
    return output;
  }

  /**
   * join_exam again until the questions come (the exam has started on the server). With `ladder` it
   * tries at once and after 2, 4, 8 and 16 s, because join_exam allows ten tries a minute and counts the
   * refused ones too; otherwise it tries once. It throws QuestionsUnavailable when the questions did not
   * come, at once for a refusal that will not pass soon (the exam was cancelled or closed, another device
   * holds the session): 2.1 then shows exam.questions.failed, and the machine tries once more every 30 s
   * or on Check again.
   */
  private async loadQuestions(input: QuestionsLoad): Promise<Question[]> {
    const tries = input.ladder ? LAST_RETRY_STEP + 1 : 1;
    for (let attempt = 0; attempt < tries; attempt += 1) {
      if (attempt > 0) await this.sleep(retryDelayMs(attempt - 1));
      if (this.stopped) throw new Error("stopped");
      try {
        const output = await this.joinOnce(input);
        if (output.questions && output.questions.length > 0) return output.questions;
      } catch (error) {
        const transient =
          error instanceof JoinFailure ? error.code === "rate_limited" : toServiceError(error).retryable;
        if (!transient) throw new QuestionsUnavailable(error);
      }
    }
    throw new QuestionsUnavailable(null);
  }

  /** Flushes the outbox (briefly), then submit_session until it answers. */
  private async submit(sessionId: string): Promise<SubmitResult> {
    const api = this.deps.api;
    if (!api) throw new ServiceError("network", "no Supabase settings in this build");
    if (this.sync) {
      await Promise.race([this.sync.flush().catch(() => false), this.sleep(SUBMIT_FLUSH_MS)]);
    }
    let attempt = 0;
    while (!this.stopped) {
      try {
        const result = await api.submitSession(sessionId);
        const flags = await this.deps.outbox.flagCount(sessionId).catch(() => 0);
        return {
          receiptId: result.receipt_id,
          timeUsedS: result.time_used_s,
          state: result.state,
          flags,
          at: this.serverNow(),
        };
      } catch (error) {
        const failure = toServiceError(error);
        if (!failure.retryable) throw failure;
        await this.sleep(retryDelayMs(attempt));
        attempt += 1;
      }
    }
    throw new Error("stopped");
  }

  // -------------------------------------------------------------------------------------------------
  // Effects
  // -------------------------------------------------------------------------------------------------

  private handle(effect: FlowEffect): void {
    switch (effect.type) {
      case "effect.locale":
        storeLocale(effect.locale);
        if (this.pendingSave) {
          this.pendingSave = { ...this.pendingSave, locale: effect.locale };
          void this.deps.outbox.setMeta(META_JOIN, this.pendingSave).catch(() => {});
        }
        return;
      case "effect.joined":
        this.onJoined(effect.output, effect.restored);
        return;
      case "effect.event":
        void this.queueEvent(effect.eventType, effect.data);
        return;
      case "effect.answer":
        void this.saveAnswer(effect.questionId, effect.choiceId, effect.savedAt);
        return;
      case "effect.systemCheck":
        void this.detection?.retry();
        void this.systemCheck?.again().finally(() => this.send({ type: "RECHECK_DONE" }));
        return;
      case "effect.lockStart":
        this.lockLink.lockStart();
        return;
      case "effect.resume":
        void this.resume();
        return;
      case "effect.finish":
        this.finish(effect.reason);
        return;
      case "effect.saveReceipt":
        void this.deps.bridge.receipt.savePdf().catch(() => null);
        return;
      case "effect.quit":
        void this.deps.bridge.app.quit().catch(() => {});
        return;
      case "effect.openCameraSettings":
        void this.deps.bridge.system.openCameraSettings().catch(() => {});
        return;
    }
  }

  private onJoined(output: Omit<JoinExamOutput, "questions">, restored: boolean): void {
    const api = this.deps.api;
    if (this.session?.id === output.session.id) {
      this.session = { ...this.session, output };
      return;
    }
    const saved = this.pendingSave ?? { code: "", studentNumber: "", locale: this.deps.locale };
    this.session = { id: output.session.id, examId: output.exam.id, output, saved };
    // The Lock popup names the student (E.3 "Windows 11 · Aliya S."); the main process keeps the name
    // for every later hello and fills in its own version, OS and pairing state.
    void this.deps.bridge.lock
      .send({
        type: "hello",
        app_version: this.appVersion,
        os: this.actor.getSnapshot().context.device.os,
        paired: false,
        student_name: output.student.full_name,
      })
      .catch(() => {});
    if (!api) return;

    this.sync = new SyncLoop({
      api,
      outbox: this.deps.outbox,
      sessionId: output.session.id,
      getStatus: () => ingestStatus(this.actor.getSnapshot()),
      onReply: ({ response, sentAt, receivedAt }) => {
        this.clock.update(response.server_time, sentAt, receivedAt);
        this.send({ type: "SESSION_SYNC", session: response.session, serverTime: response.server_time });
        // The heartbeat's fallback for a lost broadcast: unacked commands apply once by id.
        const pending = response.pending_commands ?? [];
        if (pending.length > 0) void this.commands?.deliver(pending).catch(() => {});
      },
      onConnectivity: (state) =>
        this.send({
          type: "CONNECTIVITY",
          offline: state.offline,
          since: state.since === null ? null : this.clock.now(state.since),
        }),
      onReconnect: async ({ offlineMs, queued }) => {
        await this.queueEvent("net.offline", { offline_ms: offlineMs, queued }, { flush: false });
        void this.commands?.catchUp();
      },
    });
    this.sync.start();

    this.commands = new CommandRouter({
      api,
      outbox: this.deps.outbox,
      sessionId: output.session.id,
      apply: (command) => this.send({ type: "COMMAND", command }),
    });
    void this.commands.start().catch(() => {});

    const create = this.deps.createDetection ?? ((options) => new DetectionRuntime(options));
    this.detection = create({
      requestAccess: () => this.deps.bridge.checks.cameraAccess(),
      checks: output.exam.checks,
      mode: output.exam.mode,
      debug: this.deps.debug ?? false,
      handlers: {
        onEvent: (event) => {
          void this.queueRuleEvent(event);
          if (event.type === "gaze.on_screen")
            this.send({ type: "RULE_EVENT", eventType: event.type, at: this.serverNow() });
        },
        onStill: (still) => void this.saveStill(still),
        onCue: (cue) => {
          const at = this.serverNow();
          if (cue.cue === "phone") this.send({ type: "CUE_PHONE", on: cue.on, score: cue.score, at });
          else if (cue.cue === "paused") {
            if (!cue.on) this.restoredSelfPauseSince = null;
            this.send({ type: "CUE_PAUSED", on: cue.on, reason: cue.reason, at });
          } else this.send({ type: "CUE_AWAY", on: cue.on });
        },
        onState: (state) => {
          this.rulesPaused = state.paused !== null;
          const key = `${state.faces}|${state.canResume}`;
          if (key === this.lastDetectionState) return;
          this.lastDetectionState = key;
          this.send({
            type: "DETECTION_STATE",
            faces: state.faces,
            canResume: state.canResume || (this.restoredSelfPauseSince !== null && state.faces === 1),
          });
        },
        onCameraCheck: (check) => this.cameraRow(cameraRow(check)),
        onCameraError: () => this.cameraRow(CAMERA_UNAVAILABLE),
        onError: (error) => {
          if (error.stage === "init") this.cameraRow(CAMERA_UNAVAILABLE);
        },
        onDebug: (debug) => this.debug.set(debug),
        onStream: (stream) => this.camera.set(stream),
      },
    });

    if (restored) void this.restoreExam(output);
    this.reconcile(this.actor.getSnapshot());
  }

  /** After a restart mid-exam: a paused session, and a Lock that lost its app. */
  private async restoreExam(output: Omit<JoinExamOutput, "questions">): Promise<void> {
    const sessionId = output.session.id;
    const saved = await this.deps.outbox.answers(sessionId).catch(() => []);
    if (saved.length > 0) {
      this.send({
        type: "RESTORE_ANSWERS",
        answers: saved.map((row) => ({
          questionId: row.questionId,
          choiceId: row.choiceId,
          savedAt: Date.parse(row.savedAt),
        })),
      });
    }
    // The pause may wait for the server's command list; the Lock's state does not wait for it.
    const pause = output.session.state === "paused" ? this.restorePause(sessionId) : null;
    const wasLocked = await this.deps.outbox
      .getMeta(metaLocked(sessionId), (v) => (v === true ? true : null))
      .catch(() => null);
    if (wasLocked) {
      this.lockLink.markLocked();
      await this.queueEvent("lock.app_disconnected", { side: "app" });
    }
    await pause;
  }

  /**
   * The session was paused when the app restarted. A pause command this laptop applied, or one the
   * server still lists unacked, is the proctor's: 2.1c until the resume command. Only when the server's
   * list has been read and holds none is it the student's own pause (2.3, I'm here); deciding sooner
   * would let I'm here end the proctor's pause.
   */
  private async restorePause(sessionId: string): Promise<void> {
    const rows = await this.deps.outbox.commands(sessionId).catch(() => []);
    const last = rows
      .filter((row) => row.type === "pause" || row.type === "resume")
      .sort((a, b) => a.issuedAt - b.issuedAt)
      .at(-1);
    if (last?.type === "pause") {
      this.send({
        type: "COMMAND",
        command: {
          id: last.id,
          type: "pause",
          payload: (last.payload ?? {}) as { text?: string },
          issuedAt: last.issuedAt,
          byName: last.byName,
        } as FlowCommand,
      });
      return;
    }
    // The read retries until it works; a pause among the unacked commands opens 2.1c as it applies.
    for (let attempt = 0; !(await (this.commands?.catchUp() ?? Promise.resolve(true))); attempt += 1) {
      if (this.stopped || this.session?.id !== sessionId) return;
      await this.sleep(retryDelayMs(attempt));
    }
    if (this.stopped || this.session?.id !== sessionId) return;
    if (stageOf(this.actor.getSnapshot()) !== "writing") return;
    this.restoredSelfPauseSince = this.serverNow();
    this.send({ type: "CUE_PAUSED", on: true, reason: "face_missing", at: this.restoredSelfPauseSince });
  }

  private cameraRow(row: ReturnType<typeof cameraRow>): void {
    const key = JSON.stringify(row);
    if (key === this.lastCameraRow) return;
    this.lastCameraRow = key;
    this.send({ type: "CHECK_ROWS", rows: { camera: row } });
  }

  /** Queues an event in the outbox; true once it is there (also when a resent Lock event already was). */
  private async enqueue(
    build: (seq: number, sessionId: string) => ClientEventEnvelope | EventEnvelope,
    flush = true,
    fromLock = false,
  ): Promise<boolean> {
    const session = this.session;
    if (!session) return false;
    try {
      const envelope = (seq: number) => ClientEventEnvelope.parse(build(seq, session.id));
      const row = fromLock
        ? await this.deps.outbox.enqueueLockEvent(session.id, envelope)
        : await this.deps.outbox.enqueueEvent(session.id, envelope);
      // A Lock event sent again on a new link was queued before.
      if (!row || !flush) return true;
      if (row.flag) this.sync?.flushNow();
      else this.sync?.kick();
      return true;
    } catch (error) {
      if (import.meta.env.DEV) console.error("uki: event not queued", error);
      return false;
    }
  }

  private queueEvent(
    type: ClientEventType,
    data: Record<string, unknown>,
    options: { flush?: boolean } = {},
  ): Promise<boolean> {
    return this.enqueue(
      (seq, sessionId) => ({
        id: uuidv7(this.now()),
        session_id: sessionId,
        type,
        source: "app",
        at: new Date(this.now()).toISOString(),
        seq,
        data,
        frame_count: 0,
        app_version: this.appVersion,
      }),
      options.flush ?? true,
    );
  }

  private queueRuleEvent(event: Parameters<typeof toEnvelope>[0]): Promise<boolean> {
    return this.enqueue((seq, sessionId) =>
      toEnvelope(event, { session_id: sessionId, seq, app_version: this.appVersion }),
    );
  }

  private queueLockEvent(event: Exclude<LockEvent, { type: "exam.submitted" }>): Promise<boolean> {
    return this.enqueue(
      (seq, sessionId) =>
        lockEventToEnvelope(event, { session_id: sessionId, seq, app_version: this.appVersion }),
      true,
      true,
    );
  }

  private async saveAnswer(questionId: string, choiceId: string, savedAt: number): Promise<void> {
    const session = this.session;
    if (!session) return;
    await this.deps.outbox.saveAnswer(session.id, questionId, choiceId, new Date(savedAt).toISOString());
    this.sync?.kick();
  }

  private async saveStill(still: { eventId: string; index: number; at: number; blob: Blob }): Promise<void> {
    const session = this.session;
    if (!session) return;
    const bytes = await still.blob.arrayBuffer();
    await this.deps.outbox.addStill({
      sessionId: session.id,
      eventId: still.eventId,
      index: still.index,
      at: still.at,
      bytes,
    });
    this.sync?.kick();
  }

  /** I'm here on 2.3. After a restart the worker never paused; then the app resumes for it. */
  private async resume(): Promise<void> {
    const ok = (await this.detection?.resume().catch(() => false)) ?? false;
    if (ok || this.restoredSelfPauseSince === null || this.rulesPaused) return;
    const snapshot = this.actor.getSnapshot();
    // Only the student's own pause: a proctor's pause that arrived meanwhile ends with resume alone.
    if (stageOf(snapshot) !== "selfPaused") return;
    if ((snapshot.context.watch.faces ?? 0) < 1) return;
    const pausedMs = Math.max(0, Math.round(this.serverNow() - this.restoredSelfPauseSince));
    this.restoredSelfPauseSince = null;
    await this.queueEvent("session.resumed", { paused_ms: pausedMs, by: "student" });
    this.send({ type: "CUE_PAUSED", on: false, reason: null, at: this.serverNow() });
  }

  /**
   * The proctor's resume ended a 2.1c that took over from 2.3: the worker is still paused. It resumes
   * now (session.resumed, after the proctor's resume) when a face is in view, or 2.3 comes back.
   */
  private async resumeAfterProctor(): Promise<void> {
    const ok = (await this.detection?.resume().catch(() => false)) ?? false;
    if (ok || !this.rulesPaused || stageOf(this.actor.getSnapshot()) !== "writing") return;
    this.send({ type: "CUE_PAUSED", on: true, reason: "face_missing", at: this.serverNow() });
  }

  /** 3.1 or 2.1d: release the Lock, stop guarding, and clear the outbox once the server has it all. */
  private finish(reason: ReleaseReason): void {
    this.lockLink.release(reason);
    this.guard.stop();
    const session = this.session;
    if (!session || this.draining) return;
    this.draining = true;
    void (async () => {
      while (!this.stopped) {
        this.sync?.kick();
        await this.sleep(DRAIN_POLL_MS);
        if (await this.deps.outbox.isEmpty(session.id).catch(() => false)) {
          this.sync?.stop();
          this.commands?.stop();
          await this.deps.outbox.clear().catch(() => {});
          return;
        }
      }
    })();
  }

  // -------------------------------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------------------------------

  private reconcile(snapshot: FlowSnapshot): void {
    if (this.stopped) return;
    const { bridge } = this.deps;

    const stage = stageOf(snapshot);
    const previousStage = this.lastStage;
    this.lastStage = stage;
    // The proctor's pause ends only with the resume command: no restored self-pause survives it.
    if (stage === "proctorPaused") this.restoredSelfPauseSince = null;
    if (previousStage === "proctorPaused" && stage === "writing" && this.rulesPaused) {
      void this.resumeAfterProctor();
    }

    const lockdown = wantsLockdown(snapshot);
    if (lockdown !== this.applied.lockdown) {
      this.applied.lockdown = lockdown;
      void bridge.exam.lockdown(lockdown).catch(() => {});
      this.guard.watchFocus(lockdown);
    }

    const watch = wantsExamWatch(snapshot);
    if (watch !== this.applied.watch) {
      this.applied.watch = watch;
      this.guard.scan(watch);
    }

    const hidden = wantsHidden(snapshot);
    if (hidden !== this.applied.hidden) {
      this.applied.hidden = hidden;
      void bridge.exam.hideToTray(hidden).catch(() => {});
    }

    const detection = wantsDetection(snapshot);
    if (this.detection && detection !== this.applied.detection) {
      this.applied.detection = detection;
      void this.detection.setPhase(detection);
      if (detection === "off") this.camera.set(null);
    }

    const systemCheck = wantsSystemCheck(snapshot);
    if (systemCheck !== this.applied.systemCheck) {
      this.applied.systemCheck = systemCheck;
      if (systemCheck) {
        this.lastCameraRow = "";
        this.systemCheck ??= new SystemCheck({
          health: () => (this.deps.api ? this.deps.api.health() : Promise.reject(new Error("offline"))),
          bridge,
          onRows: (rows) => this.send({ type: "CHECK_ROWS", rows }),
        });
        this.systemCheck.start();
      } else {
        this.systemCheck?.stop();
      }
    }

    const identity = wantsIdentity(snapshot);
    if (identity !== this.applied.identity) {
      this.applied.identity = identity;
      if (identity) this.startIdentity(snapshot);
      else {
        void this.identity?.stop();
        this.identity = null;
      }
    }

    // A new check-in step or question reaches the lobby and the wall at once, not on the next tick.
    const statusKey = JSON.stringify(ingestStatus(snapshot) ?? null);
    if (statusKey !== this.lastStatusKey) {
      this.lastStatusKey = statusKey;
      this.sync?.kick();
    }

    this.lockLink.update(lockExamState(snapshot));
  }

  private startIdentity(snapshot: FlowSnapshot): void {
    const studentNumber =
      snapshot.context.joined?.student.student_number ?? snapshot.context.form.studentNumber;
    const create = this.deps.createIdentity ?? ((options) => new IdentityRunner(options));
    this.identity = create({
      stream: () => this.detection?.stream ?? null,
      studentNumber,
      cardRect: cameraCardRect(),
      onStatus: (status) => this.send({ type: "IDENTITY_STATUS", status }),
      onVerdict: (verdict) =>
        this.send({
          type: "IDENTITY_VERDICT",
          kind: verdict.kind,
          tries: verdict.tries,
          rows: verdict.rows,
          score: verdict.kind === "matched" ? verdict.score : null,
        }),
    });
    this.identity.start();
  }
}
