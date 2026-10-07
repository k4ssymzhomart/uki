"use client";

// Live wall data flow, steps 2 and 3: join the private exam:{exam_id} channel after setAuth(), feed
// event, session and frame messages to the store, and catch up after every (re)subscribe, when the
// tab regains focus, and every RECONCILE_EVERY_MS. Step 4's ticker lives here too.
import { EXAM_BROADCAST, examTopic, parseExamMessage, SessionTileMessage, Uuid } from "@uki/contracts";
import { useEffect, useRef } from "react";
import { type AnyClient, fetchEventsAfter, fetchSessions } from "./queries.ts";
import { useWallStoreApi } from "./wall-store-context.tsx";

/** The trigger also sends student_id (plan open issue), which a new join needs. */
const SessionMessageWithStudent = SessionTileMessage.extend({ student_id: Uuid.optional() });

/** At most one catch-up per this interval from focus events. */
const FOCUS_REFETCH_MIN_MS = 2000;

/**
 * Broadcast from the database is not durable: a message committed while Realtime's replication
 * connection restarts never arrives, and the page's channel stays SUBSCRIBED, so no resubscribe
 * catches it up (seen on a loaded local stack: a phone flag missing from the wall). While the page is
 * not hidden, the wall also reconciles on this timer, looking further back than the resubscribe
 * catch-up. The store drops what it already holds, so a quiet reconcile re-renders nothing.
 */
export const RECONCILE_EVERY_MS = 20_000;
export const RECONCILE_OVERLAP_MS = 60_000;

export type ChannelStatus = "connecting" | "live" | "offline";

export function useExamChannel({
  client,
  examId,
  offsetMs,
  onStatus,
}: {
  client: AnyClient;
  examId: string;
  /** Server clock minus this browser's clock. */
  offsetMs: number;
  onStatus?: (status: ChannelStatus) => void;
}): void {
  const store = useWallStoreApi();
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;

  // One 1-second ticker drives every clock on the wall.
  useEffect(() => {
    const { actions } = store.getState();
    actions.tick(Date.now() + offsetMs);
    const timer = window.setInterval(() => actions.tick(Date.now() + offsetMs), 1000);
    return () => window.clearInterval(timer);
  }, [store, offsetMs]);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let lastCatchUp = 0;
    const { actions } = store.getState();

    const catchUp = async (overlapMs?: number) => {
      if (inFlight || cancelled) return;
      inFlight = true;
      lastCatchUp = Date.now();
      try {
        const [events, sessions] = await Promise.all([
          fetchEventsAfter(client, examId, store.getState().lastReceivedAt, Date.now() + offsetMs, overlapMs),
          fetchSessions(client, examId),
        ]);
        if (cancelled) return;
        actions.mergeEvents(events);
        actions.mergeSessions(sessions);
      } catch {
        // Nothing is lost: the next resubscribe or focus asks again from the same point.
      } finally {
        inFlight = false;
      }
    };

    const channel = client.channel(examTopic(examId), { config: { private: true } });
    channel
      .on("broadcast", { event: EXAM_BROADCAST.event }, ({ payload }) => {
        const parsed = parseExamMessage(EXAM_BROADCAST.event, payload);
        if (parsed?.event === "event") actions.applyEvent(parsed.payload);
      })
      .on("broadcast", { event: EXAM_BROADCAST.session }, ({ payload }) => {
        const parsed = SessionMessageWithStudent.safeParse(payload);
        if (parsed.success) actions.applySession(parsed.data);
      })
      .on("broadcast", { event: EXAM_BROADCAST.frame }, ({ payload }) => {
        const parsed = parseExamMessage(EXAM_BROADCAST.frame, payload);
        if (parsed?.event === "frame") actions.applyFrame(parsed.payload);
      });

    onStatusRef.current?.("connecting");
    void (async () => {
      try {
        await client.realtime.setAuth();
      } catch {
        onStatusRef.current?.("offline");
        return;
      }
      if (cancelled) return;
      channel.subscribe((status) => {
        if (cancelled) return;
        if (status === "SUBSCRIBED") {
          onStatusRef.current?.("live");
          void catchUp();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          onStatusRef.current?.("offline");
        }
      });
    })();

    const onFocus = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastCatchUp < FOCUS_REFETCH_MIN_MS) return;
      void catchUp();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    const reconcile = window.setInterval(() => {
      if (document.visibilityState !== "hidden") void catchUp(RECONCILE_OVERLAP_MS);
    }, RECONCILE_EVERY_MS);

    // A session message for a session the store does not know (a join) asks for the sessions again.
    const unsubscribe = store.subscribe((state, previous) => {
      if (state.unknownSessions && !previous.unknownSessions) void catchUp();
    });

    return () => {
      cancelled = true;
      unsubscribe();
      window.clearInterval(reconcile);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      void client.removeChannel(channel);
    };
  }, [client, examId, offsetMs, store]);
}
