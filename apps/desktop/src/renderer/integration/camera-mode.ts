// Which camera the window opens. Production builds always open the real camera: SYNTHETIC_CAMERA_BUILD
// is a build-time constant, false there, so the synthetic camera's code is never bundled.
//
// Development builds (`pnpm dev`), the end-to-end build (`electron-vite build --mode e2e`) and the smoke
// build (`electron-vite build --mode smoke`, the CI-only Windows zip for a box with no webcam) may feed
// detection a synthetic picture instead (integration/synthetic-camera.ts): the e2e and smoke builds do so
// by default, a development build when localStorage["uki-dev-camera"] is "synthetic". Set it to "real" in
// an e2e build to use the laptop's camera.

/** True only in development, e2e and smoke builds. */
export const SYNTHETIC_CAMERA_BUILD: boolean =
  import.meta.env.DEV || import.meta.env.MODE === "e2e" || import.meta.env.MODE === "smoke";

export const CAMERA_MODE_STORAGE_KEY = "uki-dev-camera";

export type CameraMode = "real" | "synthetic";

/** The stored choice wins; otherwise the e2e and smoke builds are synthetic and every other build real. */
export function chooseCameraMode(stored: string | null, syntheticByDefault: boolean): CameraMode {
  if (stored === "real" || stored === "synthetic") return stored;
  return syntheticByDefault ? "synthetic" : "real";
}

/** The camera for this window, read once when the flow starts. */
export function cameraMode(): CameraMode {
  if (!SYNTHETIC_CAMERA_BUILD) return "real";
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(CAMERA_MODE_STORAGE_KEY);
  } catch {
    stored = null;
  }
  return chooseCameraMode(stored, import.meta.env.MODE === "e2e" || import.meta.env.MODE === "smoke");
}
