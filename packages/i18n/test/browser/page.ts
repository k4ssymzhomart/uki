// The page kk-intl.browser.ts runs in Chromium, bundled with esbuild: the polyfill first, as the desktop
// renderer and every Üki Lock entry import it, then the same formatting the screens use.
import "../../src/polyfill.ts";

import { createFormatter } from "use-intl/core";
import {
  BCP47,
  createUkiTranslator,
  formatDate,
  formats,
  formatTime,
  type Locale,
  TIME_ZONE,
} from "../../src/index.ts";
import { installKazakhIntl } from "../../src/kk-intl/install.ts";

/** Friday 9 October 2026, 10:47:02 in Asia/Almaty. */
const AT = Date.UTC(2026, 9, 9, 5, 47, 2);

function screens(locale: Locale) {
  const t = createUkiTranslator(locale);
  const format = createFormatter({ locale: BCP47[locale], formats, timeZone: TIME_ZONE });
  return {
    phoneStatus: t("exam.phone.status", { confidence: 0.94 }),
    phoneDetail: t("event.phone.detail", { confidence: 0.9 }),
    receiptDate: formatDate(AT, locale),
    submitted: t("done.submitted.value", {
      time: formatTime(AT, locale, { seconds: true }),
      date: formatDate(AT, locale),
    }),
    longDate: formatDate(AT, locale, { weekday: "long", day: "numeric", month: "long" }),
    time: formatTime(AT, locale),
    flagsOne: t("done.flags.value", { count: 1 }),
    flagsMany: t("done.flags.value", { count: 3 }),
    storage: t("check.storage.ok", { free: format.number(12.34, { maximumFractionDigits: 1 }) }),
    network: t("check.network.ok", { ms: format.number(1234) }),
    confidence: format.number(0.94, "confidence"),
  };
}

declare global {
  interface Window {
    ukiIntl: { status: ReturnType<typeof installKazakhIntl>; screens: typeof screens };
  }
}

// Installed by the first import; this returns what it did.
window.ukiIntl = { status: installKazakhIntl(), screens };
