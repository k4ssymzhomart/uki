import { cva } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn.ts";

export type ChipStatus = "ok" | "warn" | "flag" | "idle";

const dot = cva("size-2 shrink-0 rounded-pill", {
  variants: {
    status: {
      ok: "bg-ok",
      warn: "bg-warn",
      flag: "bg-flag",
      idle: "bg-fg-primary",
    },
  },
});

export type ChipProps = Omit<ComponentProps<"span">, "children"> & {
  /** ok = moss, warn = yellow, flag = coral, idle = ink, as the screen instances draw it. */
  status?: ChipStatus;
  /** The raw event or state, short: "gaze on screen", "Needs help". */
  children: ReactNode;
};

/** Event chip: status dot and a mono label (Figma Chip 8:26). */
export function Chip({ status = "ok", className, children, ...props }: ChipProps) {
  return (
    <span
      data-status={status}
      className={cn(
        "inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-pill bg-subtle py-2.25 pr-4 pl-3.5 text-fg-primary type-mono-s",
        className,
      )}
      {...props}
    >
      <span aria-hidden="true" className={dot({ status })} />
      {children}
    </span>
  );
}
