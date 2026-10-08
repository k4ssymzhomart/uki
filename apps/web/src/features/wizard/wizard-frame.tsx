"use client";

import type { WizardStep } from "@uki/contracts";
import { cn, Step } from "@uki/ui";
import { useTranslations } from "next-intl";
import { Fragment, type ReactNode } from "react";
import { PageHeader } from "../shell/page-header.tsx";
import { STEPPER_ITEMS, stepperStates } from "./wizard-model.ts";

export type WizardFrameProps = {
  step: WizardStep;
  /** Gap between the stepper, the body and the footer: 20 px on 0.4, 0.3 and 0.5, 22 px on 0.2 and E.1. */
  gap?: "md" | "lg";
  /** The footer's line on the left: when the draft was saved, or what to fix. */
  footer: ReactNode;
  /** The footer's buttons on the right. */
  actions: ReactNode;
  /** An error line above the footer. */
  error?: ReactNode;
  children: ReactNode;
};

/**
 * The page every wizard step shares (0.4, 0.2, E.1, 0.3, 0.5): App/Top bar "Exams / New exam", the
 * four-step stepper (Figma Step 46:2106, lines 40 × 1.5 between), the step's body and the footer.
 */
export function WizardFrame({ step, gap = "md", footer, actions, error, children }: WizardFrameProps) {
  const t = useTranslations("dashboard.wizard");
  const states = stepperStates(step);
  return (
    <>
      <PageHeader breadcrumb={t("breadcrumb")} title={t("title")} />
      <main className={cn("flex flex-col px-8 pt-6.5 pb-7", gap === "md" ? "gap-5" : "gap-5.5")}>
        <ol aria-label={t("stepper.label")} className="flex items-center gap-4">
          {STEPPER_ITEMS.map((item, index) => (
            <Fragment key={item}>
              {index > 0 ? <li aria-hidden="true" className="h-0.5 w-10 shrink-0 bg-fg-primary" /> : null}
              <li>
                <Step state={states[item]} number={index + 1} label={t(`step.${item}`)} />
              </li>
            </Fragment>
          ))}
        </ol>
        {children}
        {error ? (
          <p role="alert" className="text-fg-danger type-card-caption">
            {error}
          </p>
        ) : null}
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1 text-fg-primary type-card-caption">{footer}</div>
          {actions}
        </div>
      </main>
    </>
  );
}
