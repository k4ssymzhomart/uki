import { describe, expect, it } from "vitest";
import { chunked, retentionAuditRow, tally, type WorkspaceRun } from "./runs.ts";

const WS_A = "a0000000-0000-4000-8000-000000000001";
const WS_B = "a0000000-0000-4000-8000-000000000002";

describe("a retention run", () => {
  it("counts the stills of each workspace across batches, with the oldest and newest capture", () => {
    const totals = new Map<string, WorkspaceRun>();
    tally(totals, [
      { frame_id: "1", workspace_id: WS_A, storage_path: "a/1.jpg", captured_at: "2026-07-01T10:00:00Z" },
      { frame_id: "2", workspace_id: WS_B, storage_path: "b/2.jpg", captured_at: "2026-07-02T10:00:00Z" },
    ]);
    tally(totals, [
      { frame_id: "3", workspace_id: WS_A, storage_path: "a/3.jpg", captured_at: "2026-06-30T10:00:00Z" },
    ]);
    expect(totals.get(WS_A)).toEqual({
      frames: 2,
      oldest: "2026-06-30T10:00:00Z",
      newest: "2026-07-01T10:00:00Z",
    });
    expect(totals.get(WS_B)?.frames).toBe(1);
  });

  it("writes one audit row per workspace, as the system", () => {
    expect(
      retentionAuditRow(
        WS_A,
        { frames: 2, oldest: "2026-06-30T10:00:00Z", newest: "2026-07-01T10:00:00Z" },
        90,
      ),
    ).toEqual({
      workspace_id: WS_A,
      actor_id: null,
      actor_kind: "service",
      action: "retention.run",
      object_type: "workspace",
      object_id: WS_A,
      meta: {
        frames: 2,
        retention_days: 90,
        oldest_captured_at: "2026-06-30T10:00:00Z",
        newest_captured_at: "2026-07-01T10:00:00Z",
      },
    });
  });

  it("splits ids into chunks", () => {
    expect(chunked([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunked([], 100)).toEqual([]);
    expect(() => chunked([1], 0)).toThrow(RangeError);
  });
});
