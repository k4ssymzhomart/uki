import { BCP47, DEFAULT_LOCALE, formats, type Locale, loadMessages, TIME_ZONE } from "@uki/i18n";
import type { ReactNode } from "react";
import { IntlProvider } from "use-intl";

/**
 * Catalog messages for the popup and the extension pages. Üki Lock follows the app: exam.state carries
 * the locale; until the first one arrives it shows Kazakh.
 */
export function LockIntlProvider({
  locale = DEFAULT_LOCALE,
  children,
}: {
  locale?: Locale;
  children: ReactNode;
}) {
  return (
    <IntlProvider
      locale={BCP47[locale]}
      messages={loadMessages(locale)}
      timeZone={TIME_ZONE}
      formats={formats}
    >
      {children}
    </IntlProvider>
  );
}
