// The student's language for the few strings the main process draws itself (tray menu, save dialog).
// The renderer's UkiIntlProvider sets <html lang> to the BCP 47 tag of the chosen locale; the Lock's
// exam.state messages carry the locale too.
import { BCP47, DEFAULT_LOCALE, LOCALES, type Locale } from "@uki/i18n";
import { z } from "zod";

/** "kk-KZ" gives kk, "ru" gives ru; anything else gives the default, Kazakh. */
export function localeFromTag(tag: unknown): Locale {
  const parsed = z.string().safeParse(tag);
  if (!parsed.success) return DEFAULT_LOCALE;
  const lower = parsed.data.trim().toLowerCase();
  return (
    LOCALES.find((locale) => lower === BCP47[locale].toLowerCase() || lower.split("-")[0] === locale) ??
    DEFAULT_LOCALE
  );
}

/** The part of WebContents this module uses. */
export interface ScriptRunner {
  executeJavaScript(code: string): Promise<unknown>;
}

/** Reads <html lang> from the renderer; the default locale when the page does not answer. */
export async function readRendererLocale(contents: ScriptRunner): Promise<Locale> {
  try {
    return localeFromTag(await contents.executeJavaScript("document.documentElement.lang"));
  } catch {
    return DEFAULT_LOCALE;
  }
}
