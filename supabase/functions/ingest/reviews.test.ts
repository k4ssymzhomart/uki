import { describe, expect, it } from "vitest";
import { EVENT_TYPES, type EventType, REVIEW } from "../_shared/contracts/index.ts";
import { assignReviews } from "./reviews.ts";

const none = { fullscreenExits: 0, storedIds: new Set<string>() };
const id = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, "0")}`;

describe("assignReviews", () => {
  it("takes every type's review from the contracts REVIEW map", () => {
    const events = EVENT_TYPES.filter((type) => type !== "lock.fullscreen_exit").map((type, i) => ({
      id: id(i),
      type,
    }));
    expect(assignReviews(events, none)).toEqual(events.map((event) => REVIEW[event.type]));
  });

  it("flags the third and every later fullscreen exit of the session", () => {
    const exits = [1, 2, 3, 4].map((n) => ({ id: id(n), type: "lock.fullscreen_exit" as EventType }));
    expect(assignReviews(exits, none)).toEqual(["log", "log", "flag", "flag"]);
    expect(assignReviews(exits.slice(0, 2), { fullscreenExits: 1, storedIds: new Set() })).toEqual([
      "log",
      "flag",
    ]);
  });

  it("does not count a resent or repeated exit again", () => {
    const first = { id: id(1), type: "lock.fullscreen_exit" as EventType };
    const second = { id: id(2), type: "lock.fullscreen_exit" as EventType };
    // id(1) is already stored, so the session has 1 exit; the resend and its in-batch repeat add nothing.
    const stored = { fullscreenExits: 1, storedIds: new Set([id(1)]) };
    expect(assignReviews([first, first, second], stored)).toEqual(["log", "log", "log"]);
    expect(assignReviews([first, second, { id: id(3), type: "lock.fullscreen_exit" }], stored)).toEqual([
      "log",
      "log",
      "flag",
    ]);
  });
});
