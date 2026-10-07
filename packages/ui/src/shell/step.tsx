import { cva } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn.ts";
import { glyphs, ICON_STROKE } from "../icons.ts";

export type StepState = "done" | "current" | "upcoming";

const marker = cva(
  "flex size-7 shrink-0 items-center justify-center overflow-clip whitespace-nowrap rounded-pill type-ui-label",
  {
    variants: {
      state: {
        done: "bg-brand text-fg-on-brand",
        current: "bg-inverse text-fg-inverse",
        upcoming: "text-fg-primary opacity-40 inset-ring-2 inset-ring-line-strong",
      },
    },
  },
);

export type StepProps = Omit<ComponentProps<"div">, "children"> & {
  state: StepState;
  /** "1". */
  number: ReactNode;
  /** "Camera". */
  label: ReactNode;
};

/**
 * One step of the check-in stepper (Figma Step 46:2106): Done shows a tick, Current is ink, Upcoming is
 * outlined. Put steps in an ordered list; the current one carries aria-current="step".
 */
export function Step({ state, number, label, className, ...props }: StepProps) {
  const Tick = glyphs.tick;
  return (
    <div
      data-state={state}
      aria-current={state === "current" ? "step" : undefined}
      className={cn("flex items-center gap-2.5 text-fg-primary", className)}
      {...props}
    >
      <span className={marker({ state })}>
        {state === "done" ? (
          <Tick aria-hidden="true" strokeWidth={ICON_STROKE} absoluteStrokeWidth className="size-4" />
        ) : (
          number
        )}
      </span>
      <span className={cn("whitespace-nowrap type-label-m", state === "upcoming" && "opacity-50")}>
        {label}
      </span>
    </div>
  );
}
