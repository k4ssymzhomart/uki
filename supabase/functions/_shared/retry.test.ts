import { describe, expect, it } from "vitest";
import { isGatewayFailure, retryOnGateway } from "./retry.ts";

const KONG_502 = {
  error: { message: "An invalid response was received from the upstream server", code: "", details: null },
  status: 502,
};

describe("isGatewayFailure", () => {
  it("recognises Kong's 502 and network failures", () => {
    expect(isGatewayFailure(KONG_502)).toBe(true);
    expect(isGatewayFailure({ error: { message: "TypeError: fetch failed" }, status: 0 })).toBe(true);
    expect(isGatewayFailure({ error: { name: "StorageUnknownError", message: "x" } })).toBe(true);
    expect(
      isGatewayFailure({ error: { name: "StorageApiError", message: "bad gateway", status: 502 } }),
    ).toBe(true);
  });

  it("leaves database and client errors alone", () => {
    expect(isGatewayFailure({ error: null, status: 200 })).toBe(false);
    expect(isGatewayFailure({ error: { code: "P0001", message: "conflict" }, status: 400 })).toBe(false);
    expect(isGatewayFailure({ error: { code: "42501", message: "forbidden" }, status: 403 })).toBe(false);
    expect(isGatewayFailure({ error: { message: "bad upstream server name in data" }, status: 400 })).toBe(
      false,
    );
    expect(
      isGatewayFailure({ error: { name: "StorageApiError", message: "fetch failed", status: 400 } }),
    ).toBe(false);
    expect(
      isGatewayFailure({ error: { name: "StorageApiError", message: "Object not found", status: 404 } }),
    ).toBe(false);
  });
});

describe("retryOnGateway", () => {
  it("retries once after a gateway failure", async () => {
    const results = [KONG_502, { error: null, status: 200, data: 1 }];
    let calls = 0;
    const result = await retryOnGateway(async () => results[calls++] ?? KONG_502, 0);
    expect(calls).toBe(2);
    expect(result.error).toBeNull();
  });

  it("does not retry success, a database error, or a second gateway failure", async () => {
    for (const first of [
      { error: null, status: 200 },
      { error: { message: "conflict" }, status: 409 },
    ]) {
      let calls = 0;
      await retryOnGateway(async () => {
        calls += 1;
        return first;
      }, 0);
      expect(calls).toBe(1);
    }
    let calls = 0;
    const last = await retryOnGateway(async () => {
      calls += 1;
      return KONG_502;
    }, 0);
    expect(calls).toBe(2);
    expect(last.status).toBe(502);
  });
});
