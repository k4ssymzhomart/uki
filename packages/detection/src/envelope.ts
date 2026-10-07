// From a rules-engine event to the envelope `ingest` takes (ClientEventEnvelope in @uki/contracts).
// The outbox assigns `seq` when it stores the event.
import { ClientEventEnvelope } from "@uki/contracts";
import type { RuleEvent } from "./rules.ts";

export interface EnvelopeContext {
  session_id: string;
  seq: number;
  app_version: string;
}

/** Throws a ZodError when the event or the context is not valid for `ingest`. */
export function toEnvelope(event: RuleEvent, context: EnvelopeContext): ClientEventEnvelope {
  return ClientEventEnvelope.parse({
    id: event.id,
    session_id: context.session_id,
    type: event.type,
    source: "app",
    at: new Date(event.at).toISOString(),
    seq: context.seq,
    data: event.data,
    frame_count: event.frame_count,
    app_version: context.app_version,
  });
}
