import { CommandRequest } from "@uki/contracts";
import { describe, expect, it, vi } from "vitest";
import { createFunctionsClient } from "./functions-client.ts";
import { messageRequest, presetsFor } from "./message-target.ts";
import { EXAM_ID, sessionId } from "./test-helpers.tsx";

const COMMAND_ID = "c0000000-0000-4000-8000-0000000000c1";

function client(reply: () => Promise<Response> | Response, token: string | null = "staff-token") {
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) => reply());
  const api = createFunctionsClient({
    url: "http://127.0.0.1:54721/",
    publishableKey: "sb_publishable_test",
    getAccessToken: async () => token,
    fetch: fetch as unknown as typeof globalThis.fetch,
  });
  return { api, fetch };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("command client", () => {
  it("posts each command shape to /functions/v1/command with the staff token", async () => {
    const { api, fetch } = client(() => json(200, { command_ids: [COMMAND_ID] }));
    const requests: CommandRequest[] = [
      { session_id: sessionId(1), type: "pause", payload: {} },
      { session_id: sessionId(1), type: "resume", payload: {} },
      { session_id: sessionId(1), type: "end", payload: { reason: "Second face twice" } },
      {
        session_id: sessionId(1),
        type: "message",
        payload: { preset: "message.preset.phone_away", scope: "student" },
      },
      {
        exam_id: EXAM_ID,
        scope: "group",
        type: "message",
        payload: { text: "Ten minutes left", scope: "group" },
      },
      { exam_id: EXAM_ID, scope: "group", type: "add_time", payload: { minutes: 10, scope: "group" } },
    ];
    for (const request of requests) {
      const result = await api.command(request);
      expect(result).toEqual({ ok: true, data: { command_ids: [COMMAND_ID] } });
    }
    expect(fetch).toHaveBeenCalledTimes(requests.length);
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe("http://127.0.0.1:54721/functions/v1/command");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      authorization: "Bearer staff-token",
      apikey: "sb_publishable_test",
      "content-type": "application/json",
    });
    expect(fetch.mock.calls.map(([, i]) => JSON.parse(String(i?.body)))).toEqual(requests);
  });

  it("refuses a bad request before it leaves", async () => {
    const { api, fetch } = client(() => json(200, { command_ids: [] }));
    const tooLong = { session_id: sessionId(1), type: "end", payload: { reason: "x".repeat(201) } } as const;
    expect(await api.command(tooLong)).toEqual({ ok: false, code: "bad_request" });
    const wrongScope = {
      session_id: sessionId(1),
      type: "add_time",
      payload: { minutes: 5, scope: "group" },
    } as const;
    expect(await api.command(wrongScope)).toEqual({ ok: false, code: "bad_request" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("maps the function's ApiError codes, a gateway error, a broken reply and no network", async () => {
    const request: CommandRequest = { session_id: sessionId(1), type: "pause", payload: {} };
    expect(await client(() => json(409, { error: "conflict" })).api.command(request)).toEqual({
      ok: false,
      code: "conflict",
    });
    expect(await client(() => json(403, { error: "forbidden", message: "x" })).api.command(request)).toEqual({
      ok: false,
      code: "forbidden",
    });
    expect(
      await client(() => json(401, { msg: "Missing authorization header" })).api.command(request),
    ).toEqual({ ok: false, code: "unauthorized" });
    expect(await client(() => new Response("bad gateway", { status: 502 })).api.command(request)).toEqual({
      ok: false,
      code: "internal",
    });
    expect(await client(() => json(200, { nope: true })).api.command(request)).toEqual({
      ok: false,
      code: "internal",
    });
    expect(await client(() => Promise.reject(new TypeError("Failed to fetch"))).api.command(request)).toEqual(
      { ok: false, code: "network" },
    );
  });

  it("does not call without a signed-in staff member", async () => {
    const { api, fetch } = client(() => json(200, { command_ids: [] }), null);
    expect(await api.command({ session_id: sessionId(1), type: "resume", payload: {} })).toEqual({
      ok: false,
      code: "unauthorized",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reads stills as signed URLs", async () => {
    const urls = [
      {
        frame_id: "f0000000-0000-4000-8000-000000000001",
        url: "http://x/1",
        captured_at: "2026-10-09T05:47:10+00:00",
      },
    ];
    const { api, fetch } = client(() => json(200, { urls }));
    expect(await api.stills({ event_id: "01a10000-0000-7000-8000-000000000001" })).toEqual({
      ok: true,
      data: { urls },
    });
    expect(fetch.mock.calls[0]?.[0]).toBe("http://127.0.0.1:54721/functions/v1/stills");
  });
});

describe("message requests", () => {
  const group = { scope: "group", examId: EXAM_ID, label: "Group 204" } as const;
  const one = { scope: "student", sessionId: sessionId(2), name: "Arman B." } as const;

  it("builds group and student requests the command contract accepts", () => {
    for (const request of [
      messageRequest(group, { preset: "message.preset.time_15" }),
      messageRequest(group, { text: "  Ten minutes left  " }),
      messageRequest(one, { preset: "message.preset.phone_away" }),
      messageRequest(one, { text: "Sit up, please" }),
    ]) {
      expect(CommandRequest.safeParse(request).success).toBe(true);
    }
    expect(messageRequest(group, { text: "  Ten minutes left  " })).toMatchObject({
      payload: { text: "Ten minutes left", scope: "group" },
    });
  });

  it("refuses empty and over-long text", () => {
    expect(messageRequest(one, { text: "   " })).toBeNull();
    expect(messageRequest(one, { text: "x".repeat(281) })).toBeNull();
    expect(messageRequest(one, { text: "x".repeat(280) })).not.toBeNull();
  });

  it("offers the group plural preset and the single-student one", () => {
    expect(presetsFor(group)).toContain("message.preset.phones_away");
    expect(presetsFor(one)).toContain("message.preset.phone_away");
    expect(presetsFor(one)).toHaveLength(3);
  });
});
