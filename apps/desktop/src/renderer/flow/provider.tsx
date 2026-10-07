// React access to the student flow. <FlowProvider> (inside <UkiIntlProvider>) owns one FlowRuntime for
// the window; screens call useStudentFlow() for { state: ScreenModel, send } and useCameraStream() for
// the live preview. The flow's language and the IntlProvider's stay in step both ways.
import { DEFAULT_LOCALE } from "@uki/contracts";
import type { DetectionDebug } from "@uki/detection";
import { useSelector } from "@xstate/react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useLocale } from "../i18n/locale-context.ts";
import { OutboxDb } from "../outbox/db.ts";
import { Outbox } from "../outbox/outbox.ts";
import { examOfficeEmail, storedLocale } from "../services/config.ts";
import { createStudentApi, type StudentApi } from "../services/student-api.ts";
import { ensureStudentSession, getStudentClient } from "../services/supabase.ts";
import { FlowRuntime, type FlowRuntimeDeps } from "./runtime.ts";
import { selectScreen } from "./select.ts";
import type { FlowUiEvent, ScreenModel } from "./view-model.ts";

const RuntimeContext = createContext<FlowRuntime | null>(null);

let shared: FlowRuntime | null = null;

/**
 * The window's runtime: the Supabase client from the build settings, the outbox in IndexedDB.
 * `overrides` replaces single dependencies (the app root passes a synthetic camera in e2e builds).
 */
export function createDefaultRuntime(overrides: Partial<FlowRuntimeDeps> = {}): FlowRuntime {
  let api: StudentApi | null = null;
  let ensureSignedIn = async (): Promise<void> => {
    throw new Error("no Supabase settings in this build");
  };
  try {
    const { client, env } = getStudentClient();
    api = createStudentApi(client, {
      url: env.VITE_SUPABASE_URL,
      publishableKey: env.VITE_SUPABASE_PUBLISHABLE_KEY,
    });
    ensureSignedIn = async () => {
      await ensureStudentSession(client);
    };
  } catch (error) {
    if (import.meta.env.DEV) console.error("uki: Supabase is not configured", error);
  }
  return new FlowRuntime({
    bridge: window.uki,
    api,
    ensureSignedIn,
    outbox: new Outbox(new OutboxDb()),
    locale: storedLocale() ?? DEFAULT_LOCALE,
    contactEmail: examOfficeEmail(),
    debug: import.meta.env.DEV,
    ...overrides,
  });
}

export interface FlowProviderProps {
  children: ReactNode;
  /** A runtime to use instead of the window's own (tests); the caller starts and stops it. */
  runtime?: FlowRuntime;
}

/**
 * Starts the flow once for the window (it lives as long as the window, so React's StrictMode double
 * mount does not restart it) and keeps the language in step with <UkiIntlProvider>.
 */
export function FlowProvider({ children, runtime }: FlowProviderProps) {
  const [rt] = useState<FlowRuntime>(() => {
    if (runtime) return runtime;
    shared ??= createDefaultRuntime();
    return shared;
  });
  useEffect(() => {
    if (!runtime) rt.start();
  }, [rt, runtime]);

  const { locale, setLocale } = useLocale();
  const flowLocale = useSelector(rt.actor, (snapshot) => snapshot.context.locale);
  // The flow's language wins on mount (kept on the laptop, or restored with the session) ...
  useEffect(() => {
    setLocale(flowLocale);
  }, [flowLocale, setLocale]);
  // ... and a switch made straight on the IntlProvider (LanguageSwitch with useLocale) reaches the flow.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (locale !== rt.actor.getSnapshot().context.locale) rt.send({ type: "SET_LOCALE", locale });
  }, [locale, rt]);

  return <RuntimeContext.Provider value={rt}>{children}</RuntimeContext.Provider>;
}

export function useFlowRuntime(): FlowRuntime {
  const rt = useContext(RuntimeContext);
  if (!rt) throw new Error("useStudentFlow needs <FlowProvider>");
  return rt;
}

function sameModel(a: ScreenModel, b: ScreenModel): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

/** The frame on screen as a ScreenModel, and `send` for the screen's events. */
export function useStudentFlow(): { state: ScreenModel; send: (event: FlowUiEvent) => void } {
  const rt = useFlowRuntime();
  const state = useSelector(rt.actor, selectScreen, sameModel);
  const send = useCallback((event: FlowUiEvent) => rt.send(event), [rt]);
  return { state, send };
}

/** The live camera stream for the previews on 1.2, 1.3 and 2.1 (play it muted; it never leaves the laptop). */
export function useCameraStream(): MediaStream | null {
  const rt = useFlowRuntime();
  return useSyncExternalStore(rt.camera.subscribe, rt.camera.get);
}

/** The developer overlay's numbers (development builds only send them). */
export function useDetectionDebug(): DetectionDebug | null {
  const rt = useFlowRuntime();
  return useSyncExternalStore(rt.debug.subscribe, rt.debug.get);
}
