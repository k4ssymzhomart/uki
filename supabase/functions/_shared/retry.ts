// One quick retry for idempotent calls that failed at the gateway, not in Postgres or Storage.
//
// Under the local CLI, Kong keeps upstream connections alive longer than PostgREST does; a request sent
// on a connection PostgREST has just closed fails with 502 "An invalid response was received from the
// upstream server" without ever reaching the database. nginx retries such GETs itself, never POSTs, so
// RPCs see it. Only idempotent calls go through here: reads, ingest_batch (insert ... on conflict do
// nothing), confirm_frames (idempotent per path) and URL signing. issue_command and audit inserts never
// do. Pure, so Vitest runs it under Node.

/** The shape of a supabase-js result: PostgREST adds `status`, Storage puts it on the error. */
export interface ClientResult {
  error: unknown;
  status?: number;
}

const GATEWAY_STATUSES = new Set([502, 503, 504]);
const GATEWAY_MESSAGE = /upstream server|fetch failed|connection reset|ECONNRESET|socket hang up/i;

/**
 * True for a failure that happened between the function and the service, not inside it: a 502, 503
 * or 504, or, when no HTTP status came back at all, a network error.
 */
export function isGatewayFailure(result: ClientResult): boolean {
  if (!result.error) return false;
  if (result.status !== undefined && result.status !== 0) return GATEWAY_STATUSES.has(result.status);
  const error = result.error as { status?: unknown; statusCode?: unknown; message?: unknown; name?: unknown };
  const status = Number(error.status ?? error.statusCode);
  if (Number.isFinite(status) && status > 0) return GATEWAY_STATUSES.has(status);
  if (error.name === "StorageUnknownError") return true;
  return typeof error.message === "string" && GATEWAY_MESSAGE.test(error.message);
}

/** Runs `op`, and runs it once more after `delayMs` when the first result is a gateway failure. */
export async function retryOnGateway<R extends ClientResult>(
  op: () => PromiseLike<R>,
  delayMs = 50,
): Promise<R> {
  const first = await op();
  if (!isGatewayFailure(first)) return first;
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  return await op();
}
