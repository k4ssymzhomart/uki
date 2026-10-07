import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn.ts";
import { Icon } from "../icon.tsx";
import type { IconName } from "../icons.ts";
import type { WindowOs } from "./window-os.ts";

export type BrowserTab = {
  id: string;
  icon: IconName;
  /** "Lecture 7 notes". */
  title: ReactNode;
};

export type BrowserTopBarProps = Omit<ComponentProps<"div">, "children"> & {
  os: WindowOs;
  /** Active tab: "Physics 1 · Quiz 3". */
  tabTitle: ReactNode;
  /** Address bar: "exam.kru.test/physics-1/quiz-3". */
  url: ReactNode;
  /** Active tab's favicon. */
  favicon?: IconName;
  /** Background tabs (Figma "Show other tabs"); none by default. */
  otherTabs?: readonly BrowserTab[];
  /** macOS: the 66 × 23 px traffic-light area. Windows: <WindowButtons decorative />. */
  windowControls?: ReactNode;
  /** The 32 px Üki Lock toolbar button (Ext/Toolbar icon from the lock group). */
  extension?: ReactNode;
};

const TOOL = "flex size-8 shrink-0 items-center justify-center overflow-clip";

/**
 * Neutral Chromium-style browser chrome around LMS pages and extension screens (Figma Browser/Top bar
 * 150:13406). A picture of a browser: nothing in it is interactive.
 */
export function BrowserTopBar({
  os,
  tabTitle,
  url,
  favicon = "file-text",
  otherTabs = [],
  windowControls,
  extension,
  className,
  ...props
}: BrowserTopBarProps) {
  const macos = os === "macos";
  return (
    <div
      data-os={os}
      className={cn("flex w-full select-none flex-col items-start text-fg-primary", className)}
      {...props}
    >
      <div
        className={cn(
          "flex w-full shrink-0 items-end gap-1 overflow-clip bg-subtle pt-2",
          macos ? "pr-3 pl-4" : "pl-2.5",
        )}
      >
        {macos ? <div className="flex h-5.75 w-16.5 shrink-0 items-start">{windowControls}</div> : null}
        <div className="flex h-8.5 w-60 shrink-0 items-center gap-2 overflow-clip rounded-t-sm bg-surface pr-2.5 pl-3">
          <Icon name={favicon} className="size-3.5 opacity-70" />
          <p className="min-w-0 flex-1 truncate type-ui-label">{tabTitle}</p>
          <span className="flex size-5 shrink-0 items-center justify-center">
            <Icon name="close" className="size-3.5 opacity-50" />
          </span>
        </div>
        {otherTabs.length === 0 ? null : (
          <div className="flex shrink-0 items-center overflow-clip">
            {otherTabs.map((tab) => {
              return (
                <div key={tab.id} className="flex h-8.5 w-45 shrink-0 items-center gap-2 overflow-clip px-3">
                  <Icon name={tab.icon} className="size-3.5 opacity-50" />
                  <p className="min-w-0 flex-1 truncate opacity-60 type-ui-label">{tab.title}</p>
                  <span aria-hidden="true" className="h-4 w-px shrink-0 bg-line-strong opacity-25" />
                </div>
              );
            })}
          </div>
        )}
        <div className="flex shrink-0 items-start overflow-clip px-2 pb-2.25">
          <Icon name="plus" className="size-4 opacity-60" />
        </div>
        {macos ? null : (
          <>
            <span aria-hidden="true" className="min-w-0 flex-1" />
            {windowControls === undefined ? null : (
              <div className="-mt-2 flex self-stretch">{windowControls}</div>
            )}
          </>
        )}
      </div>
      <div className="flex w-full shrink-0 items-center gap-1 overflow-clip border-b border-line-default bg-surface px-2.5 py-1.75">
        <span className={TOOL}>
          <Icon name="chevron-left" className="size-4.5 opacity-75" />
        </span>
        <span className={TOOL}>
          <Icon name="chevron-right" className="size-4.5 opacity-30" />
        </span>
        <span className={TOOL}>
          <Icon name="refresh" className="size-4.5 opacity-75" />
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-clip rounded-pill bg-subtle px-3.5 py-2">
          <Icon name="lock" className="size-3.5 opacity-60" />
          <p className="truncate opacity-85 type-ui-label">{url}</p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 overflow-clip pl-1.5">
          <span className={TOOL}>
            <Icon name="puzzle" className="size-4.5 opacity-75" />
          </span>
          {extension === undefined ? null : <span className={TOOL}>{extension}</span>}
          <span className={TOOL}>
            <Icon name="more" className="size-4.5 rotate-90 opacity-75" />
          </span>
        </div>
      </div>
    </div>
  );
}
