// 2.4d's pure logic: the open Ask proctor requests of one exam, fed by the server render, the `help`
// broadcast on exam:{exam_id} and the wall's catch-up reads. A request leaves the list when a `help`
// message carries its done_at (Mark done or Reply on any proctor's wall), and a later read never
// brings it back.
import { type HelpRequest, type HelpTopic, toMs } from "@uki/contracts";
import type { HelpReasonTone } from "@uki/ui";

export interface HelpState {
  /** Open requests by id. */
  open: Readonly<Record<string, HelpRequest>>;
  /** Ids seen closed, so a read that started before the closing cannot reopen them. */
  closed: Readonly<Record<string, true>>;
}

export const EMPTY_HELP: HelpState = { open: {}, closed: {} };

/** The state from the server render's open requests. */
export function initialHelpState(requests: readonly HelpRequest[]): HelpState {
  return mergeOpenHelp(EMPTY_HELP, requests);
}

/**
 * One `help` message: a new request joins the list; one with done_at leaves it. Returns `state` itself
 * when nothing changes, so subscribers do not re-render.
 */
export function applyHelp(state: HelpState, message: HelpRequest): HelpState {
  if (message.done_at !== null) {
    if (state.closed[message.id] && state.open[message.id] === undefined) return state;
    const { [message.id]: _gone, ...open } = state.open;
    return { open, closed: { ...state.closed, [message.id]: true } };
  }
  if (state.closed[message.id]) return state;
  const current = state.open[message.id];
  if (current !== undefined && sameRequest(current, message)) return state;
  return { ...state, open: { ...state.open, [message.id]: message } };
}

/**
 * A read of the exam's open requests (the catch-up after a reconnect, on focus and every 20 s). It
 * replaces the list, except that requests a `help` message added while the read was in flight
 * (`arrived`) stay, and closed ones never come back.
 */
export function mergeOpenHelp(
  state: HelpState,
  fetched: readonly HelpRequest[],
  arrived: ReadonlySet<string> = new Set(),
): HelpState {
  const open: Record<string, HelpRequest> = {};
  for (const request of fetched) {
    if (request.done_at !== null || state.closed[request.id]) continue;
    open[request.id] = request;
  }
  for (const id of arrived) {
    const kept = state.open[id];
    if (kept !== undefined && open[id] === undefined) open[id] = kept;
  }
  const before = Object.keys(state.open);
  const unchanged =
    before.length === Object.keys(open).length &&
    before.every((id) => {
      const next = open[id];
      const current = state.open[id];
      return next !== undefined && current !== undefined && sameRequest(current, next);
    });
  return unchanged ? state : { ...state, open };
}

function sameRequest(a: HelpRequest, b: HelpRequest): boolean {
  return (
    a.id === b.id &&
    a.topic === b.topic &&
    a.text === b.text &&
    a.created_at === b.created_at &&
    a.done_at === b.done_at &&
    a.student_name === b.student_name
  );
}

const sortedCache = new WeakMap<object, HelpRequest[]>();

/**
 * Open requests, newest first, as 2.4d lists them (Kamila's 10:46 above Saule's 10:44). Cached per
 * state.
 */
export function openRequests(state: HelpState): HelpRequest[] {
  const hit = sortedCache.get(state.open);
  if (hit) return hit;
  const sorted = Object.values(state.open).sort(
    (a, b) => toMs(b.created_at) - toMs(a.created_at) || (a.id < b.id ? 1 : -1),
  );
  sortedCache.set(state.open, sorted);
  return sorted;
}

/** The Requests badge: how many are open. */
export function openCount(state: HelpState): number {
  return Object.keys(state.open).length;
}

/** Whether a session has an open request: its tile reads "raised hand" while it is on screen. */
export function hasOpenRequest(state: HelpState, sessionId: string): boolean {
  return Object.values(state.open).some((request) => request.session_id === sessionId);
}

/**
 * The reason pill's colour. 2.4d draws Question is unclear on brand-subtle and Technical problem on
 * warn-subtle; a stuck identity check is a problem like a technical one, and a break or something
 * else is a question for the proctor.
 */
export const REASON_TONE: Record<HelpTopic, HelpReasonTone> = {
  identity: "warn",
  question: "brand",
  technical: "warn",
  break: "brand",
  other: "brand",
};
