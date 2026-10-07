import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn.ts";
import { Button } from "../controls/button.tsx";
import { Avatar } from "../data/avatar.tsx";
import { Chip, type ChipStatus } from "../data/chip.tsx";
import { type Fact, FactList } from "./fact-list.tsx";

export const CHECK_IN_STEP_STATES = ["done", "warn", "todo"] as const;
/** done: lime; warn: the step with a problem; todo: not reached. */
export type CheckInStepState = (typeof CHECK_IN_STEP_STATES)[number];

export interface CheckInStep {
  id: string;
  /** "SYSTEM", "IDENTITY", "RULES", "READY". */
  label: ReactNode;
  state: CheckInStepState;
}

export interface CardAction {
  label: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
}

export interface StudentPopoverCardProps extends Omit<ComponentProps<"div">, "children"> {
  /** "DK". */
  initials: ReactNode;
  /** "Dias Kenzhebekov". */
  name: ReactNode;
  /** Student number and group, "20231044 · Group 204". */
  meta: ReactNode;
  /** Chip at the top right, for example { status: "warn", label: "help" }. */
  status?: { status: ChipStatus; label: ReactNode };
  /** "Check-in · step 2 of 4". */
  step: ReactNode;
  /** "retry 2 of 3". */
  stepMeta?: ReactNode;
  /** The four check-in steps as a segmented bar with their names. */
  steps: readonly CheckInStep[];
  /** Up to three facts, for example Problem / Card unreadable. */
  facts: readonly Fact[];
  /** Outline button, "Message". */
  secondaryAction?: CardAction;
  /** Filled button, "Verify by hand". */
  primaryAction?: CardAction;
}

const STEP_BAR: Record<CheckInStepState, string> = {
  done: "bg-brand",
  warn: "bg-warn",
  todo: "bg-subtle",
};

/** Who, where they are in check-in, the problem and the next action (Figma Popover/Student 77:2318). */
export function StudentPopoverCard({
  initials,
  name,
  meta,
  status,
  step,
  stepMeta,
  steps,
  facts,
  secondaryAction,
  primaryAction,
  className,
  ...props
}: StudentPopoverCardProps) {
  return (
    <div
      className={cn(
        "flex w-85 flex-col items-stretch gap-3.5 rounded-md border border-line-default bg-surface p-4 text-fg-primary shadow-float",
        className,
      )}
      {...props}
    >
      <div className="flex items-center gap-3">
        <Avatar tone="paper" size="lg" initials={initials} className="rounded-md" />
        <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5 whitespace-nowrap">
          <h2 className="type-card-title max-w-full truncate">{name}</h2>
          <p className="type-ui-mono max-w-full truncate opacity-55">{meta}</p>
        </div>
        {status ? <Chip status={status.status}>{status.label}</Chip> : null}
      </div>
      <div className="flex flex-col items-stretch gap-2">
        <div className="flex items-start gap-2">
          <p className="type-ui-label min-w-0 flex-1">{step}</p>
          {stepMeta ? <p className="type-ui-mono whitespace-nowrap opacity-55">{stepMeta}</p> : null}
        </div>
        <div aria-hidden="true" className="flex items-start gap-1">
          {steps.map((item) => (
            <span
              key={item.id}
              data-step-state={item.state}
              className={cn("h-1.5 min-w-0 flex-1 rounded-pill", STEP_BAR[item.state])}
            />
          ))}
        </div>
        <ol className="flex items-start gap-1">
          {steps.map((item) => (
            <li key={item.id} className="type-mono-tag min-w-0 flex-1 opacity-50">
              {item.label}
            </li>
          ))}
        </ol>
      </div>
      {facts.length > 0 ? <FactList facts={facts} labelClassName="opacity-58" /> : null}
      {secondaryAction || primaryAction ? (
        <div className="flex items-start gap-2">
          {secondaryAction ? (
            <Button
              variant="secondary"
              className="min-w-0 flex-1"
              onClick={secondaryAction.onClick}
              disabled={secondaryAction.disabled}
              loading={secondaryAction.loading}
            >
              {secondaryAction.label}
            </Button>
          ) : null}
          {primaryAction ? (
            <Button
              variant="primary"
              className="min-w-0 flex-1"
              onClick={primaryAction.onClick}
              disabled={primaryAction.disabled}
              loading={primaryAction.loading}
            >
              {primaryAction.label}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
