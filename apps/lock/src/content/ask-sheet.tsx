import { ASK_REASONS, type AskReason, HELP_NOTE_MAX } from "@uki/contracts";
import { formatTime, type Locale } from "@uki/i18n";
import { AskProctorPanel, Banner, Button } from "@uki/ui";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "use-intl";
import type { BarState } from "../lib/state.ts";

/** The catalog key of each of E.5a's reasons. */
const REASON_KEY = {
  question: "lock.ask.reason.unclear",
  technical: "lock.ask.reason.technical",
  break: "lock.ask.reason.break",
  other: "lock.ask.reason.other",
} as const satisfies Record<AskReason, string>;

export interface AskSheetProps {
  bar: BarState;
  locale: Locale;
  /** Sends content.help to the service worker; resolves to the event id, or null when it was refused. */
  onSend: (topic: AskReason, text: string | null) => Promise<string | null>;
  onClose: () => void;
  className?: string;
}

/**
 * E.5a's Ask proctor sheet under the Lock bar (Figma 152:11750). Send hands the request to the service
 * worker, which keeps it in its outbox until the app takes it; the sheet waits, loading, until the app
 * answers help.queued, then confirms with "Help requested at …" (no frame draws that state).
 */
export function AskSheet({ bar, locale, onSend, onClose, className }: AskSheetProps) {
  const t = useTranslations();
  const [reason, setReason] = useState<AskReason | null>(null);
  const [note, setNote] = useState("");
  const [sentId, setSentId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const queued = sentId !== null && bar.help?.id === sentId && bar.help.queued ? bar.help : null;

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("[role=radio]")?.focus();
  }, []);

  return (
    <AskProctorPanel
      ref={ref}
      data-uki-ask=""
      data-state={queued ? "queued" : sentId !== null ? "sent" : "form"}
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
        if (next && sentId === null) setReason(next);
      }}
      noteLabel={t("lock.ask.note.label")}
      note={note}
      onNoteChange={(value) => {
        if (sentId === null) setNote(value);
      }}
      noteMax={HELP_NOTE_MAX}
      noteHelper={t("lock.ask.note.helper", { count: note.length, max: HELP_NOTE_MAX })}
      cancelLabel={t("action.cancel")}
      sendLabel={t("lock.ask.send")}
      sending={sending || (sentId !== null && queued === null)}
      onSend={async () => {
        if (reason === null || sending || sentId !== null) return;
        setSending(true);
        const text = note.trim();
        const id = await onSend(reason, text.length > 0 ? text : null).catch(() => null);
        setSending(false);
        if (id !== null) setSentId(id);
      }}
      confirmation={
        queued ? (
          <Banner
            kind="info"
            title={t("identity.help.requested", { time: formatTime(queued.at, locale) })}
            action={
              <Button variant="secondary" onClick={onClose}>
                {t("message.ack")}
              </Button>
            }
          />
        ) : undefined
      }
    />
  );
}
