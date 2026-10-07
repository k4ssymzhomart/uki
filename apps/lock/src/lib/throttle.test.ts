import { describe, expect, it } from "vitest";
import { createKindThrottle } from "./throttle.ts";

describe("copy throttle", () => {
  it("lets one event per kind through every 10 s", () => {
    const throttle = createKindThrottle<"copy" | "paste" | "print">();
    expect(throttle.take("copy", 0)).toBe(true);
    expect(throttle.take("copy", 3_000)).toBe(false);
    expect(throttle.take("paste", 3_000)).toBe(true);
    expect(throttle.take("copy", 9_999)).toBe(false);
    expect(throttle.take("copy", 10_000)).toBe(true);
    expect(throttle.take("copy", 15_000)).toBe(false);
    expect(throttle.take("print", 15_000)).toBe(true);
  });

  it("forgets everything on reset (a new lock)", () => {
    const throttle = createKindThrottle<"copy">(10_000);
    throttle.take("copy", 0);
    throttle.reset();
    expect(throttle.take("copy", 1)).toBe(true);
  });
});
