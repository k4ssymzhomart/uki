import type { DesktopOs } from "@uki/contracts";
import type { Locale } from "@uki/i18n";
import { Button, Checkbox, Face } from "@uki/ui";
import { useId } from "react";
import { useTranslations } from "use-intl";
import type { RulesModel } from "../../flow/view-model.ts";
import browserLock from "../shared/assets/uki-3d-browser-lock.png";
import eye from "../shared/assets/uki-3d-eye.png";
import laptopShield from "../shared/assets/uki-3d-laptop-shield.png";
import phoneScan from "../shared/assets/uki-3d-phone-scan.png";
import { CheckInStepper } from "../shared/check-in-stepper.tsx";
import { formatClock } from "../shared/format.ts";
import { ScreenFrame } from "../shared/screen-frame.tsx";
import { FaqDisclosure } from "./faq-disclosure.tsx";

export type RulesScreenProps = {
  model: RulesModel;
  /** The agree box (rules.agree). */
  onAgree: (agreed: boolean) => void;
  onLanguage: (locale: Locale) => void;
  os?: DesktopOs;
};

function RuleCard({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <li className="flex w-full items-center gap-4.5 overflow-clip rounded-card border border-line-default bg-surface py-3 pr-5 pl-3.5">
      <img src={icon} alt="" draggable={false} className="size-16 shrink-0 object-contain" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="type-card-title">{title}</p>
        <p className="opacity-62 type-card-caption">{body}</p>
      </div>
    </li>
  );
}

/**
 * 1.4 Rules and lobby (Figma 51:2064): four rules, the agree box and the countdown to the start. The
 * flow moves to 2.1 at the start once the box is ticked.
 */
export function RulesScreen({ model, onAgree, onLanguage, os }: RulesScreenProps) {
  const t = useTranslations();
  const headingId = useId();
  return (
    <ScreenFrame
      frame={model.frame}
      locale={model.locale}
      titleBar={model.titleBar}
      os={os}
      onLanguage={onLanguage}
      className="flex-col gap-7 overflow-clip px-14 pt-9 pb-10"
    >
      <CheckInStepper step={model.step} />
      <div className="flex min-h-0 w-full flex-1 gap-10">
        <section aria-labelledby={headingId} className="flex min-w-0 flex-1 flex-col gap-3.5 overflow-y-auto">
          <h1 id={headingId} className="type-h3">
            {t("rules.title")}
          </h1>
          <ul className="flex flex-col gap-3.5">
            <RuleCard icon={browserLock} title={t("rules.window.title")} body={t("rules.window.body")} />
            <RuleCard
              icon={eye}
              title={t("rules.eyes.title")}
              body={t("rules.eyes.body", { seconds: model.gazeSeconds })}
            />
            <RuleCard icon={phoneScan} title={t("rules.phone.title")} body={t("rules.phone.body")} />
            <RuleCard icon={laptopShield} title={t("rules.video.title")} body={t("rules.video.body")} />
          </ul>
          <Checkbox
            label={t("rules.agree")}
            checked={model.agreed}
            onCheckedChange={(checked) => onAgree(checked === true)}
            className="shrink-0"
          />
          <FaqDisclosure question={t("rules.faq.video")} answer={t("join.privacy")} />
        </section>
        <section
          data-theme="dark"
          className="flex h-full w-95 shrink-0 flex-col items-center justify-center gap-3.5 overflow-clip rounded-xl bg-canvas p-8 text-fg-primary"
        >
          <Face state="neutral" className="size-33" />
          <div aria-hidden="true" className="h-1.5 shrink-0" />
          <p className="whitespace-nowrap opacity-60 type-mono-overline">{t("lobby.countdown.label")}</p>
          <p role="timer" className="whitespace-nowrap tabular-nums type-display-l">
            {formatClock(model.countdownMs)}
          </p>
          <p className="w-75 text-center opacity-70 type-body-s">{t("lobby.countdown.body")}</p>
          <Button disabled>{t("lobby.waiting")}</Button>
        </section>
      </div>
    </ScreenFrame>
  );
}
