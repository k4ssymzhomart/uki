import { type DateInput, formatDate } from "@uki/i18n";
import type { DashboardLocale } from "../../i18n/locale.ts";

/**
 * Figma writes September "Sep" (A.3: "18 Sep", "24 Sep"); current ICU data writes "Sept" in en-GB.
 * The other English short months are the same in both.
 */
function figmaMonths(text: string): string {
  return text.replace(/\bSept\b/, "Sep");
}

/**
 * Dates on A.2 and A.3 in Asia/Almaty, without the full stop Intl puts after a Russian short month, as
 * the receipt date does: "9 Oct" and "9 окт" (the last exam, the exam history, "seen 9 Oct").
 */
export function formatDayMonth(value: DateInput, locale: DashboardLocale): string {
  return figmaMonths(formatDate(value, locale, { day: "numeric", month: "short" }).replace(/\.$/, ""));
}

/** "4 September", "4 сентября" (A.3 "since 4 September"). */
export function formatDayLongMonth(value: DateInput, locale: DashboardLocale): string {
  return formatDate(value, locale, { day: "numeric", month: "long" });
}

/** "7 Jan 2027", "7 янв 2027" (A.3 "Deleted on 7 Jan 2027"). */
export function formatDayMonthYear(value: DateInput, locale: DashboardLocale): string {
  return figmaMonths(
    formatDate(value, locale, { day: "numeric", month: "short", year: "numeric" })
      .replace(/\.(?=\s)/, "")
      .replace(/\s*г\.$/, ""),
  );
}
