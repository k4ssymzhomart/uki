// The app's pairing card (E.3, Figma 95:9374 "Üki app window"): Üki's face, pair.card.title, the code in
// Mono/Code, pair.card.body, and pair.card.next once the student has joined. It floats over the lower
// left of the check-in frames while Üki Lock waits for the student to confirm the same code.
import { formatDate, formatTime } from "@uki/i18n";
import { Face } from "@uki/ui";
import { useId } from "react";
import { useTranslations } from "use-intl";
import { useLocale } from "../i18n/locale-context.ts";
import { groupPairCode, type PairingCardModel, sameAlmatyDay } from "./pairing.ts";

export interface PairingCardProps {
  pairing: PairingCardModel;
  /** Server-clock now, to say the start time alone when the exam is today. */
  now: number;
}

export function PairingCard({ pairing, now }: PairingCardProps) {
  const t = useTranslations();
  const { locale } = useLocale();
  const titleId = useId();
  const exam = pairing.exam;
  const when = exam
    ? sameAlmatyDay(exam.startsAt, now)
      ? formatTime(exam.startsAt, locale)
      : `${formatDate(exam.startsAt, locale)} ${formatTime(exam.startsAt, locale)}`
    : null;
  return (
    <section
      role="dialog"
      aria-labelledby={titleId}
      data-pairing-card=""
      className="pointer-events-auto absolute bottom-10 left-10 z-20 flex w-95 flex-col items-start gap-2.5 rounded-md border border-line-default bg-surface px-5.5 pt-4.5 pb-5.5 text-fg-primary shadow-float"
    >
      <div className="flex items-center gap-2.5">
        <Face state="neutral" size={28} className="size-7" />
        <h2 id={titleId} className="type-card-title whitespace-nowrap">
          {t("pair.card.title")}
        </h2>
      </div>
      <p className="type-card-caption opacity-62">{t("pair.card.body")}</p>
      <output aria-live="polite" className="type-mono-code whitespace-nowrap">
        {groupPairCode(pairing.code)}
      </output>
      {exam && when ? (
        <p className="type-ui-caption opacity-55">{t("pair.card.next", { exam: exam.title, when })}</p>
      ) : null}
    </section>
  );
}
