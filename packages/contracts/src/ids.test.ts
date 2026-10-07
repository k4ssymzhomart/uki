import { describe, expect, it } from "vitest";
import { z } from "zod";
import { isUuid, uuidv7, uuidv7Time } from "./ids.ts";

const V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("uuidv7", () => {
  it("has version 7, the RFC variant and lower-case hex", () => {
    for (let i = 0; i < 100; i += 1) expect(uuidv7()).toMatch(V7);
  });

  it("is accepted by z.uuid() and isUuid", () => {
    const id = uuidv7();
    expect(z.uuid().safeParse(id).success).toBe(true);
    expect(isUuid(id)).toBe(true);
  });

  it("carries its millisecond timestamp", () => {
    const ms = Date.UTC(2026, 9, 9, 10, 40, 0, 123);
    expect(uuidv7Time(uuidv7(ms))).toBe(ms);
  });

  it("sorts in creation order within one millisecond", () => {
    const ms = Date.UTC(2030, 0, 1);
    const ids = Array.from({ length: 5000 }, () => uuidv7(ms));
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("stays in order when the clock steps back", () => {
    const later = uuidv7(Date.UTC(2031, 0, 1, 0, 0, 1));
    const earlier = uuidv7(Date.UTC(2031, 0, 1, 0, 0, 0));
    expect(earlier > later).toBe(true);
  });

  it("borrows the next millisecond when the counter runs out", () => {
    const ms = Date.UTC(2032, 0, 1);
    const ids = Array.from({ length: 4097 }, () => uuidv7(ms));
    expect([...ids].sort()).toEqual(ids);
    expect(uuidv7Time(ids[ids.length - 1] ?? "")).toBeGreaterThan(ms);
  });

  it("sorts across milliseconds", () => {
    const a = uuidv7(Date.UTC(2033, 0, 1, 0, 0, 0, 1));
    const b = uuidv7(Date.UTC(2033, 0, 1, 0, 0, 0, 2));
    expect(a < b).toBe(true);
  });
});

describe("isUuid", () => {
  it("rejects non-UUIDs", () => {
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid(42)).toBe(false);
    expect(isUuid(undefined)).toBe(false);
    expect(uuidv7Time("not-a-uuid")).toBeNull();
    expect(uuidv7Time("6ba7b810-9dad-41d1-80b4-00c04fd430c8")).toBeNull();
  });
});
