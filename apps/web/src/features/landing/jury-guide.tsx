"use client";

import { Button, Drawer } from "@uki/ui";
import { Mascot } from "@uki/ui/art";
import { Icon } from "@uki/ui/icon";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { GUIDE_LOOK, GUIDE_STEPS } from "./guide-model.ts";
import { LandingLink } from "./landing-parts.tsx";

/** The speech bubble: a card whose corner nearest the mascot is tighter, as if Üki were saying it. */
const BUBBLE = "rounded-card rounded-tl-sm px-4 py-3.5 text-fg-primary";

/**
 * The jury guide (a user request of 8 October; no Figma frame, docs/decisions.md): a small floating
 * button with the waving mascot in the bottom corner of `/`, over the frames' sections without moving
 * them. It opens the kit's Drawer, where Üki walks the jury through five numbered steps in speech
 * bubbles: what Üki is, signing in (the demo login is given in person and never shown), the app, Üki
 * Lock and what to look at. Escape, the scrim, the close icon and any of its links close it, and the
 * focus goes back to the button. Motion is a fade only (the panel and the button fade in), so it reads
 * the same with reduced motion.
 */
export function JuryGuide() {
  const t = useTranslations("dashboard.landing.guide");
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-4 z-40 flex cursor-pointer items-center gap-2 rounded-pill bg-surface py-1 pr-4 pl-1 text-fg-primary opacity-100 shadow-float outline-none inset-ring inset-ring-line-default transition-[opacity,background-color] duration-300 ease-out starting:opacity-0 hover:bg-hover focus-visible:shadow-focus lg:right-6 lg:bottom-6"
      >
        <Mascot pose="hello" size={40} className="size-10" />
        <span className="type-label-m">{t("title")}</span>
      </button>
      <Drawer
        open={open}
        onOpenChange={setOpen}
        title={t("title")}
        closeLabel={t("close")}
        className="opacity-100 transition-opacity duration-200 ease-out starting:opacity-0"
      >
        <div className="flex items-start gap-3">
          <Mascot pose="hello" size={64} className="size-16" />
          <p className={`${BUBBLE} min-w-0 flex-1 bg-brand-subtle type-body-s`}>{t("hello")}</p>
        </div>
        <ol className="flex flex-col gap-4">
          {GUIDE_STEPS.map((step, index) => (
            <li key={step.id} className="flex items-start gap-3">
              <Mascot pose={step.pose} size={48} className="size-12" />
              <div className={`${BUBBLE} flex min-w-0 flex-1 flex-col items-start gap-2 bg-subtle`}>
                <h3 className="flex items-center gap-2.5 type-card-title">
                  <span
                    aria-hidden="true"
                    className="flex size-6 shrink-0 items-center justify-center rounded-pill bg-inverse text-fg-inverse type-ui-label"
                  >
                    {index + 1}
                  </span>
                  {t(`${step.id}.title`)}
                </h3>
                {step.id === "look" ? (
                  <>
                    <p className="opacity-72 type-card-caption">{t("look.body")}</p>
                    <ul className="flex w-full flex-col gap-2.5">
                      {GUIDE_LOOK.map((point) => (
                        <li key={point.id} className="flex items-start gap-2.5">
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-pill bg-surface">
                            <Icon name={point.icon} className="size-4" />
                          </span>
                          <span className="flex min-w-0 flex-col">
                            <span className="type-ui-label">{t(`look.${point.id}.title`)}</span>
                            <span className="opacity-72 type-card-caption">{t(`look.${point.id}.body`)}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="opacity-72 type-card-caption">{t(`${step.id}.body`)}</p>
                )}
                {"action" in step ? (
                  <Button variant={step.action.variant} asChild className="mt-1">
                    <LandingLink href={step.action.href} onClick={close}>
                      {step.action.variant === "primary" ? (
                        <>
                          {t(`${step.id}.action`)}
                          <Icon name={step.action.icon} className="size-4.5 text-fg-inverse" />
                        </>
                      ) : (
                        <>
                          <Icon name={step.action.icon} className="size-4.5" />
                          {t(`${step.id}.action`)}
                        </>
                      )}
                    </LandingLink>
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </Drawer>
    </>
  );
}
