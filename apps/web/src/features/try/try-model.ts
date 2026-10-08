// The /try detection demo as pure functions: which state the page is in, what a camera error means,
// how each rule event reads, and the event list. The detection itself is @uki/detection's, unchanged:
// the same worker, models and rules engine as the desktop app (try-runtime.ts wires it up).
import { DEFAULT_EXAM_CHECKS, type ExamChecks, REVIEW, THRESHOLDS } from "@uki/contracts";
import type { DetectionDebug, FrameSource, RuleEvent, RuleEventType, RulesState } from "@uki/detection";
import type { EventRowKind } from "@uki/ui";

/** The demo runs an app exam with the default checks, so face.missing pauses as 2.3 does. */
export const DEMO_CHECKS: ExamChecks = { ...DEFAULT_EXAM_CHECKS };

/** Where the web app serves the worker's models (apps/web/scripts/detection-models.ts). */
export const MODELS_PATH = "/models/";

/** Events kept on the page, newest first. */
export const MAX_EVENTS = 30;

export type CameraProblem = "denied" | "missing" | "busy" | "unsupported";
export type TryProblem = CameraProblem | "models";

export type TryStatus =
  | { kind: "idle" }
  | { kind: "camera" }
  | { kind: "models" }
  | { kind: "running" }
  | { kind: "failed"; problem: TryProblem };

/** What getUserMedia's rejection means for the visitor (the DOMException names browsers use). */
export function cameraProblem(error: unknown): CameraProblem {
  const name = typeof error === "object" && error !== null ? (error as { name?: unknown }).name : null;
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return "denied";
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
      return "missing";
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return "busy";
    default:
      return "unsupported";
  }
}

/** The browser features the demo needs: a camera API, module workers, wasm and OffscreenCanvas. */
export function detectionSupported(scope: {
  isSecureContext?: boolean;
  navigator?: { mediaDevices?: { getUserMedia?: unknown } };
  Worker?: unknown;
  WebAssembly?: unknown;
  OffscreenCanvas?: unknown;
  createImageBitmap?: unknown;
}): boolean {
  return (
    scope.isSecureContext !== false &&
    typeof scope.navigator?.mediaDevices?.getUserMedia === "function" &&
    typeof scope.Worker === "function" &&
    typeof scope.WebAssembly === "object" &&
    typeof scope.OffscreenCanvas === "function" &&
    typeof scope.createImageBitmap === "function"
  );
}

/** The API names shown in the overlay's "Frames from" row: Chrome and Edge, then Safari and Firefox. */
export const FRAME_SOURCE_NAMES: Readonly<Record<FrameSource, string>> = {
  "track-processor": "MediaStreamTrackProcessor",
  "video-frame-callback": "requestVideoFrameCallback",
  timer: "setInterval",
};

export type LookKey = DetectionDebug["frameClass"];

/** The Look tile: the frame's class while tracking, `no_face` before the first debug message. */
export function lookOf(debug: DetectionDebug | null): LookKey {
  return debug?.frameClass ?? "no_face";
}

export function lookTone(look: LookKey): "ok" | "warn" | "flag" {
  if (look === "on") return "ok";
  return look === "no_face" ? "flag" : "warn";
}

export function facesTone(faces: number): "ok" | "warn" | "flag" {
  if (faces === 1) return "ok";
  return faces === 0 ? "warn" : "flag";
}

/** The message key part of each event type (`dashboard.try.event.<key>.title`). */
export const EVENT_KEYS = {
  "gaze.on_screen": "gaze_on_screen",
  "gaze.off_screen": "gaze_off_screen",
  "gaze.down": "gaze_down",
  "phone.detected": "phone_detected",
  "face.missing": "face_missing",
  "face.second": "face_second",
  "camera.lost": "camera_lost",
  "session.paused": "session_paused",
  "session.resumed": "session_resumed",
} as const satisfies Record<RuleEventType, string>;

/** Flag events in coral, the pause in yellow, the rest neutral; as the wall and the timeline draw them. */
export function eventKind(type: RuleEventType): EventRowKind {
  if (REVIEW[type] === "flag") return "flag";
  if (type === "session.paused") return "warn";
  return type === "gaze.on_screen" || type === "session.resumed" ? "ok" : "info";
}

export interface TryEvent {
  id: string;
  type: RuleEventType;
  /** Milliseconds since the demo started. */
  elapsedMs: number;
  review: "flag" | "log" | "none";
  /** Stills the app would take for it; the demo makes none. */
  stills: number;
  event: RuleEvent;
}

export function toTryEvent(event: RuleEvent, startedAt: number): TryEvent {
  return {
    id: event.id,
    type: event.type,
    elapsedMs: Math.max(0, event.at - startedAt),
    review: REVIEW[event.type],
    stills: event.frame_count,
    event,
  };
}

/** Adds an event at the top, keeps at most `max`, and never adds the same id twice. */
export function pushEvent(list: readonly TryEvent[], next: TryEvent, max = MAX_EVENTS): TryEvent[] {
  if (list.some((item) => item.id === next.id)) return [...list];
  return [next, ...list].slice(0, max);
}

/** `mm:ss` since the demo started; hours roll into minutes. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export interface RuleTimers {
  /** Seconds the current look has been held, and the limit. */
  look: { held: number; limit: number };
  noFace: { held: number; limit: number };
  twoFaces: { held: number; limit: number };
  phone: { hits: number; needed: number };
}

const seconds = (ms: number | null | undefined): number => Math.round((ms ?? 0) / 100) / 10;

/** The rule engine's running timers against their thresholds, for the Rule timers rows. */
export function ruleTimers(state: RulesState | null, checks: ExamChecks = DEMO_CHECKS): RuleTimers {
  return {
    look: { held: seconds(state?.look?.heldMs), limit: checks.gaze_s },
    noFace: { held: seconds(state?.noFaceMs), limit: checks.face_missing_s },
    twoFaces: { held: seconds(state?.twoFacesMs), limit: THRESHOLDS.face.secondFaceMs / 1000 },
    phone: { hits: state?.phone.hits ?? 0, needed: THRESHOLDS.phone.consecutiveHits },
  };
}

export interface TryState {
  status: TryStatus;
  stream: MediaStream | null;
  debug: DetectionDebug | null;
  source: FrameSource | null;
  /** The last debug message's time since the demo started. */
  elapsedMs: number | null;
  rules: RulesState | null;
  events: TryEvent[];
  /** The 2.1 Watching panel's away cue and the 2.2 phone cue, as the app would show them. */
  away: boolean;
  phone: boolean;
}

export const INITIAL_TRY_STATE: TryState = {
  status: { kind: "idle" },
  stream: null,
  debug: null,
  source: null,
  elapsedMs: null,
  rules: null,
  events: [],
  away: false,
  phone: false,
};

export type TryAction =
  | { type: "start" }
  | { type: "status"; status: TryStatus }
  | { type: "stream"; stream: MediaStream | null }
  | { type: "debug"; debug: DetectionDebug; source: FrameSource | null; elapsedMs: number }
  | { type: "rules"; rules: RulesState }
  | { type: "event"; event: TryEvent }
  | { type: "cue"; cue: "away" | "phone" | "paused"; on: boolean };

export function tryReducer(state: TryState, action: TryAction): TryState {
  switch (action.type) {
    case "start":
      return { ...INITIAL_TRY_STATE, status: { kind: "camera" } };
    case "status":
      // Leaving a run clears what it showed; a failure keeps the event list for reading.
      if (action.status.kind === "idle") return { ...INITIAL_TRY_STATE, events: state.events };
      if (action.status.kind === "failed") {
        return { ...INITIAL_TRY_STATE, status: action.status, events: state.events };
      }
      return { ...state, status: action.status };
    case "stream":
      return { ...state, stream: action.stream };
    case "debug":
      return {
        ...state,
        debug: action.debug,
        source: action.source ?? state.source,
        elapsedMs: action.elapsedMs,
      };
    case "rules":
      return { ...state, rules: action.rules };
    case "event":
      return { ...state, events: pushEvent(state.events, action.event) };
    case "cue":
      if (action.cue === "away") return { ...state, away: action.on };
      if (action.cue === "phone") return { ...state, phone: action.on };
      return state;
  }
}

/** True while the run is starting or running: the Stop button shows. */
export function isActive(status: TryStatus): boolean {
  return status.kind === "camera" || status.kind === "models" || status.kind === "running";
}
