// The one wrapper every Üki Edge Function uses: CORS, POST only, `withSupabase({ auth: "user" })` from
// @supabase/server for the caller's token and the two clients, Zod on the request body and on the
// reply, and `{ error, message }` bodies (contracts ApiError) for every failure, including the ones
// @supabase/server answers itself. Every reply carries Server-Timing (timing.ts): auth, body, handle
// (with the handler's own calls), reply and total, plus boot on an isolate's first request.
import { ErrorCodeHeader, type SupabaseContext, withSupabase } from "@supabase/server";
import type { z } from "zod";
import { API_ERROR_CODES, type ApiError, type ApiErrorCode } from "./contracts/index.ts";
import { corsHeaders, isAllowedOrigin, parseAllowedOrigins } from "./cors.ts";
import { API_ERROR_STATUS, ApiFailure, summarizeIssues } from "./errors.ts";
import { ServerTiming } from "./timing.ts";

type Client = SupabaseContext["supabase"];

/** What a handler gets besides its parsed input. */
export interface ApiContext {
  /** The caller's client: PostgREST and RPC run under RLS as this user. */
  supabase: Client;
  /** Secret-key client from the platform: bypasses RLS. Use only after checking the caller. */
  supabaseAdmin: Client;
  /** `auth.uid()` of the caller, from the verified token. */
  userId: string;
  /** True for a student's anonymous sign-in. */
  isAnonymous: boolean;
  /** The platform's SUPABASE_URL (internal under the local CLI; see public-url.ts). */
  supabaseUrl: string;
  /** The incoming request, for its headers. */
  request: Request;
  /** This request's Server-Timing: handlers time their database and Storage calls with it. */
  timing: ServerTiming;
}

export interface ApiSpec<In extends z.ZodType, Out extends z.ZodType> {
  /** The function's name, for logs. */
  name: string;
  /** Request body schema. A body that fails it gets 400 bad_request. */
  input: In;
  /** Reply schema. A reply that fails it is a bug: 500 internal, logged. */
  output: Out;
  handle: (input: z.output<In>, ctx: ApiContext) => Promise<z.input<Out>>;
}

const STATUS_CODES = new Map<number, ApiErrorCode>(
  API_ERROR_CODES.map((code) => [API_ERROR_STATUS[code], code] as const),
);

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

function errorResponse(code: ApiErrorCode, message?: string, headers?: Record<string, string>): Response {
  const body: ApiError = message === undefined ? { error: code } : { error: code, message };
  return json(API_ERROR_STATUS[code], body, headers);
}

function failureResponse(name: string, error: unknown): Response {
  if (error instanceof ApiFailure) {
    if (error.code === "internal") console.error(`[${name}] ${error.message}`);
    return json(error.status, error.toBody());
  }
  console.error(`[${name}] unexpected error`, error);
  return errorResponse("internal");
}

/**
 * Rewrites a response @supabase/server produced itself (missing or invalid token, missing platform
 * keys) into an ApiError body. Those carry the `x-supabase-server-error` header with their code.
 */
async function normalizeServerError(response: Response): Promise<Response> {
  const code = response.headers.get(ErrorCodeHeader);
  if (code === null) return response;
  await response.body?.cancel();
  const mapped = response.status === 401 ? "unauthorized" : (STATUS_CODES.get(response.status) ?? "internal");
  if (mapped === "internal") console.error(`[@supabase/server] ${response.status} ${code}`);
  return errorResponse(mapped, code);
}

function withHeaders(response: Response, headers: Record<string, string>): Response {
  if (Object.keys(headers).length === 0) return response;
  const copy = new Response(response.body, response);
  for (const [key, value] of Object.entries(headers)) copy.headers.set(key, value);
  return copy;
}

/** Builds the `Deno.serve` handler for one function. */
export function serveApi<In extends z.ZodType, Out extends z.ZodType>(
  spec: ApiSpec<In, Out>,
): (request: Request) => Promise<Response> {
  const origins = parseAllowedOrigins(Deno.env.get("UKI_ALLOWED_ORIGINS"));
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  // Isolate start to this point: loading and evaluating the function's modules.
  let bootMs: number | null = performance.now();
  // Each request's timing and start, found again inside withSupabase's callback. Keyed by the headers:
  // the callback gets a proxy of the request (a re-readable body) whose `headers` is the original's.
  const pending = new WeakMap<Headers, { timing: ServerTiming; started: number }>();

  const authed = withSupabase(
    // CORS is answered below, before the auth gate, so a preflight never needs a token.
    { auth: "user", cors: "disabled", errors: { detailed: false } },
    async (request, ctx) => {
      const own = pending.get(request.headers);
      const timing = own?.timing ?? new ServerTiming();
      if (own) timing.add("auth", performance.now() - own.started);
      try {
        const claims = ctx.jwtClaims;
        const userId = ctx.userClaims?.id;
        if (claims === null || userId === undefined || claims.role !== "authenticated") {
          throw new ApiFailure("unauthorized", "a signed-in user's token is required");
        }

        const bodyStarted = performance.now();
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          throw new ApiFailure("bad_request", "the body is not JSON");
        }
        const parsed = spec.input.safeParse(body);
        timing.add("body", performance.now() - bodyStarted);
        if (!parsed.success) throw new ApiFailure("bad_request", summarizeIssues(parsed.error.issues));

        const reply = await timing.measure("handle", () =>
          spec.handle(parsed.data, {
            supabase: ctx.supabase,
            supabaseAdmin: ctx.supabaseAdmin,
            userId,
            isAnonymous: claims.is_anonymous === true,
            supabaseUrl,
            request,
            timing,
          }),
        );

        const replyStarted = performance.now();
        const checked = spec.output.safeParse(reply);
        if (!checked.success) {
          throw new ApiFailure(
            "internal",
            `reply failed its schema: ${summarizeIssues(checked.error.issues)}`,
          );
        }
        const response = json(200, checked.data);
        timing.add("reply", performance.now() - replyStarted);
        return response;
      } catch (error) {
        return failureResponse(spec.name, error);
      }
    },
  );

  return async (request) => {
    const started = performance.now();
    const timing = new ServerTiming();
    const origin = request.headers.get("origin");
    const cors = corsHeaders(origin, origins);
    if (request.method === "OPTIONS") {
      if (origin !== null && !isAllowedOrigin(origin, origins)) {
        return errorResponse("forbidden", "origin not allowed", cors);
      }
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== "POST") {
      return errorResponse("method_not_allowed", undefined, { ...cors, Allow: "POST, OPTIONS" });
    }
    const timed = (response: Response) => {
      if (bootMs !== null) {
        timing.add("boot", bootMs);
        bootMs = null;
      }
      timing.add("total", performance.now() - started);
      return withHeaders(response, { ...cors, "server-timing": timing.header() });
    };
    pending.set(request.headers, { timing, started });
    try {
      return timed(await normalizeServerError(await authed(request)));
    } catch (error) {
      return timed(failureResponse(spec.name, error));
    } finally {
      pending.delete(request.headers);
    }
  };
}
