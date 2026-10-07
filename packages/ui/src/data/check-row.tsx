import { cva } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn.ts";
import { Icon } from "../icon.tsx";
import type { IconName } from "../icons.ts";
import { Chip, type ChipStatus } from "./chip.tsx";

export type CheckRowStatus = "pass" | "fail" | "running";

const STATUS: Record<CheckRowStatus, { icon: IconName; chip: ChipStatus }> = {
  pass: { icon: "check", chip: "ok" },
  fail: { icon: "alert", chip: "flag" },
  running: { icon: "refresh", chip: "idle" },
};

const marker = cva("flex size-10 shrink-0 items-center justify-center overflow-clip rounded-pill", {
  variants: {
    status: {
      pass: "bg-ok-subtle",
      fail: "bg-flag-subtle",
      running: "bg-subtle",
    },
  },
});

export type CheckRowProps = Omit<ComponentProps<"div">, "children" | "title"> & {
  status: CheckRowStatus;
  /** "Camera". */
  title: ReactNode;
  /** What was checked, or for Fail the fix: "One face, good light, lens not covered." */
  detail?: ReactNode;
  /** The chip on the right: "Ready", "Fix this", "Checking". */
  statusLabel: ReactNode;
};

/** One line of the pre-exam system check (Figma Check row 46:2089). */
export function CheckRow({ status, title, detail, statusLabel, className, ...props }: CheckRowProps) {
  const { icon, chip } = STATUS[status];
  return (
    <div
      data-status={status}
      aria-busy={status === "running" || undefined}
      className={cn(
        "flex items-center gap-3.5 rounded-md border border-line-default bg-surface p-4 text-fg-primary",
        className,
      )}
      {...props}
    >
      <span className={marker({ status })}>
        <Icon name={icon} className="size-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5 overflow-clip">
        <p className="type-card-title">{title}</p>
        {detail === undefined ? null : <p className="opacity-58 type-card-caption">{detail}</p>}
      </div>
      <Chip status={chip}>{statusLabel}</Chip>
    </div>
  );
}
