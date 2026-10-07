import { Button, type MascotPose } from "@uki/ui";
import { type ReactNode, useId } from "react";
import { useTranslations } from "use-intl";
import { MascotBox } from "../shared/mascot-box.tsx";
import { ReceiptCard, type ReceiptRow } from "./receipt-card.tsx";

export type ReceiptScreenBodyProps = {
  pose: MascotPose;
  mascotSize: "md" | "lg";
  title: string;
  body: string;
  /** Body/M at a fixed 520 px measure (2.1d) or one line (3.1). */
  bodyWrap: boolean;
  rows: readonly ReceiptRow[];
  /** Names the saved PDF (data-uki-receipt-id on the card). */
  receiptId?: string | null;
  saveDisabled: boolean;
  onSavePdf: () => void;
  onQuit: () => void;
  footer?: ReactNode;
};

/** The centred column of 3.1 and 2.1d: mascot, heading, one line, the receipt and its two actions. */
export function ReceiptScreenBody({
  pose,
  mascotSize,
  title,
  body,
  bodyWrap,
  rows,
  receiptId,
  saveDisabled,
  onSavePdf,
  onQuit,
  footer,
}: ReceiptScreenBodyProps) {
  const t = useTranslations();
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="flex h-full w-full flex-col items-center justify-center gap-3.5 overflow-y-auto px-14 pt-6 pb-10"
    >
      <MascotBox pose={pose} size={mascotSize} />
      <h1 id={headingId} className="text-center type-h2">
        {title}
      </h1>
      <p
        className={
          bodyWrap
            ? "w-130 max-w-full text-center opacity-66 type-body-m"
            : "text-center opacity-66 type-body-m"
        }
      >
        {body}
      </p>
      <div aria-hidden="true" className="h-1.5 shrink-0" />
      <ReceiptCard rows={rows} receiptId={receiptId} />
      <div className="flex shrink-0 gap-3 overflow-clip pt-2.5">
        <Button variant="secondary" disabled={saveDisabled} onClick={onSavePdf}>
          {t("done.save")}
        </Button>
        <Button onClick={onQuit}>{t("done.close")}</Button>
      </div>
      {footer}
    </section>
  );
}
