import { expect, it, describe as suite } from "vitest";
import { Buckets, describe, parseServerTiming, percentile, summarize } from "./stats.ts";

suite("percentile", () => {
  it("uses the nearest rank", () => {
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(sorted, 50)).toBe(5);
    expect(percentile(sorted, 95)).toBe(10);
    expect(percentile(sorted, 0)).toBe(1);
    expect(percentile([], 50)).toBeNull();
  });
});

suite("summarize", () => {
  it("sorts, rounds to 0.1 ms and counts", () => {
    expect(summarize([30, 10.04, 20])).toEqual({ n: 3, min: 10, p50: 20, p95: 30, p99: 30, max: 30 });
    expect(describe(summarize([]))).toBe("no samples");
    expect(describe(summarize([12]))).toBe("n 1 · p50 12 ms · p95 12 ms · p99 12 ms · max 12 ms");
  });
});

suite("parseServerTiming", () => {
  it("reads every metric with a duration", () => {
    expect(parseServerTiming('auth;dur=1.25, rpc;desc="x";dur=8, cold;desc="1", bad;dur=abc')).toEqual({
      auth: 1.25,
      rpc: 8,
    });
    expect(parseServerTiming(null)).toEqual({});
    expect(parseServerTiming("")).toEqual({});
  });
});

suite("Buckets", () => {
  it("summarises each name apart", () => {
    const buckets = new Buckets();
    buckets.addAll({ a: 1, b: 10 });
    buckets.add("a", 3);
    const out = buckets.summaries();
    expect(out.a?.n).toBe(2);
    expect(out.b?.max).toBe(10);
  });
});
