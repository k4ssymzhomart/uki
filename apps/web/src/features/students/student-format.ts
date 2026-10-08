import { type DateInput, formatDate } from "@uki/i18n";
import type { DashboardLocale } from "../../i18n/locale.ts";

/**
 * Dates on A.2 and A.3 in Asia/Almaty, without the full stop Intl puts after a Russian short month, as
 * the receipt date does: "9 Oct" and "9 окт" (the last exam, the exam history, "seen 9 Oct").
 */
export function formatDayMonth(value: DateInput, locale: DashboardLocale): string {
  return formatDate(value, locale, { day: "numeric", month: "short" }).replace(/\.$/, "");
}

/** "4 September", "4 сентября" (A.3 "since 4 September"). */
export function formatDayLongMonth(value: DateInput, locale: DashboardLocale): string {
  return formatDate(value, locale, { day: "numeric", month: "long" });
}

/** "7 Jan 2027", "7 янв 2027" (A.3 "Deleted on 7 Jan 2027"). */
export function formatDayMonthYear(value: DateInput, locale: DashboardLocale): string {
  return formatDate(value, locale, { day: "numeric", month: "short", year: "numeric" })
    .replace(/\.(?=\s)/, "")
    .replace(/\s*г\.$/, "");
}
