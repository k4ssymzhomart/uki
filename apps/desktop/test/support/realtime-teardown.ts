// After the Realtime restart run, also when a worker died mid-round: the stack's Realtime runs again.
import { readStackEnv } from "../../../../test/integration/stack.ts";
import { ensureRealtimeRunning, realtimeContainer } from "./realtime.ts";

export default async function globalTeardown(): Promise<void> {
  let stack: ReturnType<typeof readStackEnv> | null = null;
  try {
    stack = readStackEnv();
  } catch {
    // No stack env: start the container anyway, without waiting for its ping.
  }
  await ensureRealtimeRunning(stack, realtimeContainer());
}
