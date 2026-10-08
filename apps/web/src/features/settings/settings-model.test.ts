import { DEFAULT_WORKSPACE_SETTINGS } from "@uki/contracts";
import { describe, expect, it } from "vitest";
import { applyChange, DURATION_OPTIONS, GAZE_OPTIONS, PHONE_OPTIONS, withCurrent } from "./settings-model.ts";

const settings = DEFAULT_WORKSPACE_SETTINGS;

describe("A.4 settings", () => {
  it("changes one setting and keeps the rest", () => {
    expect(applyChange(settings, { key: "default_duration_min", value: 120 })).toEqual({
      ...settings,
      default_duration_min: 120,
    });
    expect(applyChange(settings, { key: "lobby_minutes", value: 30 })?.lobby_minutes).toBe(30);
    expect(applyChange(settings, { key: "retention_days", value: 30 })?.retention_days).toBe(30);
  });

  it("changes the default checks inside default_checks", () => {
    const next = applyChange(settings, { key: "identity", value: false });
    expect(next?.default_checks).toEqual({ ...settings.default_checks, identity: false });
    expect(applyChange(settings, { key: "gaze_s", value: 3 })?.default_checks.gaze_s).toBe(3);
    expect(applyChange(settings, { key: "phone_score", value: 0.9 })?.default_checks.phone_score).toBe(0.9);
    expect(applyChange(settings, { key: "lock", value: false })?.default_checks.lock).toBe(false);
    // The input is not changed.
    expect(settings.default_checks.identity).toBe(true);
  });

  it("refuses a value WorkspaceSettings and the database would refuse", () => {
    expect(applyChange(settings, { key: "retention_days", value: 0 })).toBeNull();
    expect(applyChange(settings, { key: "default_duration_min", value: 4 })).toBeNull();
    expect(applyChange(settings, { key: "lobby_minutes", value: 241 })).toBeNull();
    expect(applyChange(settings, { key: "phone_score", value: 1.5 })).toBeNull();
  });

  it("offers the fixed choices plus a current value that is not one of them", () => {
    expect(withCurrent(GAZE_OPTIONS, 2)).toEqual([1, 2, 3]);
    expect(withCurrent(GAZE_OPTIONS, 2.5)).toEqual([1, 2, 2.5, 3]);
    expect(withCurrent(PHONE_OPTIONS, 0.77)).toEqual([0.75, 0.77, 0.8, 0.85, 0.9, 0.95]);
    expect(withCurrent(DURATION_OPTIONS, 90)).toEqual([...DURATION_OPTIONS]);
  });
});
