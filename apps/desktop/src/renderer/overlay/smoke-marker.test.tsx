import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { syntheticCameraControl } from "../integration/synthetic-camera.ts";
import { isSceneShortcut, nextSubject, SMOKE_MARKER, SmokeMarker } from "./smoke-marker.dev.tsx";

const key = (patch: Partial<Parameters<typeof isSceneShortcut>[0]>) => ({
  ctrlKey: true,
  shiftKey: true,
  altKey: false,
  key: "S",
  code: "KeyS",
  ...patch,
});

afterEach(() => {
  cleanup();
  syntheticCameraControl.set({ subject: "present" });
});

describe("the smoke build's marker", () => {
  it("moves the synthetic picture on in a loop: student, phone, empty seat", () => {
    expect(nextSubject("present")).toBe("phone");
    expect(nextSubject("phone")).toBe("absent");
    expect(nextSubject("absent")).toBe("present");
  });

  it("reads Ctrl+Shift+S on any layout and nothing else", () => {
    expect(isSceneShortcut(key({}))).toBe(true);
    expect(isSceneShortcut(key({ key: "Ы" }))).toBe(true);
    expect(isSceneShortcut(key({ code: "", key: "s" }))).toBe(true);
    expect(isSceneShortcut(key({ shiftKey: false }))).toBe(false);
    expect(isSceneShortcut(key({ ctrlKey: false }))).toBe(false);
    expect(isSceneShortcut(key({ altKey: true }))).toBe(false);
    expect(isSceneShortcut(key({ code: "KeyD", key: "D" }))).toBe(false);
  });

  it("says SMOKE BUILD and changes the camera's picture on Ctrl+Shift+S", () => {
    render(<SmokeMarker />);
    const marker = screen.getByTestId("smoke-marker");
    expect(marker.textContent).toContain(SMOKE_MARKER);
    expect(marker.textContent).toContain("present");

    act(() => {
      fireEvent.keyDown(window, key({}));
    });
    expect(syntheticCameraControl.get().subject).toBe("phone");
    expect(marker.textContent).toContain("phone");

    act(() => {
      fireEvent.keyDown(window, key({ shiftKey: false }));
    });
    expect(syntheticCameraControl.get().subject).toBe("phone");
  });
});
