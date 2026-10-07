import { describe, expect, it } from "vitest";
import { mapLimit } from "./async.ts";

describe("mapLimit", () => {
  it("keeps input order and never runs more than the limit at once", async () => {
    let running = 0;
    let peak = 0;
    const result = await mapLimit([30, 5, 20, 1, 10, 2], 2, async (ms, index) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, ms));
      running -= 1;
      return `${index}:${ms}`;
    });
    expect(result).toEqual(["0:30", "1:5", "2:20", "3:1", "4:10", "5:2"]);
    expect(peak).toBe(2);
  });

  it("handles an empty list and rejects on the first failure", async () => {
    expect(await mapLimit([], 3, async () => 1)).toEqual([]);
    await expect(
      mapLimit([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error("no");
        return n;
      }),
    ).rejects.toThrow("no");
    await expect(mapLimit([1], 0, async (n) => n)).rejects.toThrow(RangeError);
  });
});
