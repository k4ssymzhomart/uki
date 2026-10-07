import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CLOCK_SKEW_MS, measureServerOffset, useNow, useServerOffset } from "./use-now.ts";

const URL_BASE = "http://127.0.0.1:54721";
const DATE = "Wed, 07 Oct 2026 20:06:23 GMT";
const D = Date.parse(DATE);

beforeAll(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", URL_BASE);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
});

afterEach(() => {
  vi.useRealTimers();
});

/** A fetch that answers with `date` (or no Date header) and records each call. */
function fakeFetch(date: string | null) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return { headers: { get: (name: string) => (name.toLowerCase() === "date" ? date : null) } };
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

/** A clock that returns `times` in order. */
function clock(...times: number[]) {
  let i = 0;
  return () => times[Math.min(i++, times.length - 1)] ?? 0;
}

describe("measureServerOffset", () => {
  it("compares the Supabase API's Date header with the middle of the fastest round trip", async () => {
    // The browser runs 3 minutes fast. The first trip waits for a CORS preflight (400 ms), the second
    // takes 100 ms; the header counts whole seconds, so the server's time is taken mid-second.
    const T0 = D + 180_000;
    const { fetchImpl, calls } = fakeFetch(DATE);
    const offset = await measureServerOffset(fetchImpl, clock(T0, T0 + 400, T0 + 500, T0 + 600));
    expect(offset).toBe(D + 500 - (T0 + 550));
    expect(calls).toHaveLength(2);
    expect(calls[0]?.url).toBe(`${URL_BASE}/rest/v1/`);
    expect(calls[0]?.init).toMatchObject({
      method: "HEAD",
      headers: { apikey: "sb_publishable_test" },
      cache: "no-store",
    });
  });

  it("answers null without a usable answer", async () => {
    expect(await measureServerOffset(fakeFetch(null).fetchImpl, clock(D))).toBeNull();
    expect(await measureServerOffset(fakeFetch("not a date").fetchImpl, clock(D))).toBeNull();
    // Both trips took longer than 2 s.
    expect(
      await measureServerOffset(fakeFetch(DATE).fetchImpl, clock(D, D + 2500, D + 3000, D + 5100)),
    ).toBeNull();
    const offline = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    expect(await measureServerOffset(offline, clock(D))).toBeNull();
  });
});

describe("useServerOffset", () => {
  it("keeps a measured gap above CLOCK_SKEW_MS and ignores smaller ones", async () => {
    const fast = async () => -180_000;
    const { result } = renderHook(() => useServerOffset(fast));
    expect(result.current).toBe(0);
    await waitFor(() => expect(result.current).toBe(-180_000));

    const near = async () => CLOCK_SKEW_MS - 1;
    const small = renderHook(() => useServerOffset(near));
    await act(async () => {});
    expect(small.result.current).toBe(0);

    const none = async () => null;
    const missing = renderHook(() => useServerOffset(none));
    await act(async () => {});
    expect(missing.result.current).toBe(0);
  });
});

describe("useNow", () => {
  it("starts from the server's render time, then ticks on this browser's clock plus the offset", () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(D + 180_000);
    const { result } = renderHook(() => useNow(D - 1000, 15_000, -180_000));
    expect(result.current).toBe(D);
    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    expect(result.current).toBe(D + 15_000);
  });
});
