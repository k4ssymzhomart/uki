import { describe, expect, it } from "vitest";
import { createRng } from "./rng.ts";
import { describeLatency, Limiter, Samples } from "./stats.ts";

describe("Samples", () => {
  it("answers nearest-rank percentiles over the kept window", () => {
    const samples = new Samples(100);
    for (let i = 1; i <= 100; i += 1) samples.add(i);
    expect(samples.percentile(50)).toBe(50);
    expect(samples.percentile(95)).toBe(95);
    expect(samples.max()).toBe(100);
    samples.add(1000);
    expect(samples.count).toBe(101);
    expect(samples.max()).toBe(1000);
    expect(describeLatency(new Samples())).toBe("no samples");
  });
});

describe("Limiter", () => {
  it("never runs more than its limit at once and runs every task", async () => {
    const limiter = new Limiter(3);
    let active = 0;
    let peak = 0;
    const done: number[] = [];
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        limiter.run(async () => {
          active += 1;
          peak = Math.max(peak, active);
          await new Promise((resolve) => setTimeout(resolve, 1 + (i % 4)));
          active -= 1;
          done.push(i);
        }),
      ),
    );
    expect(peak).toBe(3);
    expect(done).toHaveLength(20);
    expect(limiter.inFlight).toBe(0);
  });
});

describe("createRng", () => {
  it("repeats for a seed and forks independent streams", () => {
    const a = createRng(42);
    const b = createRng(42);
    expect([a.next(), a.next(), a.int(1, 6)]).toEqual([b.next(), b.next(), b.int(1, 6)]);
    expect(createRng(42).fork("x").next()).not.toBe(createRng(42).fork("y").next());
    const r = createRng(1);
    for (let i = 0; i < 1000; i += 1) {
      const v = r.between(2, 5);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThan(5);
    }
  });
});
