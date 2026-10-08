// The few Supabase calls a simulated student makes, over fetch with the publishable key and the
// student's own anonymous session: no supabase-js (one small bundle, no timers, no Realtime socket), no
// secret key. Every reply is checked with Zod; every failure is an ApiError with the HTTP status and the
// error code the server put in its body (PostgREST message, Edge Function `error`, Auth `error_code`).
import {
  FramesResponse,
  type IngestRequestInput,
  IngestResponse,
  JoinExamOutput,
  matchErrorCode,
} from "@uki/contracts";
import { z } from "zod";
import type { StoredAuth } from "./state.ts";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    /** The server's error code, when the body names one: `not_found`, `already_joined`, `rate_limited`… */
    readonly code: string | null,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** True when the request never got an answer (network, DNS, timeout) or the gateway failed. */
  get transient(): boolean {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

const AuthReply = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().positive(),
  expires_at: z.number().int().positive().optional(),
  user: z.object({ id: z.string().min(1) }),
});

const KNOWN_CODES = [
  "not_found",
  "forbidden",
  "unauthorized",
  "already_joined",
  "lobby_closed",
  "invalid_code",
  "rate_limited",
  "bad_request",
  "conflict",
  "refresh_token_not_found",
  "refresh_token_already_used",
  "session_not_found",
  "over_request_rate_limit",
  "anonymous_provider_disabled",
] as const;

/** The error code of a reply body: PostgREST `message`, an Edge Function `error`, or Auth's `error_code`. */
export function errorCode(body: unknown): string | null {
  const matched = matchErrorCode(body, KNOWN_CODES);
  if (matched !== null) return matched;
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;
  for (const key of ["error_code", "error", "code"]) {
    const value = record[key];
    if (typeof value === "string" && /^[a-z_]{3,60}$/.test(value)) return value;
  }
  return null;
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface ApiOptions {
  url: string;
  publishableKey: string;
  fetch?: FetchLike;
  timeoutMs?: number;
}

export class SupabaseApi {
  private readonly base: string;
  private readonly key: string;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;

  constructor(options: ApiOptions) {
    if (!options.publishableKey.startsWith("sb_publishable_")) {
      throw new Error("the simulator runs with the publishable key (sb_publishable_…) only");
    }
    this.base = options.url.replace(/\/+$/, "");
    this.key = options.publishableKey;
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    this.timeoutMs = options.timeoutMs ?? 20_000;
  }

  private async send(
    path: string,
    init: { method: string; body?: RequestInit["body"]; headers?: Record<string, string>; token?: string },
  ): Promise<unknown> {
    const headers: Record<string, string> = { apikey: this.key, ...init.headers };
    if (init.token !== undefined) headers.authorization = `Bearer ${init.token}`;
    const url = path.startsWith("http") ? path : `${this.base}${path}`;
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: init.method,
        headers,
        body: init.body ?? null,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.name : "error";
      throw new ApiError(0, null, `${init.method} ${pathOnly(url)}: no answer (${reason})`);
    }
    const text = await response.text();
    let body: unknown = null;
    if (text.length > 0) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    if (!response.ok) {
      const code = errorCode(body);
      throw new ApiError(
        response.status,
        code,
        `${init.method} ${pathOnly(url)}: ${response.status} ${code ?? ""}`.trim(),
      );
    }
    // join_exam answers its four errors with a PostgREST error body and the status set in SQL.
    const code = errorCode(body);
    if (code !== null && typeof body === "object" && body !== null && "hint" in body && "details" in body) {
      throw new ApiError(response.status, code, `${init.method} ${pathOnly(url)}: ${code}`);
    }
    return body;
  }

  private json(path: string, body: unknown, token?: string, extra: Record<string, string> = {}) {
    return this.send(path, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json", ...extra },
      ...(token === undefined ? {} : { token }),
    });
  }

  /** A new anonymous user (Auth `signup` with no email). */
  async signInAnonymously(nowMs: number): Promise<StoredAuth> {
    return toStoredAuth(await this.json("/auth/v1/signup", { data: { judge_sim: true } }), nowMs);
  }

  /** A fresh access token; the refresh token is single use, so the caller stores the new one at once. */
  async refresh(refreshToken: string, nowMs: number): Promise<StoredAuth> {
    return toStoredAuth(
      await this.json("/auth/v1/token?grant_type=refresh_token", { refresh_token: refreshToken }),
      nowMs,
    );
  }

  async rpc<S extends z.ZodType>(name: string, args: Record<string, unknown>, token: string, schema: S) {
    const body = await this.json(`/rest/v1/rpc/${name}`, args, token);
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new ApiError(200, "bad_reply", `rpc ${name}: unexpected reply`);
    return parsed.data as z.output<S>;
  }

  joinExam(args: { code: string; student_number: string; locale: string; device: object }, token: string) {
    return this.rpc("join_exam", args, token, JoinExamOutput);
  }

  async ingest(request: IngestRequestInput, token: string): Promise<IngestResponse> {
    const parsed = IngestResponse.safeParse(await this.json("/functions/v1/ingest", request, token));
    if (!parsed.success) throw new ApiError(200, "bad_reply", "ingest: unexpected reply");
    return parsed.data;
  }

  async confirmFrames(eventId: string, paths: string[], token: string): Promise<FramesResponse> {
    const parsed = FramesResponse.safeParse(
      await this.json("/functions/v1/frames", { event_id: eventId, paths }, token),
    );
    if (!parsed.success) throw new ApiError(200, "bad_reply", "frames: unexpected reply");
    return parsed.data;
  }

  /** PUT a JPEG to a signed upload URL from ingest (it creates the object once; no upsert). */
  async upload(signedUrl: string, bytes: Uint8Array, token: string): Promise<void> {
    await this.send(signedUrl, {
      method: "PUT",
      body: bytes,
      headers: { "content-type": "image/jpeg", "x-upsert": "false", "cache-control": "max-age=3600" },
      token,
    });
  }

  /** The student's own answer (answers upsert under row-level security). */
  async saveAnswer(
    row: { session_id: string; question_id: string; choice_id: string; saved_at: string },
    token: string,
  ) {
    await this.json("/rest/v1/answers?on_conflict=session_id,question_id", row, token, {
      prefer: "resolution=merge-duplicates,return=minimal",
    });
  }
}

/** What the simulator uses of the API (tests pass a fake server). */
export type SimApi = Pick<
  SupabaseApi,
  "signInAnonymously" | "refresh" | "rpc" | "joinExam" | "ingest" | "confirmFrames" | "upload" | "saveAnswer"
>;

function toStoredAuth(body: unknown, nowMs: number): StoredAuth {
  const parsed = AuthReply.safeParse(body);
  if (!parsed.success) throw new ApiError(200, "bad_reply", "auth: unexpected reply");
  const reply = parsed.data;
  return {
    user_id: reply.user.id,
    access_token: reply.access_token,
    refresh_token: reply.refresh_token,
    expires_at: reply.expires_at ?? Math.floor(nowMs / 1000 + reply.expires_in),
  };
}

/** The path of a URL without its query (a signed URL's token stays out of the logs). */
export function pathOnly(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname.replace(/(\/object\/upload\/sign\/[^/]+)\/.*/, "$1/…");
  } catch {
    return "(url)";
  }
}
