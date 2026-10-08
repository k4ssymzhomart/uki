// The free plan's limits and what the simulator spends of them: the arithmetic in
// docs/runbooks/judge-mode.md comes from here (`--dry-run` prints it), and DailyBudget keeps the
// simulator inside its share of Realtime messages day by day, however many judges watch. Pure.
import { type EpisodeKind, type EpisodePlan, INCIDENT_KINDS, planCost, planEpisode } from "./episodes.ts";
import { createRng } from "./rng.ts";
import { CADENCE, type Cadence, heartbeatPeriodMs, INCIDENT_WEIGHTS, type Mode } from "./scheduler.ts";

const KB = 1024;
const MB = 1024 * KB;
const GB = 1024 * MB;

/**
 * Supabase Free plan quotas, from https://supabase.com/docs/guides/platform/billing-on-supabase,
 * .../manage-your-usage/realtime-messages and .../auth/rate-limits, read on 9 October 2026. Realtime
 * counts a broadcast as one message sent plus one per client that receives it.
 */
export const FREE_PLAN = {
  realtimeMessagesPerMonth: 2_000_000,
  realtimePeakConnections: 200,
  edgeFunctionInvocationsPerMonth: 500_000,
  egressBytesPerMonth: 5 * GB,
  storageBytes: 1 * GB,
  databaseBytes: 500 * MB,
  monthlyActiveUsers: 50_000,
  /** The project's anonymous sign-in limit per IP address (Authentication > Rate limits). */
  anonymousSignInsPerHour: 30,
} as const;

/** The simulator's share of Realtime messages per UTC day: 35,000 × 30 = 1.05 million, 52.5 % of the plan. */
export const DAILY_MESSAGE_BUDGET = 35_000;
/** New anonymous users at most per rolling hour, under the project's 30 per IP. */
export const SIGN_INS_PER_HOUR = 25;

/** Bytes that leave Supabase per call (response body and headers), measured on the local stack and rounded up. */
export const EGRESS_BYTES = {
  rpc: 0.9 * KB,
  ingest: 1.6 * KB,
  upload: 0.4 * KB,
  join: 14 * KB,
  refresh: 2 * KB,
  /** One Realtime message to one watching dashboard. */
  realtimeMessage: 0.5 * KB,
  /** A JPEG still, when a judge opens it. */
  still: 46 * KB,
} as const;

/** A joined student's first ingest call: identity.matched and exam.started with step ready. */
export const JOIN_BROADCASTS = 5;

/** What one hour of a cadence costs the class, before anyone watches. */
export interface HourCost {
  broadcasts: number;
  invocations: number;
  egressBytes: number;
  stillsBytes: number;
  heartbeats: number;
  incidents: number;
  answers: number;
  asks: number;
}

/** A representative plan per kind: the shape (events, stills, steps) never depends on the random draws. */
function representative(kind: EpisodeKind): EpisodePlan {
  return planEpisode(kind, createRng(1), {
    gazeS: 2,
    faceMissingS: 10,
    locale: "kk",
    next: { id: "00000000-0000-4000-8000-000000000001", position: 1, choiceIds: ["a", "b"] },
    questionCount: 20,
  });
}

/** Mean cost of one incident slot drawn with INCIDENT_WEIGHTS. */
export function meanIncidentCost(): { broadcasts: number; invocations: number; stills: number } {
  const total = INCIDENT_KINDS.reduce((sum, kind) => sum + INCIDENT_WEIGHTS[kind], 0);
  return INCIDENT_KINDS.reduce(
    (sum, kind) => {
      const cost = planCost(representative(kind));
      const share = INCIDENT_WEIGHTS[kind] / total;
      return {
        broadcasts: sum.broadcasts + cost.broadcasts * share,
        invocations: sum.invocations + cost.invocations * share,
        stills: sum.stills + cost.stills * share,
      };
    },
    { broadcasts: 0, invocations: 0, stills: 0 },
  );
}

/** One hour of `mode` for `students` writing students, with no viewer. */
export function hourCost(mode: Mode, students: number, cadence: Cadence = CADENCE[mode]): HourCost {
  const meanPeriodS = heartbeatPeriodMs(cadence, 0.5) / 1000;
  const heartbeats = (students * 3600) / meanPeriodS;
  const slots = 3600 / cadence.incidentEveryS;
  const asks =
    cadence.askMinGapS === null ? 0 : Math.min(slots * cadence.askChance, 3600 / cadence.askMinGapS);
  const incidents = slots - asks;
  const answers = cadence.answerEveryS === null ? 0 : (students * 3600) / cadence.answerEveryS;
  const incident = meanIncidentCost();
  const ask = planCost(representative("ask_proctor"));
  const answer = planCost(representative("answer"));
  const polls = 3600 / cadence.pollS;
  const broadcasts =
    heartbeats + incidents * incident.broadcasts + asks * ask.broadcasts + answers * answer.broadcasts;
  const invocations =
    incidents * incident.invocations + asks * ask.invocations + answers * answer.invocations;
  const stills = incidents * incident.stills;
  // Every Edge Function call is counted at ingest's reply size (frames answers less), plus each upload's.
  const egressBytes =
    (heartbeats + polls + answers) * EGRESS_BYTES.rpc +
    invocations * EGRESS_BYTES.ingest +
    stills * EGRESS_BYTES.upload +
    ((students * 3600) / 3300) * EGRESS_BYTES.refresh;
  return {
    broadcasts,
    invocations,
    egressBytes,
    stillsBytes: stills * EGRESS_BYTES.still,
    heartbeats,
    incidents,
    answers,
    asks,
  };
}

export interface MonthEstimate {
  realtimeMessages: number;
  invocations: number;
  egressBytes: number;
  /** The most stills Storage holds at once: one 690-minute run, plus one run of leftovers. */
  storageBytes: number;
  watchedHoursPerDay: number;
}

/**
 * Thirty days of 24/7 running: `watchedHoursPerDay` hours in the watched cadence with `viewers` walls
 * open, the rest idle, two rollovers a day (every student joins again). Each judge also opens
 * `stillViewsPerDay` stills.
 */
export function monthEstimate(options: {
  students: number;
  watchedHoursPerDay: number;
  viewers: number;
  stillViewsPerDay?: number;
}): MonthEstimate {
  const { students, viewers } = options;
  const watchedHours = Math.min(Math.max(options.watchedHoursPerDay, 0), 24);
  const idle = hourCost("idle", students);
  const watched = hourCost("watched", students);
  const joins = students * 2;
  const dayMessages =
    idle.broadcasts * (24 - watchedHours) +
    watched.broadcasts * watchedHours * (1 + viewers) +
    joins * JOIN_BROADCASTS;
  const dayInvocations = idle.invocations * (24 - watchedHours) + watched.invocations * watchedHours + joins;
  const dayEgress =
    idle.egressBytes * (24 - watchedHours) +
    watched.egressBytes * watchedHours +
    watched.broadcasts * watchedHours * viewers * EGRESS_BYTES.realtimeMessage +
    joins * EGRESS_BYTES.join +
    (options.stillViewsPerDay ?? 50) * EGRESS_BYTES.still;
  const runHours = (720 - 30) / 60;
  const watchedPerRun = Math.min(watchedHours, runHours);
  const runStills = idle.stillsBytes * (runHours - watchedPerRun) + watched.stillsBytes * watchedPerRun;
  return {
    realtimeMessages: dayMessages * 30,
    invocations: dayInvocations * 30,
    egressBytes: dayEgress * 30,
    storageBytes: runStills * 2,
    watchedHoursPerDay: watchedHours,
  };
}

/** Watched hours a day the daily message budget allows with `viewers` open walls. */
export function watchedHoursAllowed(
  students: number,
  viewers: number,
  budget = DAILY_MESSAGE_BUDGET,
): number {
  const idle = hourCost("idle", students).broadcasts;
  const watched = hourCost("watched", students).broadcasts * (1 + viewers);
  const fixed = idle * 24 + students * 2 * JOIN_BROADCASTS;
  if (watched <= idle) return 24;
  return Math.max(0, Math.min(24, (budget - fixed) / (watched - idle)));
}

function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function endOfUtcDay(ms: number): number {
  const day = new Date(ms);
  return Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + 1);
}

export interface BudgetSnapshot {
  day: string;
  spent: number;
}

/**
 * The day's Realtime messages, as the simulator causes them: each broadcast counts once, plus once per
 * open wall at the time. Watched mode runs only while the day keeps room for idle until midnight UTC plus
 * ten more watched minutes; idle never stops (its heartbeats keep the class and the indicator alive).
 */
export class DailyBudget {
  private day: string;
  private spentToday: number;

  constructor(
    readonly limit: number,
    readonly students: number,
    nowMs: number,
    restored: BudgetSnapshot | null = null,
  ) {
    this.day = utcDay(nowMs);
    this.spentToday = restored !== null && restored.day === this.day ? Math.max(0, restored.spent) : 0;
  }

  private roll(nowMs: number): void {
    const day = utcDay(nowMs);
    if (day !== this.day) {
      this.day = day;
      this.spentToday = 0;
    }
  }

  record(broadcasts: number, viewers: number, nowMs: number): void {
    this.roll(nowMs);
    this.spentToday += broadcasts * (1 + Math.max(0, viewers));
  }

  spent(nowMs: number): number {
    this.roll(nowMs);
    return this.spentToday;
  }

  allowsWatched(nowMs: number, viewers: number): boolean {
    this.roll(nowMs);
    const hoursLeft = (endOfUtcDay(nowMs) - nowMs) / 3_600_000;
    const reserve = hourCost("idle", this.students).broadcasts * hoursLeft;
    const tenMinutes = (hourCost("watched", this.students).broadcasts * (1 + Math.max(0, viewers))) / 6;
    return this.spentToday + reserve + tenMinutes <= this.limit;
  }

  snapshot(nowMs: number): BudgetSnapshot {
    this.roll(nowMs);
    return { day: this.day, spent: Math.round(this.spentToday) };
  }
}

/** Per cent of a quota, one decimal. */
export function percent(value: number, quota: number): string {
  return `${((value / quota) * 100).toFixed(1)} %`;
}
