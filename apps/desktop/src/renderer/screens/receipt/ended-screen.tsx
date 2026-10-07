import type { DesktopOs } from "@uki/contracts";
import { formatDate, formatTime, type Locale } from "@uki/i18n";
import { Spinner } from "@uki/ui";
import { useTranslations } from "use-intl";
import type { EndedModel } from "../../flow/view-model.ts";
import { ScreenFrame } from "../shared/screen-frame.tsx";
import { useScreenLocale } from "../shared/use-screen-env.ts";
import { ReceiptScreenBody } from "./receipt-screen-body.tsx";

export type EndedScreenProps = {
  model: EndedModel;
  /** Save receipt: printToPDF of the receipt card, then a save dialog. */
  onSavePdf: () => void;
  /** Close Üki. */
  onQuit: () => void;
  onLanguage: (locale: Locale) => void;
  os?: DesktopOs;
};

/**
 * 2.1d Ended by proctor (Figma 181:16655): when and by whom, the receipt with the answered count and
 * the reason, and where to write if the student thinks it is a mistake.
 */
export function EndedScreen({ model, onSavePdf, onQuit, onLanguage, os }: EndedScreenProps) {
  const t = useTranslations();
  const locale = useScreenLocale(model.locale);
  return (
    <ScreenFrame
      frame={model.frame}
      locale={model.locale}
      titleBar={model.titleBar}
      face="happy"
      os={os}
      onLanguage={onLanguage}
    >
      <ReceiptScreenBody
        pose="standing"
        mascotSize="md"
        title={t("ended.title")}
        body={t("ended.body", { proctor: model.proctorName ?? "", time: formatTime(model.endedAt, locale) })}
        bodyWrap
        rows={[
          {
            id: "receipt",
            label: t("done.receipt"),
            value: model.receiptId ?? <Spinner size="sm" className="inline-block" />,
          },
          {
            id: "ended",
            label: t("ended.label"),
            value: t("done.submitted.value", {
              time: formatTime(model.endedAt, locale, { seconds: true }),
              date: formatDate(model.endedAt, locale),
            }),
          },
          {
            id: "answered",
            label: t("ended.answered.title"),
            value: t("ended.answered.value", { answered: model.answered, total: model.total }),
          },
          { id: "reason", label: t("ended.reason.title"), value: t("ended.reason.proctor") },
        ]}
        receiptId={model.receiptId}
        saveDisabled={model.receiptId === null}
        onSavePdf={onSavePdf}
        onQuit={onQuit}
        footer={
          model.contactEmail === null ? null : (
            <p className="text-center opacity-64 type-card-caption">
              {t("ended.contact", { email: model.contactEmail })}
            </p>
          )
        }
      />
    </ScreenFrame>
  );
}
