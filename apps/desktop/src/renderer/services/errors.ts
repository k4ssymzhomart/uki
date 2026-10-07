// One error shape for every server call the app makes, so the sync loop and the flow can decide
// between "retry later" and "give up" without knowing which client library failed.
import { ApiError } from "@uki/contracts";

/**
 * - `network`: no reply (offline, timeout, DNS), a gateway 502/503/504, or the Edge Runtime's 546
 *   WORKER_LIMIT (the function never ran): retry with backoff.
 * - `rate_limited`: 429: retry with backoff.
 * - `auth`: 401: the session token is missing or expired; supabase-js refreshes it, retry.
 * - `bad_request`: 400: this request will never work as sent.
 * - `forbidden`, `not_found`, `conflict`: 403, 404, 409.
 * - `server`: any other 5xx or a reply that failed its schema.
 */
export type FailureKind =
  | "network"
  | "rate_limited"
  | "auth"
  | "bad_request"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "server";

export class ServiceError extends Error {
  override readonly name = "ServiceError";
  constructor(
    readonly kind: FailureKind,
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
  }

  /** Worth trying again later. */
  get retryable(): boolean {
    return (
      this.kind === "network" ||
      this.kind === "rate_limited" ||
      this.kind === "auth" ||
      this.kind === "server"
    );
  }
}

export function isServiceError(error: unknown): error is ServiceError {
  return error instanceof ServiceError;
}

/**
 * Replies that say nothing about the request, only that nothing handled it this time: Kong's 502, 503
 * and 504, and 546 WORKER_LIMIT, which the Edge Runtime sends when it has no worker or memory for the
 * function. The outbox and every Edge Function call retry them with the backoff, never give up on them.
 */
export const GATEWAY_STATUSES: readonly number[] = [502, 503, 504, 546];

/** The failure kind for an HTTP status. */
export function kindForStatus(status: number): FailureKind {
  if (status === 0 || GATEWAY_STATUSES.includes(status)) return "network";
  if (status === 429) return "rate_limited";
  if (status === 401) return "auth";
  if (status === 400 || status === 405 || status === 422) return "bad_request";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  return "server";
}

/** A ServiceError from a non-2xx Edge Function reply (its body is a contracts ApiError). */
export function fromHttpReply(status: number, body: unknown): ServiceError {
  const parsed = ApiError.safeParse(body);
  const detail = parsed.success
    ? `${parsed.data.error}${parsed.data.message ? `: ${parsed.data.message}` : ""}`
    : `HTTP ${status}`;
  return new ServiceError(kindForStatus(status), detail, status);
}

/** Wraps anything thrown by fetch or a client library. */
export function toServiceError(error: unknown): ServiceError {
  if (isServiceError(error)) return error;
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
    return new ServiceError("network", "timed out");
  }
  if (error instanceof TypeError) return new ServiceError("network", error.message);
  return new ServiceError("server", error instanceof Error ? error.message : String(error));
}

/**
 * A ServiceError from a supabase-js PostgREST error (`{ code, message, details, hint }`) and the HTTP
 * status of the reply. supabase-js reports a failed fetch with status 0 or a message starting
 * "TypeError: Failed to fetch".
 */
export function fromPostgrestError(
  error: { message?: string; code?: string } | null,
  status: number,
): ServiceError {
  const message = error?.message ?? `HTTP ${status}`;
  if (status === 0 || /fetch failed|failed to fetch|network|aborted|timed out/i.test(message)) {
    return new ServiceError("network", message, status);
  }
  if (error?.code === "42501") return new ServiceError("forbidden", message, status);
  if (error?.code === "P0002") return new ServiceError("not_found", message, status);
  return new ServiceError(kindForStatus(status), message, status);
}
