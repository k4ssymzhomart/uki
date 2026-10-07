import { describe, expect, it } from "vitest";
import { RateLimiter } from "./rate-limit.ts";

function clock(start = 0) {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

describe("RateLimiter", () => {
  it("allows 10 calls a second per key and refuses the 11th", () => {
    const time = clock();
    const limiter = new RateLimiter({ limit: 10, windowMs: 1000, now: time.now });
    for (let i = 0; i < 10; i++) expect(limiter.hit("s1")).toBe(true);
    expect(limiter.hit("s1")).toBe(false);
    expect(limiter.hit("s2")).toBe(true);
  });

  it("slides: a call is allowed again once the oldest leaves the window", () => {
    const time = clock();
    const limiter = new RateLimiter({ limit: 2, windowMs: 1000, now: time.now });
    expect(limiter.hit("s")).toBe(true);
    time.advance(600);
    expect(limiter.hit("s")).toBe(true);
    expect(limiter.hit("s")).toBe(false);
    time.advance(401);
    expect(limiter.hit("s")).toBe(true);
    expect(limiter.hit("s")).toBe(false);
  });

  it("does not count refused calls", () => {
    const time = clock();
    const limiter = new RateLimiter({ limit: 1, windowMs: 1000, now: time.now });
    expect(limiter.hit("s")).toBe(true);
    for (let i = 0; i < 5; i++) {
      time.advance(100);
      expect(limiter.hit("s")).toBe(false);
    }
    time.advance(500);
    expect(limiter.hit("s")).toBe(true);
  });

  it("forgets the stalest keys beyond maxKeys", () => {
    const time = clock();
    const limiter = new RateLimiter({ limit: 1, windowMs: 1000, maxKeys: 2, now: time.now });
    limiter.hit("a");
    limiter.hit("b");
    limiter.hit("c");
    expect(limiter.size).toBe(2);
    expect(limiter.hit("a")).toBe(true);
    expect(limiter.hit("c")).toBe(false);
  });

  it("rejects a nonsensical configuration", () => {
    expect(() => new RateLimiter({ limit: 0, windowMs: 1000 })).toThrow(RangeError);
    expect(() => new RateLimiter({ limit: 1, windowMs: 0 })).toThrow(RangeError);
  });
});
