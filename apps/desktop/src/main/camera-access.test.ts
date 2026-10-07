// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { requestCameraAccess } from "./camera-access.ts";

describe("requestCameraAccess", () => {
  it("asks macOS for the camera", async () => {
    const askForMediaAccess = vi.fn(async () => true);
    const getMediaAccessStatus = vi.fn(() => "not-determined" as const);
    await expect(requestCameraAccess("macos", { askForMediaAccess, getMediaAccessStatus })).resolves.toBe(
      true,
    );
    expect(askForMediaAccess).toHaveBeenCalledWith("camera");
    askForMediaAccess.mockResolvedValueOnce(false);
    await expect(requestCameraAccess("macos", { askForMediaAccess, getMediaAccessStatus })).resolves.toBe(
      false,
    );
  });

  it("reads the Windows privacy switch", async () => {
    const status = vi.fn<() => "granted" | "denied" | "restricted" | "unknown" | "not-determined">(
      () => "granted",
    );
    const prefs = { getMediaAccessStatus: status };
    await expect(requestCameraAccess("windows", prefs)).resolves.toBe(true);
    status.mockReturnValue("denied");
    await expect(requestCameraAccess("windows", prefs)).resolves.toBe(false);
    status.mockReturnValue("restricted");
    await expect(requestCameraAccess("windows", prefs)).resolves.toBe(false);
    status.mockReturnValue("unknown");
    await expect(requestCameraAccess("windows", prefs)).resolves.toBe(true);
  });
});
