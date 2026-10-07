import type { DesktopOs } from "@uki/contracts";
import type { Locale } from "@uki/i18n";
import { Hud } from "@uki/ui";
import type { ReactNode } from "react";
import { useTranslations } from "use-intl";
import type { ExamModel } from "../../flow/view-model.ts";
import { ScreenFrame } from "../shared/screen-frame.tsx";
import { useScreenLocale } from "../shared/use-screen-env.ts";
import { PauseCard } from "./pause-card.tsx";
import { QuestionPane } from "./question-pane.tsx";
import { UkiPanel } from "./uki-panel.tsx";

export type ExamScreenProps = {
  model: ExamModel;
  /** The live preview for the camera tile (a <video> from the flow). */
  camera?: ReactNode;
  onSelectChoice: (questionId: string, choiceId: string) => void;
  onNext: () => void;
  onBack: () => void;
  /** Submit on the last question. */
  onSubmit: () => void;
  /** 2.3 I'm here. */
  onImHere: () => void;
  /** 2.1e Got it. */
  onGotIt: () => void;
  onLanguage: (locale: Locale) => void;
  os?: DesktopOs;
};

/**
 * 2.1 Exam and its states: 2.1a Offline, 2.1c Paused by proctor, 2.1e Message and new end time,
 * 2.2 Phone warning (the HUD) and 2.3 Paused (Figma 51:2074, 180:18130, 180:18517, 199:18883, 51:2076,
 * 51:2078). Every state is a layer on the same layout, so they combine as the model says.
 */
export function ExamScreen({
  model,
  camera,
  onSelectChoice,
  onNext,
  onBack,
  onSubmit,
  onImHere,
  onGotIt,
  onLanguage,
  os,
}: ExamScreenProps) {
  const t = useTranslations();
  const locale = useScreenLocale(model.locale);
  const paused = model.proctorPause !== null || model.selfPause !== null;

  return (
    <ScreenFrame
      frame={model.frame}
      locale={model.locale}
      titleBar={model.titleBar}
      os={os}
      browserLocked={model.browserLocked !== null}
      onLanguage={onLanguage}
    >
      <div className="relative flex h-full min-w-0 flex-1">
        <QuestionPane
          model={model}
          locale={locale}
          inert={paused}
          onSelectChoice={onSelectChoice}
          onNext={onNext}
          onBack={onBack}
          onSubmit={onSubmit}
          onGotIt={onGotIt}
        />
        <PauseCard selfPause={model.selfPause} proctorPause={model.proctorPause} onImHere={onImHere} />
        {model.phone !== null && !paused ? (
          <Hud
            kind="phone"
            message={t("exam.phone.toast")}
            meta={t("exam.toast.flag")}
            className="-translate-x-1/2 absolute top-6 left-1/2"
          />
        ) : null}
      </div>
      <UkiPanel model={model} locale={locale} camera={camera} />
    </ScreenFrame>
  );
}
