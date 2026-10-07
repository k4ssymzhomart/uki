// The live wall's store: sessions, the roster and events keyed by session id, fed by the server
// render, the exam:{exam_id} channel and the refetch after a reconnect. The reducers are pure and
// exported for tests; the Zustand store only applies them.
import type { CompactEvent, FrameMessage, SessionTileMessage } from "@uki/contracts";
import { FLAG_TILE_EVENT_TYPES, PAUSE_EVENT_TYPES, toMs } from "@uki/contracts";
import { createStore } from "zustand/vanilla";
import type { SessionDevice, SessionRow } from "./rows.ts";

/**
 * Most events kept per session; the oldest go first, except phone, second-face and pause events (see
 * capEvents). The drawer reads the full timeline itself.
 */
export const MAX_EVENTS_PER_SESSION = 300;

/**
 * Events the cap never drops: the Flagged tile reads any unreviewed phone.detected or face.second
 * whatever its age, and the Paused tile reads the pause that started it.
 */
const PINNED_EVENT_TYPES: ReadonlySet<string> = new Set([...FLAG_TILE_EVENT_TYPES, ...PAUSE_EVENT_TYPES]);

/**
 * A session's list (oldest first) cut to MAX_EVENTS_PER_SESSION by dropping its oldest other events;
 * pinned events always stay.
 */
function capEvents(list: CompactEvent[]): CompactEvent[] {
  if (list.length <= MAX_EVENTS_PER_SESSION) return list;
  const pinned = list.filter((event) => PINNED_EVENT_TYPES.has(event.type)).length;
  let drop = list.length - Math.max(MAX_EVENTS_PER_SESSION, pinned);
  const kept: CompactEvent[] = [];
  for (const event of list) {
    if (drop > 0 && !PINNED_EVENT_TYPES.has(event.type)) {
      drop -= 1;
      continue;
    }
    kept.push(event);
  }
  return kept;
}

export interface WallStudent {
  id: string;
  fullName: string;
  number: string;
  seat: number | null;
}

export interface WallSession {
  id: string;
  studentId: string;
  state: SessionRow["state"];
  status: SessionRow["status"];
  lastSeenAt: string | null;
  joinedAt: string | null;
  startedAt: string | null;
  extraMin: number;
  pausedS: number;
  device: SessionDevice;
  locale: SessionRow["locale"];
}

export interface WallExam {
  id: string;
  title: string;
  startsAt: string;
  durationMin: number;
  status: string;
  /** Group codes on the exam, for "Quick message · Group 204". */
  groups: string[];
  /** Questions on the exam when the caller may count them (exam office); null for proctors. */
  questionCount: number | null;
}

export interface WallState {
  exam: WallExam;
  students: Record<string, WallStudent>;
  sessions: Record<string, WallSession>;
  /** Each session's events, oldest first by `received_at`, without duplicate ids. */
  events: Record<string, CompactEvent[]>;
  /** Confirmed stills per event id, from `frame` messages. */
  frames: Record<string, FrameMessage[]>;
  /** Staff names by id, for proctor events. */
  staffNames: Record<string, string>;
  /** Latest `received_at` seen, for the refetch after a reconnect. */
  lastReceivedAt: string | null;
  /** Set when a `session` message names a session the store does not know: the client refetches. */
  unknownSessions: boolean;
  /** The 1-second ticker's server-corrected time. */
  nowMs: number;
}

export interface WallInitialData {
  exam: WallExam;
  students: WallStudent[];
  sessions: SessionRow[];
  events: CompactEvent[];
  staff: { id: string; fullName: string }[];
  /**
   * Server time when the page rendered: the clock of the first render, so it matches the server HTML.
   * The ticker then runs on the offset lib/use-now.ts measures.
   */
  serverNowMs: number;
}

export function sessionFromRow(row: SessionRow): WallSession {
  return {
    id: row.id,
    studentId: row.student_id,
    state: row.state,
    status: row.status,
    lastSeenAt: row.last_seen_at,
    joinedAt: row.joined_at,
    startedAt: row.started_at,
    extraMin: row.extra_min,
    pausedS: row.paused_s,
    device: row.device,
    locale: row.locale,
  };
}

function laterOf(a: string | null, b: string): string {
  if (a === null) return b;
  return toMs(b) > toMs(a) ? b : a;
}

function byReceived(a: CompactEvent, b: CompactEvent): number {
  return toMs(a.received_at) - toMs(b.received_at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** The initial state from the server render. */
export function initialWallState(data: WallInitialData, nowMs: number): WallState {
  const base: WallState = {
    exam: data.exam,
    students: Object.fromEntries(data.students.map((s) => [s.id, s])),
    sessions: Object.fromEntries(data.sessions.map((row) => [row.id, sessionFromRow(row)])),
    events: {},
    frames: {},
    staffNames: Object.fromEntries(data.staff.map((s) => [s.id, s.fullName])),
    lastReceivedAt: null,
    unknownSessions: false,
    nowMs,
  };
  return mergeEvents(base, data.events);
}

/**
 * Adds events, dropping ids already held, keeping each session's list ordered by `received_at` and
 * capped at MAX_EVENTS_PER_SESSION (capEvents). Events of other exams are ignored. Returns `state`
 * unchanged when nothing is new, so subscribers do not re-render.
 */
export function mergeEvents(state: WallState, incoming: readonly CompactEvent[]): WallState {
  let events: Record<string, CompactEvent[]> | null = null;
  let lastReceivedAt = state.lastReceivedAt;
  const touched = new Set<string>();
  for (const event of incoming) {
    if (event.exam_id !== state.exam.id) continue;
    const current = (events ?? state.events)[event.session_id] ?? [];
    if (current.some((e) => e.id === event.id)) continue;
    events ??= { ...state.events };
    events[event.session_id] = touched.has(event.session_id) ? current : [...current];
    events[event.session_id]?.push(event);
    touched.add(event.session_id);
    lastReceivedAt = laterOf(lastReceivedAt, event.received_at);
  }
  if (events === null) return state;
  for (const sessionId of touched) {
    events[sessionId] = capEvents((events[sessionId] ?? []).sort(byReceived));
  }
  return { ...state, events, lastReceivedAt };
}

/** One `event` message. */
export function applyEvent(state: WallState, event: CompactEvent): WallState {
  return mergeEvents(state, [event]);
}

/**
 * One `session` message: the tile's new fields. A session the store does not know yet (a new join)
 * is added when the message names its student and the student is on the roster; otherwise the
 * store flags `unknownSessions` so the client refetches the sessions.
 */
export function applySession(
  state: WallState,
  message: SessionTileMessage & { student_id?: string | undefined },
): WallState {
  if (message.exam_id !== state.exam.id) return state;
  const current = state.sessions[message.id];
  if (current === undefined) {
    const studentId = message.student_id;
    if (studentId === undefined || state.students[studentId] === undefined) {
      return state.unknownSessions ? state : { ...state, unknownSessions: true };
    }
    const added: WallSession = {
      id: message.id,
      studentId,
      state: message.state,
      status: message.status,
      lastSeenAt: message.last_seen_at,
      joinedAt: null,
      startedAt: null,
      extraMin: message.extra_min,
      pausedS: message.paused_s,
      device: { os: undefined },
      locale: "kk",
    };
    return { ...state, sessions: { ...state.sessions, [message.id]: added } };
  }
  const next: WallSession = {
    ...current,
    state: message.state,
    status: message.status,
    lastSeenAt: message.last_seen_at,
    extraMin: message.extra_min,
    pausedS: message.paused_s,
  };
  return { ...state, sessions: { ...state.sessions, [message.id]: next } };
}

/**
 * Rows from a refetch replace what the store holds for those sessions; others stay. Sessions in `keep`
 * that the store holds stay as they are: a `session` message updated them while the refetch was in
 * flight, so its row may be older than what the store shows.
 */
export function mergeSessions(
  state: WallState,
  rows: readonly SessionRow[],
  keep: ReadonlySet<string> = new Set(),
): WallState {
  if (rows.length === 0) return state.unknownSessions ? { ...state, unknownSessions: false } : state;
  const sessions = { ...state.sessions };
  for (const row of rows) {
    if (keep.has(row.id) && state.sessions[row.id] !== undefined) continue;
    sessions[row.id] = sessionFromRow(row);
  }
  return { ...state, sessions, unknownSessions: false };
}

/** One `frame` message: a still of a flag event is ready. */
export function applyFrame(state: WallState, frame: FrameMessage): WallState {
  const current = state.frames[frame.event_id] ?? [];
  if (current.some((f) => f.frame_id === frame.frame_id)) return state;
  return { ...state, frames: { ...state.frames, [frame.event_id]: [...current, frame] } };
}

/** The ticker. */
export function tick(state: WallState, nowMs: number): WallState {
  return state.nowMs === nowMs ? state : { ...state, nowMs };
}

export interface WallActions {
  applyEvent: (event: CompactEvent) => void;
  mergeEvents: (events: readonly CompactEvent[]) => void;
  applySession: (message: SessionTileMessage & { student_id?: string | undefined }) => void;
  mergeSessions: (rows: readonly SessionRow[], keep?: ReadonlySet<string>) => void;
  applyFrame: (frame: FrameMessage) => void;
  tick: (nowMs: number) => void;
}

export type WallStore = ReturnType<typeof createWallStore>;

/** A store per mounted wall (never a module singleton, so server renders never share state). */
export function createWallStore(data: WallInitialData, nowMs: number) {
  return createStore<WallState & { actions: WallActions }>()((set) => {
    const apply = (reducer: (state: WallState) => WallState) =>
      set((store) => {
        const next = reducer(store);
        return next === store ? store : next;
      });
    return {
      ...initialWallState(data, nowMs),
      actions: {
        applyEvent: (event) => apply((s) => applyEvent(s, event)),
        mergeEvents: (events) => apply((s) => mergeEvents(s, events)),
        applySession: (message) => apply((s) => applySession(s, message)),
        mergeSessions: (rows, keep) => apply((s) => mergeSessions(s, rows, keep)),
        applyFrame: (frame) => apply((s) => applyFrame(s, frame)),
        tick: (now) => apply((s) => tick(s, now)),
      },
    };
  });
}
