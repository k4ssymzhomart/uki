import type { HelpRequest } from "@uki/contracts";
import { describe, expect, it } from "vitest";
import {
  applyHelp,
  EMPTY_HELP,
  hasOpenRequest,
  initialHelpState,
  mergeOpenHelp,
  openCount,
  openRequests,
  REASON_TONE,
} from "./help-model.ts";

const EXAM = "e0000000-0000-4000-8000-0000000000aa";

function help(n: number, overrides: Partial<HelpRequest> = {}): HelpRequest {
  return {
    id: `4e100000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    session_id: `5e550000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    exam_id: EXAM,
    student_id: `b0000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    student_name: n === 1 ? "Kamila Rakhimova" : "Saule Tokhtarova",
    topic: n === 1 ? "question" : "technical",
    text: n === 1 ? "Q 8: is the angle in radians or degrees?" : null,
    created_at: `2026-10-09T05:4${n}:00.000Z`,
    reply: null,
    done_at: null,
    done_by: null,
    ...overrides,
  };
}

const done = (request: HelpRequest): HelpRequest => ({
  ...request,
  done_at: "2026-10-09T05:50:00.000Z",
  done_by: "a5000000-0000-4000-8000-000000000001",
});

describe("2.4d requests", () => {
  it("lists open requests newest first, as 2.4d does, and counts them for the badge", () => {
    const state = initialHelpState([help(1), help(2)]);
    expect(openRequests(state).map((r) => r.student_name)).toEqual(["Saule Tokhtarova", "Kamila Rakhimova"]);
    expect(openCount(state)).toBe(2);
    expect(openRequests(state)).toBe(openRequests(state));
    expect(hasOpenRequest(state, help(1).session_id)).toBe(true);
    expect(hasOpenRequest(state, "5e550000-0000-4000-8000-000000000009")).toBe(false);
  });

  it("adds a request from a `help` message and drops it when the closing arrives", () => {
    let state = applyHelp(EMPTY_HELP, help(1));
    expect(openCount(state)).toBe(1);
    expect(applyHelp(state, help(1))).toBe(state);
    state = applyHelp(state, done(help(1)));
    expect(openCount(state)).toBe(0);
    expect(applyHelp(state, done(help(1)))).toBe(state);
    // A late copy of the opening message does not bring it back.
    expect(openCount(applyHelp(state, help(1)))).toBe(0);
  });

  it("takes a catch-up read as the list, keeps what arrived during it, and never reopens a closed one", () => {
    const start = initialHelpState([help(1), help(2)]);
    const closed = applyHelp(start, done(help(2)));
    // The read began before help 2 was closed and before help 3 arrived.
    const during = applyHelp(closed, help(3));
    const merged = mergeOpenHelp(during, [help(1), help(2)], new Set([help(3).id]));
    expect(openRequests(merged).map((r) => r.id)).toEqual([help(3).id, help(1).id]);
    // A read that finds nothing open empties the list.
    expect(openCount(mergeOpenHelp(merged, []))).toBe(0);
    // The same list again changes nothing.
    expect(mergeOpenHelp(merged, [help(1), help(3)])).toBe(merged);
  });

  it("colours the reasons as 2.4d draws them", () => {
    expect(REASON_TONE.question).toBe("brand");
    expect(REASON_TONE.technical).toBe("warn");
    expect(Object.keys(REASON_TONE).sort()).toEqual(["break", "identity", "other", "question", "technical"]);
  });
});
