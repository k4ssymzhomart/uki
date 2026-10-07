import { tileState } from "@uki/contracts";
import { describe, expect, it } from "vitest";
import { loadWall } from "./load-wall.ts";
import type { AnyClient } from "./queries.ts";
import { EXAM_ID, event, iso, NOW, sessionId, sessionRow, studentId } from "./test-helpers.tsx";
import { initialWallState } from "./wall-store.ts";

const WORKSPACE_ID = "a0000000-0000-4000-8000-000000000001";

type Row = Record<string, unknown>;

/**
 * A PostgREST stand-in that applies the filters loadWall uses (eq, in, gte, lt, order, range), so a
 * query's window really decides what comes back.
 */
function postgrest(tables: Record<string, Row[]>): AnyClient {
  const query = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    const time = (value: unknown) => Date.parse(String(value));
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        rows = rows.filter((row) => row[column] === value);
        return builder;
      },
      in: (column: string, values: unknown[]) => {
        rows = rows.filter((row) => values.includes(row[column]));
        return builder;
      },
      gte: (column: string, value: unknown) => {
        rows = rows.filter((row) => time(row[column]) >= time(value));
        return builder;
      },
      lt: (column: string, value: unknown) => {
        rows = rows.filter((row) => time(row[column]) < time(value));
        return builder;
      },
      order: () => builder,
      range: (from: number, to: number) => {
        rows = rows.slice(from, to + 1);
        return builder;
      },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      // biome-ignore lint/suspicious/noThenProperty: a PostgREST builder is awaited like a promise
      then: (resolve: (result: { data: Row[]; error: null }) => void) => resolve({ data: rows, error: null }),
    };
    return builder;
  };
  return {
    from: query,
    rpc: async () => ({ data: 20, error: null }),
  } as unknown as AnyClient;
}

describe("loadWall", () => {
  it("loads a phone flag older than the 60-minute window, so its tile is still Flagged", async () => {
    const oldPhone = event(
      1,
      "phone.detected",
      { score: 0.94 },
      {
        at: iso(-65 * 60_000),
        received_at: iso(-65 * 60_000 + 1000),
      },
    );
    const oldSecondFace = event(
      2,
      "face.second",
      { faces: 2 },
      {
        at: iso(-80 * 60_000),
        received_at: iso(-80 * 60_000 + 1000),
      },
    );
    const oldGaze = event(
      3,
      "gaze.off_screen",
      { duration_ms: 2300 },
      {
        at: iso(-70 * 60_000),
        received_at: iso(-70 * 60_000 + 1000),
      },
    );
    const recentGaze = event(
      1,
      "gaze.down",
      { duration_ms: 2100 },
      {
        at: iso(-10 * 60_000),
        received_at: iso(-10 * 60_000 + 1000),
      },
    );
    const client = postgrest({
      exams: [
        {
          id: EXAM_ID,
          workspace_id: WORKSPACE_ID,
          title: "Mathematics 2 · Midterm",
          starts_at: iso(-70 * 60_000),
          duration_min: 90,
          status: "live",
        },
      ],
      exam_groups: [{ exam_id: EXAM_ID, groups: { code: "204" } }],
      exam_students: [1, 2, 3].map((n) => ({
        exam_id: EXAM_ID,
        seat: n,
        students: { id: studentId(n), full_name: `Student Number${n}`, student_number: `2023100${n}` },
      })),
      sessions: [1, 2, 3].map((n) => ({ ...sessionRow(n), exam_id: EXAM_ID })),
      events: [oldPhone, oldSecondFace, oldGaze, recentGaze],
      staff: [],
    });

    const data = await loadWall(client, EXAM_ID, NOW);
    expect(data).not.toBeNull();
    if (data === null) return;
    expect(data.events.map((e) => e.id).sort()).toEqual(
      [oldPhone.id, oldSecondFace.id, recentGaze.id].sort(),
    );

    const state = initialWallState(data, NOW);
    const tile = (n: number) =>
      tileState(
        {
          session: { id: sessionId(n), state: "writing", last_seen_at: iso(-5_000) },
          events: state.events[sessionId(n)] ?? [],
        },
        NOW,
      ).state;
    expect(tile(1)).toBe("flagged");
    expect(tile(2)).toBe("flagged");
    expect(tile(3)).toBe("on_screen");
  });
});
