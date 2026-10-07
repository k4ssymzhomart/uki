import type { DesktopOs } from "@uki/contracts";
import { formatDate, formatTime, type Locale } from "@uki/i18n";
import { useTranslations } from "use-intl";
import type { SubmittedModel } from "../../flow/view-model.ts";
import { ScreenFrame } from "../shared/screen-frame.tsx";
import { useScreenLocale } from "../shared/use-screen-env.ts";
import { ReceiptScreenBody } from "./receipt-screen-body.tsx";

export type SubmittedScreenProps = {
  model: SubmittedModel;
  /** Save receipt: printToPDF of the receipt card, then a save dialog. */
  onSavePdf: () => void;
  /** Close Üki. */
  onQuit: () => void;
  onLanguage: (locale: Locale) => void;
  os?: DesktopOs;
};

/** 3.1 Submitted (Figma 51:2090): receipt id, submit time, time used and flags. Time up shows it too. */
export function SubmittedScreen({ model, onSavePdf, onQuit, onLanguage, os }: SubmittedScreenProps) {
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
        pose="celebrating"
        mascotSize="lg"
        title={t("done.title")}
        body={t("done.body")}
        bodyWrap={false}
        rows={[
          { id: "receipt", label: t("done.receipt"), value: model.receiptId },
          {
            id: "submitted",
            label: t("done.submitted.label"),
            value: t("done.submitted.value", {
              time: formatTime(model.submittedAt, locale, { seconds: true }),
              date: formatDate(model.submittedAt, locale),
            }),
          },
          {
            id: "time-used",
            label: t("done.time_used.label"),
            value: t("done.time_used.value", { used: model.timeUsedMin, total: model.totalMin }),
          },
          { id: "flags", label: t("done.flags.label"), value: t("done.flags.value", { count: model.flags }) },
        ]}
        receiptId={model.receiptId}
        saveDisabled={false}
        onSavePdf={onSavePdf}
        onQuit={onQuit}
      />
    </ScreenFrame>
  );
}
