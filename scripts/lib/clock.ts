// The server owns exam time (CLAUDE.md), so the scripts read the Supabase host's clock from the HTTP
// Date header of a cheap request and correct the laptop clock by the difference.

export interface ServerClock {
  /** Server time minus laptop time, in milliseconds. */
  offsetMs: number;
  /** The server's time now, in epoch milliseconds. */
  now(): number;
}

/**
 * The offset of a server clock that wrote `dateHeader` (1-second resolution) between `sentAt` and
 * `receivedAt` on the laptop clock. The header's second is assumed to be half over, and the reply to
 * have been written halfway through the round trip. Null when the header is missing or invalid.
 */
export function offsetFromDateHeader(
  dateHeader: string | null,
  sentAt: number,
  receivedAt: number,
): number | null {
  if (dateHeader === null) return null;
  const serverMs = Date.parse(dateHeader);
  if (!Number.isFinite(serverMs)) return null;
  const midpoint = sentAt + (receivedAt - sentAt) / 2;
  return Math.round(serverMs + 500 - midpoint);
}

/**
 * Reads the server clock from `GET /auth/v1/health` (three tries, the fastest round trip wins). Falls
 * back to the laptop clock when the host sends no usable Date header.
 */
export async function serverClock(
  supabaseUrl: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ServerClock> {
  let best: { offset: number; roundTrip: number } | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const sentAt = Date.now();
    const response = await fetchImpl(new URL("/auth/v1/health", supabaseUrl), {
      headers: { apikey: apiKey },
      signal: AbortSignal.timeout(10_000),
    });
    const receivedAt = Date.now();
    await response.body?.cancel();
    const offset = offsetFromDateHeader(response.headers.get("date"), sentAt, receivedAt);
    if (offset === null) continue;
    const roundTrip = receivedAt - sentAt;
    if (best === null || roundTrip < best.roundTrip) best = { offset, roundTrip };
  }
  // Within the header's 1-second resolution the laptop's own (NTP) clock is the better guess.
  const measured = best?.offset ?? 0;
  const offsetMs = Math.abs(measured) < 1000 ? 0 : measured;
  return { offsetMs, now: () => Date.now() + offsetMs };
}
