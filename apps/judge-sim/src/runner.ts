// The simulator's loop, once a second: poll DEMO-LIVE's status (its run and how many walls are open),
// pick the cadence (idle or watched, within the day's Realtime budget), move each student along (sign
// in once, refresh, join, check in, heartbeat, the next step of its episode), and start the class's
// next incident or answer when it is due. Every network call runs in the background, at most a few at
// a time, one per student.
import { DemoLiveStatus } from "@uki/contracts";
import { ApiError, type SimApi } from "./api.ts";
import { DailyBudget, JOIN_BROADCASTS } from "./budget.ts";
import type { Config } from "./config.ts";
import { type EpisodeKind, type EpisodePlan, planEpisode, type StillName, stepCost } from "./episodes.ts";
import type { Logger } from "./log.ts";
import type { Rng } from "./rng.ts";
import {
  CADENCE,
  chooseIncident,
  chooseStudent,
  heartbeatDue,
  heartbeatPeriodMs,
  type Mode,
  nextAnswerDelayMs,
  nextIncidentDelayMs,
} from "./scheduler.ts";
import { type StateStore, signInAllowed } from "./state.ts";
import { describe, type ExamRun, SimStudent } from "./student.ts";

export interface SimulatorDeps {
  api: SimApi;
  store: StateStore;
  log: Logger;
  config: Config;
  stills: Readonly<Record<StillName, Uint8Array>>;
  rng: Rng;
  /** The local clock (tests pass a fake). */
  now?: () => number;
  version?: string;
}

const MAX_IN_FLIGHT = 6;
const SUMMARY_EVERY_MS = 5 * 60_000;
const ALIVE_EVERY_MS = 30_000;

type Counters = Record<
  "heartbeats" | "incidents" | "answers" | "asks" | "stills" | "joins" | "signIns" | "refreshes" | "errors",
  number
>;

const zero = (): Counters => ({
  heartbeats: 0,
  incidents: 0,
  answers: 0,
  asks: 0,
  stills: 0,
  joins: 0,
  signIns: 0,
  refreshes: 0,
  errors: 0,
});

export class Simulator {
  readonly students: SimStudent[];
  mode: Mode = "idle";
  viewers = 0;
  run: ExamRun | null = null;
  examStatus: string | null = null;
  private offsetMs = 0;
  private readonly budget: DailyBudget;
  private ledger: number[];
  private nextPollAt = 0;
  private nextIncidentAt = 0;
  private nextAnswerAt = 0;
  private lastAskAt: number | null = null;
  private inFlight = 0;
  private nextAliveAt = 0;
  private nextSummaryAt: number;
  private nextBudgetNoteAt = 0;
  private counters: Counters = zero();
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopping = false;
  private polling = false;
  private signingIn = false;
  private signInRetryAt = 0;
  private readonly now: () => number;

  constructor(private readonly deps: SimulatorDeps) {
    this.now = deps.now ?? Date.now;
    const now = this.now();
    deps.store.init();
    this.ledger = deps.store.loadLedger();
    this.budget = new DailyBudget(
      deps.config.dailyMessageBudget,
      deps.config.students.length,
      now,
      deps.store.loadBudget(),
    );
    this.nextSummaryAt = now + SUMMARY_EVERY_MS;
    this.students = deps.config.students.map(
      (number) =>
        new SimStudent(number, deps.rng.next(), {
          api: deps.api,
          store: deps.store,
          stills: deps.stills,
          serverNow: () => this.now() + this.offsetMs,
          observeServerTime: (iso) => {
            const ms = Date.parse(iso);
            if (Number.isFinite(ms)) this.offsetMs = ms - this.now();
          },
        }),
    );
    this.nextIncidentAt = now + nextIncidentDelayMs(deps.rng, CADENCE.idle);
  }

  start(): void {
    const { config, log } = this.deps;
    log.info(
      `judge-sim ${this.deps.version ?? ""} starting: ${this.students.length} students on ${config.examCode} at ${hostOf(config.url)}; ` +
        `${this.students.filter((s) => s.signedIn).length} have a stored sign-in`,
    );
    this.timer = setInterval(() => this.tick(), 1000);
    this.tick();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.timer !== null) clearInterval(this.timer);
    const until = this.now() + 5000;
    while (this.inFlight > 0 && this.now() < until) await new Promise((resolve) => setTimeout(resolve, 100));
    this.saveBudget();
    this.deps.log.info("judge-sim stopped");
  }

  /** One pass of the loop; public for tests. */
  tick(): void {
    if (this.stopping) return;
    const now = this.now();
    try {
      this.maybePoll(now);
      this.decideMode(now);
      this.driveStudents(now);
      this.driveEpisodes(now);
      this.maybeAlive(now);
      this.maybeSummary(now);
    } catch (error) {
      this.counters.errors += 1;
      this.deps.log.error(`tick: ${describe(error)}`);
    }
  }

  private launch(student: SimStudent | null, work: () => Promise<void>): void {
    if (student !== null) student.busy = true;
    this.inFlight += 1;
    work()
      .catch((error: unknown) => {
        this.counters.errors += 1;
        this.deps.log.warn(`${student?.number ?? "poll"}: ${describe(error)}`);
      })
      .finally(() => {
        if (student !== null) student.busy = false;
        this.inFlight -= 1;
      });
  }

  private room(): boolean {
    return this.inFlight < MAX_IN_FLIGHT;
  }

  // ---------------------------------------------------------------------------------------------------
  // DEMO-LIVE's status, the cadence

  private maybePoll(now: number): void {
    if (this.polling || now < this.nextPollAt || !this.room()) return;
    const student = this.students.find((s) => s.token() !== null && !s.needsRefresh(now));
    if (student === undefined) {
      this.nextPollAt = now + 5000;
      return;
    }
    const token = student.token() as string;
    this.polling = true;
    this.nextPollAt = now + CADENCE[this.mode].pollS * 1000;
    this.launch(null, async () => {
      try {
        const status = await this.deps.api.rpc("demo_live_status", {}, token, DemoLiveStatus);
        this.applyStatus(status, this.now());
      } catch (error) {
        if (error instanceof ApiError && error.status === 401 && student.file.auth !== null) {
          student.adoptAuth({ ...student.file.auth, expires_at: 1 });
        }
        throw error;
      } finally {
        this.polling = false;
      }
    });
  }

  /** Public for tests. */
  applyStatus(status: DemoLiveStatus, now: number): void {
    const serverMs = Date.parse(status.server_time);
    if (Number.isFinite(serverMs)) this.offsetMs = serverMs - now;
    this.viewers = status.viewers;
    const exam = status.exam;
    if (exam === null) {
      if (this.run !== null) this.deps.log.warn(`${this.deps.config.examCode} is gone; waiting for it`);
      this.run = null;
      this.examStatus = null;
      return;
    }
    const previous = this.run;
    this.run = { id: exam.id, startsAt: exam.starts_at };
    if (exam.status !== this.examStatus) this.deps.log.info(`${this.deps.config.examCode} is ${exam.status}`);
    this.examStatus = exam.status;
    if (previous !== null && previous.startsAt !== exam.starts_at) {
      this.deps.log.info(`rollover: a new run began at ${exam.starts_at}; every student joins again`);
    }
    for (const student of this.students) {
      if (student.joined && student.file.exam_starts_at !== exam.starts_at) student.dropSession();
      if (student.hold.kind === "until_rollover" && student.hold.startsAt !== exam.starts_at) {
        student.hold = { kind: "none" };
      }
    }
  }

  private decideMode(now: number): void {
    const wanted = this.viewers > 0;
    const allowed = wanted && this.budget.allowsWatched(now, this.viewers);
    const mode: Mode = allowed ? "watched" : "idle";
    if (wanted && !allowed && now >= this.nextBudgetNoteAt) {
      this.deps.log.warn(
        `a wall is open, but today's Realtime budget (${this.budget.spent(now).toFixed(0)} of ${this.budget.limit}) keeps the idle cadence until 00:00 UTC`,
      );
      this.nextBudgetNoteAt = now + 3_600_000;
    }
    if (mode === this.mode) return;
    this.mode = mode;
    this.deps.log.info(
      mode === "watched"
        ? `watched: ${this.viewers} wall(s) open; full cadence`
        : "idle: no wall open; idle cadence",
    );
    if (mode === "watched") {
      this.nextIncidentAt = now + this.deps.rng.int(3000, 10_000);
      this.nextAnswerAt = now + this.deps.rng.int(10_000, 30_000);
      this.nextPollAt = Math.min(this.nextPollAt, now + CADENCE.watched.pollS * 1000);
    } else {
      this.nextIncidentAt = now + nextIncidentDelayMs(this.deps.rng, CADENCE.idle);
    }
  }

  // ---------------------------------------------------------------------------------------------------
  // Students

  private driveStudents(now: number): void {
    const cadence = CADENCE[this.mode];
    for (const student of this.students) {
      if (!this.room()) return;
      if (!student.ready(now)) continue;

      if (!student.signedIn) {
        this.maybeSignIn(student, now);
        continue;
      }
      if (student.needsRefresh(now)) {
        this.launch(student, async () => {
          const result = await student.refresh(this.now());
          if (result === "ok") this.counters.refreshes += 1;
          if (result === "lost")
            this.deps.log.warn(`${student.number}: sign-in lost; a new anonymous user follows`);
        });
        continue;
      }
      const run = this.run;
      if (run === null || this.examStatus !== "live") continue;
      if (student.hold.kind === "until_rollover") continue;

      if (!student.joined || student.questions.length === 0) {
        this.launch(student, async () => {
          const result = await student.join(this.deps.config.examCode, run, this.now());
          if (result === "joined") {
            this.counters.joins += 1;
            this.budget.record(1, this.viewers, this.now());
          } else if (result === "held") {
            this.deps.log.warn(
              `${student.number}: ${student.hold.kind === "none" ? "waiting" : holdReason(student)}`,
            );
          }
        });
        continue;
      }
      if (!student.file.checked_in) {
        const step = student.checkInStep(Math.round(this.deps.rng.between(0.82, 0.96) * 100) / 100);
        this.launch(student, async () => {
          const result = await student.send(step, this.now(), true);
          if (result.ok) this.budget.record(JOIN_BROADCASTS - 1, this.viewers, this.now());
        });
        continue;
      }
      const due = student.pending[0];
      if (due !== undefined && now >= due.atMs) {
        student.pending.shift();
        this.sendStep(student, due.step, "step");
        continue;
      }
      if (heartbeatDue(student.lastWriteAtMs, now, heartbeatPeriodMs(cadence, student.heartbeatJitter))) {
        this.launch(student, async () => {
          if (await student.heartbeat(this.now())) {
            this.counters.heartbeats += 1;
            this.budget.record(1, this.viewers, this.now());
          }
        });
      }
    }
  }

  private maybeSignIn(student: SimStudent, now: number): void {
    if (this.signingIn || now < this.signInRetryAt) return;
    const check = signInAllowed(this.ledger, now);
    this.ledger = check.ledger;
    if (!check.allowed) {
      this.signInRetryAt = check.retryAtMs;
      return;
    }
    this.signingIn = true;
    this.ledger = [...this.ledger, now];
    this.deps.store.saveLedger(this.ledger);
    this.launch(student, async () => {
      try {
        const auth = await this.deps.api.signInAnonymously(this.now());
        student.adoptAuth(auth);
        this.counters.signIns += 1;
        this.deps.log.info(`${student.number}: signed in as a new anonymous user (stored for every restart)`);
      } catch (error) {
        // The project's limit (429) or a network error: try again in five minutes.
        this.signInRetryAt = this.now() + 5 * 60_000;
        throw error;
      } finally {
        this.signingIn = false;
      }
    });
  }

  // ---------------------------------------------------------------------------------------------------
  // Episodes

  private driveEpisodes(now: number): void {
    if (this.run === null || this.examStatus !== "live") return;
    const cadence = CADENCE[this.mode];
    if (now >= this.nextIncidentAt) {
      const kind = chooseIncident(this.deps.rng, cadence, this.lastAskAt, now);
      if (this.startEpisode(kind, now)) {
        if (kind === "ask_proctor") this.lastAskAt = now;
        this.nextIncidentAt = now + nextIncidentDelayMs(this.deps.rng, cadence);
      } else {
        this.nextIncidentAt = now + 5000;
      }
    }
    if (cadence.answerEveryS !== null && now >= this.nextAnswerAt) {
      const writers = this.students.filter((s) => s.writing(now)).length;
      this.startEpisode("answer", now);
      this.nextAnswerAt = now + (nextAnswerDelayMs(this.deps.rng, cadence, Math.max(writers, 1)) ?? 60_000);
    }
  }

  private startEpisode(kind: EpisodeKind, now: number): boolean {
    if (!this.room()) return false;
    const student = chooseStudent(
      this.deps.rng,
      this.students
        .filter((s) => s.writing(now))
        .map((s) => ({ number: s.number, lastEpisodeAtMs: s.lastEpisodeAtMs, student: s })),
    )?.student;
    if (student === undefined) return false;
    const plan: EpisodePlan = planEpisode(kind, this.deps.rng, {
      gazeS: student.checks.gazeS,
      faceMissingS: student.checks.faceMissingS,
      locale: student.locale,
      next: student.nextQuestion(),
      questionCount: student.questions.length,
    });
    const [first, ...rest] = plan.steps;
    if (first === undefined) return false;
    student.lastEpisodeAtMs = now;
    student.pending = rest.map((step) => ({ atMs: now + step.afterMs, step }));
    student.episodeUntilMs = now + (rest.at(-1)?.afterMs ?? 0) + 5000;
    this.sendStep(student, first, kind);
    return true;
  }

  private sendStep(student: SimStudent, step: EpisodePlan["steps"][number], label: string): void {
    this.launch(student, async () => {
      const result = await student.send(step, this.now());
      if (!result.ok) return;
      this.budget.record(stepCost(step).broadcasts, this.viewers, this.now());
      this.counters.stills += result.stills;
      if (label === "answer") this.counters.answers += 1;
      else if (label === "ask_proctor") this.counters.asks += 1;
      else if (label !== "step") this.counters.incidents += 1;
    });
  }

  // ---------------------------------------------------------------------------------------------------
  // Health

  private saveBudget(): void {
    try {
      this.deps.store.saveBudget(this.budget.snapshot(this.now()));
    } catch (error) {
      this.deps.log.warn(`budget.json: ${describe(error)}`);
    }
  }

  private online(): number {
    const now = this.now();
    return this.students.filter(
      (s) => s.joined && s.lastWriteAtMs !== null && now - s.lastWriteAtMs < 6 * 60_000,
    ).length;
  }

  private maybeAlive(now: number): void {
    if (now < this.nextAliveAt) return;
    this.nextAliveAt = now + ALIVE_EVERY_MS;
    try {
      this.deps.store.saveAlive({
        pid: process.pid,
        at: new Date(now).toISOString(),
        mode: this.mode,
        viewers: this.viewers,
        online: this.online(),
        students: this.students.length,
        run: this.run?.startsAt ?? null,
        rss_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      });
      this.saveBudget();
    } catch (error) {
      this.deps.log.warn(`alive.json: ${describe(error)}`);
    }
  }

  private maybeSummary(now: number): void {
    if (now < this.nextSummaryAt) return;
    this.nextSummaryAt = now + SUMMARY_EVERY_MS;
    const c = this.counters;
    const held = this.students
      .filter((s) => s.hold.kind !== "none")
      .map((s) => `${s.number} (${holdReason(s)})`);
    this.deps.log.info(
      `${this.mode}, ${this.viewers} wall(s) open, ${this.online()}/${this.students.length} online, ` +
        `run ${this.run?.startsAt ?? "unknown"}, budget ${this.budget.spent(now).toFixed(0)}/${this.budget.limit}; ` +
        `last 5 min: ${c.heartbeats} heartbeats, ${c.incidents} incidents, ${c.answers} answers, ${c.asks} asks, ` +
        `${c.stills} stills, ${c.joins} joins, ${c.signIns} sign-ins, ${c.refreshes} refreshes, ${c.errors} errors, ` +
        `rss ${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB` +
        (held.length > 0 ? `; waiting: ${held.join(", ")}` : ""),
    );
    this.counters = zero();
  }
}

function holdReason(student: SimStudent): string {
  const hold = student.hold;
  return hold.kind === "none" ? "none" : hold.reason;
}

function hostOf(url: string | null): string {
  if (url === null) return "(no project)";
  try {
    return new URL(url).host;
  } catch {
    return "(project)";
  }
}
