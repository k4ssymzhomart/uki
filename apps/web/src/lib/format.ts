import { type DateInput, formatDate, formatTime, TIME_ZONE } from "@uki/i18n";
import type { DashboardLocale } from "../i18n/locale.ts";

/**
 * Formatting shared by the dashboard screens. Every time is shown in Asia/Almaty (CLAUDE.md), in the
 * dashboard's locale (useDashboardLocale() on the client); the words around the values come from
 * dashboard.* messages.
 */

/** "10:00": 24-hour in both dashboard languages, so it needs no locale. */
export function timeOf(value: DateInput): string {
  return formatTime(value, "en");
}

/** "Fri 9 Oct", "пт, 9 окт". */
export function dayOf(value: DateInput, locale: DashboardLocale): string {
  return formatDate(value, locale);
}

/** "Fri", "пт". */
export function weekdayOf(value: DateInput, locale: DashboardLocale): string {
  return formatDate(value, locale, { weekday: "short" });
}

/** "Friday", "пятница". */
export function longWeekdayOf(value: DateInput, locale: DashboardLocale): string {
  return formatDate(value, locale, { weekday: "long" });
}

const dayKeyFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The calendar day in Asia/Almaty, "2026-10-09", for comparing days. */
export function almatyDay(value: DateInput): string {
  return dayKeyFormat.format(value instanceof Date ? value : new Date(value));
}

export function isSameAlmatyDay(a: DateInput, b: DateInput): boolean {
  return almatyDay(a) === almatyDay(b);
}

/**
 * Group codes as Figma writes them: consecutive numbers become a range with an en dash ("101–103"),
 * everything else is listed with commas. ["101", "102", "103", "204"] gives "101–103, 204".
 */
export function formatGroupCodes(codes: readonly string[]): string {
  const sorted = [...new Set(codes)].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  const parts: string[] = [];
  let index = 0;
  while (index < sorted.length) {
    const start = sorted[index] as string;
    let end = index;
    while (end + 1 < sorted.length && isNextNumber(sorted[end] as string, sorted[end + 1] as string)) {
      end += 1;
    }
    parts.push(end - index >= 2 ? `${start}–${sorted[end]}` : sorted.slice(index, end + 1).join(", "));
    index = end + 1;
  }
  return parts.join(", ");
}

function isNextNumber(a: string, b: string): boolean {
  return /^\d+$/.test(a) && /^\d+$/.test(b) && Number(b) === Number(a) + 1;
}

/** Whole minutes from now until a time, never negative; a part-minute counts as a minute. */
export function minutesUntil(targetMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((targetMs - nowMs) / 60_000));
}
