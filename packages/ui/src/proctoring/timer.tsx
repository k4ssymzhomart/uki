import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn.ts";
import { toPercent } from "./progress.ts";

export interface TimerProps extends Omit<ComponentProps<"div">, "children"> {
  /** Time as shown, for example "42:17". The app formats it from the server-owned end time. */
  time: ReactNode;
  /** Word after the time, for example "left". */
  label: ReactNode;
  /** Filled share of the bar, 0 to 1 (Figma shows 0.7). Values outside are clamped. */
  progress: number;
  /** Accessible name of the bar, for example "Time used". */
  progressLabel?: string;
}

/** Exam timer with its progress bar (Figma 15:1304). */
export function Timer({ time, label, progress, progressLabel, className, ...props }: TimerProps) {
  const value = toPercent(progress);
  return (
    <div className={cn("flex w-65 flex-col items-start gap-3 text-fg-primary", className)} {...props}>
      <div className="flex items-baseline gap-2.5 whitespace-nowrap">
        <span className="type-mono-display-l">{time}</span>
        <span className="type-label-m">{label}</span>
      </div>
      <div
        role="progressbar"
        aria-label={progressLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        className="h-1.5 w-full overflow-hidden rounded-pill bg-subtle"
      >
        <div className="h-full rounded-pill bg-brand" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
