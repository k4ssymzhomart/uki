// copy.blocked goes to the app at most once per kind every 10 s ("No copy, paste or print" in
// docs/phase-0-plan.md). Every attempt is still cancelled and still shows the E.6 toast.
import { COPY_BLOCKED_THROTTLE_MS } from "@uki/contracts";

export interface KindThrottle<K extends string> {
  /** Whether an event of this kind may be sent now; records it when it may. */
  take(kind: K, nowMs: number): boolean;
  reset(): void;
}

export function createKindThrottle<K extends string>(windowMs = COPY_BLOCKED_THROTTLE_MS): KindThrottle<K> {
  const last = new Map<K, number>();
  return {
    take(kind, nowMs) {
      const previous = last.get(kind);
      if (previous !== undefined && nowMs - previous < windowMs) return false;
      last.set(kind, nowMs);
      return true;
    },
    reset() {
      last.clear();
    },
  };
}
