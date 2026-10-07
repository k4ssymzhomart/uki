// Time left for the Lock bar and the locked popup: "17:42", or "1:02:05" past an hour, never negative.
import { splitDuration, toMs } from "@uki/contracts";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatTimeLeft(ms: number): string {
  const { hours, minutes, seconds } = splitDuration(Math.max(0, ms));
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

export function timeLeftMs(endsAt: string, nowMs: number): number {
  return Math.max(0, toMs(endsAt) - nowMs);
}

/** The share of the exam already used, 0 to 1. */
export function elapsedShare(startsAt: string, endsAt: string, nowMs: number): number {
  const start = toMs(startsAt);
  const total = toMs(endsAt) - start;
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, (nowMs - start) / total));
}

/** Whole minutes between two instants, for "Locked for 38 min" and "40 min". */
export function wholeMinutes(fromMs: number, toMsValue: number): number {
  return Math.max(0, Math.round((toMsValue - fromMs) / 60_000));
}
