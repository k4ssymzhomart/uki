import { describe, expect, it } from "vitest";
import { EXAM_ID, event, initialData, iso, NOW, sessionId, sessionRow } from "./test-helpers.tsx";
import {
  collapseGroupEvents,
  isGroupEvent,
  selectCounts,
  selectFeed,
  selectOrder,
  selectTileView,
  tileLine,
} from "./tiles.ts";
import { applyEvent, initialWallState } from "./wall-store.ts";

describe("tile status lines", () => {
  it("writes each Live wall rule as a dashboard.wall.tile key", () => {
    expect(tileLine({ kind: "done", state: "time_up" })).toEqual({
      key: "tile.done",
      values: { state: "time_up" },
    });
    expect(tileLine({ kind: "paused", reason: "face_missing", sinceMs: 42_000 })).toEqual({
      key: "tile.paused",
      values: { reason: "face_missing", duration: "00:42" },
    });
    expect(tileLine({ kind: "paused", reason: null, sinceMs: null })).toEqual({
      key: "tile.pausedNoTime",
      values: { reason: "other" },
    });
    expect(tileLine({ kind: "no_signal", sinceMs: 31_000 })).toEqual({
      key: "tile.noSignal",
      values: { duration: "00:31" },
    });
    expect(tileLine({ kind: "no_signal", sinceMs: null })).toEqual({ key: "tile.noSignalNever" });
    expect(tileLine({ kind: "flagged", event: "phone", score: 0.94, at: iso(0) })).toEqual({
      key: "tile.phone",
      values: { score: 0.94, time: "10:47" },
    });
    expect(tileLine({ kind: "flagged", event: "second_face", at: iso(-120_000) })).toEqual({
      key: "tile.secondFace",
      values: { time: "10:45" },
    });
    expect(
      tileLine({
        kind: "warning",
        lookedAwayCount: 3,
        lookedAwayMs: 6000,
        last: { type: "gaze.off_screen", at: iso(0) },
      }),
    ).toEqual({ key: "tile.lookedAway", values: { count: 3, seconds: 6 } });
    expect(
      tileLine({
        kind: "warning",
        lookedAwayCount: 1,
        lookedAwayMs: 2400,
        last: { type: "gaze.off_screen", at: iso(0) },
      }),
    ).toEqual({ key: "tile.lookedAwayOnce", values: { seconds: 2.4 } });
    expect(
      tileLine({
        kind: "warning",
        lookedAwayCount: 2,
        lookedAwayMs: 4000,
        last: { type: "tab.blocked", at: iso(-180_000) },
      }),
    ).toEqual({ key: "tile.tabBlocked", values: { time: "10:44" } });
    expect(tileLine({ kind: "on_screen", question: 9 })).toEqual({
      key: "tile.onScreen",
      values: { question: 9 },
    });
    expect(tileLine({ kind: "on_screen" })).toEqual({ key: "tile.onScreenNoQuestion" });
  });
});

function wall() {
  const sessions = [
    sessionRow(1),
    sessionRow(2),
    sessionRow(3),
    sessionRow(4, { state: "paused" }),
    sessionRow(5, { last_seen_at: iso(-45_000) }),
    sessionRow(6, { state: "submitted" }),
  ];
  const events = [
    event(
      1,
      "phone.detected",
      { score: 0.94, held_ms: 6000 },
      { at: iso(-10_000), received_at: iso(-9_000) },
    ),
    event(
      2,
      "gaze.off_screen",
      { duration_ms: 2000, direction: "left" },
      { at: iso(-20_000), received_at: iso(-19_000) },
    ),
    event(
      4,
      "session.paused",
      { reason: "camera_lost" },
      { review: "log", at: iso(-10_000), received_at: iso(-8_000) },
    ),
    event(
      3,
      "answer.saved",
      { question_id: "c0000000-0000-4000-8000-000000000007" },
      { review: "none", received_at: iso(-1_000) },
    ),
  ];
  return initialWallState(initialData(sessions, events), NOW);
}

describe("wall selectors", () => {
  it("derives every tile with the contracts' rules and maps it onto StudentTile's four looks", () => {
    const state = wall();
    expect(selectTileView(state, sessionId(1))).toMatchObject({
      state: "flagged",
      tone: "flag",
      name: "Madina T.",
    });
    expect(selectTileView(state, sessionId(2))).toMatchObject({ state: "warning", tone: "warn" });
    expect(selectTileView(state, sessionId(3))).toMatchObject({ state: "on_screen", tone: "ok" });
    expect(selectTileView(state, sessionId(4))).toMatchObject({
      state: "paused",
      tone: "paused",
      line: { key: "tile.paused", values: { reason: "camera_lost", duration: "00:10" } },
    });
    expect(selectTileView(state, sessionId(5))).toMatchObject({ state: "no_signal", tone: "paused" });
    expect(selectTileView(state, sessionId(6))).toMatchObject({ state: "done", tone: "ok" });
  });

  it("returns the same view object for the same snapshot", () => {
    const state = wall();
    expect(selectTileView(state, sessionId(1))).toBe(selectTileView(state, sessionId(1)));
  });

  it("counts the stat cards", () => {
    expect(selectCounts(wall())).toMatchObject({
      onScreen: 1,
      writing: 5,
      warnings: 1,
      flagged: 1,
      paused: 1,
      noSignal: 1,
      done: 1,
      total: 6,
    });
  });

  it("sorts flags first or by seat, and the Paused chip filters", () => {
    const state = wall();
    expect(selectOrder(state, { sort: "flags", filter: "all" })).toEqual([1, 2, 4, 5, 3, 6].map(sessionId));
    expect(selectOrder(state, { sort: "seat", filter: "all" })).toEqual([1, 2, 3, 4, 5, 6].map(sessionId));
    expect(selectOrder(state, { sort: "flags", filter: "paused" })).toEqual([sessionId(4)]);
  });

  it("feeds Live events with flag and log events, newest first", () => {
    const state = wall();
    const feed = selectFeed(state);
    expect(feed.map((e) => e.type)).toEqual(["session.paused", "phone.detected", "gaze.off_screen"]);
    expect(selectFeed(state)).toBe(feed);
    const next = applyEvent(
      state,
      event(3, "tab.blocked", { host: null }, { received_at: iso(0), exam_id: EXAM_ID }),
    );
    expect(selectFeed(next)[0]?.type).toBe("tab.blocked");
  });

  it("shows a group command once, so it cannot push the flags out of the feed", () => {
    const at = iso(-1_000);
    const perStudent = [1, 2, 3, 4].map((n) =>
      event(
        n,
        "proctor.time_added",
        { minutes: 5, scope: "group", staff_id: `a5000000-0000-4000-8000-00000000000${n}` },
        {
          review: "log",
          source: "proctor",
          at,
          received_at: at,
        },
      ),
    );
    const single = event(
      1,
      "proctor.time_added",
      { minutes: 5, scope: "student" },
      { review: "log", at, received_at: at },
    );
    expect(collapseGroupEvents([...perStudent, single])).toEqual([perStudent[0], single]);
    expect(isGroupEvent(single)).toBe(false);
    const state = perStudent.reduce(applyEvent, wall());
    expect(selectFeed(state).filter((e) => e.type === "proctor.time_added")).toHaveLength(1);
  });
});
