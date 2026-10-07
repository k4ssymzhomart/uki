import { cn, Step, type StepState } from "@uki/ui";
import { Fragment } from "react";
import { useTranslations } from "use-intl";
import type { StepperModel } from "../../flow/view-model.ts";

const STEPS = ["stepper.join", "stepper.check", "stepper.identity", "stepper.rules"] as const;

export type CheckInStepperProps = {
  step: StepperModel;
  /** 1.2 draws the joining lines in full ink; 1.3 and 1.4 at 20 %. */
  lineTone?: "strong" | "muted";
  className?: string;
};

function stateOf(index: number, current: number): StepState {
  if (index < current) return "done";
  return index === current ? "current" : "upcoming";
}

/** Join · System check · Identity · Rules, as on 1.2 to 1.4 (Figma Step 46:2106). */
export function CheckInStepper({ step, lineTone = "muted", className }: CheckInStepperProps) {
  const t = useTranslations();
  return (
    <ol className={cn("flex shrink-0 items-center gap-4", className)}>
      {STEPS.map((key, index) => {
        const number = index + 1;
        return (
          <Fragment key={key}>
            {index > 0 ? (
              <li
                aria-hidden="true"
                className={cn("h-0.5 w-10 shrink-0 bg-fg-primary", lineTone === "muted" && "opacity-20")}
              />
            ) : null}
            <li>
              <Step state={stateOf(number, step.current)} number={number} label={t(key)} />
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}
