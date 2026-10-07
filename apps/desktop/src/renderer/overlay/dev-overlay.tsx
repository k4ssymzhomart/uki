// Mount point for the developer overlay. In production builds `import.meta.env.DEV` is false, so the
// lazy import below is dropped and the overlay's code never ships.
import { lazy, Suspense } from "react";

const Panel = import.meta.env.DEV
  ? lazy(() => import("./overlay-panel.tsx").then((module) => ({ default: module.OverlayPanel })))
  : null;

/** Render once inside <FlowProvider>; Ctrl+Shift+D toggles it in development builds. */
export function DevOverlay() {
  if (!Panel) return null;
  return (
    <Suspense fallback={null}>
      <Panel />
    </Suspense>
  );
}
