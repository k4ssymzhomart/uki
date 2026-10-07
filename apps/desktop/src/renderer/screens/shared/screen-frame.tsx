import type { DesktopOs } from "@uki/contracts";
import type { Locale } from "@uki/i18n";
import { AppTitleBar, cn, Face, type FaceState, Logo } from "@uki/ui";
import type { ReactNode } from "react";
import { LanguageSwitch } from "../../components/language-switch.tsx";
import type { Frame, TitleBarModel } from "../../flow/view-model.ts";
import { useScreenLocale, useScreenOs } from "./use-screen-env.ts";
import { useTitle } from "./use-title.ts";

export type ScreenFrameProps = {
  frame: Frame;
  locale: Locale;
  titleBar: TitleBarModel;
  /** The live Üki face in the title bar (28 px). */
  face?: FaceState;
  /** Window chrome to draw; window.uki.app.info() when absent. */
  os?: DesktopOs;
  /** Üki Lock has locked the browser: the offline title says so (app.title.offline). */
  browserLocked?: boolean;
  onLanguage: (locale: Locale) => void;
  /** Classes for the body under the title bar. */
  className?: string;
  children: ReactNode;
};

/**
 * The student window: App/Title bar (title, ҚАЗ · РУС · ENG, live face) over the frame's body. The
 * window is 1280 × 800 by default and at least 1024 × 700. On macOS Electron draws the traffic lights
 * into the bar's reserved box; Windows keeps its native frame in Phase 0, so no window buttons here.
 */
export function ScreenFrame({
  frame,
  locale,
  titleBar,
  face = "neutral",
  os,
  browserLocked,
  onLanguage,
  className,
  children,
}: ScreenFrameProps) {
  const windowOs = useScreenOs(os);
  const current = useScreenLocale(locale);
  const title = useTitle(titleBar, { browserLocked });
  return (
    <div
      data-frame={frame}
      className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-canvas text-fg-primary"
    >
      <AppTitleBar
        os={windowOs}
        title={title}
        appIcon={windowOs === "windows" ? <Logo variant="eyes" className="size-4.5" /> : undefined}
        languageSwitch={<LanguageSwitch value={current} onValueChange={onLanguage} />}
        face={<Face state={face} className="size-7" />}
        // Windows keeps its native frame in Phase 0, so no window buttons close the bar: pad it as on macOS.
        className={windowOs === "windows" ? "pr-3.5" : undefined}
      />
      <main className={cn("relative flex min-h-0 w-full flex-1", className)}>{children}</main>
    </div>
  );
}
