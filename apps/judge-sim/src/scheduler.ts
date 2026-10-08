// When things happen: the two cadences (idle while nobody watches the DEMO-LIVE wall, watched while
// someone does), the class-wide streams of incidents and answers, who plays the next episode, and when
// a student's heartbeat is due. Pure; the runner (runner.ts) feeds it the clock and the students.
import { type EpisodeKind, INCIDENT_KINDS, type IncidentKind } from "./episodes.ts";
import type { Rng } from "./rng.ts";

export type Mode = "idle" | "watched";

export interface Cadence {
  /** Seconds between two writes of a student's last_seen_at (session_heartbeat or an ingest call). */
  heartbeatS: number;
  /** Seconds between two demo_live_status polls. */
  pollS: number;
  /** Mean seconds between two incidents in the whole class. */
  incidentEveryS: number;
  /** Mean seconds between two answers of one writing student; null: no answers. */
  answerEveryS: number | null;
  /** Seconds at least between two Ask proctor requests; null: none. */
  askMinGapS: number | null;
  /** Chance that an incident slot is an Ask proctor request, when one is allowed. */
  askChance: number;
}

/**
 * Idle keeps every tile seen every 5 minutes and plays an incident every 5 minutes, so an opened wall
 * has the last hour's flags; it polls every 5 s so a judge who opens the wall wakes the class within
 * seconds. Watched keeps every tile online (the wall shows No signal after 30 s, so 20 s), plays an
 * incident every 30 s, an answer per student every 6 minutes and Ask proctor at most every 10 minutes.
 */
export const CADENCE: Readonly<Record<Mode, Cadence>> = {
  idle: {
    heartbeatS: 300,
    pollS: 5,
    incidentEveryS: 300,
    answerEveryS: null,
    askMinGapS: null,
    askChance: 0,
  },
  watched: {
    heartbeatS: 20,
    pollS: 15,
    incidentEveryS: 30,
    answerEveryS: 360,
    askMinGapS: 600,
    askChance: 0.2,
  },
};

/** How often each incident is picked, relative to the others. */
export const INCIDENT_WEIGHTS: Readonly<Record<IncidentKind, number>> = {
  phone_hand: 3,
  phone_raised: 2,
  look_down: 3,
  glance_left: 2,
  glance_right: 2,
  second_face: 1.5,
  absent: 1.5,
  app_switch: 2,
  forbidden_app: 1.5,
};

/** The wall's No signal threshold (THRESHOLDS.wall.noSignalMs); a watched heartbeat must stay well under it. */
export const NO_SIGNAL_MS = 30_000;

/** Delay to the next incident: the mean, spread 0.5 to 1.5 times. */
export function nextIncidentDelayMs(rng: Rng, cadence: Cadence): number {
  return Math.round(cadence.incidentEveryS * 1000 * rng.between(0.5, 1.5));
}

/** Delay to the next answer in the class, or null without answers or writers. */
export function nextAnswerDelayMs(rng: Rng, cadence: Cadence, writers: number): number | null {
  if (cadence.answerEveryS === null || writers < 1) return null;
  return Math.round(((cadence.answerEveryS * 1000) / writers) * rng.between(0.5, 1.5));
}

/** The next incident slot's episode: an Ask proctor request when allowed and drawn, otherwise an incident. */
export function chooseIncident(
  rng: Rng,
  cadence: Cadence,
  lastAskAtMs: number | null,
  nowMs: number,
): EpisodeKind {
  const askAllowed =
    cadence.askMinGapS !== null && (lastAskAtMs === null || nowMs - lastAskAtMs >= cadence.askMinGapS * 1000);
  if (askAllowed && rng.chance(cadence.askChance)) return "ask_proctor";
  return rng.weighted(INCIDENT_WEIGHTS);
}

export interface Candidate {
  number: string;
  /** When this student last played an episode (0 when never). */
  lastEpisodeAtMs: number;
}

/** A random one of the five who played longest ago, so episodes spread over the class. */
export function chooseStudent<T extends Candidate>(rng: Rng, candidates: readonly T[]): T | null {
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort(
    (a, b) => a.lastEpisodeAtMs - b.lastEpisodeAtMs || a.number.localeCompare(b.number),
  );
  return rng.pick(sorted.slice(0, 5));
}

/**
 * Each student's own heartbeat period: the cadence's, shortened by up to 15 % (watched: by up to 2 s), so
 * students that joined together drift apart and the tiles' writes spread over the period.
 */
export function heartbeatPeriodMs(cadence: Cadence, jitter: number): number {
  const base = cadence.heartbeatS * 1000;
  const cut = Math.min(base * 0.15, base <= NO_SIGNAL_MS ? 2000 : Number.POSITIVE_INFINITY);
  return Math.round(base - cut * Math.min(Math.max(jitter, 0), 1));
}

export function heartbeatDue(lastWriteAtMs: number | null, nowMs: number, periodMs: number): boolean {
  return lastWriteAtMs === null || nowMs - lastWriteAtMs >= periodMs;
}

/** All incident kinds, for the dry run's table. */
export const ALL_INCIDENTS: readonly IncidentKind[] = INCIDENT_KINDS;
