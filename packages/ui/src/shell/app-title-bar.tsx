import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn.ts";
import { dragRegion, noDragRegion, type WindowOs } from "./window-os.ts";

export type AppTitleBarProps = Omit<ComponentProps<"header">, "children" | "title"> & {
  os: WindowOs;
  /** "Üki · Mathematics 2 · Midterm" (app.title in the catalog). */
  title: ReactNode;
  /**
   * macOS: what fills the 52 × 12 px traffic-light area. Leave it empty in Electron, which draws the
   * native lights there (titleBarStyle "hiddenInset"). Windows: <WindowButtons />.
   */
  windowControls?: ReactNode;
  /** Windows only: the 18 px Mark left of the title (brand art). */
  appIcon?: ReactNode;
  /** The ҚАЗ / РУС / ENG switch, usually a TabGroup of Tabs. */
  languageSwitch?: ReactNode;
  /** The 28 px live Üki face (Face art from the proctoring group). */
  face?: ReactNode;
};

/**
 * Student app window bar (Figma App/Title bar 150:13352). macOS: traffic lights, centred title. Windows:
 * mark and title left, window buttons right. The bar is an Electron drag region; its controls are not.
 */
export function AppTitleBar({
  os,
  title,
  windowControls,
  appIcon,
  languageSwitch,
  face,
  className,
  ...props
}: AppTitleBarProps) {
  const macos = os === "macos";
  return (
    <header
      data-os={os}
      className={cn(
        "flex h-13 w-full shrink-0 select-none items-center gap-2 border-b border-line-default bg-subtle pl-4.5 text-fg-primary",
        macos && "pr-3.5",
        dragRegion,
        className,
      )}
      {...props}
    >
      {macos ? (
        <>
          <div className="flex h-3 w-13 shrink-0 items-center">{windowControls}</div>
          <span aria-hidden="true" className="min-w-0 flex-1" />
          <p className="truncate type-ui-label">{title}</p>
          <span aria-hidden="true" className="min-w-0 flex-1" />
        </>
      ) : (
        <>
          {appIcon === undefined ? null : <div className="flex size-4.5 shrink-0">{appIcon}</div>}
          <p className="truncate type-ui-label">{title}</p>
          <span aria-hidden="true" className="min-w-0 flex-1" />
        </>
      )}
      {languageSwitch === undefined ? null : (
        <div className={cn("flex shrink-0", noDragRegion)}>{languageSwitch}</div>
      )}
      {face === undefined ? null : <div className="flex size-7 shrink-0">{face}</div>}
      {!macos && windowControls !== undefined ? windowControls : null}
    </header>
  );
}
