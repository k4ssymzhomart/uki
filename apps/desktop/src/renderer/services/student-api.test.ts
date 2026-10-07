// How student-api.ts reports failed replies: the sync loop and the flow retry what `retryable` says.
import type { UkiClient } from "@uki/db";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QUESTION_IDS, SESSION_ID } from "../test/harness.ts";
import { GATEWAY_STATUSES, kindForStatus, ServiceError } from "./errors.ts";
import { createStudentApi } from "./student-api.ts";

const ENV = { url: "http://127.0.0.1:54721", publishableKey: "sb_publishable_test" };
const EVENT_ID = "0199a000-0000-7000-8000-0000000000e1";

/** Bodies the Edge Runtime and Kong send with these statuses. */
const BODIES: Record<number, string> = {
  546: JSON.stringify({
    code: "WORKER_LIMIT",
    message: "Function failed due to not having enough compute resources (please check logs)",
  }),
  502: JSON.stringify({ message: "An invalid response was received from the upstream server" }),
  503: JSON.stringify({ code: "BOOT_ERROR", message: "Function failed to start (please check logs)" }),
  504: "<html><body>Gateway Timeout</body></html>",
};

/** A client whose PostgREST calls all answer `reply`, with a signed-in session. */
function fakeClient(reply: { error: { message: string; code?: string } | null; status: number }): UkiClient {
  const builder = {
    upsert: () => builder,
    abortSignal: async () => ({ data: null, ...reply }),
  };
  return {
    auth: { getSession: async () => ({ data: { session: { access_token: "token" } } }) },
    from: () => builder,
    rpc: () => builder,
  } as unknown as UkiClient;
}

function replyWith(status: number, body: string): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(body, { status })),
  );
}

async function failure(call: Promise<unknown>): Promise<ServiceError> {
  const error = await call.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(ServiceError);
  return error as ServiceError;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Edge Function replies", () => {
  it("counts 546 WORKER_LIMIT and Kong's 502, 503 and 504 as no reply", () => {
    expect([...GATEWAY_STATUSES].sort()).toEqual([502, 503, 504, 546]);
    for (const status of GATEWAY_STATUSES) expect(kindForStatus(status)).toBe("network");
  });

  it.each([546, 502, 503, 504])("ingest and frames: %i is retryable, never a refusal", async (status) => {
    const api = createStudentApi(fakeClient({ error: null, status: 200 }), ENV);
    replyWith(status, BODIES[status] ?? "");
    const ingest = await failure(api.ingest({ session_id: SESSION_ID, events: [] }));
    expect(ingest).toMatchObject({ kind: "network", status, retryable: true });
    replyWith(status, BODIES[status] ?? "");
    const frames = await failure(
      api.confirmFrames({ event_id: EVENT_ID, paths: [`frames/${SESSION_ID}/${EVENT_ID}/0.jpg`] }),
    );
    expect(frames).toMatchObject({ kind: "network", status, retryable: true });
  });

  it("still gives up on the replies that mean the request is wrong", async () => {
    const api = createStudentApi(fakeClient({ error: null, status: 200 }), ENV);
    for (const [status, kind] of [
      [400, "bad_request"],
      [403, "forbidden"],
      [404, "not_found"],
    ] as const) {
      replyWith(status, JSON.stringify({ error: kind }));
      const error = await failure(api.ingest({ session_id: SESSION_ID, events: [] }));
      expect(error).toMatchObject({ kind, status, retryable: false });
    }
  });
});

describe("PostgREST replies", () => {
  it.each([502, 503, 504])("the answers upsert: %i is retryable", async (status) => {
    const api = createStudentApi(fakeClient({ error: { message: `HTTP ${status}` }, status }), ENV);
    const error = await failure(
      api.upsertAnswers([
        {
          session_id: SESSION_ID,
          question_id: QUESTION_IDS[0] ?? "",
          choice_id: "a",
          saved_at: "2026-10-09T10:00:00.000Z",
        },
      ]),
    );
    expect(error).toMatchObject({ kind: "network", status, retryable: true });
  });
});
