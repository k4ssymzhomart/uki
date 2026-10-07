/**
 * A leading-edge gate: `pass()` is true for the first call and then at most once per `intervalMs`.
 * Used for the Windows blur notice, which may reach the renderer at most once every 5 seconds.
 */
export function createGate(intervalMs: number, now: () => number = Date.now): { pass(): boolean } {
  let last: number | null = null;
  return {
    pass() {
      const at = now();
      if (last !== null && at - last < intervalMs) return false;
      last = at;
      return true;
    },
  };
}
