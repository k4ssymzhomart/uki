// Tile state for the live wall (2.4), its stat cards, sort and the Live events column. Pure functions:
// the dashboard feeds them its store and a 1-second ticker. Lines are structured data for i18n, never
// text. Phase 0 has no review table, so every phone.detected and face.second counts as unreviewed.
import { THRESHOLDS } from "./checks.ts";
import { type CompactEvent, PauseReason } from "./events.ts";
import { toMs } from "./primitives.ts";
import { type FinalState, isFinalState, type SessionState, type SessionStatus } from "./session.ts";

/** Tile states in the order their rules are tried; the first match wins. */
export const TILE_STATES = ["done", "paused", "no_signal", "flagged", "warning", "on_screen"] as const;
export type TileStateName = (typeof TILE_STATES)[number];

export const WARNING_EVENT_TYPES = ["gaze.off_screen", "gaze.down", "tab.blocked"] as const;
export type WarningEventType = (typeof WARNING_EVENT_TYPES)[number];
export const LOOK_AWAY_EVENT_TYPES = ["gaze.off_screen", "gaze.down"] as const;
export const FLAG_TILE_EVENT_TYPES = ["phone.detected", "face.second"] as const;
export const PAUSE_EVENT_TYPES = ["session.paused", "proctor.paused"] as const;

export type TileLine =
  /** "Final state": submitted, time up or ended. */
  | { kind: "done"; state: FinalState }
  /** "no face · 00:42", "camera lost · 00:10". Null when the pause event is not in the store. */
  | { kind: "paused"; reason: PauseReason | null; sinceMs: number | null }
  /** Time since the last ingest call; null when the session never called. */
  | { kind: "no_signal"; sinceMs: number | null }
  /** "phone 0.94 · 10:47", "second face · 10:45"; `at` is the event's ISO time. */
  | { kind: "flagged"; event: "phone" | "second_face"; score?: number; at: string }
  /** "looked away 3× · 6 s" from the counts, or "tab blocked · 10:44" when `last.type` is tab.blocked. */
  | {
      kind: "warning";
      lookedAwayCount: number;
      lookedAwayMs: number;
      last: { type: WarningEventType; at: string };
    }
  /** "on screen · Q 9" from `status.question`. */
  | { kind: "on_screen"; question?: number };

export interface TileResult {
  state: TileStateName;
  line: TileLine;
}

export interface TileSessionInput {
  /** When given, events of other sessions are ignored. */
  id?: string;
  state: SessionState;
  last_seen_at: string | null;
  /** Used for No signal when the session never called `ingest`. */
  joined_at?: string | null;
  status?: SessionStatus | null;
}

export interface TileInput {
  session: TileSessionInput;
  /** This session's events; duplicates by id are ignored. */
  events: readonly CompactEvent[];
  /**
   * Ids of flag events a person has reviewed. Phase 0 has no review table, so leave it out and every
   * phone.detected and face.second counts as unreviewed; Phase 1 passes the review queue's ids.
   */
  reviewedEventIds?: ReadonlySet<string>;
}

function byTimeDesc(a: CompactEvent, b: CompactEvent): number {
  return toMs(b.at) - toMs(a.at) || toMs(b.received_at) - toMs(a.received_at) || (b.id > a.id ? 1 : -1);
}

function uniqueEvents(events: readonly CompactEvent[], sessionId: string | undefined): CompactEvent[] {
  const seen = new Set<string>();
  const out: CompactEvent[] = [];
  for (const event of events) {
    if (sessionId !== undefined && event.session_id !== sessionId) continue;
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    out.push(event);
  }
  return out;
}

function latest(events: readonly CompactEvent[], types: readonly string[]): CompactEvent | undefined {
  let best: CompactEvent | undefined;
  for (const event of events) {
    if (!types.includes(event.type)) continue;
    if (best === undefined || byTimeDesc(event, best) < 0) best = event;
  }
  return best;
}

function sinceMs(from: string | null | undefined, nowMs: number): number | null {
  if (from === null || from === undefined) return null;
  const ms = toMs(from);
  return Number.isFinite(ms) ? Math.max(0, nowMs - ms) : null;
}

function numberField(data: Record<string, unknown>, key: string): number | undefined {
  const value = data[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** The tile for one session at `nowMs` (the dashboard's server-corrected clock), per the Live wall table. */
export function tileState(input: TileInput, nowMs: number): TileResult {
  const { session } = input;
  const events = uniqueEvents(input.events, session.id);

  // 1. Done
  if (isFinalState(session.state)) {
    return { state: "done", line: { kind: "done", state: session.state } };
  }

  // 2. Paused
  if (session.state === "paused") {
    const pause = latest(events, PAUSE_EVENT_TYPES);
    let reason: PauseReason | null = null;
    if (pause?.type === "proctor.paused") reason = "proctor";
    else if (pause !== undefined) {
      const parsed = PauseReason.safeParse(pause.data.reason);
      reason = parsed.success ? parsed.data : null;
    }
    return { state: "paused", line: { kind: "paused", reason, sinceMs: sinceMs(pause?.at, nowMs) } };
  }

  // 3. No signal
  const lastSeen = session.last_seen_at ?? session.joined_at ?? null;
  const silentMs = sinceMs(lastSeen, nowMs);
  if (silentMs === null || silentMs > THRESHOLDS.wall.noSignalMs) {
    return { state: "no_signal", line: { kind: "no_signal", sinceMs: silentMs } };
  }

  // 4. Flagged: any unreviewed phone.detected or face.second
  const reviewed = input.reviewedEventIds;
  const unreviewed = reviewed === undefined ? events : events.filter((event) => !reviewed.has(event.id));
  const flag = latest(unreviewed, FLAG_TILE_EVENT_TYPES);
  if (flag !== undefined) {
    const line: TileLine =
      flag.type === "phone.detected"
        ? { kind: "flagged", event: "phone", at: flag.at, ...scoreOf(flag) }
        : { kind: "flagged", event: "second_face", at: flag.at };
    return { state: "flagged", line };
  }

  // 5. Warning: gaze.off_screen, gaze.down or tab.blocked in the last 5 minutes
  const windowStart = nowMs - THRESHOLDS.wall.warningWindowMs;
  const recent = events.filter(
    (event) =>
      (WARNING_EVENT_TYPES as readonly string[]).includes(event.type) && toMs(event.at) >= windowStart,
  );
  const last = latest(recent, WARNING_EVENT_TYPES);
  if (last !== undefined) {
    let lookedAwayCount = 0;
    let lookedAwayMs = 0;
    for (const event of recent) {
      if (!(LOOK_AWAY_EVENT_TYPES as readonly string[]).includes(event.type)) continue;
      lookedAwayCount += 1;
      lookedAwayMs += Math.max(0, numberField(event.data, "duration_ms") ?? 0);
    }
    return {
      state: "warning",
      line: {
        kind: "warning",
        lookedAwayCount,
        lookedAwayMs,
        last: { type: last.type as WarningEventType, at: last.at },
      },
    };
  }

  // 6. On screen
  const question = session.status?.question ?? undefined;
  return {
    state: "on_screen",
    line: question === undefined ? { kind: "on_screen" } : { kind: "on_screen", question },
  };
}

function scoreOf(event: CompactEvent): { score?: number } {
  const score = numberField(event.data, "score");
  return score === undefined ? {} : { score };
}

export interface TileCounts {
  /** Stat card "On screen": writing sessions whose tile is on screen. */
  onScreen: number;
  /** "of all writing": sessions in state writing or paused. */
  writing: number;
  warnings: number;
  flagged: number;
  paused: number;
  noSignal: number;
  done: number;
  total: number;
}

/** Stat cards: On screen of all writing, Warnings, Flagged, Paused. */
export function countTiles(
  tiles: readonly { session: { state: SessionState }; tile: TileResult }[],
): TileCounts {
  const counts: TileCounts = {
    onScreen: 0,
    writing: 0,
    warnings: 0,
    flagged: 0,
    paused: 0,
    noSignal: 0,
    done: 0,
    total: 0,
  };
  for (const { session, tile } of tiles) {
    counts.total += 1;
    if (session.state === "writing" || session.state === "paused") counts.writing += 1;
    switch (tile.state) {
      case "on_screen":
        if (session.state === "writing") counts.onScreen += 1;
        break;
      case "warning":
        counts.warnings += 1;
        break;
      case "flagged":
        counts.flagged += 1;
        break;
      case "paused":
        counts.paused += 1;
        break;
      case "no_signal":
        counts.noSignal += 1;
        break;
      case "done":
        counts.done += 1;
        break;
    }
  }
  return counts;
}

/** "Flags first" order: flagged, warning, paused, no signal, on screen, done. */
export const FLAGS_FIRST_ORDER: Record<TileStateName, number> = {
  flagged: 0,
  warning: 1,
  paused: 2,
  no_signal: 3,
  on_screen: 4,
  done: 5,
};

export type TileSort = "flags" | "seat";

export interface SortableTile {
  id: string;
  seat: number | null;
  tile: TileResult;
}

function bySeat(a: SortableTile, b: SortableTile): number {
  if (a.seat !== b.seat) {
    if (a.seat === null) return 1;
    if (b.seat === null) return -1;
    return a.seat - b.seat;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * A sorted copy. `flags`: by FLAGS_FIRST_ORDER, then seat. `seat`: by seat, seats missing last.
 * Ties fall back to the session id, so the order is stable between renders.
 */
export function sortTiles<T extends SortableTile>(tiles: readonly T[], order: TileSort = "flags"): T[] {
  const copy = [...tiles];
  if (order === "seat") return copy.sort(bySeat);
  return copy.sort(
    (a, b) => FLAGS_FIRST_ORDER[a.tile.state] - FLAGS_FIRST_ORDER[b.tile.state] || bySeat(a, b),
  );
}

/**
 * The Live events column: flag and log events only, deduplicated by id, newest first by `received_at`
 * (then by id, which is time-ordered for UUIDv7), at most `cap`.
 */
export function liveFeed(
  events: readonly CompactEvent[],
  cap: number = THRESHOLDS.wall.liveFeedCap,
): CompactEvent[] {
  const seen = new Set<string>();
  const kept: CompactEvent[] = [];
  for (const event of events) {
    if (event.review === "none" || seen.has(event.id)) continue;
    seen.add(event.id);
    kept.push(event);
  }
  kept.sort((a, b) => toMs(b.received_at) - toMs(a.received_at) || (b.id > a.id ? 1 : b.id < a.id ? -1 : 0));
  return kept.slice(0, Math.max(0, cap));
}
