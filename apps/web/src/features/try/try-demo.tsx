"use client";

import { openCamera, type WorkerLike } from "@uki/detection";
import { useCallback, useEffect, useReducer, useRef } from "react";
import { detectionSupported, INITIAL_TRY_STATE, MODELS_PATH, tryReducer } from "./try-model.ts";
import { type TryDeps, TryRuntime } from "./try-runtime.ts";
import { TryView } from "./try-view.tsx";

/** The desktop app's detection worker, bundled by Next.js as a module worker. */
function createWorker(): WorkerLike {
  return new Worker(new URL("./detection.worker.ts", import.meta.url), {
    type: "module",
    name: "uki-detection",
  });
}

const BROWSER_DEPS: TryDeps = {
  createWorker,
  openCamera: () => openCamera(),
  modelsBase: () => new URL(MODELS_PATH, window.location.origin).href,
  supported: () => detectionSupported(globalThis),
};

/**
 * The /try demo's client side: starts the camera and the worker on Start, feeds the view, and stops
 * both on Stop, on leaving the page and when the tab is closed.
 */
export function TryDemo({ deps = BROWSER_DEPS }: { deps?: TryDeps }) {
  const [state, dispatch] = useReducer(tryReducer, INITIAL_TRY_STATE);
  const runtime = useRef<TryRuntime | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);

  const ensureRuntime = useCallback((): TryRuntime => {
    runtime.current ??= new TryRuntime(
      {
        onStatus: (status) => dispatch({ type: "status", status }),
        onStream: (stream) => dispatch({ type: "stream", stream }),
        onDebug: (debug, source, elapsedMs) => dispatch({ type: "debug", debug, source, elapsedMs }),
        onState: (rules) => dispatch({ type: "rules", rules }),
        onEvent: (event) => dispatch({ type: "event", event }),
        onCue: (cue) => {
          if (cue.cue === "away" || cue.cue === "phone" || cue.cue === "paused") {
            dispatch({ type: "cue", cue: cue.cue, on: cue.on });
          }
        },
      },
      deps,
    );
    return runtime.current;
  }, [deps]);

  useEffect(() => {
    const stop = () => runtime.current?.stop();
    window.addEventListener("pagehide", stop);
    return () => {
      window.removeEventListener("pagehide", stop);
      stop();
    };
  }, []);

  useEffect(() => {
    if (video.current && video.current.srcObject !== state.stream) video.current.srcObject = state.stream;
  }, [state.stream]);

  const start = useCallback(() => {
    dispatch({ type: "start" });
    void ensureRuntime().start();
  }, [ensureRuntime]);

  const stop = useCallback(() => {
    ensureRuntime().stop();
    dispatch({ type: "status", status: { kind: "idle" } });
  }, [ensureRuntime]);

  const resume = useCallback(() => {
    void ensureRuntime().resume();
  }, [ensureRuntime]);

  const videoRef = useCallback(
    (element: HTMLVideoElement | null) => {
      video.current = element;
      if (element && element.srcObject !== state.stream) element.srcObject = state.stream;
    },
    [state.stream],
  );

  return <TryView state={state} onStart={start} onStop={stop} onResume={resume} videoRef={videoRef} />;
}
