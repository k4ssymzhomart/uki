"use client";

// The flag card's stills (2.5): signed 5-minute URLs from the `stills` function, read only while the
// drawer is open. They are asked for again when a new still is confirmed (a `frame` message) and
// shortly before the URLs expire.
import { STILL_VIEW_URL_TTL_S, type StillsResponse } from "@uki/contracts";
import { useEffect, useState } from "react";
import type { FunctionsClient } from "./functions-client.ts";

/** Ask again this long before the URLs expire. */
export const STILLS_REFRESH_MARGIN_MS = 30_000;

export type Still = StillsResponse["urls"][number];

export type StillsState =
  | { status: "idle"; stills: Still[] }
  | { status: "loading"; stills: Still[] }
  | { status: "ready"; stills: Still[] }
  | { status: "error"; stills: Still[] };

export function useStills({
  eventId,
  frameCount,
  confirmed,
  getClient,
}: {
  /** The flag event on the card, or null when the session has none. */
  eventId: string | null;
  /** The event's frame_count: no call when it has no stills. */
  frameCount: number;
  /** Stills confirmed through the channel so far; a change triggers a new call. */
  confirmed: number;
  getClient: () => FunctionsClient;
}): StillsState {
  const [state, setState] = useState<StillsState>({ status: "idle", stills: [] });
  const [round, setRound] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `confirmed` and `round` re-run the call on purpose
  useEffect(() => {
    if (eventId === null || frameCount === 0) {
      setState({ status: "idle", stills: [] });
      return;
    }
    let cancelled = false;
    setState((previous) => ({ status: "loading", stills: previous.stills }));
    void getClient()
      .stills({ event_id: eventId })
      .then((result) => {
        if (cancelled) return;
        setState(result.ok ? { status: "ready", stills: result.data.urls } : { status: "error", stills: [] });
      });
    const refresh = window.setTimeout(
      () => setRound((r) => r + 1),
      STILL_VIEW_URL_TTL_S * 1000 - STILLS_REFRESH_MARGIN_MS,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(refresh);
    };
  }, [eventId, frameCount, confirmed, round, getClient]);

  return state;
}
