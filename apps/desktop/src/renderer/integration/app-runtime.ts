// The window's one flow runtime, made and started on first use (StrictMode's double render and a later
// hash change reuse it). In development and e2e builds it may open the synthetic camera instead of the
// laptop's (camera-mode.ts); production builds compile that branch away.
import { DetectionRuntime } from "../detection/runtime.ts";
import { stageOf } from "../flow/derive.ts";
import { createDefaultRuntime } from "../flow/provider.tsx";
import type { FlowRuntime, FlowRuntimeDeps } from "../flow/runtime.ts";
import { cameraCardRect } from "../flow/select.ts";
import { cameraMode, SYNTHETIC_CAMERA_BUILD } from "./camera-mode.ts";

let shared: FlowRuntime | null = null;

/**
 * The synthetic camera's module, in development and e2e builds only. The condition is spelled out here
 * (not imported) so the bundler sees `false ? ... : null` in a production build and never emits the
 * module or its pictures.
 */
const loadSyntheticCamera =
  import.meta.env.DEV || import.meta.env.MODE === "e2e" ? () => import("./synthetic-camera.ts") : null;

/** 1.3 or 1.3a is open: the student holds the card in its frame until Continue. */
function identityOpen(runtime: FlowRuntime | null): boolean {
  if (!runtime) return false;
  const stage = stageOf(runtime.actor.getSnapshot());
  return stage === "identity" || stage === "identityHelp" || stage === "identityMatched";
}

declare global {
  interface Window {
    /** Development and e2e builds with the synthetic camera only: the detection worker's numbers. */
    ukiDetectionDebug?: () => unknown;
  }
}

function syntheticCameraDeps(): Partial<FlowRuntimeDeps> {
  const load = loadSyntheticCamera;
  if (!SYNTHETIC_CAMERA_BUILD || !load || cameraMode() !== "synthetic") return {};
  if (import.meta.env.DEV) console.warn("uki: synthetic camera (localStorage uki-dev-camera)");
  // The test reads what detection saw (face count, phone score) next to the picture it drew.
  window.ukiDetectionDebug = () => shared?.debug.get() ?? null;
  return {
    debug: true,
    createDetection: (options) =>
      new DetectionRuntime({
        ...options,
        // No camera permission is involved: the picture is drawn by the page.
        requestAccess: async () => true,
        openCamera: async () => {
          const { openSyntheticCamera } = await load();
          return openSyntheticCamera({
            cardRect: cameraCardRect(),
            cardWanted: () => identityOpen(shared),
            studentNumber: () => shared?.actor.getSnapshot().context.joined?.student.student_number ?? null,
          });
        },
      }),
  };
}

/** The runtime behind <StudentRoute>: started once, it lives as long as the window. */
export function getAppRuntime(): FlowRuntime {
  if (shared) return shared;
  const runtime = createDefaultRuntime(syntheticCameraDeps());
  shared = runtime;
  runtime.start();
  return runtime;
}
