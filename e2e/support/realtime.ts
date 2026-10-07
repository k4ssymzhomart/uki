// Joining a private Broadcast channel as a signed-in user and recording what arrives, to check that a
// staff member is refused a topic they may not read (realtime.messages policy uki_read_own_topics).
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { UkiClient } from "./supabase.ts";

export interface ChannelProbe {
  /** SUBSCRIBED, CHANNEL_ERROR, TIMED_OUT, CLOSED, or "no answer" when nothing came back in time. */
  status: string;
  error: string | null;
  /** Every broadcast received on the topic, for any event name. */
  received: { event: string; payload: unknown }[];
  channel: RealtimeChannel;
}

async function joinOnce(client: UkiClient, topic: string, timeoutMs: number): Promise<ChannelProbe> {
  const received: ChannelProbe["received"] = [];
  const channel = client.channel(topic, { config: { private: true } });
  channel.on("broadcast", { event: "*" }, (message: { event: string; payload?: unknown }) => {
    received.push({ event: message.event, payload: message.payload });
  });
  const outcome = await new Promise<{ status: string; error: string | null }>((resolve) => {
    const timer = setTimeout(() => resolve({ status: "no answer", error: null }), timeoutMs);
    channel.subscribe((status, error) => {
      if (
        status === "SUBSCRIBED" ||
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT" ||
        status === "CLOSED"
      ) {
        clearTimeout(timer);
        resolve({ status, error: error?.message ?? null });
      }
    });
  });
  return { ...outcome, received, channel };
}

/**
 * Joins `topic` and reports how Realtime answered. A join that times out says nothing about rights
 * (Realtime checks them against Postgres, which a loaded local stack answers slowly), so it is tried
 * again, up to three times; SUBSCRIBED and CHANNEL_ERROR are final.
 */
export async function probeChannel(
  client: UkiClient,
  topic: string,
  timeoutMs = 40_000,
): Promise<ChannelProbe> {
  for (let attempt = 1; ; attempt += 1) {
    const probe = await joinOnce(client, topic, timeoutMs);
    if (probe.status === "SUBSCRIBED" || probe.status === "CHANNEL_ERROR" || attempt === 3) return probe;
    await client.removeChannel(probe.channel);
  }
}
