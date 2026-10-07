import { describe, expect, it } from "vitest";
import { ServerTiming } from "./timing.ts";

describe("ServerTiming", () => {
  it("writes metrics in first-added order, adding up repeats, to 0.1 ms", () => {
    const timing = new ServerTiming();
    timing.add("auth", 1.234);
    timing.add("sign", 2);
    timing.add("sign", 3.06);
    expect(timing.header()).toBe("auth;dur=1.2, sign;dur=5.1");
  });

  it("skips names that are not tokens and durations that are not numbers", () => {
    const timing = new ServerTiming();
    timing.add("bad name", 1);
    timing.add("x;dur=9", 1);
    timing.add("nan", Number.NaN);
    timing.add("neg", -4);
    expect(timing.header()).toBe("neg;dur=0");
  });

  it("measures an operation whether it resolves or throws", async () => {
    let clock = 0;
    const timing = new ServerTiming(() => clock);
    await timing.measure("rpc", async () => {
      clock += 7;
    });
    await expect(
      timing.measure("rpc", async () => {
        clock += 3;
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(timing.header()).toBe("rpc;dur=10");
  });

  it("is empty without metrics", () => {
    expect(new ServerTiming().header()).toBe("");
  });
});
