import type { Locale } from "@uki/i18n";
import { CameraTile, Timer } from "@uki/ui";
import { type ReactNode, useId } from "react";
import { useTranslations } from "use-intl";
import type { ExamModel } from "../../flow/view-model.ts";
import { formatClock, share } from "../shared/format.ts";
import { SessionLog } from "./session-log.tsx";
import { WatchWidget } from "./watch-widget.tsx";

export type UkiPanelProps = {
  model: ExamModel;
  locale: Locale;
  /** The live preview for the camera tile. */
  camera?: ReactNode;
};

/**
 * The Üki panel right of the exam (2.1 to 2.3): Widget/Live, the camera tile, the timer and "This
 * session". 384 px wide; under 1280 px it narrows to 320 (Figma 212:2521).
 */
export function UkiPanel({ model, locale, camera }: UkiPanelProps) {
  const t = useTranslations();
  const logHeadingId = useId();
  const faces = model.camera.faces;
  const { timer } = model;

  let facesLabel: string | undefined;
  if (faces === 0) facesLabel = t("exam.camera.no_face");
  else if (faces !== null) facesLabel = t("exam.camera.faces", { count: faces });

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col items-start gap-4 overflow-clip border-line-default border-l bg-subtle px-5.5 py-6 xl:w-96">
      <WatchWidget watch={model.watch} />
      <CameraTile
        liveLabel={t("check.preview.badge")}
        facesLabel={facesLabel}
        facesTone={faces === 1 ? "ok" : "flag"}
        className="h-53 w-full shrink-0"
      >
        {camera}
      </CameraTile>
      <Timer
        time={formatClock(timer.remainingMs)}
        label={
          timer.addedMinutes === null
            ? t("exam.timer.left")
            : t("exam.timer.added", { minutes: timer.addedMinutes })
        }
        progress={share(timer.remainingMs, timer.totalMs)}
        className="shrink-0"
      />
      <SessionLog entries={model.log} locale={locale} headingId={logHeadingId} />
    </aside>
  );
}
