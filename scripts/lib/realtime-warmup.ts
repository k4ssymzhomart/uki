// One Realtime connection for a few seconds, as the live wall makes it. A Supabase project creates the
// day's `realtime.messages` partitions only when a client connects; until then every broadcast the
// database sends (the wall's events, the `help` message) fails with MissingPartition, and on 8 October
// the first connection to the cloud project failed that way. `pnpm demo:reset` calls this before it
// writes anything, so the partitions exist for the reset's own broadcasts and for the demo.
import { examTopic } from "../../packages/contracts/src/index.ts";
import type { UkiClient } from "./supabase.ts";

export interface WarmupResult {
  ok: boolean;
  attempts: number;
  /** Connect to SUBSCRIBED on the attempt that worked, in ms. */
  ms: number | null;
  errors: string[];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function once(
  client: UkiClient,
  accessToken: string,
  topic: string,
  holdMs: number,
  timeoutMs: number,
): Promise<number> {
  await client.realtime.setAuth(accessToken);
  const channel = client.channel(topic, { config: { private: true } });
  const started = Date.now();
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("no SUBSCRIBED in time")), timeoutMs);
      channel.subscribe((status, error) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timer);
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          clearTimeout(timer);
          reject(new Error(`${status}${error ? `: ${error.message}` : ""}`));
        }
      });
    });
    const ms = Date.now() - started;
    await sleep(holdMs);
    return ms;
  } finally {
    await client.removeChannel(channel);
  }
}

/**
 * Joins the private channel exam:{examId} as a signed-in staff member for `holdMs`, up to `attempts`
 * times: a first connection that trips over a missing partition still makes the project create it.
 */
export async function warmRealtime(
  client: UkiClient,
  accessToken: string,
  examId: string,
  options: { holdMs?: number; timeoutMs?: number; attempts?: number } = {},
): Promise<WarmupResult> {
  const attempts = options.attempts ?? 3;
  const errors: string[] = [];
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const ms = await once(
        client,
        accessToken,
        examTopic(examId),
        options.holdMs ?? 4000,
        options.timeoutMs ?? 15_000,
      );
      return { ok: true, attempts: attempt, ms, errors };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      if (attempt < attempts) await sleep(3000);
    }
  }
  return { ok: false, attempts, ms: null, errors };
}
