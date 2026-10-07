import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LobbySession, parseRows } from "./lobby-model.ts";
import { useLobbySessions } from "./use-lobby-sessions.ts";

const EXAM_ID = "e0000000-0000-4000-8000-000000000001";
const sid = (n: number) => `5e550000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const id = (n: number) => `b0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const row = (n: number, state: string) => ({
  id: sid(n),
  student_id: id(n),
  state,
  status: {},
  device: { os: "macos", app_version: "0.1.0" },
});

/** The browser client: a sessions read that answers when the test releases it, and one channel. */
const db = vi.hoisted(() => {
  const state = {
    rows: [] as unknown[],
    reads: 0,
    release: () => {},
    onSession: null as ((message: { payload: unknown }) => void) | null,
    onStatus: null as ((status: string) => void) | null,
  };
  const gated = () => {
    state.reads += 1;
    const rows = state.rows;
    const gate = new Promise<void>((resolve) => {
      state.release = resolve;
    });
    const builder = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      // biome-ignore lint/suspicious/noThenProperty: a PostgREST builder is awaited like a promise
      then: (resolve: (value: { data: unknown[]; error: null }) => void) => {
        void gate.then(() => resolve({ data: rows, error: null }));
      },
    };
    return builder;
  };
  const channel = {
    on: (_type: string, _filter: unknown, handler: (message: { payload: unknown }) => void) => {
      state.onSession = handler;
      return channel;
    },
    subscribe: (callback: (status: string) => void) => {
      state.onStatus = callback;
      return channel;
    },
  };
  const client = {
    from: gated,
    channel: () => channel,
    removeChannel: async () => "ok",
    realtime: { setAuth: async () => {} },
  };
  return { state, client };
});

vi.mock("../../lib/supabase/browser.ts", () => ({ createSupabaseBrowserClient: () => db.client }));

describe("useLobbySessions", () => {
  it("never rolls a session back to a read that started before its session message", async () => {
    const initial = parseRows(LobbySession, [row(5, "ready"), row(6, "ready")]);
    const { result } = renderHook(() => useLobbySessions(EXAM_ID, initial));
    await waitFor(() => expect(db.state.onStatus).not.toBeNull());

    // A reconnect reads every session again; the read sees Madina (5) still ready and 6 in rules.
    db.state.rows = [row(5, "ready"), row(6, "rules")];
    act(() => {
      db.state.onStatus?.("SUBSCRIBED");
      db.state.onStatus?.("SUBSCRIBED");
    });
    expect(db.state.reads).toBe(1);

    // Before the reply arrives, the start moves Madina to writing.
    act(() =>
      db.state.onSession?.({
        payload: {
          id: sid(5),
          exam_id: EXAM_ID,
          state: "writing",
          status: {},
          last_seen_at: null,
          extra_min: 0,
          paused_s: 0,
        },
      }),
    );
    expect(result.current.find((s) => s.id === sid(5))?.state).toBe("writing");

    await act(async () => {
      db.state.release();
    });
    await waitFor(() => expect(result.current.find((s) => s.id === sid(6))?.state).toBe("rules"));
    expect(result.current.find((s) => s.id === sid(5))?.state).toBe("writing");
  });
});
