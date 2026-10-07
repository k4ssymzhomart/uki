import { useRef } from "react";
import type { BarState } from "./state.ts";
import { timeLeftMs } from "./time-left.ts";

/**
 * Time left on the bar. While the app reports the exam paused, the clock stands still at the value it had
 * when the pause began, as the app's own timer does.
 */
export function useTimeLeft(bar: Pick<BarState, "ends_at" | "phase">, nowMs: number): number {
  const frozen = useRef<number | null>(null);
  if (bar.phase === "paused") frozen.current ??= timeLeftMs(bar.ends_at, nowMs);
  else frozen.current = null;
  return frozen.current ?? timeLeftMs(bar.ends_at, nowMs);
}
