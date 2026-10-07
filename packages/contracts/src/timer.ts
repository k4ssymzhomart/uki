// Exam time, owned by the server ("Timer" and "Session states" in docs/phase-0-plan.md).
// A session ends at starts_at + duration_min + extra_min + paused_s, the same sum as the SQL function
// `session_ends_at(sessions)`.
import { THRESHOLDS } from "./checks.ts";
import { toMs } from "./primitives.ts";

export type Instant = string | number | Date;

/** When the session ends. Late joiners get no extra time: the exam's `starts_at` counts, not the join. */
export function sessionEndsAt(
  exam: { starts_at: Instant; duration_min: number },
  session: { extra_min: number; paused_s: number },
): Date {
  const start = toMs(exam.starts_at);
  return new Date(start + (exam.duration_min + session.extra_min) * 60_000 + session.paused_s * 1000);
}

/**
 * Milliseconds left, never negative. While the session is paused, pass the pause's start as
 * `serverNowMs` so the timer stands still; it moves again from the new end once the resume is stored.
 */
export function remainingMs(endsAt: Instant, serverNowMs: number): number {
  return Math.max(0, toMs(endsAt) - serverNowMs);
}

/** Hours, minutes and seconds of a duration, rounded up to the next whole second, for a clock face. */
export function splitDuration(ms: number): { hours: number; minutes: number; seconds: number } {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return { hours: Math.floor(total / 3600), minutes: Math.floor((total % 3600) / 60), seconds: total % 60 };
}

export interface ClockSample {
  /** server time minus local time, in ms */
  offsetMs: number;
  /** request round trip, in ms */
  rttMs: number;
}

/**
 * One offset estimate from a request: `server_time` was read on the server somewhere between sending
 * and receiving, so the midpoint of the round trip is the best guess for it.
 */
export function clockSample(serverTime: Instant, sentAtMs: number, receivedAtMs: number): ClockSample {
  const rttMs = Math.max(0, receivedAtMs - sentAtMs);
  return { offsetMs: toMs(serverTime) - (sentAtMs + rttMs / 2), rttMs };
}

/**
 * Corrects the laptop clock from `server_time` in every `join_exam` and `ingest` reply. It keeps the
 * last `window` samples and trusts the one with the shortest round trip, which has the least
 * uncertainty.
 *
 *   const clock = new ClockOffset();
 *   const sent = Date.now(); const reply = await ingest(...); clock.update(reply.server_time, sent, Date.now());
 *   const serverNow = clock.now();
 */
export class ClockOffset {
  private samples: ClockSample[] = [];
  private readonly window: number;

  constructor(window = 8) {
    this.window = Math.max(1, Math.floor(window));
  }

  update(serverTime: Instant, sentAtMs: number, receivedAtMs: number): void {
    const sample = clockSample(serverTime, sentAtMs, receivedAtMs);
    if (!Number.isFinite(sample.offsetMs)) return;
    this.samples.push(sample);
    if (this.samples.length > this.window) this.samples.shift();
  }

  /** server time minus local time, in ms; 0 before the first sample */
  get offsetMs(): number {
    let best: ClockSample | undefined;
    for (const sample of this.samples) {
      if (best === undefined || sample.rttMs < best.rttMs) best = sample;
    }
    return best === undefined ? 0 : Math.round(best.offsetMs);
  }

  get hasSample(): boolean {
    return this.samples.length > 0;
  }

  /** Server time now, from the local clock. */
  now(localNowMs: number = Date.now()): number {
    return localNowMs + this.offsetMs;
  }
}

export interface PauseCreditInput {
  /** `at` of session.paused or proctor.paused */
  pauseAt: Instant;
  /** `at` of session.resumed or proctor.resumed */
  resumeAt: Instant;
  /** `received_at` of the pause event */
  pauseReceivedAt: Instant;
  /** `received_at` of the resume event */
  resumeReceivedAt: Instant;
  /** `proctor` when the pause event is proctor.paused, otherwise `self` */
  kind: "self" | "proctor";
  /** Seconds already given back for earlier self-pauses in this session */
  selfCreditSoFarS: number;
}

/**
 * Whole seconds this pause adds to `paused_s`. The pause lasts from the pause's `at` to the resume's
 * `at`, capped by the gap between their `received_at` times, so a forged or replayed event cannot add
 * time; partial seconds are dropped. Self-pauses give back at most 300 s per session in total; proctor
 * pauses give back all their time.
 *
 * SQL equivalent for the trigger:
 *   floor(greatest(0, least(extract(epoch from resume.at - pause.at),
 *                           extract(epoch from resume.received_at - pause.received_at))))::int
 *   then, for a self-pause, least(that, greatest(0, 300 - self_credit_so_far))
 */
export function pauseCredit(input: PauseCreditInput): number {
  const byClock = toMs(input.resumeAt) - toMs(input.pauseAt);
  const byServer = toMs(input.resumeReceivedAt) - toMs(input.pauseReceivedAt);
  const ms = Math.max(0, Math.min(byClock, byServer));
  const seconds = Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
  if (input.kind === "proctor") return seconds;
  const left = Math.max(0, THRESHOLDS.pause.selfGiveBackCapS - Math.max(0, input.selfCreditSoFarS));
  return Math.min(seconds, left);
}
