import { act, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EXAM_ID,
  event,
  fakeClient,
  initialData,
  iso,
  NOW,
  sessionId,
  sessionRow,
  setupDom,
  studentId,
} from "./test-helpers.tsx";
import { RECONCILE_EVERY_MS, useExamChannel } from "./use-exam-channel.ts";
import type { WallStore } from "./wall-store.ts";
import { useWallStoreApi, WallStoreProvider } from "./wall-store-context.tsx";

setupDom();

afterEach(() => vi.useRealTimers());

function mount(rows: Record<string, unknown[]> = {}, db = fakeClient(rows)) {
  let store: WallStore | null = null;
  function Probe() {
    store = useWallStoreApi();
    useExamChannel({ client: db.client, examId: EXAM_ID, offsetMs: 0 });
    return null;
  }
  const data = initialData([sessionRow(1), sessionRow(2)]);
  data.students.push({ id: studentId(3), fullName: "Dias Kenzhebekov", number: "20231003", seat: 12 });
  render(
    <WallStoreProvider initial={data} nowMs={NOW}>
      <Probe />
    </WallStoreProvider>,
  );
  return { db, store: () => store as unknown as WallStore };
}

describe("exam channel", () => {
  it("joins after setAuth and applies event, session and frame messages, dropping bad payloads", async () => {
    const { db, store } = mount();
    await waitFor(() => expect(db.subscribed()).toBe(true));
    const phone = event(1, "phone.detected", { score: 0.94, held_ms: 6000 });
    act(() => {
      db.broadcast("event", phone);
      db.broadcast("event", { ...phone, id: "not-a-uuid" });
      db.broadcast("session", {
        id: sessionId(2),
        exam_id: EXAM_ID,
        student_id: studentId(2),
        state: "paused",
        status: {},
        last_seen_at: iso(0),
        extra_min: 0,
        paused_s: 0,
      });
      db.broadcast("frame", {
        id: "ignored-extra-key",
        event_id: phone.id,
        session_id: sessionId(1),
        frame_id: "f0000000-0000-4000-8000-000000000001",
        captured_at: iso(0),
      });
    });
    expect(store().getState().events[sessionId(1)]).toEqual([phone]);
    expect(store().getState().sessions[sessionId(2)]?.state).toBe("paused");
    expect(store().getState().frames[phone.id]).toHaveLength(1);
  });

  it("adds a new join from its session message", async () => {
    const { db, store } = mount();
    await waitFor(() => expect(db.subscribed()).toBe(true));
    act(() =>
      db.broadcast("session", {
        id: sessionId(3),
        exam_id: EXAM_ID,
        student_id: studentId(3),
        state: "joined",
        status: {},
        last_seen_at: null,
        extra_min: 0,
        paused_s: 0,
      }),
    );
    expect(store().getState().sessions[sessionId(3)]?.studentId).toBe(studentId(3));
  });

  it("catches up after (re)subscribing: missed events and the sessions, without duplicates", async () => {
    const missed = event(2, "face.second", { duration_ms: 4000, faces: 2 }, { received_at: iso(1000) });
    const { db, store } = mount({
      events: [missed, { ...missed }],
      sessions: [sessionRow(1, { state: "time_up" }), sessionRow(2)],
    });
    await waitFor(() => expect(db.subscribed()).toBe(true));
    act(() => db.status("SUBSCRIBED"));
    await waitFor(() => expect(store().getState().events[sessionId(2)]).toEqual([missed]));
    expect(store().getState().sessions[sessionId(1)]?.state).toBe("time_up");
    expect(db.queries).toEqual(expect.arrayContaining(["events", "sessions"]));
  });

  it("never rolls a session back to a catch-up read that started before its session message", async () => {
    // The sessions read answers only when the test releases it, after the End's message arrived. It
    // read session 1 as writing (before the End committed) and session 2 as paused.
    const db = fakeClient({ events: [], sessions: [sessionRow(1), sessionRow(2, { state: "paused" })] });
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const from = db.client.from.bind(db.client);
    db.client.from = ((table: string) => {
      const chain = from(table);
      if (table !== "sessions") return chain;
      const gated: unknown = new Proxy(
        {},
        {
          get(_target, prop) {
            if (prop === "then") {
              return (resolve: (value: unknown) => void) => {
                void gate.then(() => (chain as unknown as PromiseLike<unknown>).then(resolve));
              };
            }
            return () => gated;
          },
        },
      );
      return gated;
    }) as typeof db.client.from;
    const { store } = mount({}, db);
    await waitFor(() => expect(db.subscribed()).toBe(true));
    act(() => db.status("SUBSCRIBED"));
    await waitFor(() => expect(db.queries).toContain("sessions"));
    act(() =>
      db.broadcast("session", {
        id: sessionId(1),
        exam_id: EXAM_ID,
        student_id: studentId(1),
        state: "ended",
        status: {},
        last_seen_at: iso(0),
        extra_min: 0,
        paused_s: 0,
      }),
    );
    expect(store().getState().sessions[sessionId(1)]?.state).toBe("ended");
    await act(async () => {
      release();
      await gate;
    });
    await waitFor(() => expect(store().getState().sessions[sessionId(2)]?.state).toBe("paused"));
    expect(store().getState().sessions[sessionId(1)]?.state).toBe("ended");
  });

  it("reconciles every 20 s while the page is not hidden, for broadcasts Realtime never delivered", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const lost = event(1, "phone.detected", { score: 0.94, held_ms: 800 }, { received_at: iso(500) });
    const { db, store } = mount({ events: [lost], sessions: [sessionRow(1), sessionRow(2)] });
    // waitFor polls with the faked setInterval, so promises are flushed through act() instead.
    await act(async () => {});
    expect(db.subscribed()).toBe(true);
    const reads = () => db.queries.filter((table) => table === "events").length;
    const before = reads();
    await act(async () => {
      vi.advanceTimersByTime(RECONCILE_EVERY_MS - 1);
    });
    expect(reads()).toBe(before);
    expect(store().getState().events[sessionId(1)]).toBeUndefined();
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    await act(async () => {});
    expect(reads()).toBe(before + 1);
    expect(store().getState().events[sessionId(1)]).toEqual([lost]);
  });

  it("ticks every second", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    vi.setSystemTime(NOW);
    const { store } = mount();
    expect(store().getState().nowMs).toBe(NOW);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(store().getState().nowMs).toBe(NOW + 3000);
  });
});
