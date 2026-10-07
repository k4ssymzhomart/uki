// Tiles derived from the store with the contracts' wall rules (tileState, countTiles, sortTiles,
// liveFeed). Results are cached per store snapshot, so the stat cards, the order and 125 tiles share
// one computation per tick.
import {
  CommandGroupId,
  type CompactEvent,
  countTiles,
  liveFeed,
  sortTiles,
  type TileCounts,
  type TileLine,
  type TileResult,
  type TileSort,
  type TileStateName,
  tileState,
} from "@uki/contracts";
import { formatTime } from "@uki/i18n";
import type { StudentTileState } from "@uki/ui";
import { formatClock, toSeconds } from "./durations.ts";
import { shortName } from "./names.ts";
import { message, sameMessage, type WallMessage } from "./wall-message.ts";
import type { WallState } from "./wall-store.ts";

/**
 * StudentTile draws Figma's ok, warn, flag and paused states only (docs/decisions.md, UI kit): Done
 * shows as ok with its final state in the line, No signal as paused (the sleeping face, idle dot).
 */
export const TILE_TONE: Record<TileStateName, StudentTileState> = {
  on_screen: "ok",
  warning: "warn",
  flagged: "flag",
  paused: "paused",
  no_signal: "paused",
  done: "ok",
};

export interface TileView {
  id: string;
  name: string;
  state: TileStateName;
  tone: StudentTileState;
  line: WallMessage;
}

/** The status line under the name, as dashboard.wall.tile.* with its values. */
export function tileLine(line: TileLine): WallMessage {
  switch (line.kind) {
    case "done":
      return message("tile.done", { state: line.state });
    case "paused":
      return line.sinceMs === null
        ? message("tile.pausedNoTime", { reason: line.reason ?? "other" })
        : message("tile.paused", { reason: line.reason ?? "other", duration: formatClock(line.sinceMs) });
    case "no_signal":
      return line.sinceMs === null
        ? message("tile.noSignalNever")
        : message("tile.noSignal", { duration: formatClock(line.sinceMs) });
    case "flagged": {
      const time = formatTime(line.at, "en");
      if (line.event === "second_face") return message("tile.secondFace", { time });
      return line.score === undefined
        ? message("tile.phoneNoScore", { time })
        : message("tile.phone", { score: line.score, time });
    }
    case "warning": {
      // wall.ts: "tab blocked · 10:44" when the latest warning is a blocked tab, else the look-away counts.
      if (line.last.type === "tab.blocked") {
        return message("tile.tabBlocked", { time: formatTime(line.last.at, "en") });
      }
      const seconds = toSeconds(line.lookedAwayMs);
      return line.lookedAwayCount > 1
        ? message("tile.lookedAway", { count: line.lookedAwayCount, seconds })
        : message("tile.lookedAwayOnce", { seconds });
    }
    case "on_screen":
      return line.question === undefined
        ? message("tile.onScreenNoQuestion")
        : message("tile.onScreen", { question: line.question });
  }
}

interface Computed {
  results: Map<string, TileResult>;
  views: Map<string, TileView>;
}

const cache = new WeakMap<object, Computed>();

function eventsOf(state: WallState, sessionId: string): readonly CompactEvent[] {
  return state.events[sessionId] ?? [];
}

function compute(state: WallState): Computed {
  const hit = cache.get(state);
  if (hit) return hit;
  const results = new Map<string, TileResult>();
  const views = new Map<string, TileView>();
  for (const session of Object.values(state.sessions)) {
    const result = tileState(
      {
        session: {
          id: session.id,
          state: session.state,
          last_seen_at: session.lastSeenAt,
          joined_at: session.joinedAt,
          status: session.status,
        },
        events: eventsOf(state, session.id),
      },
      state.nowMs,
    );
    results.set(session.id, result);
    views.set(session.id, {
      id: session.id,
      name: shortName(state.students[session.studentId]?.fullName ?? ""),
      state: result.state,
      tone: TILE_TONE[result.state],
      line: tileLine(result.line),
    });
  }
  const computed = { results, views };
  cache.set(state, computed);
  return computed;
}

export function selectTileView(state: WallState, sessionId: string): TileView | undefined {
  return compute(state).views.get(sessionId);
}

export function selectTileResult(state: WallState, sessionId: string): TileResult | undefined {
  return compute(state).results.get(sessionId);
}

export function sameTileView(a: TileView | undefined, b: TileView | undefined): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.state === b.state &&
    a.tone === b.tone &&
    sameMessage(a.line, b.line)
  );
}

export function selectCounts(state: WallState): TileCounts {
  const { results } = compute(state);
  return countTiles(
    Object.values(state.sessions).map((session) => ({
      session: { state: session.state },
      tile: results.get(session.id) ?? { state: "on_screen", line: { kind: "on_screen" } },
    })),
  );
}

export type WallFilter = "all" | "paused";

export interface OrderOptions {
  sort: TileSort;
  filter: WallFilter;
}

/** Session ids in wall order: Flags first or Seat order, with the Paused chip applied. */
export function selectOrder(state: WallState, options: OrderOptions): string[] {
  const { results } = compute(state);
  const tiles = [];
  for (const session of Object.values(state.sessions)) {
    const tile = results.get(session.id);
    if (tile === undefined) continue;
    if (options.filter === "paused" && tile.state !== "paused") continue;
    tiles.push({ id: session.id, seat: state.students[session.studentId]?.seat ?? null, tile });
  }
  return sortTiles(tiles, options.sort).map((t) => t.id);
}

/** A group command writes one proctor event per student; the feed shows it once. */
export function isGroupEvent(event: CompactEvent): boolean {
  return (
    (event.type === "proctor.time_added" || event.type === "proctor.message") && event.data.scope === "group"
  );
}

/**
 * The group command an event belongs to: `data.group_id`, which issue_command writes into every event
 * of one group call. Events stored before group ids fall back to the same type, time and data.
 */
export function groupKey(event: CompactEvent): string {
  const groupId = CommandGroupId.safeParse(event.data.group_id);
  if (groupId.success) return `group|${groupId.data}`;
  const { staff_id: _staff, group_id: _group, ...data } = event.data;
  return `${event.type}|${event.at}|${JSON.stringify(data)}`;
}

/** Keeps one event of each group command, so a command to 125 students cannot push flags out. */
export function collapseGroupEvents(events: readonly CompactEvent[]): CompactEvent[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    if (!isGroupEvent(event)) return true;
    const key = groupKey(event);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const feedCache = new WeakMap<object, CompactEvent[]>();

/**
 * The Live events column: flag and log events, newest first, at most 100, with each group command
 * once. Cached per events object.
 */
export function selectFeed(state: WallState): CompactEvent[] {
  const hit = feedCache.get(state.events);
  if (hit) return hit;
  const feed = liveFeed(collapseGroupEvents(Object.values(state.events).flat()));
  feedCache.set(state.events, feed);
  return feed;
}
