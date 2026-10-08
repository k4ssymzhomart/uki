// Judge mode on the DEMO-LIVE wall (docs/runbooks/judge-mode.md): the simulator indicator as pure
// functions. "Simulator: live" while some session of the exam was seen in the last 60 s
// (SIMULATOR_STOPPED_AFTER_MS), "stopped" otherwise, with the time since the newest last_seen_at.
import { DEMO_LIVE_CODE, SIMULATOR_STOPPED_AFTER_MS, toMs } from "@uki/contracts";

export interface SimulatorStatus {
  live: boolean;
  /** Milliseconds since the newest last_seen_at among the exam's sessions; null when none was ever seen. */
  agoMs: number | null;
}

export function isDemoLive(code: string | null | undefined): boolean {
  return (code ?? "").trim().toUpperCase() === DEMO_LIVE_CODE;
}

/** The newest of the sessions' last_seen_at values, against the wall's server-corrected clock. */
export function simulatorStatus(lastSeen: readonly (string | null)[], nowMs: number): SimulatorStatus {
  let newest: number | null = null;
  for (const value of lastSeen) {
    if (value === null) continue;
    const ms = toMs(value);
    if (Number.isFinite(ms) && (newest === null || ms > newest)) newest = ms;
  }
  if (newest === null) return { live: false, agoMs: null };
  const agoMs = Math.max(0, nowMs - newest);
  return { live: agoMs <= SIMULATOR_STOPPED_AFTER_MS, agoMs };
}

/** "4 s", "3 min", "2 h": the unit and count the indicator's message takes. */
export function agoParts(ms: number): { unit: "seconds" | "minutes" | "hours"; count: number } {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return { unit: "seconds", count: seconds };
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return { unit: "minutes", count: minutes };
  return { unit: "hours", count: Math.floor(minutes / 60) };
}

/** True when the exam's starts_at moved: demo_live_tick rolled the exam over, so the wall reloads. */
export function rolledOver(initialStartsAt: string, currentStartsAt: string): boolean {
  return toMs(initialStartsAt) !== toMs(currentStartsAt);
}
