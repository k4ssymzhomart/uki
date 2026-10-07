// The renderer root. Production builds show only the student window; development builds also serve the
// galleries at #/gallery and #/screens (routes/route-table.ts).
import { Suspense } from "react";
import type { FlowRuntime } from "./flow/runtime.ts";
import { ScreensGallery, UiGallery } from "./routes/dev-galleries.tsx";
import { routeOf } from "./routes/route-table.ts";
import { StudentRoute } from "./routes/student-route.tsx";
import { useHash } from "./routes/use-hash.ts";

export interface AppProps {
  /** Tests only: a runtime with fakes instead of the window's own. */
  runtime?: FlowRuntime;
}

export function App({ runtime }: AppProps) {
  const route = routeOf(useHash(), import.meta.env.DEV);
  if (route === "gallery" && UiGallery) {
    return (
      <Suspense fallback={null}>
        <UiGallery />
      </Suspense>
    );
  }
  if (route === "screens" && ScreensGallery) {
    return (
      <Suspense fallback={null}>
        <ScreensGallery />
      </Suspense>
    );
  }
  return <StudentRoute runtime={runtime} />;
}
