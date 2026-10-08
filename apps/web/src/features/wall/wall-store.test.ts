import { tileState } from "@uki/contracts";
import { describe, expect, it } from "vitest";
import { EXAM_ID, event, initialData, iso, NOW, sessionId, sessionRow, studentId } from "./test-helpers.tsx";
import { selectHasOpenFlag, selectTileResult } from "./tiles.ts";
import {
  applyDecision,
  applyEvent,
  applyFrame,
  applySession,
  createWallStore,
  initialWallState,
  MAX_EVENTS_PER_SESSION,
  mergeDecisions,
  mergeEvents,
  mergeSessions,
  tick,
} from "./wall-store.ts";

describe("wall store reducers", () => {
  it("builds the initial state from the server render, events ordered by received_at", () => {
    const late = event(1, "gaze.off_screen", { duration_ms: 2000 }, { received_at: iso(-1_000) });
    const early = event(1, "phone.detected", { score: 0.9 }, { received_at: iso(-9_000) });
    const state = initialWallState(initialData(undefined, [late, early]), NOW);
    expect(Object.keys(state.sessions)).toHaveLength(3);
    expect(state.events[sessionId(1)]?.map((e) => e.id)).toEqual([early.id, late.id]);
    expect(state.lastReceivedAt).toBe(late.received_at);
    expect(state.staffNames["a5000000-0000-4000-8000-000000000001"]).toBe("Aigerim Sadykova");
  });

  it("adds an event message and drops a duplicate id", () => {
    const state = initialWallState(initialData(), NOW);
    const phone = event(2, "phone.detected", { score: 0.94 });
    const once = applyEvent(state, phone);
    expect(once.events[sessionId(2)]).toEqual([phone]);
    const twice = applyEvent(once, { ...phone });
    expect(twice).toBe(once);
  });

  it("ignores events of another exam", () => {
    const state = initialWallState(initialData(), NOW);
    const other = event(1, "phone.detected", {}, { exam_id: "e0000000-0000-4000-8000-0000000000bb" });
    expect(applyEvent(state, other)).toBe(state);
  });

  it("merges a refetch that overlaps what the channel already delivered", () => {
    const seen = event(1, "gaze.down", { duration_ms: 2100 }, { received_at: iso(-3_000) });
    const missed = event(1, "face.second", { duration_ms: 4000, faces: 2 }, { received_at: iso(-2_000) });
    const state = applyEvent(initialWallState(initialData(), NOW), seen);
    const merged = mergeEvents(state, [seen, missed, { ...seen }]);
    expect(merged.events[sessionId(1)]?.map((e) => e.id)).toEqual([seen.id, missed.id]);
    expect(merged.lastReceivedAt).toBe(missed.received_at);
    expect(mergeEvents(merged, [seen, missed])).toBe(merged);
  });

  it("keeps at most MAX_EVENTS_PER_SESSION events per session, newest kept", () => {
    const many = Array.from({ length: MAX_EVENTS_PER_SESSION + 5 }, (_, i) =>
      event(1, "answer.saved", {}, { review: "none", received_at: iso(-100_000 + i * 10) }),
    );
    const state = mergeEvents(initialWallState(initialData(), NOW), many);
    const kept = state.events[sessionId(1)] ?? [];
    expect(kept).toHaveLength(MAX_EVENTS_PER_SESSION);
    expect(kept.at(-1)?.id).toBe(many.at(-1)?.id);
    expect(kept[0]?.id).toBe(many[5]?.id);
  });

  it("never lets the cap drop a phone flag or the current pause, so the tile keeps them", () => {
    const phone = event(
      1,
      "phone.detected",
      { score: 0.94 },
      { at: iso(-3_000_000), received_at: iso(-2_999_000) },
    );
    const pause = event(
      2,
      "session.paused",
      { reason: "face_missing" },
      { review: "log", received_at: iso(-2_999_000) },
    );
    const noise = (n: number) =>
      Array.from({ length: MAX_EVENTS_PER_SESSION }, (_, i) =>
        event(
          n,
          i % 2 === 0 ? "gaze.on_screen" : "answer.saved",
          {},
          {
            review: "none",
            at: iso(-2_000_000 + i * 10),
            received_at: iso(-2_000_000 + i * 10),
          },
        ),
      );
    let state = mergeEvents(initialWallState(initialData(), NOW), [phone, pause]);
    state = mergeEvents(state, [...noise(1), ...noise(2)]);

    const one = state.events[sessionId(1)] ?? [];
    expect(one).toHaveLength(MAX_EVENTS_PER_SESSION);
    expect(one[0]?.id).toBe(phone.id);
    const tile = tileState(
      { session: { id: sessionId(1), state: "writing", last_seen_at: iso(-5_000) }, events: one },
      NOW,
    );
    expect(tile.state).toBe("flagged");

    const two = state.events[sessionId(2)] ?? [];
    expect(two.map((e) => e.id)).toContain(pause.id);
    const paused = tileState(
      { session: { id: sessionId(2), state: "paused", last_seen_at: iso(-5_000) }, events: two },
      NOW,
    );
    expect(paused.line).toEqual({ kind: "paused", reason: "face_missing", sinceMs: 60_000 });
  });

  it("applies a session message to its tile fields", () => {
    const state = initialWallState(initialData(), NOW);
    const next = applySession(state, {
      id: sessionId(1),
      exam_id: EXAM_ID,
      state: "paused",
      status: { question: 9 },
      last_seen_at: iso(0),
      extra_min: 10,
      paused_s: 42,
    });
    expect(next.sessions[sessionId(1)]).toMatchObject({
      state: "paused",
      status: { question: 9 },
      lastSeenAt: iso(0),
      extraMin: 10,
      pausedS: 42,
      studentId: studentId(1),
    });
  });

  it("adds a new join from its session message, or asks for a refetch when the student is unknown", () => {
    const data = initialData([sessionRow(1)]);
    data.students.push({ id: studentId(4), fullName: "Aruzhan Kassymova", number: "20231004", seat: 8 });
    const state = initialWallState(data, NOW);
    const joined = applySession(state, {
      id: sessionId(4),
      exam_id: EXAM_ID,
      student_id: studentId(4),
      state: "joined",
      status: {},
      last_seen_at: null,
      extra_min: 0,
      paused_s: 0,
    });
    expect(joined.sessions[sessionId(4)]?.studentId).toBe(studentId(4));
    expect(joined.unknownSessions).toBe(false);

    const stranger = applySession(state, {
      id: sessionId(9),
      exam_id: EXAM_ID,
      state: "joined",
      status: {},
      last_seen_at: null,
      extra_min: 0,
      paused_s: 0,
    });
    expect(stranger.sessions[sessionId(9)]).toBeUndefined();
    expect(stranger.unknownSessions).toBe(true);
    const refetched = mergeSessions(stranger, [sessionRow(9)]);
    expect(refetched.sessions[sessionId(9)]?.state).toBe("writing");
    expect(refetched.unknownSessions).toBe(false);
  });

  it("keeps a session a message updated while the refetch was in flight", () => {
    const state = initialWallState(initialData([sessionRow(1), sessionRow(2)]), NOW);
    const ended = applySession(state, {
      id: sessionId(1),
      exam_id: EXAM_ID,
      state: "ended",
      status: { question: 1 },
      last_seen_at: iso(0),
      extra_min: 0,
      paused_s: 0,
    });
    // The refetch read session 1 before the End committed; session 2 and the new session 9 are fresh.
    const rows = [sessionRow(1), sessionRow(2, { state: "paused" }), sessionRow(9)];
    const merged = mergeSessions(ended, rows, new Set([sessionId(1), sessionId(9)]));
    expect(merged.sessions[sessionId(1)]?.state).toBe("ended");
    expect(merged.sessions[sessionId(2)]?.state).toBe("paused");
    expect(merged.sessions[sessionId(9)]?.state).toBe("writing");
    // Without the in-flight ids, a refetch replaces what the store holds.
    expect(mergeSessions(ended, rows).sessions[sessionId(1)]?.state).toBe("writing");
  });

  it("records each confirmed still once", () => {
    const state = initialWallState(initialData(), NOW);
    const frame = {
      event_id: "01a10000-0000-7000-8000-00000000ffff",
      session_id: sessionId(1),
      frame_id: "f0000000-0000-4000-8000-000000000001",
      captured_at: iso(0),
    };
    const once = applyFrame(state, frame);
    expect(once.frames[frame.event_id]).toHaveLength(1);
    expect(applyFrame(once, { ...frame })).toBe(once);
  });

  it("ticks only when the time changes", () => {
    const state = initialWallState(initialData(), NOW);
    expect(tick(state, NOW)).toBe(state);
    expect(tick(state, NOW + 1000).nowMs).toBe(NOW + 1000);
  });

  it("wires the reducers into a Zustand store that keeps its actions", () => {
    const store = createWallStore(initialData(), NOW);
    const phone = event(3, "phone.detected", { score: 0.9 });
    store.getState().actions.applyEvent(phone);
    store.getState().actions.tick(NOW + 5000);
    expect(store.getState().events[sessionId(3)]).toEqual([phone]);
    expect(store.getState().nowMs).toBe(NOW + 5000);
    expect(typeof store.getState().actions.mergeSessions).toBe("function");
  });
});

describe("review decisions on the wall (WP 1.8)", () => {
  it("keeps the latest decision per session, and returns the same state when nothing is newer", () => {
    const state = initialWallState(
      { ...initialData(), decisions: [{ sessionId: sessionId(1), decidedAt: iso(-60_000) }] },
      NOW,
    );
    expect(state.decisions[sessionId(1)]).toBe(iso(-60_000));
    const later = applyDecision(state, sessionId(1), iso(-1_000));
    expect(later.decisions[sessionId(1)]).toBe(iso(-1_000));
    expect(applyDecision(later, sessionId(1), iso(-60_000))).toBe(later);
    const merged = mergeDecisions(later, [
      { sessionId: sessionId(1), decidedAt: iso(-60_000) },
      { sessionId: sessionId(2), decidedAt: iso(-2_000) },
    ]);
    expect(merged.decisions).toEqual({ [sessionId(1)]: iso(-1_000), [sessionId(2)]: iso(-2_000) });
    expect(mergeDecisions(merged, [{ sessionId: sessionId(2), decidedAt: iso(-2_000) }])).toBe(merged);
  });

  it("counts a flag as reviewed up to the decision, and a later flag as open again", () => {
    const phone = event(
      1,
      "phone.detected",
      { score: 0.94 },
      { at: iso(-30_000), received_at: iso(-29_000) },
    );
    const state = applyDecision(
      initialWallState(initialData(undefined, [phone]), NOW),
      sessionId(1),
      iso(-10_000),
    );
    expect(selectHasOpenFlag(state, sessionId(1))).toBe(false);
    expect(selectTileResult(state, sessionId(1))?.state).not.toBe("flagged");
    const face = event(
      1,
      "face.second",
      { duration_ms: 2000 },
      { at: iso(-5_000), received_at: iso(-4_000) },
    );
    const reopened = applyEvent(state, face);
    expect(selectHasOpenFlag(reopened, sessionId(1))).toBe(true);
    expect(selectTileResult(reopened, sessionId(1))?.state).toBe("flagged");
  });
});
