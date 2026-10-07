// The session-owner check `ingest` and `frames` run before any privileged write.
import { ApiFailure, fromDatabaseError } from "./errors.ts";
import type { ApiContext } from "./http.ts";
import { retryOnGateway } from "./retry.ts";
import { parseRow, SessionOwnerRow } from "./rows.ts";

/**
 * The session, when the caller is the user it was bound to by `join_exam` (`sessions.auth_uid`).
 * 404 for an unknown session, 403 for anyone else, staff included: only the student's own app sends
 * its events and stills.
 */
export async function requireSessionOwner(ctx: ApiContext, sessionId: string): Promise<SessionOwnerRow> {
  const { data, error } = await retryOnGateway(() =>
    ctx.supabaseAdmin.from("sessions").select("id, exam_id, auth_uid").eq("id", sessionId).maybeSingle(),
  );
  if (error) throw fromDatabaseError(error, "sessions");
  if (data === null) throw new ApiFailure("not_found", "no such session");
  const session = parseRow(SessionOwnerRow, data, "sessions");
  if (session.auth_uid !== ctx.userId)
    throw new ApiFailure("forbidden", "only the session owner may call this");
  return session;
}
