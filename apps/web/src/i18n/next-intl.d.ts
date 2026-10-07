// Type-safe keys and formats for next-intl (useTranslations, getTranslations, useFormatter).
// Messages come from packages/i18n/messages/en.json; dashboard.* keys come from packages/i18n/dashboard.json.
import type { Messages, UkiFormats } from "@uki/i18n";

declare module "next-intl" {
  interface AppConfig {
    Messages: Messages;
    Formats: UkiFormats;
  }
}
