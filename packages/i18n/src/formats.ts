import type { Formats } from "use-intl/core";

/**
 * Shared named formats for use-intl's and next-intl's providers (`formats` prop) and for
 * createUkiTranslator. Pass them with `timeZone: TIME_ZONE`.
 *
 * - `time`: 10:47, as in "Ends at 11:40" and the dashboard rows.
 * - `timeSeconds`: 10:47:02, as in the student app's session log and "Saved on this laptop · 10:47:02".
 * - `receipt`: the parts of the receipt date (see formatDate, which also applies the catalog's punctuation).
 * - `confidence`: 0.94 in English, 0,94 in Kazakh and Russian, like `{confidence, number, ::.00}`.
 */
export const formats = {
  dateTime: {
    time: { hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
    timeSeconds: { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" },
    receipt: { weekday: "short", day: "numeric", month: "short" },
  },
  number: {
    confidence: { minimumFractionDigits: 2, maximumFractionDigits: 2 },
  },
} as const satisfies Formats;

export type UkiFormats = typeof formats;
