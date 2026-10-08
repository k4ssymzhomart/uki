import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn.ts";
import { Badge } from "../data/badge.tsx";
import { type IconName, icons } from "../icons.ts";
import { StatusDot } from "../proctoring/status-dot.tsx";
import { LockToolbarIcon } from "./lock-toolbar-icon.tsx";

/** The bar's height in px (Figma Ext/Lock bar 90:2549); the content script pushes the page down by it. */
export const LOCK_BAR_HEIGHT = 52;

export interface LockBarTab {
  id: string;
  icon: IconName;
  label: ReactNode;
  /** The tab the student is on. Figma: Exam portal active, Calculator dimmed. */
  active?: boolean;
  onSelect?: () => void;
}

export interface LockBarProps extends Omit<ComponentProps<"div">, "children"> {
  /** Badge label, "LOCKED" (lock.badge). */
  badge: ReactNode;
  /** Exam title, for example "Physics 1 · Quiz 3". */
  exam: ReactNode;
  /** Allowed sites as tabs. Phase 0 passes only the exam portal; the Calculator tab waits for its phase. */
  tabs: readonly LockBarTab[];
  /** "Üki watching" (lock.watching). */
  watching: ReactNode;
  /** Time left as shown, for example "17:42". */
  time: ReactNode;
  /** Word after the time, "left" (exam.timer.left). */
  timeLabel: ReactNode;
  /** "Ask proctor". The button stays hidden until this and onAskProctor are given (hidden in Phase 0). */
  askProctorLabel?: ReactNode;
  onAskProctor?: () => void;
  /** E.5a: the Ask proctor sheet is open, so the button shows lime (bg/brand, text/on-brand). */
  askProctorActive?: boolean;
  /** Accessible name of the toolbar icon at the end, for example "Üki Lock · locked". */
  toolbarIconLabel?: string;
}

/**
 * Replaces tabs and the address bar while an exam is locked. Only allowed sites appear as tabs.
 * Always dark (data-theme="dark"); spans the window.
 */
export function LockBar({
  badge,
  exam,
  tabs,
  watching,
  time,
  timeLabel,
  askProctorLabel,
  onAskProctor,
  askProctorActive = false,
  toolbarIconLabel,
  className,
  ...props
}: LockBarProps) {
  const Hand = icons.hand;
  return (
    <div
      data-theme="dark"
      className={cn(
        "flex h-13 w-full items-center gap-3 bg-canvas py-2.5 pr-3 pl-4 text-fg-primary",
        className,
      )}
      {...props}
    >
      <div className="flex shrink-0 items-center gap-2.5 overflow-hidden">
        <Badge tone="brand">{badge}</Badge>
        <span className="type-label-m whitespace-nowrap">{exam}</span>
      </div>
      <div className="min-w-0 flex-1" />
      <nav className="flex shrink-0 items-center gap-1">
        {tabs.map((tab) => {
          const Icon = icons[tab.icon];
          return (
            <button
              key={tab.id}
              type="button"
              aria-current={tab.active ? "page" : undefined}
              onClick={tab.onSelect}
              className={cn(
                "flex items-center gap-1.5 rounded-pill py-1.75 pr-3.5 pl-3 outline-none focus-visible:shadow-focus",
                tab.active ? "bg-surface" : "hover:bg-hover",
              )}
            >
              <Icon aria-hidden="true" className="size-3.75 shrink-0 text-icon-primary" />
              <span className={cn("type-ui-label whitespace-nowrap", !tab.active && "opacity-60")}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </nav>
      <div className="min-w-0 flex-1" />
      <div className="flex shrink-0 items-center gap-4">
        <div className="flex items-center gap-1.5">
          <StatusDot tone="ok" className="size-2" />
          <span className="type-ui-label whitespace-nowrap opacity-70">{watching}</span>
        </div>
        <div className="flex items-baseline gap-1.5 whitespace-nowrap">
          <span className="type-mono-m">{time}</span>
          <span className="type-ui-caption opacity-60">{timeLabel}</span>
        </div>
        {askProctorLabel && onAskProctor ? (
          <button
            type="button"
            aria-expanded={askProctorActive}
            onClick={onAskProctor}
            className={cn(
              "flex items-center gap-1.5 rounded-pill border border-line-default py-1.75 pr-3 pl-2.5 outline-none focus-visible:shadow-focus",
              askProctorActive
                ? "bg-brand text-fg-on-brand hover:bg-brand-hover active:bg-brand-pressed"
                : "hover:bg-hover active:bg-pressed",
            )}
          >
            <Hand
              aria-hidden="true"
              className={cn("size-4 shrink-0", askProctorActive ? "text-fg-on-brand" : "text-icon-primary")}
            />
            <span className="type-ui-label whitespace-nowrap">{askProctorLabel}</span>
          </button>
        ) : null}
        <LockToolbarIcon state="locked" label={toolbarIconLabel} />
      </div>
    </div>
  );
}
