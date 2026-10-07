import { formats } from "./formats.ts";
import { BCP47, type Locale, TIME_ZONE } from "./locales.ts";

/** A Date, epoch milliseconds or an ISO 8601 string such as a Postgres timestamptz. */
export type DateInput = Date | number | string;

function toDate(value: DateInput): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError(`not a date: ${String(value)}`);
  return date;
}

const cache = new Map<string, Intl.DateTimeFormat>();
function formatter(locale: Locale, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const id = `${locale}|${JSON.stringify(options)}`;
  let f = cache.get(id);
  if (!f) {
    f = new Intl.DateTimeFormat(BCP47[locale], { ...options, timeZone: TIME_ZONE });
    cache.set(id, f);
  }
  return f;
}

/**
 * The time of day in Asia/Almaty, 24-hour: 10:47, or 10:47:02 with `seconds`.
 * Pass the result as the {time} argument of a message.
 */
export function formatTime(value: DateInput, locale: Locale, options: { seconds?: boolean } = {}): string {
  const style = options.seconds ? formats.dateTime.timeSeconds : formats.dateTime.time;
  return formatter(locale, style).format(toDate(value));
}

/**
 * Receipt date patterns from the catalog note on done.submitted.value: "Fri 9 Oct · жм, 9 қаз ·
 * пт, 9 окт". Intl gives "9 қаз., жм" and "пт, 9 окт.", so the parts are reassembled per locale.
 */
const RECEIPT_PATTERN: Readonly<
  Record<Locale, (p: { weekday: string; day: string; month: string }) => string>
> = {
  en: (p) => `${p.weekday} ${p.day} ${p.month}`,
  kk: (p) => `${p.weekday}, ${p.day} ${p.month}`,
  ru: (p) => `${p.weekday}, ${p.day} ${p.month}`,
};

/**
 * A date in Asia/Almaty. Without options it is the short receipt date the catalog asks for:
 * "Fri 9 Oct", "жм, 9 қаз", "пт, 9 окт". With options it is plain Intl.DateTimeFormat in the
 * student's locale and Asia/Almaty.
 */
export function formatDate(value: DateInput, locale: Locale, options?: Intl.DateTimeFormatOptions): string {
  const date = toDate(value);
  if (options) return formatter(locale, options).format(date);
  const parts = formatter(locale, formats.dateTime.receipt).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    (parts.find((p) => p.type === type)?.value ?? "").replace(/\.$/, "");
  return RECEIPT_PATTERN[locale]({ weekday: part("weekday"), day: part("day"), month: part("month") });
}
