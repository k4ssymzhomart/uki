// The student window: languages (Kazakh first), the flow and the screens. The developer overlay mounts
// only in development builds (Ctrl+Shift+D).
import { DevOverlay, FlowProvider } from "../flow/index.ts";
import type { FlowRuntime } from "../flow/runtime.ts";
import { UkiIntlProvider } from "../i18n/uki-intl-provider.tsx";
import { getAppRuntime } from "../integration/app-runtime.ts";
import { StudentWindow } from "../integration/student-window.tsx";

export interface StudentRouteProps {
  /** Tests pass their own runtime; the app uses the window's one (started once). */
  runtime?: FlowRuntime;
}

export function StudentRoute({ runtime }: StudentRouteProps) {
  return (
    <UkiIntlProvider>
      <FlowProvider runtime={runtime ?? getAppRuntime()}>
        <DevOverlay />
        <StudentWindow />
      </FlowProvider>
    </UkiIntlProvider>
  );
}
