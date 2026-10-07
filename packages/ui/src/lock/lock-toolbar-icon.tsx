import type { ComponentProps } from "react";
import { Face } from "../art/face.tsx";
import { cn } from "../cn.ts";
import { icons } from "../icons.ts";

export const LOCK_TOOLBAR_STATES = ["off", "ready", "locked"] as const;
export type LockToolbarState = (typeof LOCK_TOOLBAR_STATES)[number];

export interface LockToolbarIconProps extends Omit<ComponentProps<"span">, "children"> {
  /** off: not paired; ready: paired and waiting; locked: exam running (Figma Ext/Toolbar icon 89:2491). */
  state?: LockToolbarState;
  /** Accessible name, for example "Üki Lock · locked". Without it the icon is decorative. */
  label?: string;
}

/** Üki Lock's button face in the browser toolbar, 32 px. */
export function LockToolbarIcon({ state = "off", label, className, ...props }: LockToolbarIconProps) {
  const LockIcon = icons.lock;
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true };
  return (
    <span
      {...a11y}
      data-state={state}
      className={cn("relative inline-block size-8 shrink-0", className)}
      {...props}
    >
      <Face
        state="neutral"
        className={cn("absolute top-1.25 left-1.25 size-5.5", state === "off" && "opacity-45")}
      />
      {state === "ready" ? (
        <span className="absolute top-4.5 left-4.5 size-3.5 rounded-pill border-2 border-surface bg-brand" />
      ) : null}
      {state === "locked" ? (
        <span className="absolute top-4.5 left-4.5 flex size-4 items-center justify-center rounded-pill border-2 border-surface bg-inverse">
          <LockIcon aria-hidden="true" className="size-2.75 text-brand" />
        </span>
      ) : null}
    </span>
  );
}
