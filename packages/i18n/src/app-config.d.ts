/**
 * Type-safe message keys for useTranslations, useFormatter and IntlProvider. Opt in once per app;
 * createUkiTranslator is typed without it.
 *
 * Desktop renderer and Üki Lock (use-intl): add one line to a .d.ts the app's tsconfig includes,
 * for example apps/desktop/src/renderer/i18n.d.ts:
 *
 *   import type {} from "@uki/i18n/app-config";
 *
 * Web dashboard (next-intl re-exports use-intl's AppConfig, so the same line works there), or
 * augment next-intl directly in apps/web/global.d.ts:
 *
 *   import type { Messages, UkiFormats } from "@uki/i18n";
 *   declare module "next-intl" {
 *     interface AppConfig { Messages: Messages; Formats: UkiFormats }
 *   }
 *
 * Locale stays `string` on purpose: providers take the BCP 47 tag (BCP47[locale], such as "kk-KZ").
 */
import type { UkiFormats } from "./formats.ts";
import type { Messages } from "./messages.ts";

declare module "use-intl" {
  interface AppConfig {
    Messages: Messages;
    Formats: UkiFormats;
  }
}
