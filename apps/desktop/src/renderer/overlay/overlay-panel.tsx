// The developer overlay ("Tuning" in docs/phase-0-plan.md): Ctrl+Shift+D shows fps, head angles, look
// scores, face count, phone score, the rule state and the fallback flag. Development builds only
// (dev-overlay.tsx never imports this file in production), so plain debug labels are fine here.
import { useEffect, useState } from "react";
import { useDetectionDebug } from "../flow/provider.tsx";

function n(value: number | null | undefined, digits = 1): string {
  return value === null || value === undefined ? "-" : value.toFixed(digits);
}

/** True for Ctrl+Shift+D (Cmd is not used, so macOS shortcuts stay free). */
export function isOverlayShortcut(
  event: Pick<KeyboardEvent, "ctrlKey" | "shiftKey" | "key" | "code">,
): boolean {
  return event.ctrlKey && event.shiftKey && (event.code === "KeyD" || event.key.toLowerCase() === "d");
}

export function OverlayPanel() {
  const [open, setOpen] = useState(false);
  const debug = useDetectionDebug();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!isOverlayShortcut(event)) return;
      event.preventDefault();
      setOpen((value) => !value);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!open) return null;
  const rules = debug?.rules;
  const rows: Array<[string, string]> = debug
    ? [
        ["phase", debug.phase],
        ["fps", n(debug.fps)],
        ["face ms", n(debug.faceMs)],
        ["phone ms", n(debug.phoneMs)],
        ["phone/s", n(debug.phoneChecksPerS)],
        ["delegate", debug.delegate ? `${debug.delegate.face}/${debug.delegate.phone ?? "-"}` : "-"],
        ["input", debug.input ? `${debug.input.width}x${debug.input.height}` : "-"],
        ["degraded", String(debug.degraded)],
        ["faces", String(debug.faces)],
        ["yaw", n(debug.head?.yawDeg)],
        ["pitch", n(debug.head?.pitchDeg)],
        ["look L", n(debug.look?.left, 2)],
        ["look R", n(debug.look?.right, 2)],
        ["look down", n(debug.look?.down, 2)],
        ["frame", debug.frameClass],
        ["phone", n(debug.phoneScore, 2)],
        ["gaze", rules?.gaze ?? "-"],
        [
          "look",
          rules?.look
            ? `${rules.look.kind} ${n(rules.look.heldMs, 0)}ms${rules.look.crossed ? " crossed" : ""}`
            : "-",
        ],
        ["no face", n(rules?.noFaceMs, 0)],
        ["two faces", n(rules?.twoFacesMs, 0)],
        ["phone hits", rules ? `${rules.phone.hits}${rules.phone.warning ? " warning" : ""}` : "-"],
        ["paused", rules?.paused ? rules.paused.reason : "-"],
        ["camera lost", rules ? String(rules.cameraLost) : "-"],
        ["can resume", rules ? String(rules.canResume) : "-"],
      ]
    : [["detection", "waiting for the worker"]];

  return (
    <aside
      aria-hidden="true"
      className="pointer-events-none fixed right-4 bottom-4 z-50 rounded-md bg-inverse p-3 text-fg-inverse shadow-float type-ui-mono"
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="opacity-60">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
