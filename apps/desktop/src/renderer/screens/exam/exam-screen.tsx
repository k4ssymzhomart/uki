import type { AskReason, DesktopOs } from "@uki/contracts";
import type { Locale } from "@uki/i18n";
import { Hud } from "@uki/ui";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslations } from "use-intl";
import type { ExamModel } from "../../flow/view-model.ts";
import { ScreenFrame } from "../shared/screen-frame.tsx";
import { useScreenLocale } from "../shared/use-screen-env.ts";
import { AskProctorSheet } from "./ask-proctor-sheet.tsx";
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
  /** 2.1 Check again when the questions did not load. */
  onRetryQuestions: () => void;
  /** Send to proctor on the Ask proctor sheet (2.1 to 2.3). */
  onAskHelp?: (topic: AskReason, text: string | null) => void;
  /** Got it on the help-requested banner. */
  onHelpGotIt?: () => void;
  onLanguage: (locale: Locale) => void;
  os?: DesktopOs;
};

/**
 * 2.1 Exam and its states: 2.1a Offline, 2.1c Paused by proctor, 2.1e Message and new end time,
 * 2.2 Phone warning (the HUD) and 2.3 Paused (Figma 51:2074, 180:18130, 180:18517, 199:18883, 51:2076,
 * 51:2078). Every state is a layer on the same layout, so they combine as the model says. Phase 1 adds
 * Ask proctor in the footer, which opens E.5a's sheet over the question column (also over 2.3's veil).
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
  onRetryQuestions,
  onAskHelp,
  onHelpGotIt,
  onLanguage,
  os,
}: ExamScreenProps) {
  const t = useTranslations();
  const locale = useScreenLocale(model.locale);
  const paused = model.proctorPause !== null || model.selfPause !== null;
  const [asking, setAsking] = useState(false);
  const canAsk = model.canAskProctor === true;
  // The sheet goes when asking stops being possible (a proctor pause, submit, the end).
  useEffect(() => {
    if (!canAsk) setAsking(false);
  }, [canAsk]);

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
          onRetryQuestions={onRetryQuestions}
          onAskProctor={() => setAsking(true)}
          onHelpGotIt={onHelpGotIt}
          askAboveVeil={model.selfPause !== null && model.proctorPause === null}
        />
        <PauseCard selfPause={model.selfPause} proctorPause={model.proctorPause} onImHere={onImHere} />
        {asking && canAsk ? (
          <AskProctorSheet
            className="absolute right-14 bottom-26 z-20"
            onClose={() => setAsking(false)}
            onSend={(topic, text) => {
              setAsking(false);
              onAskHelp?.(topic, text);
            }}
          />
        ) : null}
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
