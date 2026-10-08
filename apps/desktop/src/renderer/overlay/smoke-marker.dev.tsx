// The smoke build's marker (`electron-vite build --mode smoke`: the CI-only Windows zip for a box with no
// webcam, such as a Windows Server VPS over Remote Desktop; never shipped). It labels every screen
// "SMOKE BUILD", names the synthetic camera's picture, and Ctrl+Shift+S moves the picture on: the student,
// the student holding a phone, the empty seat. dev-overlay.tsx imports this file only in the smoke build,
// so plain debug labels are fine here, as in the overlay panel; the shipped renderer never holds them
// (.github/scripts/desktop-variant-check.sh).
import { useEffect, useState } from "react";
import { type SyntheticSubject, syntheticCameraControl } from "../integration/synthetic-camera.ts";

/** The marker's own label; the variant check looks for exactly this text in the built renderer. */
export const SMOKE_MARKER = "SMOKE BUILD";

const SUBJECTS: readonly SyntheticSubject[] = ["present", "phone", "absent"];

/** The picture after `subject`, in a loop: present, phone, absent, present. */
export function nextSubject(subject: SyntheticSubject): SyntheticSubject {
  return SUBJECTS[(SUBJECTS.indexOf(subject) + 1) % SUBJECTS.length] ?? "present";
}

/** True for Ctrl+Shift+S (the keyboard hook and lockdown both let it through). */
export function isSceneShortcut(
  event: Pick<KeyboardEvent, "ctrlKey" | "shiftKey" | "altKey" | "key" | "code">,
): boolean {
  return (
    event.ctrlKey &&
    event.shiftKey &&
    !event.altKey &&
    (event.code === "KeyS" || event.key.toLowerCase() === "s")
  );
}

export function SmokeMarker() {
  const [subject, setSubject] = useState<SyntheticSubject>(() => syntheticCameraControl.get().subject);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!isSceneShortcut(event)) return;
      event.preventDefault();
      const scene = syntheticCameraControl.set({
        subject: nextSubject(syntheticCameraControl.get().subject),
      });
      setSubject(scene.subject);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <aside
      aria-hidden="true"
      data-testid="smoke-marker"
      className="pointer-events-none fixed bottom-4 left-4 z-50 flex flex-col gap-0.5 rounded-md bg-danger px-3 py-2 text-white shadow-float type-ui-mono"
    >
      <span className="type-label-m-strong">{SMOKE_MARKER}</span>
      <span>camera: synthetic, {subject} (Ctrl+Shift+S)</span>
      <span>overlay Ctrl+Shift+D, escape Ctrl+Shift+Q</span>
    </aside>
  );
}
