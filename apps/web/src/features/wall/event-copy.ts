// How each event reads on the wall's Live events column and in the 2.5 timeline. Titles follow the
// frames that show the event (2.4, 2.5) and otherwise the Event names card (Figma 212:2039); details
// come from the event's data. Only keys and values are built here.
import {
  type CompactEvent,
  type EventType,
  LOOK_AWAY_EVENT_TYPES,
  MessagePreset,
  THRESHOLDS,
  toMs,
} from "@uki/contracts";
import type { EventRowKind } from "@uki/ui";
import { formatClock, toSeconds } from "./durations.ts";
import { message, type WallKey, type WallMessage } from "./wall-message.ts";

/** The dot colour: red for flags a proctor acts on, yellow for warnings, green for good news. */
export const EVENT_KIND: Record<EventType, EventRowKind> = {
  "gaze.on_screen": "ok",
  "gaze.off_screen": "warn",
  "gaze.down": "warn",
  "phone.detected": "flag",
  "face.missing": "warn",
  "face.second": "flag",
  "camera.lost": "warn",
  "tab.blocked": "warn",
  "copy.blocked": "warn",
  "site.closed": "warn",
  "net.offline": "warn",
  "identity.matched": "ok",
  "exam.started": "ok",
  "browser.locked": "ok",
  "answer.saved": "info",
  "session.paused": "warn",
  "session.resumed": "ok",
  "exam.submitted": "ok",
  "exam.time_up": "info",
  "proctor.paused": "info",
  "proctor.resumed": "info",
  "proctor.ended": "flag",
  "proctor.time_added": "info",
  "proctor.message": "info",
  "student.help_requested": "warn",
  "lock.app_disconnected": "flag",
  "lock.fullscreen_exit": "warn",
  // Phase 1: a proctor's note (add_session_note); timeline only, never in Live events.
  "proctor.note": "info",
};

/** The dot of one stored event: a third full-screen exit is a flag, so it turns red. */
export function eventKind(event: Pick<CompactEvent, "type" | "review">): EventRowKind {
  if (event.type === "lock.fullscreen_exit" && event.review === "flag") return "flag";
  return EVENT_KIND[event.type];
}

/** The key segment of a type: "gaze.off_screen" is "gaze_off_screen". */
function segment(type: EventType): string {
  return type.replace(".", "_");
}

function num(data: Record<string, unknown>, key: string): number | undefined {
  const value = data[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function str(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export interface EventCopy {
  title: WallMessage;
  /** "phone in frame", after the student's name in Live events; undefined for events never shown there. */
  feed?: WallMessage;
  detail?: WallMessage;
  kind: EventRowKind;
}

export interface EventCopyContext {
  /** Staff names by id, for "By Aigerim Sadykova". */
  staffNames?: Readonly<Record<string, string>>;
  /** English text of a preset key ("message.preset.phone_away"), for proctor.message. */
  presetText?: (preset: MessagePreset) => string;
}

function key(type: EventType, part: "title" | "feed" | "detail"): WallKey {
  return `event.${segment(type)}.${part}` as WallKey;
}

const FEED_TYPES: ReadonlySet<EventType> = new Set<EventType>([
  "gaze.off_screen",
  "gaze.down",
  "phone.detected",
  "face.missing",
  "face.second",
  "camera.lost",
  "tab.blocked",
  "copy.blocked",
  "site.closed",
  "net.offline",
  "session.paused",
  "proctor.paused",
  "proctor.resumed",
  "proctor.ended",
  "proctor.time_added",
  "proctor.message",
  "student.help_requested",
  "lock.app_disconnected",
  "lock.fullscreen_exit",
]);

function detailOf(event: CompactEvent, context: EventCopyContext): WallMessage | undefined {
  const { data } = event;
  const by = (): WallMessage | undefined => {
    const staffId = str(data, "staff_id");
    const name = staffId === undefined ? undefined : context.staffNames?.[staffId];
    return name === undefined ? undefined : message("event.proctor_by", { name });
  };
  switch (event.type) {
    case "gaze.off_screen": {
      const ms = num(data, "duration_ms");
      if (ms === undefined) return undefined;
      return message(key(event.type, "detail"), {
        seconds: toSeconds(ms),
        direction: str(data, "direction") ?? "other",
      });
    }
    case "gaze.down":
    case "face.missing":
    case "face.second": {
      const ms = num(data, "duration_ms");
      return ms === undefined ? undefined : message(key(event.type, "detail"), { seconds: toSeconds(ms) });
    }
    case "phone.detected": {
      const score = num(data, "score");
      if (score === undefined) return undefined;
      return message(key(event.type, "detail"), { score, kept: event.frame_count > 0 ? "yes" : "no" });
    }
    case "camera.lost":
      return message(key(event.type, "detail"));
    case "tab.blocked": {
      const name = str(data, "host") ?? str(data, "app");
      if (name !== undefined) return message(key(event.type, "detail"), { target: "named", name });
      return message(key(event.type, "detail"), {
        target: event.source === "lock" ? "lock" : "other",
        name: "",
      });
    }
    case "copy.blocked":
      return message(key(event.type, "detail"), { kind: str(data, "kind") ?? "other" });
    case "site.closed": {
      const host = str(data, "host");
      return host === undefined ? undefined : message(key(event.type, "detail"), { host });
    }
    case "net.offline": {
      const ms = num(data, "offline_ms");
      const queued = num(data, "queued");
      if (ms === undefined || queued === undefined) return undefined;
      return message(key(event.type, "detail"), { seconds: toSeconds(ms), queued });
    }
    case "identity.matched": {
      const score = num(data, "score");
      const tries = num(data, "tries");
      if (score === undefined || tries === undefined) return undefined;
      return message(key(event.type, "detail"), { score, tries });
    }
    case "session.paused":
      return message(key(event.type, "detail"), { reason: str(data, "reason") ?? "other" });
    case "session.resumed": {
      const ms = num(data, "paused_ms");
      return ms === undefined ? undefined : message(key(event.type, "detail"), { seconds: toSeconds(ms) });
    }
    case "exam.submitted": {
      const seconds = num(data, "time_used_s");
      return seconds === undefined
        ? undefined
        : message(key(event.type, "detail"), { duration: formatClock(seconds * 1000) });
    }
    case "proctor.paused":
    case "proctor.resumed":
      return by();
    case "proctor.ended": {
      const reason = str(data, "reason");
      return reason === undefined ? by() : message(key(event.type, "detail"), { reason });
    }
    case "proctor.time_added":
      return message(key(event.type, "detail"), { scope: str(data, "scope") ?? "other" });
    case "proctor.message": {
      const preset = MessagePreset.safeParse(data.preset);
      const text = preset.success ? context.presetText?.(preset.data) : str(data, "text");
      return text === undefined ? undefined : message(key(event.type, "detail"), { text });
    }
    case "student.help_requested":
      return message(key(event.type, "detail"), { topic: str(data, "topic") ?? "other" });
    case "lock.app_disconnected":
      return message(key(event.type, "detail"), { side: str(data, "side") ?? "other" });
    case "lock.fullscreen_exit": {
      const count = num(data, "count");
      return count === undefined ? undefined : message(key(event.type, "detail"), { count });
    }
    case "proctor.note": {
      const text = str(data, "text");
      return text === undefined ? undefined : message(key(event.type, "detail"), { text });
    }
    default:
      return undefined;
  }
}

/** Title, Live events label, detail and dot of one event. */
export function describeEvent(event: CompactEvent, context: EventCopyContext = {}): EventCopy {
  const minutes = num(event.data, "minutes");
  const values = event.type === "proctor.time_added" ? { minutes: minutes ?? 0 } : undefined;
  const copy: EventCopy = {
    title: message(key(event.type, "title"), values),
    kind: eventKind(event),
  };
  if (FEED_TYPES.has(event.type)) copy.feed = message(key(event.type, "feed"), values);
  const detail = detailOf(event, context);
  if (detail !== undefined) copy.detail = detail;
  return copy;
}

/**
 * Live events' detail for a look-away that is not the first in its 5-minute window: "Third time,
 * 6 s in total" (2.4). `sessionEvents` are the student's events; null for a first look-away.
 */
export function lookAwayRepeat(
  event: CompactEvent,
  sessionEvents: readonly CompactEvent[],
): WallMessage | null {
  const types: readonly string[] = LOOK_AWAY_EVENT_TYPES;
  if (!types.includes(event.type)) return null;
  const end = toMs(event.at);
  const start = end - THRESHOLDS.wall.warningWindowMs;
  let count = 0;
  let totalMs = 0;
  const seen = new Set<string>();
  for (const other of sessionEvents) {
    if (seen.has(other.id) || !types.includes(other.type)) continue;
    const at = toMs(other.at);
    if (at < start || at > end) continue;
    seen.add(other.id);
    count += 1;
    totalMs += Math.max(0, num(other.data, "duration_ms") ?? 0);
  }
  if (count < 2) return null;
  return message("event.gaze_off_screen.repeat", { count, seconds: toSeconds(totalMs) });
}
