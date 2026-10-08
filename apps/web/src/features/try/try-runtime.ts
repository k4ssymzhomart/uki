// The camera and the detection worker for the /try demo: the desktop app's own pieces from
// @uki/detection (openCamera, the module worker, createDetectionClient), started with the default
// checks of an app exam, debug data on, and stills off, so no JPEG is ever made. Nothing here has a
// network call besides the model files the worker loads from this site's /models/; nothing is sent.
import {
  type Camera,
  createDetectionClient,
  type DetectionClient,
  type DetectionDebug,
  defaultNow,
  type FrameSource,
  modelUrls,
  type RuleCue,
  type RulesState,
  type WorkerLike,
} from "@uki/detection";
import { cameraProblem, DEMO_CHECKS, type TryEvent, type TryStatus, toTryEvent } from "./try-model.ts";

export interface TryHandlers {
  onStatus(status: TryStatus): void;
  /** The camera stream for the preview, or null after stop. */
  onStream(stream: MediaStream | null): void;
  /** Overlay data twice a second, with the frame source and the time since the demo started. */
  onDebug(debug: DetectionDebug, source: FrameSource | null, elapsedMs: number): void;
  onState(state: RulesState): void;
  onEvent(event: TryEvent): void;
  onCue(cue: RuleCue): void;
}

export interface TryDeps {
  createWorker(): WorkerLike;
  openCamera(): Promise<Camera>;
  /** Absolute URL of the models folder, with a trailing slash. */
  modelsBase(): string;
  supported(): boolean;
  now?: () => number;
}

export class TryRuntime {
  private readonly handlers: TryHandlers;
  private readonly deps: TryDeps;
  private camera: Camera | null = null;
  private client: DetectionClient | null = null;
  /** Bumped by every start and stop, so a start that is overtaken cleans up after itself. */
  private run = 0;
  private startedAt = 0;

  constructor(handlers: TryHandlers, deps: TryDeps) {
    this.handlers = handlers;
    this.deps = deps;
  }

  get running(): boolean {
    return this.client !== null && this.camera !== null;
  }

  async start(): Promise<void> {
    this.stop();
    const run = ++this.run;
    const current = () => run === this.run;
    const { handlers, deps } = this;
    if (!deps.supported()) {
      handlers.onStatus({ kind: "failed", problem: "unsupported" });
      return;
    }

    handlers.onStatus({ kind: "camera" });
    let camera: Camera;
    try {
      camera = await deps.openCamera();
    } catch (error) {
      if (current()) handlers.onStatus({ kind: "failed", problem: cameraProblem(error) });
      return;
    }
    if (!current()) {
      camera.stop();
      return;
    }
    this.camera = camera;
    handlers.onStream(camera.stream);

    handlers.onStatus({ kind: "models" });
    const client = createDetectionClient(deps.createWorker(), {
      onEvent: (event) => {
        if (current()) handlers.onEvent(toTryEvent(event, this.startedAt));
      },
      onCue: (cue) => {
        if (current()) handlers.onCue(cue);
      },
      onState: (state) => {
        if (current()) handlers.onState(state);
      },
      onDebug: (debug) => {
        if (current()) {
          handlers.onDebug(debug, this.camera?.source ?? null, Math.max(0, debug.at - this.startedAt));
        }
      },
    });
    this.client = client;
    const urls = modelUrls(deps.modelsBase());
    try {
      await client.init({
        checks: DEMO_CHECKS,
        mode: "app",
        models: {
          wasmBase: urls.wasmBase,
          faceLandmarker: urls.faceLandmarker,
          objectDetector: urls.objectDetector,
        },
        debug: true,
        stills: false,
      });
    } catch {
      if (!current()) return;
      this.stop();
      handlers.onStatus({ kind: "failed", problem: "models" });
      return;
    }
    if (!current()) return;
    this.startedAt = (deps.now ?? defaultNow)();
    client.attach(camera);
    client.setPhase("exam");
    handlers.onStatus({ kind: "running" });
  }

  /** "I'm here" after the pause: true when the rules engine sent session.resumed. */
  async resume(): Promise<boolean> {
    return this.client ? this.client.resume() : false;
  }

  /** Stops the worker and the camera; the camera light goes off. */
  stop(): void {
    this.run += 1;
    this.client?.dispose();
    this.client = null;
    if (this.camera) {
      this.camera.stop();
      this.camera = null;
      this.handlers.onStream(null);
    }
  }
}
