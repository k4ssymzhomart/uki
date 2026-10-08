import { describe, expect, it } from "vitest";
import { chooseCameraMode } from "./camera-mode.ts";

describe("chooseCameraMode", () => {
  it("defaults to the synthetic camera in the e2e and smoke builds and the real one elsewhere", () => {
    expect(chooseCameraMode(null, true)).toBe("synthetic");
    expect(chooseCameraMode(null, false)).toBe("real");
  });

  it("follows the stored choice and ignores anything else", () => {
    expect(chooseCameraMode("real", true)).toBe("real");
    expect(chooseCameraMode("synthetic", false)).toBe("synthetic");
    expect(chooseCameraMode("fake", true)).toBe("synthetic");
    expect(chooseCameraMode("fake", false)).toBe("real");
  });
});
