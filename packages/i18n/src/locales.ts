import { z } from "zod";

/** Student and Üki Lock languages, in the order of the switch on 1.1: ҚАЗ, РУС, ENG. */
export const LOCALES = ["kk", "ru", "en"] as const;
export type Locale = (typeof LOCALES)[number];

/** Students see Kazakh until they switch. */
export const DEFAULT_LOCALE: Locale = "kk";

// Kept in its own zod-free module so the Intl polyfill can import it without zod.
export { TIME_ZONE } from "./time-zone.ts";

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
