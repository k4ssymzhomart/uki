"use client";

import { EXAM_BROADCAST, examTopic, SessionTileMessage } from "@uki/contracts";
import { useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser.ts";
import {
  applySessionUpdate,
  LOBBY_SESSION_COLUMNS,
  LobbySession,
  mergeSessions,
  parseRows,
} from "./lobby-model.ts";

/**
 * The exam's sessions, kept current from the private `exam:{exam_id}` channel: each `session` message
 * updates its row's state and status; a session the page has not seen (a new join) and every reconnect
 * or return to the tab read the sessions again under RLS. A read never rolls back a session that a
 * message updated while the read was in flight.
 */
export function useLobbySessions(examId: string, initial: readonly LobbySession[]): LobbySession[] {
  const [sessions, setSessions] = useState<LobbySession[]>(() => [...initial]);
  const known = useRef(new Set(initial.map((session) => session.id)));

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;
    let subscribedOnce = false;
    // For each read in flight, the sessions a `session` message updated since it started.
    const reads = new Set<Set<string>>();

    const read = async (ids?: readonly string[]) => {
      const updated = new Set<string>();
      reads.add(updated);
      try {
        let query = supabase.from("sessions").select(LOBBY_SESSION_COLUMNS).eq("exam_id", examId);
        if (ids) query = query.in("id", [...ids]);
        const { data, error } = await query;
        if (cancelled || error || !data) return;
        const fresh = parseRows(LobbySession, data);
        for (const session of fresh) known.current.add(session.id);
        setSessions((current) => mergeSessions(current, fresh, updated));
      } finally {
        reads.delete(updated);
      }
    };

    const channel = supabase.channel(examTopic(examId), { config: { private: true } });
    channel.on("broadcast", { event: EXAM_BROADCAST.session }, ({ payload }) => {
      const message = SessionTileMessage.safeParse(payload);
      if (!message.success || message.data.exam_id !== examId) return;
      if (!known.current.has(message.data.id)) {
        void read([message.data.id]);
        return;
      }
      for (const updated of reads) updated.add(message.data.id);
      setSessions((current) => applySessionUpdate(current, message.data).sessions);
    });

    void supabase.realtime.setAuth().then(() => {
      if (cancelled) return;
      channel.subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        // A reconnect may have missed messages: read everything once more.
        if (subscribedOnce) void read();
        subscribedOnce = true;
      });
    });

    const onVisible = () => {
      if (document.visibilityState === "visible") void read();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [examId]);

  return sessions;
}
