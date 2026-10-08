// loadSharedReport (/r/[token]): which answers of the shared-report function are "not found" and which
// are failures, and that a malformed token never leaves the server. verifyReport (/verify/[code]): the
// client's hash goes with the code, and a refusal after 10 lookups is "rate_limited". activeShares: 3.4
// reads only the links that still open, and never a token.
import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { sharedFixture } from "./test-fixtures.ts";

vi.mock("../../lib/supabase/server.ts", () => ({}));

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@uki/db", () => ({ createUkiClient: vi.fn(() => ({ rpc })) }));

const TOKEN = "T".repeat(43);

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

let data: typeof import("./report-data.ts");
let loadSharedReport: typeof import("./report-data.ts").loadSharedReport;

beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:55021/");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  data = await import("./report-data.ts");
  ({ loadSharedReport } = data);
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

describe("verifyReport and the client", () => {
  const CLIENT = createHash("sha256").update("203.0.113.7", "utf8").digest("hex");

  it("takes the client's address from x-forwarded-for, then x-real-ip", () => {
    expect(data.clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(data.clientIp(new Headers({ "x-real-ip": " 198.51.100.4 " }))).toBe("198.51.100.4");
    expect(data.clientIp(new Headers({ "x-forwarded-for": " ", "x-real-ip": "198.51.100.4" }))).toBe(
      "198.51.100.4",
    );
    expect(data.clientIp(new Headers())).toBe("unknown");
  });

  it("hashes the address with SHA-256, so the address itself is never sent", () => {
    expect(data.clientHash("203.0.113.7")).toBe(CLIENT);
    expect(data.clientHash("203.0.113.7")).toMatch(/^[0-9a-f]{64}$/);
    expect(data.clientHash("203.0.113.8")).not.toBe(CLIENT);
  });

  it("asks verify_report with the code and the client's hash", async () => {
    rpc.mockResolvedValueOnce({ data: { found: false }, error: null });
    expect(await data.verifyReport("uki-7k2m-9qxd", CLIENT)).toEqual({ found: false });
    expect(rpc).toHaveBeenLastCalledWith("verify_report", { code: "uki-7k2m-9qxd", client_hash: CLIENT });
  });

  it("reads the 11th lookup in a minute as rate_limited", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "rate_limited", details: "42", code: "PT429" },
    });
    expect(await data.verifyReport("UKI-7K2M-9QXD", CLIENT)).toBe("rate_limited");
  });

  it("throws on any other failure, and never asks for an empty or overlong code or a bad client", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    await expect(data.verifyReport("UKI-7K2M-9QXD", CLIENT)).rejects.toThrow("verify_report: boom");
    rpc.mockClear();
    expect(await data.verifyReport("", CLIENT)).toEqual({ found: false });
    expect(await data.verifyReport("x".repeat(65), CLIENT)).toEqual({ found: false });
    expect(await data.verifyReport("UKI-7K2M-9QXD", "203.0.113.7")).toEqual({ found: false });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("activeShares", () => {
  it("reads the report's links that are neither revoked nor expired, without their tokens", async () => {
    const calls: unknown[][] = [];
    const rows = [
      {
        id: "01900000-0000-7000-8000-0000000000b1",
        created_at: "2026-10-09T06:52:00Z",
        expires_at: "2026-11-08T06:52:00Z",
      },
    ];
    const query = {
      select(...args: unknown[]) {
        calls.push(["select", ...args]);
        return query;
      },
      eq(...args: unknown[]) {
        calls.push(["eq", ...args]);
        return query;
      },
      is(...args: unknown[]) {
        calls.push(["is", ...args]);
        return query;
      },
      gt(column: string) {
        calls.push(["gt", column]);
        return query;
      },
      order(...args: unknown[]) {
        calls.push(["order", ...args]);
        return Promise.resolve({ data: rows, error: null });
      },
    };
    const supabase = {
      from(table: string) {
        calls.push(["from", table]);
        return query;
      },
    };
    const shares = await data.activeShares(supabase as never, "f0000000-0000-4000-8000-000000000917");
    expect(shares).toEqual(rows);
    expect(calls).toEqual([
      ["from", "report_shares"],
      ["select", "id, created_at, expires_at"],
      ["eq", "report_id", "f0000000-0000-4000-8000-000000000917"],
      ["is", "revoked_at", null],
      ["gt", "expires_at"],
      ["order", "created_at", { ascending: true }],
    ]);
  });
});
