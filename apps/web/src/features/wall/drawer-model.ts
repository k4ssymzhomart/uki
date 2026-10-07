// Pure pieces of the 2.5 timeline drawer: the merged timeline, the latest flag, the header chips and
// the preset suggested for the quick message.
import {
  type CompactEvent,
  isFinalState,
  isPreExamState,
  type MessagePreset,
  type TileStateName,
  toMs,
} from "@uki/contracts";
import type { ChipStatus, EventRowKind } from "@uki/ui";
import type { WallSession } from "./wall-store.ts";

/** The fetched timeline and the store's live events for the session: no duplicates, newest first by `at`. */
export function mergeTimeline(
  fetched: readonly CompactEvent[],
  live: readonly CompactEvent[],
): CompactEvent[] {
  const byId = new Map<string, CompactEvent>();
  for (const event of [...fetched, ...live]) byId.set(event.id, event);
  return [...byId.values()].sort(
    (a, b) => toMs(b.at) - toMs(a.at) || toMs(b.received_at) - toMs(a.received_at) || (b.id > a.id ? 1 : -1),
  );
}

/** The session's most recent flag event, for the header chip and the evidence card. */
export function latestFlag(timeline: readonly CompactEvent[]): CompactEvent | undefined {
  return timeline.find((event) => event.review === "flag");
}

export type DrawerState = "writing" | "paused" | "no_signal" | "lobby" | "submitted" | "time_up" | "ended";

/** The "on screen now" chip: the session's state as the proctor needs it. */
export function drawerState(session: WallSession, tile: TileStateName | undefined): DrawerState {
  if (isFinalState(session.state)) return session.state as DrawerState;
  if (session.state === "paused") return "paused";
  if (tile === "no_signal") return "no_signal";
  if (isPreExamState(session.state)) return "lobby";
  return "writing";
}

export const DRAWER_STATE_CHIP: Record<DrawerState, ChipStatus> = {
  writing: "ok",
  paused: "idle",
  no_signal: "idle",
  lobby: "idle",
  submitted: "ok",
  time_up: "ok",
  ended: "flag",
};

/** The chip dot of an event row's kind. */
export const KIND_CHIP: Record<EventRowKind, ChipStatus> = {
  flag: "flag",
  warn: "warn",
  ok: "ok",
  info: "idle",
};

/** The preset the drawer selects first, after the latest flag: a phone gets "Put the phone away" (2.5). */
export function suggestedPreset(flag: CompactEvent | undefined): MessagePreset {
  switch (flag?.type) {
    case "phone.detected":
      return "message.preset.phone_away";
    case "gaze.off_screen":
    case "gaze.down":
    case "face.missing":
    case "face.second":
    case "camera.lost":
      return "message.preset.camera_view";
    default:
      return "message.preset.time_15";
  }
}
