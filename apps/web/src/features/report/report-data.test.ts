// loadSharedReport (/r/[token]): which answers of the shared-report function are "not found" and which
// are failures, and that a malformed token never leaves the server.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { sharedFixture } from "./test-fixtures.ts";

vi.mock("../../lib/supabase/server.ts", () => ({}));

const TOKEN = "T".repeat(43);

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

let loadSharedReport: typeof import("./report-data.ts").loadSharedReport;

beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:55021/");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  ({ loadSharedReport } = await import("./report-data.ts"));
});

describe("loadSharedReport", () => {
  it("posts the token to shared-report with the publishable key and returns the report", async () => {
    const fetchImpl = vi.fn(async () => reply(200, sharedFixture()));
    const result = await loadSharedReport(TOKEN, fetchImpl);
    expect(result).toEqual({ ok: true, report: sharedFixture() });
    expect(fetchImpl).toHaveBeenCalledWith("http://127.0.0.1:55021/functions/v1/shared-report", {
      method: "POST",
      headers: { apikey: "sb_publishable_test", "content-type": "application/json" },
      body: JSON.stringify({ token: TOKEN }),
      cache: "no-store",
    });
  });

  it("reads the function's own refusals as not found", async () => {
    const notFound = vi.fn(async () => reply(404, { error: "not_found", message: "no such share" }));
    expect(await loadSharedReport(TOKEN, notFound)).toEqual({ ok: false });
    const badRequest = vi.fn(async () => reply(400, { error: "bad_request", message: "token: Invalid" }));
    expect(await loadSharedReport(TOKEN, badRequest)).toEqual({ ok: false });
  });

  it("never sends a malformed token", async () => {
    const fetchImpl = vi.fn(async () => reply(200, sharedFixture()));
    expect(await loadSharedReport("abc", fetchImpl)).toEqual({ ok: false });
    expect(await loadSharedReport(`${TOKEN}=`, fetchImpl)).toEqual({ ok: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("throws on an outage rather than calling the link expired", async () => {
    const gateway = vi.fn(async () =>
      reply(404, { code: "NOT_FOUND", message: "Requested function was not found" }),
    );
    await expect(loadSharedReport(TOKEN, gateway)).rejects.toThrow("shared-report answered 404");
    const failed = vi.fn(async () => reply(500, { error: "internal" }));
    await expect(loadSharedReport(TOKEN, failed)).rejects.toThrow("shared-report answered 500");
    const html = vi.fn(async () => new Response("<html>Bad gateway</html>", { status: 502 }));
    await expect(loadSharedReport(TOKEN, html)).rejects.toThrow("shared-report answered 502");
  });

  it("fails on a reply that does not match the contract", async () => {
    const odd = vi.fn(async () => reply(200, { report: null }));
    await expect(loadSharedReport(TOKEN, odd)).rejects.toThrow();
  });
});
