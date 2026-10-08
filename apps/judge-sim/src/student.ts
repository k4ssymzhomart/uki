// One simulated student: its anonymous user (made once, refreshed, stored), its session in DEMO-LIVE
// (join_exam, joined again after a rollover), its check-in, its heartbeats (session_heartbeat) and the
// ingest calls of its episodes, with the flagged stills uploaded through ingest's signed URLs and
// confirmed through `frames`. The runner (runner.ts) decides when; this file decides how.
import {
  type ClientEventEnvelope,
  isFinalState,
  type Locale,
  SessionHeartbeatOutput,
  type SessionState,
  uuidv7,
} from "@uki/contracts";
import { ApiError, type SimApi } from "./api.ts";
import type { EpisodeStep, NextQuestion, StillName } from "./episodes.ts";
import type { StateStore, StoredAuth, StudentFile } from "./state.ts";

export const SIM_APP_VERSION = "0.1.0-judge-sim";
/** Refresh the access token when it has less than this left. */
const REFRESH_MARGIN_S = 300;

export interface ExamRun {
  id: string;
  /** starts_at as the server wrote it: a new value means a rollover. */
  startsAt: string;
}

/** Why a student waits, for the logs and the summary. */
export type Hold =
  | { kind: "none" }
  | { kind: "backoff"; untilMs: number; reason: string }
  | { kind: "until_rollover"; startsAt: string | null; reason: string };

/** A student's language: mostly Kazakh, as at KRU, some Russian, a few English. */
export function localeFor(number: string): Locale {
  const last = Number(number.at(-1));
  if (last <= 5) return "kk";
  return last <= 8 ? "ru" : "en";
}

export interface StudentDeps {
  api: SimApi;
  store: StateStore;
  stills: Readonly<Record<StillName, Uint8Array>>;
  /** Server-corrected time for event `at` values. */
  serverNow: () => number;
  /** Learns the server's clock from a reply's server_time. */
  observeServerTime: (iso: string) => void;
}

export class SimStudent {
  file: StudentFile;
  readonly locale: Locale;
  /** One request at a time per student. */
  busy = false;
  hold: Hold = { kind: "none" };
  /** When this process last wrote the session's last_seen_at (a heartbeat or an ingest call). */
  lastWriteAtMs: number | null = null;
  lastEpisodeAtMs = 0;
  /** An episode in progress (an empty seat waits for its return): no other episode meanwhile. */
  episodeUntilMs = 0;
  /** Later steps of the current episode. */
  pending: { atMs: number; step: EpisodeStep }[] = [];
  state: SessionState | null = null;
  questions: NextQuestion[] = [];
  checks = { gazeS: 2, faceMissingS: 10 };
  private failures = 0;

  constructor(
    number: string,
    readonly heartbeatJitter: number,
    private readonly deps: StudentDeps,
  ) {
    this.file = deps.store.loadStudent(number);
    this.locale = localeFor(number);
  }

  get number(): string {
    return this.file.number;
  }

  get signedIn(): boolean {
    return this.file.auth !== null;
  }

  get joined(): boolean {
    return this.file.session_id !== null;
  }

  /** In the exam and able to play an episode now. */
  writing(nowMs: number): boolean {
    return (
      this.file.checked_in &&
      this.file.session_id !== null &&
      this.state !== null &&
      !isFinalState(this.state) &&
      this.hold.kind === "none" &&
      !this.busy &&
      this.pending.length === 0 &&
      nowMs >= this.episodeUntilMs
    );
  }

  ready(nowMs: number): boolean {
    if (this.busy) return false;
    if (this.hold.kind === "backoff" && nowMs < this.hold.untilMs) return false;
    if (this.hold.kind === "backoff") this.hold = { kind: "none" };
    return true;
  }

  private save(): void {
    this.deps.store.saveStudent(this.file);
  }

  private backoff(nowMs: number, reason: string): void {
    this.failures += 1;
    const delay = Math.min(5000 * 2 ** Math.min(this.failures - 1, 6), 300_000);
    this.hold = { kind: "backoff", untilMs: nowMs + delay, reason };
  }

  private succeeded(): void {
    this.failures = 0;
  }

  /** Forgets the session (a rollover deleted it, or another user holds it). */
  dropSession(): void {
    this.file = {
      ...this.file,
      session_id: null,
      exam_starts_at: null,
      checked_in: false,
      seq: 0,
      question: 1,
    };
    this.state = null;
    this.pending = [];
    this.episodeUntilMs = 0;
    this.save();
  }

  needsRefresh(nowMs: number): boolean {
    return this.file.auth !== null && this.file.auth.expires_at - nowMs / 1000 < REFRESH_MARGIN_S;
  }

  /** The access token, or null while the student has none. */
  token(): string | null {
    return this.file.auth?.access_token ?? null;
  }

  adoptAuth(auth: StoredAuth): void {
    this.file = { ...this.file, auth };
    this.save();
  }

  async refresh(nowMs: number): Promise<"ok" | "lost" | "failed"> {
    const auth = this.file.auth;
    if (auth === null) return "lost";
    try {
      const fresh = await this.deps.api.refresh(auth.refresh_token, nowMs);
      this.adoptAuth(fresh);
      this.succeeded();
      return "ok";
    } catch (error) {
      if (error instanceof ApiError && !error.transient && error.status >= 400 && error.status < 500) {
        // The refresh token is gone (used twice, revoked): a new anonymous user is needed, and the old
        // one's session stays bound to it until the next rollover.
        this.file = { ...this.file, auth: null };
        this.dropSession();
        return "lost";
      }
      this.backoff(nowMs, describe(error));
      return "failed";
    }
  }

  /** join_exam, then the student's questions and checks; the session is new or the same one again. */
  async join(code: string, run: ExamRun, nowMs: number): Promise<"joined" | "held" | "failed"> {
    const token = this.token();
    if (token === null) return "failed";
    try {
      const reply = await this.deps.api.joinExam(
        {
          code,
          student_number: this.number,
          locale: this.locale,
          device: { os: "windows", app_version: SIM_APP_VERSION, simulated: true },
        },
        token,
      );
      this.deps.observeServerTime(reply.server_time);
      if (reply.questions === null) {
        this.hold = { kind: "backoff", untilMs: nowMs + 60_000, reason: "exam not started" };
        return "held";
      }
      const sameSession = reply.session.id === this.file.session_id;
      this.file = {
        ...this.file,
        session_id: reply.session.id,
        exam_starts_at: run.startsAt,
        checked_in: sameSession ? this.file.checked_in : false,
        seq: sameSession ? this.file.seq : 0,
        question: sameSession ? this.file.question : 1,
      };
      this.state = reply.session.state;
      this.questions = reply.questions.map((q) => ({
        id: q.id,
        position: q.position,
        choiceIds: q.choices.map((choice) => choice.id),
      }));
      this.checks = { gazeS: reply.exam.checks.gaze_s, faceMissingS: reply.exam.checks.face_missing_s };
      if (this.state !== "joined" && !isFinalState(this.state))
        this.file = { ...this.file, checked_in: true };
      this.save();
      this.succeeded();
      return "joined";
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === "already_joined") {
          // Another anonymous user holds this student's session (a lost refresh token): wait for the
          // next run, when the rollover frees the seat.
          this.hold = { kind: "until_rollover", startsAt: run.startsAt, reason: "already_joined" };
          return "held";
        }
        if (error.code === "lobby_closed" || error.code === "invalid_code") {
          this.hold = { kind: "backoff", untilMs: nowMs + 60_000, reason: error.code };
          return "held";
        }
        if (error.status === 401) this.forceRefresh();
      }
      this.backoff(nowMs, describe(error));
      return "failed";
    }
  }

  private forceRefresh(): void {
    if (this.file.auth !== null) this.file = { ...this.file, auth: { ...this.file.auth, expires_at: 1 } };
  }

  private envelope(type: ClientEventEnvelope["type"], data: object, atMs: number, frames: number) {
    this.file = { ...this.file, seq: this.file.seq + 1 };
    return {
      id: uuidv7(atMs),
      session_id: this.file.session_id as string,
      type,
      source: "app" as const,
      at: new Date(atMs).toISOString(),
      seq: this.file.seq,
      data: data as Record<string, unknown>,
      frame_count: frames,
      app_version: SIM_APP_VERSION,
    };
  }

  /** The first ingest call: identity matched, the rules agreed (step ready), the exam started. */
  checkInStep(scoreDraw: number): EpisodeStep {
    return {
      afterMs: 0,
      events: [
        { type: "identity.matched", data: { score: scoreDraw, tries: 1 }, offsetMs: -4000, stills: [] },
        { type: "exam.started", data: {}, offsetMs: 0, stills: [] },
      ],
      status: { step: "ready", rules_locale: this.locale, question: 1 },
    };
  }

  /**
   * One ingest call for `step`: its events (stills counted in frame_count), the status, the answer before
   * it. Uploads the stills ingest asks for and confirms them. Returns the stills uploaded.
   */
  async send(step: EpisodeStep, nowMs: number, checkIn = false): Promise<{ ok: boolean; stills: number }> {
    const token = this.token();
    const sessionId = this.file.session_id;
    if (token === null || sessionId === null) return { ok: false, stills: 0 };
    try {
      const at = this.deps.serverNow();
      if (step.answer !== undefined) {
        await this.deps.api.saveAnswer(
          {
            session_id: sessionId,
            question_id: step.answer.questionId,
            choice_id: step.answer.choiceId,
            saved_at: new Date(at).toISOString(),
          },
          token,
        );
      }
      const drafts = new Map<string, StillName[]>();
      const events = step.events.map((draft) => {
        const envelope = this.envelope(draft.type, draft.data, at + draft.offsetMs, draft.stills.length);
        if (draft.stills.length > 0) drafts.set(envelope.id, draft.stills);
        return envelope;
      });
      const reply = await this.deps.api.ingest(
        { session_id: sessionId, events, ...(step.status === undefined ? {} : { status: step.status }) },
        token,
      );
      this.deps.observeServerTime(reply.server_time);
      this.lastWriteAtMs = nowMs;
      this.state = reply.session.state;
      if (checkIn) this.file = { ...this.file, checked_in: true };
      if (step.status?.question !== undefined) this.file = { ...this.file, question: step.status.question };
      this.save();

      let uploaded = 0;
      for (const upload of reply.uploads) {
        const names = drafts.get(upload.event_id) ?? [];
        const paths: string[] = [];
        for (const still of upload.stills) {
          const name = names[still.index] ?? names[0];
          if (name === undefined) continue;
          await this.deps.api.upload(still.signed_url, this.deps.stills[name], token);
          paths.push(still.path);
        }
        if (paths.length > 0) {
          await this.deps.api.confirmFrames(upload.event_id, paths, token);
          uploaded += paths.length;
        }
      }
      this.succeeded();
      return { ok: true, stills: uploaded };
    } catch (error) {
      this.save();
      this.handleSessionError(error, nowMs);
      return { ok: false, stills: 0 };
    }
  }

  /** session_heartbeat: last_seen_at, so the tile stays online. */
  async heartbeat(nowMs: number): Promise<boolean> {
    const token = this.token();
    const sessionId = this.file.session_id;
    if (token === null || sessionId === null) return false;
    try {
      const reply = await this.deps.api.rpc(
        "session_heartbeat",
        { session_id: sessionId },
        token,
        SessionHeartbeatOutput,
      );
      this.deps.observeServerTime(reply.server_time);
      this.state = reply.state;
      this.lastWriteAtMs = nowMs;
      this.succeeded();
      return true;
    } catch (error) {
      this.handleSessionError(error, nowMs);
      return false;
    }
  }

  private handleSessionError(error: unknown, nowMs: number): void {
    if (error instanceof ApiError) {
      if (error.code === "not_found" || error.code === "forbidden") {
        // The rollover deleted the session, or it is no longer this user's: join again.
        this.dropSession();
        return;
      }
      if (error.status === 401) this.forceRefresh();
    }
    this.backoff(nowMs, describe(error));
  }

  /** The question this student answers next, or null without questions. */
  nextQuestion(): NextQuestion | null {
    if (this.questions.length === 0) return null;
    const index = (this.file.question - 1) % this.questions.length;
    return this.questions[index] ?? null;
  }
}

export function describe(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
