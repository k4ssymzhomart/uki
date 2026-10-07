import { z } from "zod";

/** Student and Üki Lock languages, in the order of the switch on 1.1: ҚАЗ, РУС, ENG. */
export const LOCALES = ["kk", "ru", "en"] as const;
export type Locale = (typeof LOCALES)[number];

/** Students see Kazakh until they switch. */
export const DEFAULT_LOCALE: Locale = "kk";

/** The workspace time zone for KRU. Every time and date on screen is shown in it. */
export const TIME_ZONE = "Asia/Almaty";

/**
 * BCP 47 tags for Intl and use-intl. English is en-GB: Figma writes "Fri 9 Oct" and 24-hour times
 * such as 10:47:02, which is en-GB, not en-US ("Fri, Oct 9", "10:47 AM").
 */
export const BCP47: Readonly<Record<Locale, string>> = {
  kk: "kk-KZ",
  ru: "ru-RU",
  en: "en-GB",
};

export const localeSchema = z.enum(LOCALES);

export function isLocale(value: unknown): value is Locale {
  return localeSchema.safeParse(value).success;
}
