import { THRESHOLDS } from "@uki/contracts";
import { describe, expect, it } from "vitest";
import { eventsSince, REFETCH_OVERLAP_MS } from "./queries.ts";
import { RECONCILE_OVERLAP_MS } from "./use-exam-channel.ts";

describe("eventsSince", () => {
  const now = Date.parse("2026-10-07T10:00:00.000Z");

  it("starts the first read at the initial window", () => {
    expect(eventsSince(null, now, REFETCH_OVERLAP_MS)).toBe(
      new Date(now - THRESHOLDS.wall.initialEventsWindowMs).toISOString(),
    );
  });

  it("reads back the overlap before the last event seen, wider for the periodic reconcile", () => {
    const last = "2026-10-07T09:59:50.000+00:00";
    expect(eventsSince(last, now, REFETCH_OVERLAP_MS)).toBe("2026-10-07T09:59:45.000Z");
    expect(eventsSince(last, now, RECONCILE_OVERLAP_MS)).toBe("2026-10-07T09:58:50.000Z");
  });
});
