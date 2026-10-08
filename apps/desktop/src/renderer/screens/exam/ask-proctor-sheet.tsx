import { ASK_REASONS, type AskReason, HELP_NOTE_MAX } from "@uki/contracts";
import { AskProctorPanel } from "@uki/ui";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "use-intl";

/** The catalog key of each reason on E.5a's sheet. */
export const REASON_KEY = {
  question: "lock.ask.reason.unclear",
  technical: "lock.ask.reason.technical",
  break: "lock.ask.reason.break",
  other: "lock.ask.reason.other",
} as const satisfies Record<AskReason, string>;

export type AskProctorSheetProps = {
  onSend: (topic: AskReason, text: string | null) => void;
  onClose: () => void;
  className?: string;
};

/**
 * The Ask proctor sheet over 2.1, 2.2 and 2.3: E.5a's panel (152:11750) with the same catalog strings as
 * the Lock bar. Send queues the request in the outbox and closes the sheet; the help-requested banner
 * confirms it. Escape closes it.
 */
export function AskProctorSheet({ onSend, onClose, className }: AskProctorSheetProps) {
  const t = useTranslations();
  const [reason, setReason] = useState<AskReason | null>(null);
  const [note, setNote] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("[role=radio]")?.focus();
  }, []);

  return (
    <AskProctorPanel
      ref={ref}
      className={className}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      title={t("lock.ask.title")}
      body={t("lock.ask.body")}
      closeLabel={t("lock.done.close")}
      onClose={onClose}
      reasons={ASK_REASONS.map((value) => ({ value, label: t(REASON_KEY[value]) }))}
      reason={reason}
      onReasonChange={(value) => {
        const next = ASK_REASONS.find((r) => r === value);
        if (next) setReason(next);
      }}
      noteLabel={t("lock.ask.note.label")}
      note={note}
      onNoteChange={setNote}
      noteMax={HELP_NOTE_MAX}
      noteHelper={t("lock.ask.note.helper", { count: note.length, max: HELP_NOTE_MAX })}
      cancelLabel={t("action.cancel")}
      sendLabel={t("lock.ask.send")}
      onSend={() => {
        if (reason === null) return;
        const text = note.trim();
        onSend(reason, text.length > 0 ? text : null);
      }}
    />
  );
}
