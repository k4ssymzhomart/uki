import { describe, expect, it } from "vitest";
import { compact, OTHER_SESSION_ID, pgTime, SESSION_ID, STAFF_ID, T0 } from "../test/fixtures.ts";
import type { CompactEvent } from "./events.ts";
import type { SessionState } from "./session.ts";
import {
  countTiles,
  liveFeed,
  type SortableTile,
  sortTiles,
  type TileResult,
  type TileSessionInput,
  tileState,
} from "./wall.ts";

const S = 1000;
const MIN = 60 * S;
/** The wall clock in these recordings: 10:47 on demo day. */
const NOW = T0 + 7 * MIN;

function session(overrides: Partial<TileSessionInput> = {}): TileSessionInput {
  return {
    id: SESSION_ID,
    state: "writing",
    last_seen_at: pgTime(NOW - 4 * S),
    status: { question: 9 },
    ...overrides,
  };
}

// Recorded sequences, oldest first, as the store holds them.
const quietWriting: CompactEvent[] = [
  compact("exam.started", T0),
  compact("identity.matched", T0 - 5 * MIN, { score: 0.71, tries: 1 }),
  compact("answer.saved", T0 + 1 * MIN, { question_id: STAFF_ID }),
];
const lookedAway: CompactEvent[] = [
  ...quietWriting,
  compact("gaze.off_screen", NOW - 3 * MIN, { duration_ms: 2100, direction: "left" }),
  compact("gaze.on_screen", NOW - 3 * MIN + 2200),
  compact("gaze.down", NOW - 2 * MIN, { duration_ms: 2400 }),
  compact("gaze.off_screen", NOW - 1 * MIN, { duration_ms: 1500, direction: "right" }),
];
const phone: CompactEvent[] = [
  ...lookedAway,
  compact("phone.detected", NOW - 20 * S, { score: 0.94, held_ms: 800 }, { frame_count: 3 }),
];

describe("tileState: one row of the Live wall table at a time", () => {
  it("1 Done: submitted, time up or ended", () => {
    for (const state of ["submitted", "time_up", "ended"] as const) {
      expect(tileState({ session: session({ state }), events: phone }, NOW)).toEqual({
        state: "done",
        line: { kind: "done", state },
      });
    }
  });

  it("2 Paused: no face, with the time since the pause", () => {
    const events = [...quietWriting, compact("session.paused", NOW - 42 * S, { reason: "face_missing" })];
    expect(tileState({ session: session({ state: "paused" }), events }, NOW)).toEqual({
      state: "paused",
      line: { kind: "paused", reason: "face_missing", sinceMs: 42 * S },
    });
  });

  it("2 Paused: camera lost", () => {
    const events = [...quietWriting, compact("session.paused", NOW - 10 * S, { reason: "camera_lost" })];
    expect(tileState({ session: session({ state: "paused" }), events }, NOW).line).toEqual({
      kind: "paused",
      reason: "camera_lost",
      sinceMs: 10 * S,
    });
  });

  it("2 Paused: by the proctor, the latest pause wins", () => {
    const events = [
      ...quietWriting,
      compact("session.paused", NOW - 5 * MIN, { reason: "face_missing" }),
      compact("session.resumed", NOW - 4 * MIN, { paused_ms: 60_000, by: "student" }),
      compact("proctor.paused", NOW - 30 * S, { staff_id: STAFF_ID }),
    ];
    expect(tileState({ session: session({ state: "paused" }), events }, NOW).line).toEqual({
      kind: "paused",
      reason: "proctor",
      sinceMs: 30 * S,
    });
  });

  it("2 Paused: the pause event not in the store yet", () => {
    expect(tileState({ session: session({ state: "paused" }), events: quietWriting }, NOW).line).toEqual({
      kind: "paused",
      reason: null,
      sinceMs: null,
    });
  });

  it("3 No signal: last call older than 30 s", () => {
    const result = tileState(
      { session: session({ last_seen_at: pgTime(NOW - 31 * S) }), events: quietWriting },
      NOW,
    );
    expect(result).toEqual({ state: "no_signal", line: { kind: "no_signal", sinceMs: 31 * S } });
  });

  it("3 No signal: exactly 30 s is still on screen", () => {
    const result = tileState(
      { session: session({ last_seen_at: pgTime(NOW - 30 * S) }), events: quietWriting },
      NOW,
    );
    expect(result.state).toBe("on_screen");
  });

  it("3 No signal: a session that never called falls back to joined_at, then to unknown", () => {
    const joined = tileState(
      { session: session({ last_seen_at: null, joined_at: pgTime(NOW - 5 * S) }), events: [] },
      NOW,
    );
    expect(joined.state).toBe("on_screen");
    const never = tileState({ session: session({ last_seen_at: null }), events: [] }, NOW);
    expect(never).toEqual({ state: "no_signal", line: { kind: "no_signal", sinceMs: null } });
  });

  it("4 Flagged: phone with its score and time", () => {
    const result = tileState({ session: session(), events: phone }, NOW);
    expect(result).toEqual({
      state: "flagged",
      line: { kind: "flagged", event: "phone", score: 0.94, at: pgTime(NOW - 20 * S) },
    });
  });

  it("4 Flagged: second face", () => {
    const events = [...quietWriting, compact("face.second", NOW - 2 * MIN, { duration_ms: 1200, faces: 2 })];
    expect(tileState({ session: session(), events }, NOW).line).toEqual({
      kind: "flagged",
      event: "second_face",
      at: pgTime(NOW - 2 * MIN),
    });
  });

  it("4 Flagged: stays flagged long after, because Phase 0 has no review", () => {
    const events = [...quietWriting, compact("phone.detected", T0 - 40 * MIN, { score: 0.88, held_ms: 400 })];
    expect(tileState({ session: session(), events }, NOW).state).toBe("flagged");
  });

  it("4 Flagged: a reviewed flag no longer counts (Phase 1 hook)", () => {
    const flagId = phone[phone.length - 1]?.id ?? "";
    const result = tileState({ session: session(), events: phone, reviewedEventIds: new Set([flagId]) }, NOW);
    expect(result.state).toBe("warning");
  });

  it("4 Flagged: the latest of phone and second face is shown", () => {
    const events = [...phone, compact("face.second", NOW - 5 * S, { duration_ms: 1000, faces: 2 })];
    expect(tileState({ session: session(), events }, NOW).line).toMatchObject({ event: "second_face" });
  });

  it("5 Warning: looked away 3 times in the last 5 minutes", () => {
    expect(tileState({ session: session(), events: lookedAway }, NOW)).toEqual({
      state: "warning",
      line: {
        kind: "warning",
        lookedAwayCount: 3,
        lookedAwayMs: 2100 + 2400 + 1500,
        last: { type: "gaze.off_screen", at: pgTime(NOW - 1 * MIN) },
      },
    });
  });

  it("5 Warning: tab blocked", () => {
    const events = [...quietWriting, compact("tab.blocked", NOW - 3 * MIN, { app: null })];
    expect(tileState({ session: session(), events }, NOW).line).toEqual({
      kind: "warning",
      lookedAwayCount: 0,
      lookedAwayMs: 0,
      last: { type: "tab.blocked", at: pgTime(NOW - 3 * MIN) },
    });
  });

  it("5 Warning: ends 5 minutes after the last look", () => {
    const events = [...quietWriting, compact("gaze.down", NOW - 5 * MIN - 1, { duration_ms: 2400 })];
    expect(tileState({ session: session(), events }, NOW).state).toBe("on_screen");
    const edge = [...quietWriting, compact("gaze.down", NOW - 5 * MIN, { duration_ms: 2400 })];
    expect(tileState({ session: session(), events: edge }, NOW).state).toBe("warning");
  });

  it("6 On screen: with the question from status", () => {
    expect(tileState({ session: session(), events: quietWriting }, NOW)).toEqual({
      state: "on_screen",
      line: { kind: "on_screen", question: 9 },
    });
    expect(tileState({ session: session({ status: {} }), events: [] }, NOW).line).toEqual({
      kind: "on_screen",
    });
  });
});

describe("tileState: precedence, first match wins", () => {
  it("Done beats paused, no signal and flags", () => {
    const events = [...phone, compact("session.paused", NOW - 10 * S, { reason: "face_missing" })];
    const result = tileState(
      { session: session({ state: "ended", last_seen_at: pgTime(NOW - 10 * MIN) }), events },
      NOW,
    );
    expect(result.state).toBe("done");
  });

  it("Paused beats no signal and a phone flag", () => {
    const events = [...phone, compact("session.paused", NOW - 10 * S, { reason: "face_missing" })];
    const result = tileState(
      { session: session({ state: "paused", last_seen_at: pgTime(NOW - 2 * MIN) }), events },
      NOW,
    );
    expect(result.state).toBe("paused");
  });

  it("No signal beats a phone flag", () => {
    const result = tileState(
      { session: session({ last_seen_at: pgTime(NOW - 45 * S) }), events: phone },
      NOW,
    );
    expect(result.state).toBe("no_signal");
  });

  it("Flagged beats a fresh warning", () => {
    const events = [
      ...phone,
      compact("gaze.off_screen", NOW - 2 * S, { duration_ms: 2000, direction: "up" }),
    ];
    expect(tileState({ session: session(), events }, NOW).state).toBe("flagged");
  });

  it("Warning beats on screen with a question", () => {
    expect(tileState({ session: session({ status: { question: 3 } }), events: lookedAway }, NOW).state).toBe(
      "warning",
    );
  });

  it("ignores duplicates and other sessions' events", () => {
    const look = compact("gaze.down", NOW - 1 * MIN, { duration_ms: 2000 });
    const other = compact(
      "phone.detected",
      NOW - 1 * MIN,
      { score: 0.9, held_ms: 400 },
      {
        session_id: OTHER_SESSION_ID,
      },
    );
    const result = tileState({ session: session(), events: [look, look, { ...look }, other] }, NOW);
    expect(result.line).toMatchObject({ kind: "warning", lookedAwayCount: 1, lookedAwayMs: 2000 });
  });

  it("ignores info-only gaze.on_screen and lock logs for the warning", () => {
    const events = [
      compact("gaze.on_screen", NOW - 10 * S),
      compact("copy.blocked", NOW - 10 * S, { kind: "copy" }, { source: "lock" }),
      compact("site.closed", NOW - 10 * S, { host: "wikipedia.org" }, { source: "lock" }),
    ];
    expect(tileState({ session: session(), events }, NOW).state).toBe("on_screen");
  });
});

function tile(
  state: SessionState,
  result: TileResult["state"],
): { session: { state: SessionState }; tile: TileResult } {
  return { session: { state }, tile: { state: result, line: { kind: "on_screen" } as TileResult["line"] } };
}

describe("countTiles", () => {
  it("counts the stat cards", () => {
    const counts = countTiles([
      tile("writing", "on_screen"),
      tile("writing", "on_screen"),
      tile("writing", "warning"),
      tile("writing", "flagged"),
      tile("paused", "paused"),
      tile("writing", "no_signal"),
      tile("submitted", "done"),
      tile("ready", "on_screen"),
    ]);
    expect(counts).toEqual({
      onScreen: 2,
      writing: 6,
      warnings: 1,
      flagged: 1,
      paused: 1,
      noSignal: 1,
      done: 1,
      total: 8,
    });
  });
});

describe("sortTiles", () => {
  const make = (id: string, seat: number | null, state: TileResult["state"]): SortableTile => ({
    id,
    seat,
    tile: { state, line: { kind: "on_screen" } as TileResult["line"] },
  });
  const tiles = [
    make("a", 3, "on_screen"),
    make("b", 1, "flagged"),
    make("c", null, "warning"),
    make("d", 2, "warning"),
    make("e", 4, "done"),
    make("f", 5, "paused"),
    make("g", 6, "no_signal"),
  ];

  it("puts flags first, then by seat", () => {
    expect(sortTiles(tiles, "flags").map((t) => t.id)).toEqual(["b", "d", "c", "f", "g", "a", "e"]);
  });

  it("sorts by seat with missing seats last", () => {
    expect(sortTiles(tiles, "seat").map((t) => t.id)).toEqual(["b", "d", "a", "e", "f", "g", "c"]);
  });

  it("returns a copy", () => {
    const sorted = sortTiles(tiles);
    expect(sorted).not.toBe(tiles);
    expect(tiles[0]?.id).toBe("a");
  });
});

describe("liveFeed", () => {
  it("keeps flag and log events, newest first by received_at, deduplicated", () => {
    const late = compact(
      "net.offline",
      NOW - 2 * MIN,
      { offline_ms: 30_000, queued: 4 },
      {
        received_at: pgTime(NOW - 1 * S),
      },
    );
    const flag = compact("phone.detected", NOW - 10 * S, { score: 0.94, held_ms: 800 });
    const none = compact("answer.saved", NOW - 5 * S, { question_id: STAFF_ID });
    const log = compact("copy.blocked", NOW - 30 * S, { kind: "copy" });
    const feed = liveFeed([log, flag, none, late, flag]);
    expect(feed.map((e) => e.type)).toEqual(["net.offline", "phone.detected", "copy.blocked"]);
  });

  it("caps at 100", () => {
    const many = Array.from({ length: 150 }, (_, i) =>
      compact("gaze.down", T0 + i * S, { duration_ms: 2000 }),
    );
    const feed = liveFeed(many);
    expect(feed).toHaveLength(100);
    expect(feed[0]?.at).toBe(pgTime(T0 + 149 * S));
  });

  it("keeps the session filter to the caller", () => {
    const a = compact("gaze.down", T0, { duration_ms: 2000 });
    const b = compact("gaze.down", T0, { duration_ms: 2000 }, { session_id: OTHER_SESSION_ID });
    expect(liveFeed([a, b])).toHaveLength(2);
    expect(a.session_id).toBe(SESSION_ID);
  });
});
