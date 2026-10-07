// The dashboard's calls to the `command` and `stills` Edge Functions. Requests are checked with the
// contracts' Zod schemas before they leave, replies after they arrive; a failure comes back as an
// error code the UI translates, never as an exception.
import {
  ApiError,
  type ApiErrorCode,
  CommandRequest,
  CommandResponse,
  StillsRequest,
  StillsResponse,
} from "@uki/contracts";
import type { z } from "zod";

/** ApiError codes plus `network` for a call that never got a readable answer. */
export type CallErrorCode = ApiErrorCode | "network";

export type CallResult<T> = { ok: true; data: T } | { ok: false; code: CallErrorCode };

export interface FunctionsClientOptions {
  /** Supabase project URL, for example http://127.0.0.1:54721. */
  url: string;
  /** The publishable key (sb_publishable_...), sent as `apikey`. */
  publishableKey: string;
  /** The signed-in staff member's access token, or null when signed out. */
  getAccessToken: () => Promise<string | null>;
  fetch?: typeof fetch;
}

export interface FunctionsClient {
  command: (request: CommandRequest) => Promise<CallResult<CommandResponse>>;
  stills: (request: StillsRequest) => Promise<CallResult<StillsResponse>>;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function createFunctionsClient(options: FunctionsClientOptions): FunctionsClient {
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const base = `${options.url.replace(/\/+$/, "")}/functions/v1`;

  async function call<In, Out>(
    name: string,
    input: z.ZodType<In>,
    output: z.ZodType<Out>,
    body: In,
  ): Promise<CallResult<Out>> {
    const checked = input.safeParse(body);
    if (!checked.success) return { ok: false, code: "bad_request" };
    const token = await options.getAccessToken();
    if (token === null) return { ok: false, code: "unauthorized" };
    let response: Response;
    try {
      response = await doFetch(`${base}/${name}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          apikey: options.publishableKey,
          "content-type": "application/json",
        },
        body: JSON.stringify(checked.data),
      });
    } catch {
      return { ok: false, code: "network" };
    }
    const json = await readJson(response);
    if (response.ok) {
      const parsed = output.safeParse(json);
      return parsed.success ? { ok: true, data: parsed.data } : { ok: false, code: "internal" };
    }
    const error = ApiError.safeParse(json);
    if (error.success) return { ok: false, code: error.data.error };
    if (response.status === 401) return { ok: false, code: "unauthorized" };
    return { ok: false, code: response.status >= 500 ? "internal" : "bad_request" };
  }

  return {
    command: (request) => call("command", CommandRequest, CommandResponse, request),
    stills: (request) => call("stills", StillsRequest, StillsResponse, request),
  };
}
