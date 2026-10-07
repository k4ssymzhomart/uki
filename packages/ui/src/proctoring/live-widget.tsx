import type { ComponentProps, ReactNode } from "react";
import { Face } from "../art/face.tsx";
import type { FaceState } from "../art/faces.ts";
import { cn } from "../cn.ts";
import { StatusDot, type StatusDotTone } from "./status-dot.tsx";

export const LIVE_WIDGET_STATES = ["watching", "looked-away", "phone", "paused", "submitted"] as const;
export type LiveWidgetState = (typeof LIVE_WIDGET_STATES)[number];

const FACE: Record<LiveWidgetState, FaceState> = {
  watching: "neutral",
  "looked-away": "alert",
  phone: "flag",
  paused: "sleeping",
  submitted: "happy",
};

const DOT: Record<LiveWidgetState, StatusDotTone> = {
  watching: "ok",
  "looked-away": "warn",
  phone: "flag",
  paused: "idle",
  submitted: "ok",
};

export interface LiveWidgetProps extends Omit<ComponentProps<"div">, "children" | "title"> {
  /** Follows the latest event: watching, looked-away, phone, paused, submitted (Figma 15:1264). */
  state?: LiveWidgetState;
  /** For example "Watching" (exam.watch.title). Announced politely when it changes. */
  title: ReactNode;
  /** For example "eyes on screen · 00:42:17" (exam.watch.status). Not announced: it ticks. */
  detail: ReactNode;
}

/** The student-side Üki widget. Sits beside the exam, never over it. */
export function LiveWidget({ state = "watching", title, detail, className, ...props }: LiveWidgetProps) {
  return (
    <div
      data-widget-state={state}
      className={cn(
        "inline-flex items-center gap-3.5 rounded-pill border border-line-default bg-surface py-3 pr-5 pl-3 text-fg-primary shadow-float",
        className,
      )}
      {...props}
    >
      <Face state={FACE[state]} className="size-12" />
      <div className="flex flex-col items-start gap-0.5 whitespace-nowrap">
        <span className="type-card-title" aria-live="polite">
          {title}
        </span>
        <span className="type-mono-s">{detail}</span>
      </div>
      <StatusDot tone={DOT[state]} className="ml-2 size-2.5" />
    </div>
  );
}
