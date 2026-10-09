// The renderer's side of the detection worker: starts it, pumps camera frames with back-pressure (one
// frame in flight), forwards camera loss, applies the 480 × 360 fallback and turns worker messages into
// typed callbacks. Every message from the worker is checked with WorkerToMain. The per-frame geometry
// (face boxes, head pose, phone boxes) is a subscription, `onGeometry`, so every overlay that draws it
// (1.2, 2.1, /try, the lab overlay) can listen and stop listening on its own.
import type { CameraLostReason } from "@uki/contracts";
import type { Camera } from "./camera.ts";
import { defaultNow } from "./camera.ts";
import type { Delegate, DetectionDebug, DetectionPhase } from "./debug.ts";
import type { InputSize } from "./perf.ts";
import { type DetectionGeometry, type InitMessage, type MainToWorker, WorkerToMain } from "./protocol.ts";
import type { RuleCue, RuleEvent, RulesState, StillRequest } from "./rules.ts";
import type { CameraCheck } from "./signals.ts";

/** The parts of a Worker the client uses. */
export interface WorkerLike {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void;
  terminate(): void;
}

export interface DetectionStill {
  eventId: string;
  /** 0, 1 or 2. */
  index: number;
  /** When the frame was taken, laptop ms. */
  at: number;
  /** image/jpeg, 640 × 360. */
  blob: Blob;
}

export interface DetectionHandlers {
  /** An event for the outbox (see envelope.ts toEnvelope). A flag event should flush the outbox at once. */
  onEvent?(event: RuleEvent): void;
  /** 2.2 (phone), 2.3 (paused) and the Watching panel (away). */
  onCue?(cue: RuleCue): void;
  /** The stills that will follow an event, before they arrive. */
  onStillRequest?(request: StillRequest): void;
  /** A JPEG still for the outbox's stills table. */
  onStill?(still: DetectionStill): void;
  onState?(state: RulesState): void;
  /** The 1.2 camera row, in the check phase. */
  onCameraCheck?(check: CameraCheck): void;
  onDebug?(debug: DetectionDebug): void;
  onDegraded?(info: { input: InputSize; phoneIntervalMs: number }): void;
  onError?(error: { stage: string; message: string }): void;
}

export interface DetectionClient {
  /** Loads the models in the worker. Resolves with the delegates in use, rejects on an init error. */
  init(options: Omit<InitMessage, "type">): Promise<{ face: Delegate; phone: Delegate | null }>;
  /** Pumps `camera` into the worker until the returned function or `dispose` is called. */
  attach(camera: Camera): () => void;
  setPhase(phase: DetectionPhase): void;
  /** "I'm here" on 2.3. True when the worker sent session.resumed. */
  resume(): Promise<boolean>;
  /**
   * Calls `listener` with the geometry of every frame the worker tracks (check and exam phases), until
   * the returned function or `dispose` is called. Numbers only: no frame or pixel reaches it.
   */
  onGeometry(listener: GeometryListener): () => void;
  /** The last frame's geometry, or null before the first one and after dispose. */
  readonly geometry: DetectionGeometry | null;
  /** Tells the worker to close and terminates it. */
  dispose(): void;
  readonly phase: DetectionPhase;
  readonly ready: boolean;
}

export type GeometryListener = (geometry: DetectionGeometry) => void;

export interface DetectionClientOptions {
  now?: () => number;
  /** Frames sent before the worker answers frame-done. Default 1. */
  maxInFlight?: number;
}

export function createDetectionClient(
  worker: WorkerLike,
  handlers: DetectionHandlers,
  options: DetectionClientOptions = {},
): DetectionClient {
  const now = options.now ?? defaultNow;
  const maxInFlight = options.maxInFlight ?? 1;
  let ready = false;
  let disposed = false;
  let phase: DetectionPhase = "idle";
  let inFlight = 0;
  let camera: Camera | null = null;
  let requestId = 0;
  const resumes = new Map<number, (ok: boolean) => void>();
  const geometryListeners = new Set<GeometryListener>();
  let geometry: DetectionGeometry | null = null;
  let pendingInit: {
    resolve: (delegate: { face: Delegate; phone: Delegate | null }) => void;
    reject: (error: Error) => void;
  } | null = null;

  function send(message: MainToWorker, transfer?: Transferable[]): void {
    if (disposed) return;
    if (transfer) worker.postMessage(message, transfer);
    else worker.postMessage(message);
  }

  function onMessage(event: MessageEvent<unknown>): void {
    const parsed = WorkerToMain.safeParse(event.data);
    if (!parsed.success) {
      handlers.onError?.({ stage: "message", message: parsed.error.message });
      return;
    }
    const msg = parsed.data;
    switch (msg.type) {
      case "ready":
        ready = true;
        // A phase set before the models loaded was dropped by the worker; send it again.
        if (phase !== "idle") send({ type: "phase", phase, at: now() });
        pendingInit?.resolve(msg.delegate);
        pendingInit = null;
        return;
      case "error":
        if (msg.stage === "init" && pendingInit) {
          pendingInit.reject(new Error(msg.message));
          pendingInit = null;
        }
        handlers.onError?.({ stage: msg.stage, message: msg.message });
        return;
      case "frame-done":
        inFlight = Math.max(0, inFlight - 1);
        return;
      case "outputs":
        for (const output of msg.outputs) {
          // RuleOutputSchema checked each event's data against EVENT_DATA for its type.
          if (output.kind === "event") handlers.onEvent?.(output.event as RuleEvent);
          else if (output.kind === "stills") handlers.onStillRequest?.(output);
          else handlers.onCue?.(output);
        }
        return;
      case "still":
        handlers.onStill?.({ eventId: msg.eventId, index: msg.index, at: msg.at, blob: msg.blob });
        return;
      case "state":
        handlers.onState?.(msg.state);
        return;
      case "geometry":
        geometry = msg.geometry;
        for (const listener of geometryListeners) listener(msg.geometry);
        return;
      case "camera-check":
        handlers.onCameraCheck?.(msg.check);
        return;
      case "degraded":
        camera?.setInputSize(msg.input);
        handlers.onDegraded?.({ input: msg.input, phoneIntervalMs: msg.phoneIntervalMs });
        return;
      case "debug":
        handlers.onDebug?.(msg.debug);
        return;
      case "resumed": {
        const resolve = resumes.get(msg.requestId);
        resumes.delete(msg.requestId);
        resolve?.(msg.ok);
        return;
      }
    }
  }

  worker.addEventListener("message", onMessage);

  function cameraLost(reason: CameraLostReason, at: number): void {
    send({ type: "camera", state: "lost", reason, at });
  }

  return {
    get phase() {
      return phase;
    },
    get ready() {
      return ready;
    },
    get geometry() {
      return geometry;
    },

    init(init) {
      if (pendingInit || ready) return Promise.reject(new Error("init already called"));
      return new Promise((resolve, reject) => {
        pendingInit = { resolve, reject };
        send({ type: "init", ...init });
      });
    },

    attach(next) {
      camera = next;
      next.start({
        wantFrame: () => ready && !disposed && phase !== "idle" && inFlight < maxInFlight,
        onFrame: (bitmap, at) => {
          if (disposed) {
            bitmap.close();
            return;
          }
          inFlight += 1;
          send({ type: "frame", at, bitmap }, [bitmap]);
        },
        onLost: cameraLost,
        onRestored: (at) => send({ type: "camera", state: "ok", at }),
      });
      return () => {
        next.stop();
        if (camera === next) camera = null;
        inFlight = 0;
      };
    },

    setPhase(next) {
      phase = next;
      send({ type: "phase", phase: next, at: now() });
    },

    resume() {
      requestId += 1;
      const id = requestId;
      return new Promise<boolean>((resolve) => {
        resumes.set(id, resolve);
        send({ type: "resume", at: now(), requestId: id });
      });
    },

    onGeometry(listener) {
      if (disposed) return () => {};
      geometryListeners.add(listener);
      return () => {
        geometryListeners.delete(listener);
      };
    },

    dispose() {
      if (disposed) return;
      send({ type: "dispose" });
      disposed = true;
      camera?.stop();
      camera = null;
      worker.removeEventListener("message", onMessage);
      worker.terminate();
      for (const resolve of resumes.values()) resolve(false);
      resumes.clear();
      geometryListeners.clear();
      geometry = null;
      pendingInit?.reject(new Error("disposed"));
      pendingInit = null;
    },
  };
}
