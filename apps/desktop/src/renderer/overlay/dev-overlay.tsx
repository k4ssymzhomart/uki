// Mount point for the developer overlay. In production builds `import.meta.env.DEV` is false and the mode
// is not "lab", so the lazy import below is dropped and the overlay's code never ships. The lab zip
// (`electron-vite build --mode lab`, CI only, never shipped) keeps it for measuring fps on a lab PC.
import { lazy, Suspense } from "react";

const Panel =
  import.meta.env.DEV || import.meta.env.MODE === "lab"
    ? lazy(() => import("./overlay-panel.tsx").then((module) => ({ default: module.OverlayPanel })))
    : null;

/** Render once inside <FlowProvider>; Ctrl+Shift+D toggles it in development and lab builds. */
export function DevOverlay() {
  if (!Panel) return null;
  return (
    <Suspense fallback={null}>
      <Panel />
    </Suspense>
  );
}
