import { cva } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn.ts";
import { type IconName, icons } from "../icons.ts";

export const LOCK_CHECK_STATUSES = ["pass", "wait", "fail"] as const;
export type LockCheckStatus = (typeof LOCK_CHECK_STATUSES)[number];

const ICON: Record<LockCheckStatus, IconName> = {
  pass: "check",
  wait: "refresh",
  fail: "alert",
};

const mark = cva("flex size-5.5 shrink-0 items-center justify-center overflow-hidden rounded-pill", {
  variants: {
    status: {
      pass: "bg-ok-subtle",
      wait: "bg-warn-subtle",
      fail: "bg-flag-subtle",
    },
  },
});

export interface LockCheckProps extends Omit<ComponentProps<"div">, "children" | "title"> {
  /** pass, wait or fail (Figma Ext/Check 92:9352). */
  status?: LockCheckStatus;
  /** For example "Other tabs". */
  title: ReactNode;
  /** One line, for example "3 open. They close at the start." */
  detail?: ReactNode;
  /** Screen-reader text for the mark, for example "Done" or "Needs attention". */
  statusLabel?: ReactNode;
}

/** Compact check line for Üki Lock popups: status mark, title, one-line detail. */
export function LockCheck({
  status = "pass",
  title,
  detail,
  statusLabel,
  className,
  ...props
}: LockCheckProps) {
  const Icon = icons[ICON[status]];
  return (
    <div
      data-status={status}
      className={cn("flex items-start gap-2.5 py-1.5 text-fg-primary", className)}
      {...props}
    >
      <span className={mark({ status })}>
        <Icon aria-hidden="true" className="size-3.5 text-icon-primary" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-px">
        <span className="type-ui-label">
          {statusLabel ? <span className="sr-only">{statusLabel} </span> : null}
          {title}
        </span>
        {detail ? <span className="type-ui-caption opacity-60">{detail}</span> : null}
      </div>
    </div>
  );
}
