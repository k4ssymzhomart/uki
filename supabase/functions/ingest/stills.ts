// Upload URLs for flagged stills. ingest signs them without upsert: a URL creates its still once, so
// after `frames` has confirmed a still nobody can replace it through the same URL, which stays valid
// for 2 hours. Storage then also refuses to sign a path whose object is already there: a still whose
// upload went through but whose reply or confirm was lost. ingest confirms such a still itself, as
// `frames` would (the object exists), and offers no URL for it. Pure, so Vitest runs it under Node.

/**
 * True for Storage's "The resource already exists": HTTP 400 with statusCode "409" from the local
 * stack's storage-api, or a plain 409.
 */
export function isAlreadyStored(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { status, statusCode } = error as { status?: unknown; statusCode?: unknown };
  return String(statusCode) === "409" || Number(status) === 409;
}

/** The paths to confirm, grouped by event in first-seen order (confirm_frames takes one event a call). */
export function pathsByEvent(stills: readonly { eventId: string; path: string }[]): Map<string, string[]> {
  const byEvent = new Map<string, string[]>();
  for (const still of stills) byEvent.set(still.eventId, [...(byEvent.get(still.eventId) ?? []), still.path]);
  return byEvent;
}
