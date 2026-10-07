// Error codes and HTTP statuses of every Edge Function reply, and the mapping from database errors.
// Pure: no Deno or npm imports beyond the contracts, so Vitest runs it under Node.
import { type ApiError, type ApiErrorCode, matchErrorCode } from "./contracts/index.ts";

/** HTTP status of each `ApiErrorCode` (the list in packages/contracts/src/api.ts). */
export const API_ERROR_STATUS = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  method_not_allowed: 405,
  conflict: 409,
  rate_limited: 429,
  internal: 500,
} as const satisfies Record<ApiErrorCode, number>;

/** Thrown inside a handler to answer with `{ error, message }` and the code's status. */
export class ApiFailure extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;

  constructor(code: ApiErrorCode, message?: string) {
    super(message ?? code);
    this.name = "ApiFailure";
    this.code = code;
    this.status = API_ERROR_STATUS[code];
  }

  toBody(): ApiError {
    return this.message === this.code ? { error: this.code } : { error: this.code, message: this.message };
  }
}

/** The codes the database functions raise as their exception message (internals migration). */
const DB_ERROR_CODES = ["bad_request", "forbidden", "not_found", "conflict"] as const;

/** SQLSTATEs that mean the caller sent something wrong, for errors raised without one of our codes. */
const SQLSTATE_CODES: Record<string, ApiErrorCode> = {
  "42501": "forbidden", // insufficient_privilege
  P0002: "not_found", // no_data_found
  "22023": "bad_request", // invalid_parameter_value
  "22P02": "bad_request", // invalid_text_representation, e.g. a malformed uuid
  "23503": "bad_request", // foreign_key_violation
  "23514": "bad_request", // check_violation
};

/**
 * Maps a supabase-js (PostgREST) error from an RPC or query to an ApiFailure: our own codes in
 * `message` first (`raise exception using message = 'forbidden'`), then the SQLSTATE in `code`,
 * otherwise `internal`. `details` travels as the message, for logs.
 */
export function fromDatabaseError(error: unknown, context: string): ApiFailure {
  const matched = matchErrorCode(error, DB_ERROR_CODES);
  const record = typeof error === "object" && error !== null ? (error as Record<string, unknown>) : {};
  const details = typeof record.details === "string" && record.details !== "" ? record.details : null;
  if (matched !== null) return new ApiFailure(matched, details ?? `${context}: ${matched}`);
  const sqlstate = typeof record.code === "string" ? SQLSTATE_CODES[record.code] : undefined;
  const message = typeof record.message === "string" ? record.message : String(error);
  if (sqlstate !== undefined) return new ApiFailure(sqlstate, `${context}: ${message}`);
  return new ApiFailure("internal", `${context}: ${message}`);
}

/** A short, log-friendly summary of Zod issues: `events.3.data.score: Too big`. */
export function summarizeIssues(
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>,
  max = 5,
): string {
  const parts = issues.slice(0, max).map((issue) => {
    const path = issue.path.map((key) => String(key)).join(".");
    return path === "" ? issue.message : `${path}: ${issue.message}`;
  });
  const more = issues.length > max ? ` (+${issues.length - max} more)` : "";
  return parts.join("; ") + more;
}
