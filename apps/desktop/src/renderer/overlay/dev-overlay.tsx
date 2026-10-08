// Mount point for the developer overlay and the smoke build's marker. In production builds
// `import.meta.env.DEV` is false and the mode is neither "lab" nor "smoke", so both lazy imports below are
// dropped and neither the overlay's code nor the marker's ever ships (.github/scripts/desktop-variant-check.sh
// checks the built renderer). The lab zip (`electron-vite build --mode lab`, CI only, never shipped) keeps
// the overlay for measuring fps on a lab PC; the smoke zip (`--mode smoke`, CI only, never shipped) keeps
// it too and adds the marker (smoke-marker.dev.tsx).
import { lazy, Suspense } from "react";

const Panel =
  import.meta.env.DEV || import.meta.env.MODE === "lab" || import.meta.env.MODE === "smoke"
    ? lazy(() => import("./overlay-panel.tsx").then((module) => ({ default: module.OverlayPanel })))
    : null;

const Marker =
  import.meta.env.MODE === "smoke"
    ? lazy(() => import("./smoke-marker.dev.tsx").then((module) => ({ default: module.SmokeMarker })))
    : null;

/** Render once inside <FlowProvider>; Ctrl+Shift+D toggles it in development, lab and smoke builds. */
export function DevOverlay() {
  if (!Panel && !Marker) return null;
  return (
    <Suspense fallback={null}>
      {Panel ? <Panel /> : null}
      {Marker ? <Marker /> : null}
    </Suspense>
  );
}
