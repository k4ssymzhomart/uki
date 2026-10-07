import { formatTime, type Locale } from "@uki/i18n";
import { Button, Mascot } from "@uki/ui";
import { useTranslations } from "use-intl";
import { LockBarView } from "../../components/lock-bar-view.tsx";
import type { BarState } from "../../lib/state.ts";

export interface BlockedPageProps {
  /** The running lock's bar, or null (no lock, or an exam in the app). */
  bar: BarState | null;
  /** The closed site's host from ?host=, or null. */
  host: string | null;
  /** When the page opened: the attempt's time. */
  attemptAt: number;
  locale: Locale;
  onBack: () => void;
}

/**
 * blocked.html, the block page (E.7). The redirect rule opens it as blocked.html?host=<host>. During an exam
 * in the browser it shows the Lock bar, the lock mascot, why the site is closed, the host and time of the
 * attempt, and Back to the exam. Exams in the app use it for the one tab they keep, with its title only.
 */
export function BlockedPage({ bar, host, attemptAt, locale, onBack }: BlockedPageProps) {
  const t = useTranslations("lock.blocked");
  if (bar?.mode !== "browser") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas p-8 text-fg-primary">
        <h1 className="type-h3 text-center">{t("title")}</h1>
      </main>
    );
  }
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-fg-primary">
      <LockBarView bar={bar} onPortal={onBack} />
      <main className="flex flex-col items-center gap-4 px-8 pt-24 pb-8">
        <Mascot pose="lock" size={200} className="size-50" />
        <h1 className="type-h3 text-center">{t("title")}</h1>
        <p className="type-body-m w-full max-w-140 text-center opacity-70">{t("body.portal_only")}</p>
        {host ? (
          <p className="type-ui-mono rounded-pill bg-subtle px-3 py-1.5">
            <span className="opacity-75">
              {t("meta", { host, time: formatTime(attemptAt, locale, { seconds: true }) })}
            </span>
          </p>
        ) : null}
        <Button onClick={onBack}>{t("back")}</Button>
      </main>
    </div>
  );
}
