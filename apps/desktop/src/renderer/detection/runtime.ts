// The camera and the detection worker for one session ("On-device detection" in docs/phase-0-plan.md).
// The flow asks for a phase (off, idle, check, exam); this module opens the camera once, starts the
// worker with the exam's checks and mode, checks the model manifest, and pumps frames. Everything the
// worker reports goes out through the handlers, and the per-frame geometry through `onGeometry`, for
// the live overlay; nothing here talks to the server.
import type { ExamChecks, ExamMode } from "@uki/contracts";
import {
  type Camera,
  createDetectionClient,
  type DetectionClient,
  type DetectionHandlers,
  type DetectionPhase,
  type GeometryListener,
  MODEL_PATHS,
  ModelManifest,
  modelUrls,
  openCamera,
  type WorkerLike,
} from "@uki/detection";
import { resourceUrl } from "../lib/resources.ts";

export type DetectionWantPhase = "off" | DetectionPhase;

/** The models base: uki://app/resources/models/ in development and packaged builds alike. */
export function modelsBase(): string {
  return resourceUrl("models/manifest.json").replace(/manifest\.json$/, "");
}

/** Files the worker cannot start without; fetch-models puts them there. */
export const REQUIRED_MODEL_FILES = [MODEL_PATHS.faceLandmarker, MODEL_PATHS.objectDetector] as const;

/**
 * Reads manifest.json and checks the worker's models are listed. A missing manifest means the models
 * were never fetched (`pnpm --filter @uki/detection models`).
 */
export async function checkModelManifest(
  fetcher: typeof fetch = fetch,
  base: string = modelsBase(),
): Promise<ModelManifest> {
  const response = await fetcher(`${base}manifest.json`, { cache: "no-store" });
  if (!response.ok) throw new Error(`models manifest: HTTP ${response.status}`);
  const manifest = ModelManifest.parse(await response.json());
  const listed = new Set(manifest.files.map((file) => file.path));
  const missing = REQUIRED_MODEL_FILES.filter((path) => !listed.has(path));
  if (missing.length > 0) throw new Error(`models manifest lacks ${missing.join(", ")}`);
  return manifest;
}

export interface DetectionRuntimeOptions {
  checks: ExamChecks;
  mode: ExamMode;
  handlers: DetectionHandlers & {
    /** The camera could not open (denied or none): the 1.2 camera row fails. */
    onCameraError?(error: Error): void;
    /** The stream changed (opened or closed), for the previews. */
    onStream?(stream: MediaStream | null): void;
  };
  /** Developer overlay data (development builds). */
  debug?: boolean;
  createWorker?: () => WorkerLike;
  openCamera?: () => Promise<Camera>;
  /** macOS camera permission (window.uki.checks.cameraAccess); false fails the camera row. */
  requestAccess?: () => Promise<boolean>;
  checkModels?: () => Promise<unknown>;
}

function defaultWorker(): WorkerLike {
  return new Worker(new URL("./detection.worker.ts", import.meta.url), {
    type: "module",
    name: "uki-detection",
  });
}

export class DetectionRuntime {
  private readonly options: DetectionRuntimeOptions;
  private camera: Camera | null = null;
  private client: DetectionClient | null = null;
  private detach: (() => void) | null = null;
  private starting: Promise<void> | null = null;
  private phase: DetectionWantPhase = "off";
  private disposed = false;
  private readonly geometryListeners = new Set<GeometryListener>();

  constructor(options: DetectionRuntimeOptions) {
    this.options = options;
  }

  get stream(): MediaStream | null {
    return this.camera?.stream ?? null;
  }

  get currentPhase(): DetectionWantPhase {
    return this.phase;
  }

  /** Moves to `phase`, opening the camera and the worker on first use. */
  async setPhase(phase: DetectionWantPhase): Promise<void> {
    if (this.disposed) return;
    this.phase = phase;
    if (phase === "off") {
      this.close();
      return;
    }
    await this.ensureStarted();
    if (this.phase === phase && this.client && this.client.phase !== phase) this.client.setPhase(phase);
  }

  /** Check again on 1.2: reopen a camera, or restart a worker, that failed. */
  async retry(): Promise<void> {
    if ((this.camera && this.client) || this.disposed || this.phase === "off") return;
    this.starting = null;
    await this.ensureStarted();
    // The phase may have changed while the camera opened.
    const phase = this.currentPhase;
    if (this.client && phase !== "off") this.client.setPhase(phase);
  }

  /** "I'm here" on 2.3: true when the worker sent session.resumed. */
  async resume(): Promise<boolean> {
    return this.client ? this.client.resume() : false;
  }

  /**
   * The geometry of every tracked frame (face boxes, head pose, phone boxes) for the live overlay, across
   * worker restarts, until the returned function is called.
   */
  onGeometry(listener: GeometryListener): () => void {
    this.geometryListeners.add(listener);
    return () => {
      this.geometryListeners.delete(listener);
    };
  }

  dispose(): void {
    this.disposed = true;
    this.geometryListeners.clear();
    this.close();
  }

  private ensureStarted(): Promise<void> {
    this.starting ??= this.start().catch((error: unknown) => {
      this.starting = null;
      throw error;
    });
    return this.starting.catch(() => {});
  }

  private async start(): Promise<void> {
    const { handlers } = this.options;
    // The camera first: the preview and the 1.2 camera row need it even if the models fail.
    if (!this.camera) {
      let camera: Camera;
      try {
        const granted = await (this.options.requestAccess?.() ?? Promise.resolve(true)).catch(() => true);
        if (!granted) throw new Error("camera access denied");
        camera = await (this.options.openCamera ?? (() => openCamera()))();
      } catch (error) {
        handlers.onCameraError?.(error instanceof Error ? error : new Error(String(error)));
        throw error;
      }
      if (this.disposed || this.phase === "off") {
        camera.stop();
        return;
      }
      this.camera = camera;
      handlers.onStream?.(camera.stream);
    }
    if (!this.client) {
      const urls = modelUrls(modelsBase());
      try {
        await (this.options.checkModels ?? (() => checkModelManifest()))();
        const client = createDetectionClient((this.options.createWorker ?? defaultWorker)(), handlers);
        this.client = client;
        client.onGeometry((geometry) => {
          for (const listener of this.geometryListeners) listener(geometry);
        });
        await client.init({
          checks: this.options.checks,
          mode: this.options.mode,
          models: {
            wasmBase: urls.wasmBase,
            faceLandmarker: urls.faceLandmarker,
            objectDetector: urls.objectDetector,
          },
          debug: this.options.debug ?? false,
        });
      } catch (error) {
        handlers.onError?.({
          stage: "init",
          message: error instanceof Error ? error.message : String(error),
        });
        this.client?.dispose();
        this.client = null;
        throw error;
      }
    }
    if (!this.detach && this.camera && this.client) this.detach = this.client.attach(this.camera);
  }

  private close(): void {
    this.detach?.();
    this.detach = null;
    this.camera?.stop();
    if (this.camera) this.options.handlers.onStream?.(null);
    this.camera = null;
    this.client?.dispose();
    this.client = null;
    this.starting = null;
  }
}
