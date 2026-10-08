import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn.ts";
import { Chip, type ChipStatus } from "./chip.tsx";

export type EvidenceCardProps = Omit<ComponentProps<"div">, "children" | "title"> & {
  /**
   * The still frame, for example <img src={signedUrl} alt="" className="size-full object-cover" />.
   * Without it the frame shows the empty bg-subtle placeholder, as while a still is loading.
   */
  image?: ReactNode;
  /** The confidence chip: "phone 0.94". */
  chipLabel: ReactNode;
  chipStatus?: ChipStatus;
  /** "10:47:10". */
  time: ReactNode;
  dateTime?: string;
  /** "Phone in frame". */
  title: ReactNode;
  /** "Held for 6 s · frame 1 of 3". */
  detail?: ReactNode;
};

/** A flagged moment: the still, a confidence chip, time and what happened (Figma Evidence card 46:2166). */
export function EvidenceCard({
  image,
  chipLabel,
  chipStatus = "flag",
  time,
  dateTime,
  title,
  detail,
  className,
  ...props
}: EvidenceCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-start overflow-clip rounded-md border border-line-default bg-surface text-fg-primary",
        className,
      )}
      {...props}
    >
      <div className="h-40.75 w-full shrink-0 overflow-clip bg-subtle">{image}</div>
      <div className="flex w-full flex-col items-start gap-1.5 overflow-clip px-3.5 pt-3 pb-3.5">
        {/* Wraps the time under a long chip (Russian) instead of cutting it off. */}
        <div className="flex w-full flex-wrap items-center gap-x-2 gap-y-1.5">
          <Chip status={chipStatus}>{chipLabel}</Chip>
          <span aria-hidden="true" className="w-2.5 shrink-0" />
          <time dateTime={dateTime} className="whitespace-nowrap opacity-58 type-ui-mono">
            {time}
          </time>
        </div>
        <p className="type-label-m">{title}</p>
        {detail === undefined ? null : <p className="opacity-58 type-ui-caption">{detail}</p>}
      </div>
    </div>
  );
}
