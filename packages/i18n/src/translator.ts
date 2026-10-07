import { createTranslator, type NamespaceKeys, type NestedKeyOf } from "use-intl/core";
import { formats } from "./formats.ts";
import { BCP47, type Locale, TIME_ZONE } from "./locales.ts";
import { loadMessages, type Messages } from "./messages.ts";

/** A namespace of the messages, such as "exam" or "lock.ready". */
export type MessageNamespace = NamespaceKeys<Messages, NestedKeyOf<Messages>>;

/**
 * A translator outside React (Electron main process, tray menu, Lock service worker, scripts, tests),
 * with the Üki locale tag, Asia/Almaty and the shared formats. Keys are type-checked against
 * messages/en.json whether or not the caller's app opts into the AppConfig augmentation.
 *
 * @example
 * const t = createUkiTranslator("kk", "exam");
 * t("counter", { n: 7, total: 20 }); // "Сұрақ 7 / 20"
 */
export function createUkiTranslator<Namespace extends MessageNamespace = never>(
  locale: Locale,
  namespace?: Namespace,
) {
  return createTranslator<Messages, Namespace>({
    locale: BCP47[locale],
    messages: loadMessages(locale),
    namespace,
    timeZone: TIME_ZONE,
    formats,
  });
}

export type UkiTranslator<Namespace extends MessageNamespace = never> = ReturnType<
  typeof createUkiTranslator<Namespace>
>;
