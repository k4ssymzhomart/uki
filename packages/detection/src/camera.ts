// The camera in the renderer ("Pipeline" step 1): getUserMedia at 640 × 480 and 30 fps; a
// MediaStreamTrackProcessor reads the frames so a hidden window keeps its rate, with a
// requestVideoFrameCallback fallback. Every second frame becomes an ImageBitmap for the worker, unless
// the worker is still busy. A track that ends or mutes, or a reader error, reports camera.lost.
// The preview on 1.2, 1.3 and 2.1 plays `camera.stream` in a muted <video>; nothing here records.
import type { CameraLostReason } from "@uki/contracts";
import { FULL_INPUT, type InputSize } from "./perf.ts";

export interface CameraOptions {
  deviceId?: string;
  /** Requested size, default 640 × 480. */
  width?: number;
  height?: number;
  /** Requested rate, default 30. */
  frameRate?: number;
  /** Hand every nth camera frame to detection, default 2 (30 fps camera, 15 fps tracking). */
  everyNth?: number;
  /** Laptop time in ms; default performance.timeOrigin + performance.now(). */
  now?: () => number;
}

export interface CameraHandlers {
  /** False skips this frame before any bitmap is made (the worker is busy or detection is idle). */
  wantFrame(): boolean;
  /** The bitmap is the caller's to transfer or close. */
  onFrame(bitmap: ImageBitmap, at: number): void;
  onLost(reason: CameraLostReason, at: number): void;
  onRestored?(at: number): void;
}

export type FrameSource = "track-processor" | "video-frame-callback" | "timer";

export interface Camera {
  readonly stream: MediaStream;
  readonly track: MediaStreamTrack;
  readonly source: FrameSource | null;
  /** Starts handing frames out. Call once. */
  start(handlers: CameraHandlers): void;
  /** Width of the bitmaps handed out; the height keeps the camera's aspect. The fallback sets 480. */
  setInputSize(size: InputSize): void;
  /** Stops the frame loop and the camera. Stopping is not reported as camera.lost. */
  stop(): void;
}

interface TrackProcessor {
  readable: ReadableStream<VideoFrame>;
}
type TrackProcessorConstructor = new (init: {
  track: MediaStreamTrack;
  maxBufferSize?: number;
}) => TrackProcessor;

export const defaultNow = (): number => performance.timeOrigin + performance.now();

/** Opens the camera. Throws when the student denies access or no camera exists (the 1.2 camera row). */
export async function openCamera(options: CameraOptions = {}): Promise<Camera> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      ...(options.deviceId ? { deviceId: { exact: options.deviceId } } : {}),
      width: { ideal: options.width ?? FULL_INPUT.width },
      height: { ideal: options.height ?? FULL_INPUT.height },
      frameRate: { ideal: options.frameRate ?? 30 },
    },
  });
  const track = stream.getVideoTracks()[0];
  if (!track) {
    for (const t of stream.getTracks()) t.stop();
    throw new Error("no video track");
  }
  return cameraFromStream(stream, track, options);
}

/** The frame pump for a stream that is already open (openCamera, or a test double). */
export function cameraFromStream(
  stream: MediaStream,
  track: MediaStreamTrack,
  options: CameraOptions,
): Camera {
  const now = options.now ?? defaultNow;
  const everyNth = Math.max(1, Math.floor(options.everyNth ?? 2));
  let inputWidth = FULL_INPUT.width;
  let stopped = false;
  let started = false;
  let source: FrameSource | null = null;
  let reader: ReadableStreamDefaultReader<VideoFrame> | null = null;
  let video: HTMLVideoElement | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let lostReported = false;
  let count = 0;
  let handlers: CameraHandlers | null = null;

  function resizeFor(width: number, height: number): ImageBitmapOptions | undefined {
    if (width <= 0 || height <= 0 || width === inputWidth) return undefined;
    return {
      resizeWidth: inputWidth,
      resizeHeight: Math.round((inputWidth * height) / width),
      resizeQuality: "low",
    };
  }

  function lost(reason: CameraLostReason): void {
    if (stopped || lostReported) return;
    lostReported = true;
    handlers?.onLost(reason, now());
  }

  function restored(): void {
    if (stopped || !lostReported) return;
    lostReported = false;
    handlers?.onRestored?.(now());
  }

  const onEnded = (): void => lost("ended");
  const onMute = (): void => lost("muted");
  const onUnmute = (): void => restored();
  track.addEventListener("ended", onEnded);
  track.addEventListener("mute", onMute);
  track.addEventListener("unmute", onUnmute);

  function take(): boolean {
    count += 1;
    return count % everyNth === 0 && !stopped && (handlers?.wantFrame() ?? false);
  }

  async function pumpProcessor(Processor: TrackProcessorConstructor): Promise<void> {
    const processor = new Processor({ track, maxBufferSize: 2 });
    reader = processor.readable.getReader();
    for (;;) {
      let result: ReadableStreamReadResult<VideoFrame>;
      try {
        result = await reader.read();
      } catch {
        lost("error");
        return;
      }
      if (result.done) {
        if (!stopped) lost("ended");
        return;
      }
      const frame = result.value;
      try {
        if (take()) {
          const at = now();
          const bitmap = await createImageBitmap(frame, resizeFor(frame.displayWidth, frame.displayHeight));
          if (stopped) bitmap.close();
          else handlers?.onFrame(bitmap, at);
        }
      } catch {
        // A frame that cannot become a bitmap is skipped; a dead track reports through its events.
      } finally {
        frame.close();
      }
    }
  }

  async function grabFromVideo(element: HTMLVideoElement): Promise<void> {
    if (!take()) return;
    const at = now();
    try {
      const bitmap = await createImageBitmap(element, resizeFor(element.videoWidth, element.videoHeight));
      if (stopped) bitmap.close();
      else handlers?.onFrame(bitmap, at);
    } catch {
      // The element has no frame yet.
    }
  }

  async function pumpVideo(): Promise<void> {
    const element = document.createElement("video");
    video = element;
    element.muted = true;
    element.playsInline = true;
    element.srcObject = stream;
    try {
      await element.play();
    } catch {
      lost("error");
      return;
    }
    if (typeof element.requestVideoFrameCallback === "function") {
      source = "video-frame-callback";
      const onVideoFrame = (): void => {
        if (stopped) return;
        void grabFromVideo(element).finally(() => {
          if (!stopped) element.requestVideoFrameCallback(onVideoFrame);
        });
      };
      element.requestVideoFrameCallback(onVideoFrame);
    } else {
      source = "timer";
      const rate = track.getSettings().frameRate ?? options.frameRate ?? 30;
      timer = setInterval(() => void grabFromVideo(element), 1000 / rate);
    }
  }

  return {
    stream,
    track,
    get source() {
      return source;
    },
    start(next) {
      if (started) throw new Error("camera already started");
      started = true;
      handlers = next;
      if (track.readyState === "ended") {
        lost("ended");
        return;
      }
      if (track.muted) lost("muted");
      const Processor = (globalThis as { MediaStreamTrackProcessor?: TrackProcessorConstructor })
        .MediaStreamTrackProcessor;
      if (Processor) {
        source = "track-processor";
        void pumpProcessor(Processor);
      } else {
        void pumpVideo();
      }
    },
    setInputSize(size) {
      inputWidth = size.width;
    },
    stop() {
      if (stopped) return;
      stopped = true;
      track.removeEventListener("ended", onEnded);
      track.removeEventListener("mute", onMute);
      track.removeEventListener("unmute", onUnmute);
      void reader?.cancel().catch(() => {});
      if (timer !== null) clearInterval(timer);
      if (video) {
        video.pause();
        video.srcObject = null;
      }
      for (const t of stream.getTracks()) t.stop();
    },
  };
}
