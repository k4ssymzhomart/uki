// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createGate } from "./throttle.ts";

describe("createGate", () => {
  it("passes the first call, then at most once per interval", () => {
    let now = 0;
    const gate = createGate(5000, () => now);
    expect(gate.pass()).toBe(true);
    now = 4999;
    expect(gate.pass()).toBe(false);
    now = 5000;
    expect(gate.pass()).toBe(true);
    now = 9999;
    expect(gate.pass()).toBe(false);
    now = 20_000;
    expect(gate.pass()).toBe(true);
  });
});
