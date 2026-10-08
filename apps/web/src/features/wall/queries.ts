// PostgREST reads of the wall, shared by the server render and the browser refetch. Every result is
// parsed with Zod (rows.ts); RLS decides what the signed-in staff member sees.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompactEvent } from "@uki/contracts";
import { FLAG_TILE_EVENT_TYPES, THRESHOLDS } from "@uki/contracts";
import {
  DecisionRow,
  EVENT_COLUMNS,
  parseEvents,
  parseRows,
  parseSessions,
  SESSION_COLUMNS,
  type SessionRow,
} from "./rows.ts";

/** PostgREST answers at most this many rows per request (supabase/config.toml max_rows). */
export const PAGE_SIZE = 1000;
/** Pages read at most per query, so a runaway exam cannot stall the page. */
export const MAX_PAGES = 10;
/** The refetch after a reconnect looks this far before the last event seen, then drops duplicates. */
export const REFETCH_OVERLAP_MS = 5000;

// The web app's clients are not typed with the generated schema yet; rows are parsed with Zod.
// biome-ignore lint/suspicious/noExplicitAny: the schema generic is not used here
export type AnyClient = SupabaseClient<any, any, any>;

type Page = { data: unknown[] | null; error: { message: string } | null };

/** Runs `query(from, to)` page by page until a short page, an error or MAX_PAGES. */
export async function readPages(query: (from: number, to: number) => PromiseLike<Page>): Promise<unknown[]> {
  const rows: unknown[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await query(from, from + PAGE_SIZE - 1);
    if (error || data === null) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

/** The exam's sessions. */
export async function fetchSessions(client: AnyClient, examId: string): Promise<SessionRow[]> {
  const rows = await readPages((from, to) =>
    client.from("sessions").select(SESSION_COLUMNS).eq("exam_id", examId).order("id").range(from, to),
  );
  return parseSessions(rows);
}

/** Flag and log events received since `sinceIso`, newest first (the server render: the last 60 minutes). */
export async function fetchRecentEvents(
  client: AnyClient,
  examId: string,
  sinceIso: string,
): Promise<CompactEvent[]> {
  const rows = await readPages((from, to) =>
    client
      .from("events")
      .select(EVENT_COLUMNS)
      .eq("exam_id", examId)
      .in("review", ["flag", "log"])
      .gte("received_at", sinceIso)
      .order("received_at", { ascending: false })
      .range(from, to),
  );
  return parseEvents(rows);
}

/** Phone and second-face events received before `beforeIso`, newest first. */
async function fetchOlderFlagEvents(
  client: AnyClient,
  examId: string,
  beforeIso: string,
): Promise<CompactEvent[]> {
  const rows = await readPages((from, to) =>
    client
      .from("events")
      .select(EVENT_COLUMNS)
      .eq("exam_id", examId)
      .in("type", [...FLAG_TILE_EVENT_TYPES])
      .lt("received_at", beforeIso)
      .order("received_at", { ascending: false })
      .range(from, to),
  );
  return parseEvents(rows);
}

/** Since when the server render reads events. */
export function initialEventsSince(nowMs: number): string {
  return new Date(nowMs - THRESHOLDS.wall.initialEventsWindowMs).toISOString();
}

/**
 * The server render's events: flag and log events from the last 60 minutes, and every older phone or
 * second-face event. The Flagged tile has no time limit (Phase 0 has no review table, so every one
 * stays unreviewed), so those are read whatever their age.
 */
export async function fetchInitialEvents(
  client: AnyClient,
  examId: string,
  nowMs: number,
): Promise<CompactEvent[]> {
  const since = initialEventsSince(nowMs);
  const [recent, olderFlags] = await Promise.all([
    fetchRecentEvents(client, examId, since),
    fetchOlderFlagEvents(client, examId, since),
  ]);
  return [...recent, ...olderFlags];
}

/** Where a refetch starts: `overlapMs` before the last event seen, or the initial window. */
export function eventsSince(lastReceivedAt: string | null, nowMs: number, overlapMs: number): string {
  return lastReceivedAt === null
    ? initialEventsSince(nowMs)
    : new Date(Date.parse(lastReceivedAt) - overlapMs).toISOString();
}

/**
 * After a reconnect or when the tab regains focus: every event received after the last one seen,
 * minus a small overlap for transactions that committed late (wider for the periodic reconcile).
 * The store drops the duplicates.
 */
export async function fetchEventsAfter(
  client: AnyClient,
  examId: string,
  lastReceivedAt: string | null,
  nowMs: number,
  overlapMs: number = REFETCH_OVERLAP_MS,
): Promise<CompactEvent[]> {
  const since = eventsSince(lastReceivedAt, nowMs, overlapMs);
  const rows = await readPages((from, to) =>
    client
      .from("events")
      .select(EVENT_COLUMNS)
      .eq("exam_id", examId)
      .gte("received_at", since)
      .order("received_at", { ascending: true })
      .range(from, to),
  );
  return parseEvents(rows);
}

/** Every event of one session, newest first by `at`, for the 2.5 timeline. */
export async function fetchSessionTimeline(client: AnyClient, sessionId: string): Promise<CompactEvent[]> {
  const rows = await readPages((from, to) =>
    client
      .from("events")
      .select(EVENT_COLUMNS)
      .eq("session_id", sessionId)
      .order("at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to),
  );
  return parseEvents(rows);
}

/** The exam's review decisions (WP 1.8): which session was decided when, for Mark reviewed and Flagged. */
export async function fetchDecisions(client: AnyClient, examId: string): Promise<DecisionRow[]> {
  const rows = await readPages((from, to) =>
    client
      .from("review_decisions")
      .select("session_id, decided_at")
      .eq("exam_id", examId)
      .order("session_id")
      .range(from, to),
  );
  return parseRows(DecisionRow, rows);
}
