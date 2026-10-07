// checks.cameraAccess() for the Camera row of 1.2: on macOS the app asks with
// systemPreferences.askForMediaAccess("camera") before the live preview opens (the prompt shows once;
// later calls answer from the stored choice). Windows has no prompt for desktop apps: the privacy
// switch either allows the camera or not.
import type { DesktopOs } from "@uki/contracts";
import type { SystemPreferences } from "electron";

export type CameraPreferences = Pick<SystemPreferences, "getMediaAccessStatus"> &
  Partial<Pick<SystemPreferences, "askForMediaAccess">>;

/** True when the app may use the camera. */
export async function requestCameraAccess(os: DesktopOs, preferences: CameraPreferences): Promise<boolean> {
  if (os === "macos" && preferences.askForMediaAccess) {
    return preferences.askForMediaAccess("camera");
  }
  const status = preferences.getMediaAccessStatus("camera");
  return status !== "denied" && status !== "restricted";
}
