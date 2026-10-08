import type { AskReason } from "@uki/contracts";
import { formatTime, type Locale } from "@uki/i18n";
import { LockToast } from "@uki/ui";
import { useEffect, useState } from "react";
import { useTranslations } from "use-intl";
import { LockBarView } from "../components/lock-bar-view.tsx";
import type { BarState } from "../lib/state.ts";
import { AskSheet } from "./ask-sheet.tsx";

/** E.6: the toast stays this long, then the student is back on the exam. */
export const TOAST_MS = 2500;

export interface ToastRequest {
  /** Changes on every attempt, so a second attempt restarts the toast. */
  id: number;
  at: number;
}

export interface LockOverlayProps {
  bar: BarState;
  toast: ToastRequest | null;
  locale: Locale;
  /** Phase 1, E.5a: sends the request to the service worker; resolves to its id, or null if refused. */
  onAskHelp?: (topic: AskReason, text: string | null) => Promise<string | null>;
}

/**
 * What the content script draws over the exam portal: the Lock bar (E.5), the copy toast (E.6) and,
 * from Phase 1, the Ask proctor sheet under the bar (E.5a: 11 px below it, 24 px from the right).
 */
export function LockOverlay({ bar, toast, locale, onAskHelp }: LockOverlayProps) {
  const t = useTranslations("lock.copy");
  const [visible, setVisible] = useState(false);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (!toast) return;
    setVisible(true);
    const id = setTimeout(() => setVisible(false), TOAST_MS);
    return () => clearTimeout(id);
  }, [toast]);

  return (
    <>
      <LockBarView
        bar={bar}
        className="fixed inset-x-0 top-0 z-2147483647"
        onAskProctor={onAskHelp ? () => setAsking((open) => !open) : undefined}
        askProctorActive={asking}
      />
      {asking && onAskHelp ? (
        <AskSheet
          bar={bar}
          locale={locale}
          onSend={onAskHelp}
          onClose={() => setAsking(false)}
          className="fixed top-15.75 right-6 z-2147483647"
        />
      ) : null}
      {toast ? (
        <div
          aria-hidden={!visible}
          className={`fixed top-31 left-1/2 z-2147483647 -translate-x-1/2 transition-opacity duration-200 ${
            visible ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          <LockToast message={t("toast")} time={t("noted", { time: formatTime(toast.at, locale) })} />
        </div>
      ) : null}
    </>
  );
}
