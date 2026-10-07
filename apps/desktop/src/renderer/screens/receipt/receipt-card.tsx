import { cn } from "@uki/ui";
import type { ReactNode } from "react";
import { useTranslations } from "use-intl";
import "./receipt-print.css";

/** The attribute that marks the receipt for printToPDF: print CSS shows only this element. */
export const RECEIPT_PRINT_ATTRIBUTE = "data-uki-receipt";
/**
 * What window.uki.receipt.savePdf looks for (src/main/receipt-pdf.ts): data-uki-print="receipt" on the
 * card, and data-uki-receipt-id for the file name (UKI-204-0942-MT.pdf).
 */
export const MAIN_PRINT_MARKER = { "data-uki-print": "receipt" } as const;

export type ReceiptRow = { id: string; label: ReactNode; value: ReactNode };

/**
 * The receipt card of 3.1 and 2.1d (Figma 51:2090, 181:16655): "RECEIPT" and mono label/value rows.
 * Save receipt prints this card alone (window.uki.receipt.savePdf, printToPDF in the main process).
 */
export function ReceiptCard({
  rows,
  receiptId,
  className,
}: {
  rows: readonly ReceiptRow[];
  /** The receipt id once submit_session answered; the saved PDF is named after it. */
  receiptId?: string | null;
  className?: string;
}) {
  const t = useTranslations();
  return (
    <section
      data-uki-receipt=""
      {...MAIN_PRINT_MARKER}
      data-uki-receipt-id={receiptId ?? undefined}
      aria-label={t("done.receipt")}
      className={cn(
        "flex w-115 max-w-full shrink-0 flex-col gap-2.5 overflow-clip rounded-card border border-line-default bg-surface px-6 pt-4.5 pb-5 text-fg-primary",
        className,
      )}
    >
      <p aria-hidden="true" className="opacity-58 type-mono-tag">
        {t("done.receipt")}
      </p>
      <dl className="flex w-full flex-col gap-2.5">
        {rows.map((row) => (
          <div key={row.id} className="flex w-full items-start gap-4 overflow-clip type-mono-m">
            <dt className="min-w-0 flex-1 opacity-58">{row.label}</dt>
            <dd className="shrink-0 whitespace-nowrap">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
