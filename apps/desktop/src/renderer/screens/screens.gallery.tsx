// Development only: every student frame with its fixture model, in kk, ru or en, to compare with
// Figma side by side. Mounted at #/screens by app.tsx in development builds.
//
//   #/screens                      toolbar, frame 1.1, Kazakh
//   #/screens?frame=2.2&locale=ru  a frame in a language
//   #/screens?frame=2.2&bare=1     the screen alone, filling the window (screenshots at 1280 × 800)
import type { DesktopOs } from "@uki/contracts";
import { DEFAULT_LOCALE, isLocale, LOCALE_LABELS, LOCALES, type Locale } from "@uki/i18n";
import { useCallback, useEffect, useState } from "react";
import type { Frame } from "../flow/view-model.ts";
import { UkiIntlProvider } from "../i18n/uki-intl-provider.tsx";
import { CAMERA_STAND_IN, type CameraStandIn, FIGMA_NODES, FRAMES, fixture } from "./fixtures.ts";
import emptySeat from "./gallery-assets/uki-evidence-empty-seat.jpg";
import normal from "./gallery-assets/uki-evidence-normal.jpg";
import phone from "./gallery-assets/uki-evidence-phone.jpg";
import webcam from "./gallery-assets/uki-webcam-frame.jpg";
import { StudentScreen } from "./student-screen.tsx";

const STAND_IN: Record<CameraStandIn, string> = { normal, phone, "empty-seat": emptySeat, webcam };

type GalleryState = { frame: Frame; locale: Locale; os: DesktopOs; bare: boolean };

function isFrame(value: string | null): value is Frame {
  return value !== null && (FRAMES as readonly string[]).includes(value);
}

function readState(): GalleryState {
  const query = new URLSearchParams(window.location.hash.split("?")[1] ?? "");
  const frame = query.get("frame");
  const locale = query.get("locale");
  return {
    frame: isFrame(frame) ? frame : "1.1",
    locale: isLocale(locale) ? locale : DEFAULT_LOCALE,
    os: query.get("os") === "windows" ? "windows" : "macos",
    bare: query.get("bare") === "1",
  };
}

function writeState(state: GalleryState) {
  const query = new URLSearchParams({ frame: state.frame, locale: state.locale });
  if (state.os === "windows") query.set("os", "windows");
  if (state.bare) query.set("bare", "1");
  window.history.replaceState(null, "", `#/screens?${query.toString()}`);
}

function Screen({ state, onLocale }: { state: GalleryState; onLocale: (locale: Locale) => void }) {
  const standIn = CAMERA_STAND_IN[state.frame];
  return (
    <UkiIntlProvider key={state.locale} initialLocale={state.locale}>
      <StudentScreen
        model={fixture(state.frame, state.locale)}
        os={state.os}
        camera={standIn === undefined ? undefined : <img src={STAND_IN[standIn]} alt="" draggable={false} />}
        send={(event) => {
          if (event.type === "SET_LOCALE") onLocale(event.locale);
        }}
      />
    </UkiIntlProvider>
  );
}

/** The screens gallery (development builds only). */
export default function ScreensGallery() {
  const [state, setState] = useState<GalleryState>(readState);
  const update = useCallback((patch: Partial<GalleryState>) => {
    setState((current) => {
      const next = { ...current, ...patch };
      writeState(next);
      return next;
    });
  }, []);

  useEffect(() => {
    const onHash = () => setState(readState());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (state.bare) {
    return (
      <div className="h-dvh w-dvw">
        <Screen state={state} onLocale={(locale) => update({ locale })} />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col gap-4 bg-subtle p-6 text-fg-primary">
      <nav className="flex flex-wrap items-center gap-2 type-ui-label">
        {FRAMES.map((frame) => (
          <button
            key={frame}
            type="button"
            aria-pressed={frame === state.frame}
            title={FIGMA_NODES[frame]}
            onClick={() => update({ frame })}
            className="cursor-pointer rounded-pill px-3 py-1.5 aria-pressed:bg-inverse aria-pressed:text-fg-inverse"
          >
            {frame}
          </button>
        ))}
        <span aria-hidden="true" className="w-4" />
        {LOCALES.map((locale) => (
          <button
            key={locale}
            type="button"
            aria-pressed={locale === state.locale}
            onClick={() => update({ locale })}
            className="cursor-pointer rounded-pill px-3 py-1.5 aria-pressed:bg-inverse aria-pressed:text-fg-inverse"
          >
            {LOCALE_LABELS[locale]}
          </button>
        ))}
        <span aria-hidden="true" className="w-4" />
        {(["macos", "windows"] as const).map((os) => (
          <button
            key={os}
            type="button"
            aria-pressed={os === state.os}
            onClick={() => update({ os })}
            className="cursor-pointer rounded-pill px-3 py-1.5 aria-pressed:bg-inverse aria-pressed:text-fg-inverse"
          >
            {os}
          </button>
        ))}
        <span className="ml-auto type-ui-mono">{FIGMA_NODES[state.frame]}</span>
      </nav>
      <div className="h-200 w-320 shrink-0 overflow-hidden rounded-md shadow-float">
        <Screen state={state} onLocale={(locale) => update({ locale })} />
      </div>
    </div>
  );
}
