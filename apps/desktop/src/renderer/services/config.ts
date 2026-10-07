// Settings the student app keeps on the laptop: the chosen language (a per-laptop convenience in
// localStorage) and the exam office's address for 2.1d, an optional build-time setting.
import { isLocale, type Locale } from "@uki/i18n";
import { z } from "zod";

export const LOCALE_STORAGE_KEY = "uki-locale";

/** The language the student picked last on this laptop, or null. */
export function storedLocale(storage: Pick<Storage, "getItem"> | null = safeStorage()): Locale | null {
  try {
    const value = storage?.getItem(LOCALE_STORAGE_KEY) ?? null;
    return isLocale(value) ? value : null;
  } catch {
    return null;
  }
}

export function storeLocale(locale: Locale, storage: Pick<Storage, "setItem"> | null = safeStorage()): void {
  try {
    storage?.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Private mode or blocked storage: the language resets to Kazakh next time.
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** ended.contact {email} on 2.1d: VITE_EXAM_OFFICE_EMAIL at build time, or null when unset. */
export function examOfficeEmail(env: Record<string, unknown> = import.meta.env): string | null {
  const parsed = z.email().safeParse(env.VITE_EXAM_OFFICE_EMAIL);
  return parsed.success ? parsed.data : null;
}
