import type { CompactEvent } from "@uki/contracts";
import type { AnyClient } from "../wall/queries.ts";
import { EVENT_COLUMNS, parseEvents } from "../wall/rows.ts";
import { identityHelpLog } from "./lobby-model.ts";

/** The event types 1.5b's log shows. */
const LOG_TYPES = ["student.help_requested", "proctor.message"] as const;

/**
 * What 1.5b shows of one student's check-in, read under RLS when the drawer opens: the identity help
 * requests and the proctors' messages to the session. Reading a student's events is a read of student
 * data, so it writes one audit row (`identity_help.read` on the session). A failed read shows no log.
 */
export async function fetchIdentityHelp(
  getClient: () => AnyClient,
  sessionId: string,
): Promise<CompactEvent[]> {
  const client = getClient();
  const [events] = await Promise.all([
    client
      .from("events")
      .select(EVENT_COLUMNS)
      .eq("session_id", sessionId)
      .in("type", [...LOG_TYPES])
      .order("at", { ascending: true })
      .limit(50),
    client.rpc("audit_read", { action: "identity_help.read", object_type: "session", object_id: sessionId }),
  ]);
  if (events.error) return [];
  return identityHelpLog(parseEvents(events.data ?? []));
}
