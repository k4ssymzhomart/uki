// The simulator's runtime: one loop drives every simulated student through the script in script.ts.
//
// Writes go through the same database paths a real student's do, with the secret key:
// - join: a `sessions` row bound to a random auth uid that has no auth user (no anonymous sign-in is
//   used up; the seat can never be claimed by a real laptop), `device.simulated = true`. The
//   sessions_broadcast trigger shows it in the lobby.
// - status, events and heartbeats: `ingest_batch`, the service-only function behind the `ingest` Edge
//   Function, with the review the server's map gives. Its triggers broadcast every event and tile change.
// - answers: upserts into `answers` (the answers_keep_latest trigger applies).
// - submit: what `submit_session` does (it checks auth.uid(), which a script does not have): state,
//   time used, a receipt id from make_receipt_id, and the server's exam.submitted event.
// - proctor commands to simulated students are acknowledged (acked_at) and their effects (pause,
//   resume, end) are read back from `sessions`.
import { randomUUID } from "node:crypto";
import type { ExamChecks, SessionState, SessionStatus } from "../../../packages/contracts/src/index.ts";
import { isFinalState, isPreExamState, uuidv7 } from "../../../packages/contracts/src/index.ts";
import type { Json } from "../../../packages/db/src/index.ts";
import { formatDuration, type Logger, must } from "../cli.ts";
import type { ServerClock } from "../clock.ts";
import type { UkiClient } from "../supabase.ts";
import type { CastMember } from "./cast.ts";
import {
  type BatchEvent,
  draftsFor,
  type EventDraft,
  IngestBatchResult,
  SIM_APP_VERSION,
  toBatchEvent,
} from "./events.ts";
import { createRng, type Rng } from "./rng.ts";
import {
  joinDelay,
  type LobbyStep,
  type Planned,
  planCatchUp,
  planExam,
  planLobby,
  type SimAction,
  stepRank,
} from "./script.ts";
import { describeLatency, Limiter, Samples } from "./stats.ts";

export interface SimExam {
  id: string;
  code: string;
  title: string;
  startsAtMs: number;
  durationMin: number;
  lobbyOpensAtMs: number;
  status: string;
  checks: ExamChecks;
}

export interface SimQuestion {
  id: string;
  choiceIds: string[];
}

/** A simulated session found in the database when the simulator starts. */
export interface AdoptedSession {
  sessionId: string;
  state: SessionState;
  status: SessionStatus;
  seq: number;
  /** The session is paused by its own session.paused (not a proctor), so the student resumes it. */
  selfPaused: boolean;
}

export interface EngineOptions {
  client: UkiClient;
  clock: ServerClock;
  exam: SimExam;
  questions: SimQuestion[];
  cast: CastMember[];
  adopted: ReadonlyMap<string, AdoptedSession>;
  speed: number;
  heartbeatMs: number;
  seed: number;
  concurrency: number;
  log: Logger;
  verbose: boolean;
  /** Called just before an event is sent, with the laptop time, for the broadcast watcher. */
  onEventSent?: (eventId: string, sentAtMs: number) => void;
}

type AgendaItem = { at: number; action: SimAction | { kind: "join" } };

interface Member {
  cast: CastMember;
  rng: Rng;
  sessionId: string | null;
  state: SessionState | null;
  reported: LobbyStep;
  detail: string | undefined;
  question: number;
  seq: number;
  agenda: AgendaItem[];
  queue: BatchEvent[];
  answers: AnswerRow[];
  busy: boolean;
  nextBeatAt: number;
  failures: number;
  offlineSince: number | null;
  offlineUntil: number | null;
  selfPausedAt: number | null;
  examPlanned: boolean;
  /** identity.matched was sent; the card match happens once per session. */
  identityMatched: boolean;
  finished: boolean;
}

interface AnswerRow {
  session_id: string;
  question_id: string;
  choice_id: string;
  saved_at: string;
}

export interface EngineStats {
  members: number;
  byState: Record<string, number>;
  notJoined: number;
  offline: number;
  ingestOk: number;
  ingestFailed: number;
  eventsSent: number;
  answersSaved: number;
  submitted: number;
  ingestLatency: Samples;
}

const TICK_MS = 200;
const POLL_MS = 2000;
const ANSWER_FLUSH_MS = 2000;
const REPORT_MS = 10_000;
const DEFER_MS = 5000;
const EXAM_ACTIONS = new Set([
  "question",
  "look_away",
  "phone",
  "second_face",
  "tab_blocked",
  "self_pause",
  "go_offline",
  "submit",
]);

export class SimEngine {
  private readonly members: Member[];
  private readonly limiter: Limiter;
  private readonly answerQueue: AnswerRow[] = [];
  private timer: NodeJS.Timeout | null = null;
  private examStartedAt: number | null = null;
  private lastPoll = 0;
  private lastAnswerFlush = 0;
  private lastReport = 0;
  private readonly startedAt = Date.now();
  private polling = false;
  private flushing = false;
  private readonly statsData = {
    ingestOk: 0,
    ingestFailed: 0,
    eventsSent: 0,
    answersSaved: 0,
    submitted: 0,
    ingestLatency: new Samples(),
  };
  private readonly loggedErrors = new Map<string, number>();

  constructor(private readonly options: EngineOptions) {
    this.limiter = new Limiter(options.concurrency);
    const root = createRng(options.seed);
    this.members = options.cast.map((cast) => {
      const adopted = options.adopted.get(cast.studentId);
      const member: Member = {
        cast,
        rng: root.fork(cast.studentId),
        sessionId: adopted?.sessionId ?? null,
        state: adopted?.state ?? null,
        reported: adopted && isPreExamState(adopted.state) ? (adopted.state as LobbyStep) : "joined",
        detail: adopted?.status.detail ?? undefined,
        question: adopted?.status.question ?? 0,
        seq: adopted?.seq ?? 0,
        agenda: [],
        queue: [],
        answers: [],
        busy: false,
        nextBeatAt: Date.now() + 1000 + Math.random() * options.heartbeatMs,
        failures: 0,
        offlineSince: null,
        offlineUntil: null,
        selfPausedAt: adopted?.selfPaused ? Date.now() : null,
        examPlanned: false,
        identityMatched: adopted
          ? !isPreExamState(adopted.state) || adopted.state === "rules" || adopted.state === "ready"
          : false,
        finished: adopted ? isFinalState(adopted.state) : false,
      };
      return member;
    });
  }

  /** Plans every student and starts the loop. */
  start(): void {
    const now = Date.now();
    const started = this.examHasStarted();
    if (started) this.examStartedAt = now;
    for (const member of this.members) {
      if (member.finished) continue;
      if (member.sessionId === null) {
        const delay = started ? member.rng.between(1000, 20_000) : joinDelay(member.cast, member.rng);
        if (delay !== null) this.schedule(member, now, [{ atSimMs: delay, action: { kind: "join" } }]);
        continue;
      }
      // Adopted session: continue where it is.
      if (member.state === "writing" || member.state === "paused") {
        this.planExamFor(member, now);
        if (member.selfPausedAt !== null) {
          this.schedule(member, now, [
            { atSimMs: member.rng.between(10_000, 40_000), action: { kind: "resume" } },
          ]);
        }
      } else if (started) {
        this.schedule(member, now, planCatchUp(member.cast, member.reported, member.rng));
      } else {
        const ahead = planLobby(member.cast, member.rng).filter(
          (step) => step.action.kind !== "status" || stepRank(step.action.step) >= stepRank(member.reported),
        );
        this.schedule(member, now, ahead);
      }
    }
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  /** Stops the loop and waits up to `graceMs` for calls in flight, then saves pending answers. */
  async stop(graceMs = 5000): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const deadline = Date.now() + graceMs;
    while (this.members.some((m) => m.busy) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    for (const member of this.members) {
      if (member.offlineSince === null) this.answerQueue.push(...member.answers.splice(0));
    }
    await this.flushAnswers();
  }

  /** True once every student is final or the exam is over. */
  get finished(): boolean {
    const examOver = this.options.clock.now() > this.examEndMs() + 3 * 60_000;
    return (
      examOver || this.members.every((m) => m.finished || (m.sessionId === null && m.agenda.length === 0))
    );
  }

  /** Session ids the simulator created or adopted. */
  sessionIds(): string[] {
    return this.members.flatMap((m) => (m.sessionId ? [m.sessionId] : []));
  }

  stats(): EngineStats {
    const byState: Record<string, number> = {};
    let notJoined = 0;
    let offline = 0;
    for (const member of this.members) {
      if (member.state === null) notJoined += 1;
      else byState[member.state] = (byState[member.state] ?? 0) + 1;
      if (member.offlineSince !== null) offline += 1;
    }
    return { members: this.members.length, byState, notJoined, offline, ...this.statsData };
  }

  describe(): string {
    const s = this.stats();
    const order: SessionState[] = [
      "joined",
      "checking",
      "identity",
      "rules",
      "ready",
      "writing",
      "paused",
      "submitted",
      "time_up",
      "ended",
    ];
    const states = order
      .filter((state) => (s.byState[state] ?? 0) > 0)
      .map((state) => `${state} ${s.byState[state]}`)
      .join(" · ");
    const clock = formatDuration(Date.now() - this.startedAt);
    const phase =
      this.examStartedAt === null
        ? `lobby, start in ${formatDuration(this.options.exam.startsAtMs - this.options.clock.now())}`
        : `exam ${formatDuration(Date.now() - this.examStartedAt)}`;
    return (
      `${clock} ${phase} | ${states || "nobody joined yet"}` +
      (s.notJoined > 0 ? ` · not joined ${s.notJoined}` : "") +
      (s.offline > 0 ? ` · silent ${s.offline}` : "") +
      ` | ingest ${s.ingestOk} ok, ${s.ingestFailed} failed (${describeLatency(s.ingestLatency)}) · events ${s.eventsSent} · answers ${s.answersSaved}`
    );
  }

  // -------------------------------------------------------------------------------------------------
  // Loop
  // -------------------------------------------------------------------------------------------------

  private tick(): void {
    const now = Date.now();
    if (this.examStartedAt === null && this.examHasStarted()) this.onExamStart(now);

    for (const member of this.members) {
      if (member.busy || member.finished) continue;
      if (member.offlineUntil !== null && now >= member.offlineUntil) {
        this.run(member, () => this.reconnect(member));
        continue;
      }
      const due = member.agenda[0];
      if (due !== undefined && due.at <= now) {
        member.agenda.shift();
        this.run(member, () => this.perform(member, due));
        continue;
      }
      if (member.sessionId !== null && member.offlineSince === null && now >= member.nextBeatAt) {
        this.run(member, () => this.ingest(member, [], "heartbeat"));
      }
    }

    if (now - this.lastAnswerFlush >= ANSWER_FLUSH_MS && !this.flushing) {
      this.lastAnswerFlush = now;
      this.flushing = true;
      void this.flushAnswers().finally(() => {
        this.flushing = false;
      });
    }
    if (now - this.lastPoll >= POLL_MS && !this.polling) {
      this.lastPoll = now;
      this.polling = true;
      void this.poll()
        .catch((error: unknown) => this.logError("poll", error))
        .finally(() => {
          this.polling = false;
        });
    }
    if (now - this.lastReport >= REPORT_MS) {
      this.lastReport = now;
      this.options.log.info(this.describe());
    }
  }

  private run(member: Member, task: () => Promise<void>): void {
    member.busy = true;
    void this.limiter
      .run(task)
      .catch((error: unknown) => this.logError(member.cast.short, error))
      .finally(() => {
        member.busy = false;
      });
  }

  private schedule(
    member: Member,
    anchor: number,
    plan: readonly (Planned | { atSimMs: number; action: AgendaItem["action"] })[],
  ): void {
    for (const step of plan) {
      member.agenda.push({ at: anchor + step.atSimMs / this.options.speed, action: step.action });
    }
    member.agenda.sort((a, b) => a.at - b.at);
  }

  private defer(member: Member, item: AgendaItem, ms = DEFER_MS): void {
    member.agenda.push({ at: Date.now() + ms, action: item.action });
    member.agenda.sort((a, b) => a.at - b.at);
  }

  private examHasStarted(): boolean {
    const { exam, clock } = this.options;
    return ["live", "to_review", "reviewed"].includes(exam.status) || clock.now() >= exam.startsAtMs;
  }

  private examEndMs(): number {
    return this.options.exam.startsAtMs + this.options.exam.durationMin * 60_000;
  }

  private onExamStart(now: number): void {
    this.examStartedAt = now;
    this.options.log.info(`${this.options.exam.title} has started: simulated students move to 2.1`);
    for (const member of this.members) {
      if (member.finished || member.state === "writing" || member.state === "paused") continue;
      // Drop what is left of the lobby; keep a pending join.
      const join = member.agenda.find((item) => item.action.kind === "join");
      member.agenda = [];
      if (member.sessionId === null) {
        const delay =
          member.cast.lobby === "late"
            ? member.rng.between(30_000, 90_000)
            : member.rng.between(1000, 20_000);
        const at =
          join && member.cast.lobby !== "late"
            ? Math.min(join.at, now + delay / this.options.speed)
            : now + delay / this.options.speed;
        member.agenda.push({ at, action: { kind: "join" } });
        continue;
      }
      this.schedule(member, now, planCatchUp(member.cast, member.reported, member.rng));
    }
  }

  private planExamFor(member: Member, anchor: number): void {
    if (member.examPlanned) return;
    member.examPlanned = true;
    const plan = planExam(member.cast, member.rng, {
      questions: this.options.questions.length,
      durationMin: this.options.exam.durationMin,
    }).filter((step) => step.action.kind !== "question" || step.action.question > member.question);
    this.schedule(member, anchor, plan);
  }

  // -------------------------------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------------------------------

  private async perform(member: Member, item: AgendaItem): Promise<void> {
    const action = item.action;
    if (action.kind === "join") {
      await this.join(member);
      return;
    }
    if (member.sessionId === null || member.state === null) return;
    if (isFinalState(member.state)) {
      member.finished = true;
      member.agenda = [];
      return;
    }
    if (EXAM_ACTIONS.has(action.kind)) {
      if (isPreExamState(member.state) || (member.state === "paused" && action.kind !== "go_offline")) {
        this.defer(member, item);
        return;
      }
    }
    // Without a network the student cannot submit, and an "I'm here" waits until its pause has been sent.
    if (member.offlineSince !== null && (action.kind === "submit" || action.kind === "resume")) {
      this.defer(member, item);
      return;
    }
    const now = this.options.clock.now();
    const ctx = {
      nowMs: now,
      gazeS: this.options.exam.checks.gaze_s,
      faceMissingS: this.options.exam.checks.face_missing_s,
    };

    switch (action.kind) {
      case "status": {
        if (!isPreExamState(member.state)) return;
        if (stepRank(action.step) < stepRank(member.reported)) return;
        member.reported = action.step;
        member.detail = action.detail;
        await this.ingest(member, [], `status ${action.step}${action.detail ? ` (${action.detail})` : ""}`);
        return;
      }
      case "identity_matched": {
        if (!isPreExamState(member.state) || member.identityMatched) return;
        member.identityMatched = true;
        await this.ingest(member, draftsFor(action, ctx), "identity.matched");
        return;
      }
      case "start": {
        if (!isPreExamState(member.state)) return;
        member.question = Math.max(1, member.question);
        member.detail = undefined;
        await this.ingest(member, draftsFor(action, ctx), "exam.started");
        this.planExamFor(member, Date.now());
        return;
      }
      case "question": {
        const previous = this.options.questions[member.question - 1];
        const drafts: EventDraft[] = [];
        if (previous !== undefined && member.question >= 1) {
          const choice = member.rng.pick(previous.choiceIds);
          member.answers.push({
            session_id: member.sessionId,
            question_id: previous.id,
            choice_id: choice,
            saved_at: new Date(now).toISOString(),
          });
          drafts.push({ type: "answer.saved", data: { question_id: previous.id }, atMs: now });
        }
        member.question = action.question;
        if (member.offlineSince === null) this.answerQueue.push(...member.answers.splice(0));
        await this.ingest(member, drafts, `Q ${action.question}`);
        return;
      }
      case "look_away":
      case "phone":
      case "second_face":
      case "tab_blocked": {
        const drafts = draftsFor(action, ctx);
        await this.ingest(member, drafts, describeDrafts(drafts), true);
        return;
      }
      case "self_pause": {
        member.selfPausedAt = now;
        await this.ingest(member, draftsFor(action, ctx), `paused: ${action.cause}`, true);
        this.schedule(member, Date.now(), [{ atSimMs: action.pauseSimMs, action: { kind: "resume" } }]);
        return;
      }
      case "resume": {
        const since = member.selfPausedAt;
        member.selfPausedAt = null;
        // Only a pause this student started; a proctor's pause waits for the proctor.
        if (since === null || member.state !== "paused") return;
        const drafts: EventDraft[] = [
          {
            type: "session.resumed",
            data: { paused_ms: Math.max(0, now - since), by: "student" },
            atMs: now,
          },
        ];
        await this.ingest(member, drafts, "I'm here", true);
        return;
      }
      case "go_offline": {
        member.offlineSince = Date.now();
        member.offlineUntil = Date.now() + action.realMs;
        this.note(member, `goes silent for ${Math.round(action.realMs / 1000)} s (No signal on the wall)`);
        return;
      }
      case "submit": {
        await this.submit(member);
        return;
      }
    }
  }

  private async join(member: Member): Promise<void> {
    const { client, exam } = this.options;
    const { data, error } = await client
      .from("sessions")
      .insert({
        exam_id: exam.id,
        student_id: member.cast.studentId,
        auth_uid: randomUUID(),
        state: "joined",
        locale: member.cast.locale,
        device: { os: member.cast.os, app_version: SIM_APP_VERSION, simulated: true },
      })
      .select("id, state")
      .single();
    if (error?.code === "23505") {
      // A real student took the seat meanwhile (unique exam_id, student_id): leave it alone.
      member.finished = true;
      member.agenda = [];
      this.options.log.warn(
        `${member.cast.short} (${member.cast.number}) not simulated: the seat has a real session`,
      );
      return;
    }
    if (error || !data) {
      // A timeout or a gateway error: try again, as the app would.
      member.failures += 1;
      this.logError(`join ${member.cast.short}`, error?.message ?? "no row");
      const backoff = Math.min(30_000, 2000 * 2 ** Math.min(member.failures - 1, 4));
      this.defer(member, { at: 0, action: { kind: "join" } }, backoff);
      return;
    }
    member.failures = 0;
    member.sessionId = data.id;
    member.state = data.state;
    member.reported = "joined";
    member.nextBeatAt = Date.now() + 1000 + 2000 * Math.random();
    const now = Date.now();
    if (this.examStartedAt !== null)
      this.schedule(member, now, planCatchUp(member.cast, "joined", member.rng));
    else this.schedule(member, now, planLobby(member.cast, member.rng));
    if (this.options.verbose) this.note(member, "joined");
  }

  private async reconnect(member: Member): Promise<void> {
    const since = member.offlineSince ?? Date.now();
    member.offlineSince = null;
    member.offlineUntil = null;
    const queued = member.queue.length;
    this.answerQueue.push(...member.answers.splice(0));
    const draft: EventDraft = {
      type: "net.offline",
      data: { offline_ms: Math.max(0, Date.now() - since), queued },
      atMs: this.options.clock.now(),
    };
    await this.ingest(member, [draft], `back online, ${queued} queued events sent`, true);
  }

  /** What submit_session does, for a session whose auth uid has no auth user. */
  private async submit(member: Member): Promise<void> {
    if (member.sessionId === null) return;
    if (member.queue.length > 0 && member.offlineSince === null)
      await this.ingest(member, [], "flush before submit");
    this.answerQueue.push(...member.answers.splice(0));
    await this.flushAnswers();
    const { client, exam } = this.options;
    const row = must(
      await client
        .from("sessions")
        .select("state, started_at, paused_s, extra_min, receipt_id")
        .eq("id", member.sessionId)
        .single(),
      "read session before submit",
    );
    if (row.receipt_id !== null || isFinalState(row.state)) {
      member.state = row.state;
      member.finished = true;
      member.agenda = [];
      return;
    }
    const now = this.options.clock.now();
    const start = Math.max(exam.startsAtMs, row.started_at ? Date.parse(row.started_at) : exam.startsAtMs);
    const limitS = (exam.durationMin + row.extra_min) * 60;
    const used = Math.max(0, Math.min(Math.floor((now - start) / 1000) - row.paused_s, limitS));
    const receipt = must(
      await client.rpc("make_receipt_id", { p_student_id: member.cast.studentId }),
      "make_receipt_id",
    );
    const updated = must(
      await client
        .from("sessions")
        .update({
          state: "submitted",
          submitted_at: new Date(now).toISOString(),
          time_used_s: used,
          receipt_id: receipt,
          pause_event_id: null,
        })
        .eq("id", member.sessionId)
        .in("state", ["writing", "paused"])
        .select("id"),
      "submit",
    );
    if (updated.length === 0) return;
    const eventId = uuidv7(now);
    this.options.onEventSent?.(eventId, Date.now());
    must(
      await client
        .from("events")
        .insert({
          id: eventId,
          session_id: member.sessionId,
          exam_id: exam.id,
          type: "exam.submitted",
          source: "server",
          review: "none",
          at: new Date(now).toISOString(),
          data: { time_used_s: used },
        })
        .select("id"),
      "exam.submitted event",
    );
    member.state = "submitted";
    member.finished = true;
    member.agenda = [];
    this.statsData.submitted += 1;
    this.statsData.eventsSent += 1;
    this.note(member, `submitted, receipt ${receipt}`);
  }

  /**
   * One `ingest_batch` call with the queued events plus `drafts` and the current status. While the
   * student is silent (No signal), events wait in the queue, as in the app's outbox.
   */
  private async ingest(member: Member, drafts: EventDraft[], label: string, notable = false): Promise<void> {
    if (member.sessionId === null) return;
    for (const draft of drafts) {
      member.seq += 1;
      member.queue.push(toBatchEvent(member.sessionId, member.seq, draft));
    }
    if (member.offlineSince !== null) return;
    const batch = member.queue.slice(0, 50);
    const status: SessionStatus =
      member.state !== null && isPreExamState(member.state) && member.question === 0
        ? { step: member.reported === "joined" ? undefined : member.reported, detail: member.detail }
        : { question: Math.max(1, member.question) };
    const sentAt = Date.now();
    for (const event of batch) this.options.onEventSent?.(event.id, sentAt);
    const { data, error } = await this.options.client.rpc("ingest_batch", {
      p_session_id: member.sessionId,
      p_events: batch as unknown as Json,
      p_status: stripUndefined(status) as Json,
    });
    const elapsed = Date.now() - sentAt;
    if (error) {
      member.failures += 1;
      this.statsData.ingestFailed += 1;
      member.nextBeatAt = Date.now() + Math.min(30_000, 2000 * 2 ** Math.min(member.failures - 1, 4));
      this.logError(`ingest ${member.cast.short}`, error.message);
      return;
    }
    const result = IngestBatchResult.parse(data);
    member.failures = 0;
    member.queue.splice(0, batch.length);
    member.state = result.session.state;
    member.nextBeatAt = Date.now() + this.options.heartbeatMs * jitter();
    this.statsData.ingestOk += 1;
    this.statsData.eventsSent += result.accepted.length;
    this.statsData.ingestLatency.add(elapsed);
    if (isFinalState(result.session.state)) {
      member.finished = true;
      member.agenda = [];
    }
    if (member.queue.length > 0) member.nextBeatAt = Date.now();
    if (notable || this.options.verbose) this.note(member, label);
  }

  private async flushAnswers(): Promise<void> {
    if (this.answerQueue.length === 0) return;
    const rows = this.answerQueue.splice(0);
    const { error } = await this.options.client
      .from("answers")
      .upsert(rows, { onConflict: "session_id,question_id" });
    if (error) {
      this.answerQueue.unshift(...rows);
      this.logError("answers", error.message);
      return;
    }
    this.statsData.answersSaved += rows.length;
  }

  /** Reads states back (proctor pause, resume, end; session_tick) and acknowledges commands. */
  private async poll(): Promise<void> {
    const { client, exam } = this.options;
    const examRow = must(
      await client.from("exams").select("status, starts_at, duration_min").eq("id", exam.id).single(),
      "read exam",
    );
    exam.status = examRow.status;
    exam.startsAtMs = Date.parse(examRow.starts_at);
    exam.durationMin = examRow.duration_min;

    const byId = new Map(this.members.filter((m) => m.sessionId).map((m) => [m.sessionId as string, m]));
    const ids = [...byId.keys()];
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const rows = must(await client.from("sessions").select("id, state").in("id", chunk), "read sessions");
      for (const row of rows) {
        const member = byId.get(row.id);
        if (!member || member.state === row.state) continue;
        const before = member.state;
        member.state = row.state;
        if (isFinalState(row.state) && !member.finished) {
          member.finished = true;
          member.agenda = [];
          this.note(member, row.state === "ended" ? "ended by the proctor" : `now ${row.state}`);
        } else if (before === "writing" && row.state === "paused" && member.selfPausedAt === null) {
          this.note(member, "paused by the proctor");
        } else if (before === "paused" && row.state === "writing") {
          member.selfPausedAt = null;
        }
      }
      const acked = must(
        await client
          .from("session_commands")
          .update({ acked_at: new Date(this.options.clock.now()).toISOString() })
          .eq("exam_id", exam.id)
          .is("acked_at", null)
          .in("session_id", chunk)
          .select("session_id, type"),
        "acknowledge commands",
      );
      const byType = new Map<string, Member[]>();
      for (const command of acked) {
        const member = byId.get(command.session_id);
        if (member && command.type !== "start")
          byType.set(command.type, [...(byType.get(command.type) ?? []), member]);
      }
      for (const [type, members] of byType) {
        const [only] = members;
        if (members.length === 1 && only) this.note(only, `received the proctor's ${type}`);
        else this.options.log.info(`  ${members.length} simulated students received the proctor's ${type}`);
      }
    }
  }

  private note(member: Member, text: string): void {
    const seat = member.cast.seat === null ? "" : ` seat ${member.cast.seat}`;
    this.options.log.info(`  ${member.cast.short}${seat}: ${text}`);
  }

  /** Logs an error at most once every 10 s per label, so a dead network does not flood the terminal. */
  private logError(label: string, error: unknown): void {
    const now = Date.now();
    if (now - (this.loggedErrors.get(label) ?? 0) < 10_000) return;
    this.loggedErrors.set(label, now);
    this.options.log.warn(`${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 0.8 to 1.2, so heartbeats spread out. Not from the seeded stream: how many heartbeats run depends on
 * timing, and the script must stay the same for a seed.
 */
function jitter(): number {
  return 0.8 + 0.4 * Math.random();
}

/** "gaze.off_screen 2.05 s left", "phone.detected 0.94" for log lines. */
function describeDrafts(drafts: readonly EventDraft[]): string {
  const first = drafts[0];
  if (first === undefined) return "nothing";
  const data = first.data;
  const parts: string[] = [first.type];
  if (typeof data.duration_ms === "number") parts.push(`${(data.duration_ms / 1000).toFixed(2)} s`);
  if (typeof data.direction === "string") parts.push(data.direction);
  if (typeof data.score === "number") parts.push(data.score.toFixed(2));
  if (typeof data.host === "string") parts.push(data.host);
  return parts.join(" ");
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined && v !== null),
  ) as Partial<T>;
}
