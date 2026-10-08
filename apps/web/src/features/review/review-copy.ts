// How a flag reads on 3.2 and 3.3, as dashboard.review.* keys with their ICU values. Only keys and
// values are built here; the views translate them.
import type { Messages } from "@uki/i18n";
import type { MessageKeys, NestedKeyOf } from "next-intl";
import {
  durationParts,
  type FlagEvent,
  type FlagType,
  flagSegment,
  isFlagType,
  type ReviewSession,
  scoreOf,
  durationSeconds as secondsOf,
  totalSeconds,
} from "./review-model.ts";

type ReviewMessages = Messages["dashboard"]["review"];

/** Every key under dashboard.review, for example "top.phone_detected". */
export type ReviewKey = MessageKeys<ReviewMessages, NestedKeyOf<ReviewMessages>>;

export interface ReviewMessage {
  key: ReviewKey;
  values?: Record<string, string | number>;
}

function message(key: string, values?: Record<string, string | number>): ReviewMessage {
  return values === undefined ? { key: key as ReviewKey } : { key: key as ReviewKey, values };
}

/** The filter row and the 3.3 card's type name: "Phone in frame", "Looked away". */
export function flagTypeLabel(type: FlagType): ReviewMessage {
  return message(`flag.${flagSegment(type)}`);
}

/**
 * The row's top flag (Row/Session 50:2191): "Phone in frame · 0.94", "Second face · 4 s",
 * "Looked away · 6 s in total", "New tab blocked", "Paused · no face 42 s", "Camera lost". Look-aways add
 * up every flag of that type the row counts.
 */
export function topFlagLine(session: ReviewSession): ReviewMessage | undefined {
  const flag = session.top;
  if (flag === null || !isFlagType(flag.type)) return undefined;
  const counted = session.status === "to_review" ? session.openFlags : session.flags;
  const key = `top.${flagSegment(flag.type)}`;
  switch (flag.type) {
    case "phone.detected":
      return message(key, { score: scoreOf(flag.data) ?? "none" });
    case "face.second":
    case "face.missing":
      return message(key, { seconds: secondsOf(flag.data) ?? "none" });
    case "gaze.off_screen":
    case "gaze.down":
      return message(key, {
        count: counted.filter((f) => f.type === flag.type).length,
        seconds: totalSeconds(counted, flag.type) ?? 0,
      });
    default:
      return message(key);
  }
}

/** The short chip on an evidence card and the preview (Chip 8:26): "phone 0.94", "gaze 2.3 s". */
export function flagChip(flag: FlagEvent): ReviewMessage | undefined {
  if (!isFlagType(flag.type)) return undefined;
  const key = `session.chip.${flagSegment(flag.type)}`;
  switch (flag.type) {
    case "phone.detected":
      return message(key, { score: scoreOf(flag.data) ?? "none" });
    case "face.second":
    case "face.missing":
    case "gaze.off_screen":
    case "gaze.down":
      return message(key, { seconds: secondsOf(flag.data) ?? "none" });
    default:
      return message(key);
  }
}

/** "1 min 40 s", "3 h 5 min" for MEDIAN REVIEW. */
export function durationMessage(seconds: number): ReviewMessage {
  const parts = durationParts(seconds);
  switch (parts.unit) {
    case "seconds":
      return message("duration.seconds", { seconds: parts.seconds });
    case "minutes":
      return message("duration.minutes", { minutes: parts.minutes, seconds: parts.seconds });
    case "hours":
      return message("duration.hours", { hours: parts.hours, minutes: parts.minutes });
    case "days":
      return message("duration.days", { days: parts.days, hours: parts.hours });
  }
}
