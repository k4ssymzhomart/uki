import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn.ts";
import { type IconName, icons } from "../icons.ts";

export interface LockToastProps extends Omit<ComponentProps<"div">, "children"> {
  /** For example "Copy is off during the exam." (lock.copy.toast). */
  message: ReactNode;
  /** For example "14:16 · noted" (lock.copy.noted). */
  time?: ReactNode;
  /** Figma swaps the icon; lock by default. */
  icon?: IconName;
}

/**
 * Shows when the browser blocks an action during a locked exam (Figma Ext/Toast 89:2492).
 * The content script renders it in a shadow root; E.6 returns to the exam after 2.5 s.
 */
export function LockToast({ message, time, icon = "lock", className, ...props }: LockToastProps) {
  const Icon = icons[icon];
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-2.5 rounded-md bg-inverse py-3 pr-4 pl-3.5 text-fg-inverse shadow-float",
        className,
      )}
      {...props}
    >
      <Icon aria-hidden="true" className="size-4.5 shrink-0 text-brand" />
      <span className="type-label-m whitespace-nowrap">{message}</span>
      {time ? <span className="type-ui-mono whitespace-nowrap opacity-55">{time}</span> : null}
    </div>
  );
}
