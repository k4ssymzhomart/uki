import { Button, shortName } from "@uki/ui";
import { type ReactNode, useId } from "react";
import { useTranslations } from "use-intl";
import type { ExamModel } from "../../flow/view-model.ts";
import { formatClock } from "../shared/format.ts";
import { MascotBox } from "../shared/mascot-box.tsx";

export type PauseCardProps = {
  selfPause: ExamModel["selfPause"];
  proctorPause: ExamModel["proctorPause"];
  onImHere: () => void;
};

/**
 * The card over a paused exam, on a 42 % ink veil over the question column: 2.3 Paused, no face
 * (Figma 51:2078) with I'm here, or 2.1c Paused by proctor (180:18517), which only the proctor ends.
 */
export function PauseCard({ selfPause, proctorPause, onImHere }: PauseCardProps) {
  const t = useTranslations();
  const titleId = useId();
  if (proctorPause === null && selfPause === null) return null;

  let content: ReactNode;
  if (proctorPause !== null) {
    // Figma 2.1c names the proctor by first name and initial: "Aigerim S.".
    const proctor = proctorPause.proctorName === null ? null : shortName(proctorPause.proctorName);
    content = (
      <>
        <MascotBox pose="standing" />
        <h2 id={titleId} className="text-center type-h3">
          {t("proctor_paused.title")}
        </h2>
        <p className="w-85 text-center opacity-66 type-body-s">
          {proctorPause.text === null || proctor === null
            ? t("event.proctor_paused.detail")
            : t("proctor_paused.body", { proctor, message: proctorPause.text })}
        </p>
        <p className="text-center opacity-58 type-mono-overline">
          {t("proctor_paused.timer", { duration: formatClock(proctorPause.pausedMs) })}
        </p>
        <Button variant="secondary" loading>
          {proctor === null ? t("exam.proctor_paused.status_title") : t("identity.help.waiting", { proctor })}
        </Button>
      </>
    );
  } else if (selfPause !== null) {
    content = (
      <>
        <MascotBox pose="sleeping" />
        <h2 id={titleId} className="text-center type-h3">
          {t("exam.paused.title")}
        </h2>
        <p className="w-85 text-center opacity-66 type-body-s">{t("exam.paused.body")}</p>
        <p className="text-center opacity-58 type-mono-overline">
          {t("exam.paused.timer", { duration: formatClock(selfPause.pausedMs) })}
        </p>
        <Button disabled={!selfPause.canResume} onClick={onImHere}>
          {t("exam.paused.resume")}
        </Button>
      </>
    );
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-inverse/42 p-6">
      <div
        role="dialog"
        aria-labelledby={titleId}
        data-pause={proctorPause === null ? "self" : "proctor"}
        className="flex max-w-full flex-col items-center gap-3 overflow-clip rounded-xl bg-surface px-10 pt-7 pb-8 text-fg-primary"
      >
        {content}
      </div>
    </div>
  );
}
