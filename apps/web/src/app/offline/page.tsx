import { createUkiTranslator } from "@uki/i18n";
import { Face, Logo } from "@uki/ui/art";
import type { Metadata } from "next";

export const metadata: Metadata = { title: createUkiTranslator("en", "dashboard.pwa.offline")("meta") };

/**
 * `/offline`: what the service worker shows when a page cannot load for lack of network (judge mode,
 * PWA). Static and the same for everyone, in English and Russian, so the worker can cache it without a
 * cookie; nothing on it is private. Try again is a plain link, which works without JavaScript.
 */
export default function OfflinePage() {
  const languages = [
    createUkiTranslator("en", "dashboard.pwa.offline"),
    createUkiTranslator("ru", "dashboard.pwa.offline"),
  ];
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-canvas px-6 py-16 text-center text-fg-primary">
      <Logo variant="wordmark-ink" className="h-8 w-auto" />
      <Face state="oops" size={120} className="size-30" />
      {languages.map((t, index) => (
        <section
          key={t("title")}
          lang={index === 0 ? "en" : "ru"}
          className="flex max-w-120 flex-col items-center gap-3"
        >
          <h1 className="type-h3">{t("title")}</h1>
          <p className="opacity-72 type-body-m">{t("body")}</p>
          <a
            href="/"
            className="rounded-pill bg-inverse px-5.5 py-3 text-fg-inverse type-label-m outline-none focus-visible:shadow-focus"
          >
            {t("retry")}
          </a>
        </section>
      ))}
    </main>
  );
}
