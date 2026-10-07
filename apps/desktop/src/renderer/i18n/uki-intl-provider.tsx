import { BCP47, DEFAULT_LOCALE, formats, type Locale, loadMessages, TIME_ZONE } from "@uki/i18n";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { IntlProvider } from "use-intl";
import { LocaleContext } from "./locale-context.ts";

export type UkiIntlProviderProps = { initialLocale?: Locale; children: ReactNode };

/**
 * Messages from @uki/i18n in the student's language, Kazakh by default, with times in Asia/Almaty. Keeps
 * <html lang> in step so Geist and the screen reader read the right language.
 */
export function UkiIntlProvider({ initialLocale = DEFAULT_LOCALE, children }: UkiIntlProviderProps) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const messages = useMemo(() => loadMessages(locale), [locale]);
  const state = useMemo(() => ({ locale, setLocale }), [locale]);

  useEffect(() => {
    document.documentElement.lang = BCP47[locale];
  }, [locale]);

  return (
    <LocaleContext.Provider value={state}>
      <IntlProvider locale={BCP47[locale]} messages={messages} timeZone={TIME_ZONE} formats={formats}>
        {children}
      </IntlProvider>
    </LocaleContext.Provider>
  );
}
