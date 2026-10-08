// Pure logic of the integrity report (3.4), the shared report (3.5) and /verify/[code]: the printed
// verify code, the values of the report's rows, the events file of Export CSV, and the share link.
// The words around the values are dashboard.report.* messages; nothing here is user-facing text.
import {
  type CompactEvent,
  formatVerifyCode,
  type ReportFlag,
  type ReportPayload,
  type SharedReportResponse,
} from "@uki/contracts";
import { TIME_ZONE } from "@uki/i18n";

/**
 * How a verify code is printed on 3.4, 3.5, /verify and the CSV's name: UKI-XXXX-XXXX, as the user decided
 * on 8 Oct (docs/decisions.md, 1.9). Every printed code goes through this one function.
 */
export function printedVerifyCode(code: string): string {
  return formatVerifyCode(code);
}

/** "Aigerim S.": the first name and the last name's initial, as 3.4's Reviewed row writes it. */
export function shortName(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  const first = words[0] ?? "";
  if (words.length < 2) return first;
  const last = words[words.length - 1] ?? "";
  return `${first} ${last.slice(0, 1).toLocaleUpperCase()}.`;
}

/** Whole minutes used, rounded, and the minutes allowed with any extra time: "87 of 90 min". */
export function timeUsed(payload: Pick<ReportPayload, "session" | "exam">): { used: number; total: number } {
  return {
    used: Math.round(payload.session.time_used_s / 60),
    total: payload.exam.duration_min + payload.session.extra_min,
  };
}

/** Identity row: matched (with the time of the match when the session has one) or not checked. */
export function identityOf(
  session: ReportPayload["session"],
): { kind: "matched"; at: string | null } | { kind: "unchecked" } {
  if (session.identity_result === "matched" || session.identity_at !== null) {
    return { kind: "matched", at: session.identity_at };
  }
  return { kind: "unchecked" };
}

/** The report's flags in time order, as the content hash orders them. */
export function orderedFlags(flags: readonly ReportFlag[]): ReportFlag[] {
  return [...flags].sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id));
}

/** The first still of each flag, by flag id: 3.4 and 3.5 show one per flag. */
export function firstStillByFlag(
  stills: ReadonlyArray<{ event_id: string; url: string; captured_at: string }>,
): Record<string, string> {
  const sorted = [...stills].sort((a, b) => Date.parse(a.captured_at) - Date.parse(b.captured_at));
  const out: Record<string, string> = {};
  for (const still of sorted) out[still.event_id] ??= still.url;
  return out;
}

/** 3.5's Flagged frames: this session's frames of the exam's. */
export function framesLine(dataKept: ReportPayload["data_kept"]): { session: number; exam: number } {
  return { session: dataKept.session_frames, exam: dataKept.exam_frames };
}

// ---------------------------------------------------------------------------------------------------
// Export CSV
// ---------------------------------------------------------------------------------------------------

/**
 * The events file's columns: the database's own field names, so the file reads the same in every
 * dashboard language and joins with an export of `events` (docs/decisions.md, 1.9).
 */
export const CSV_COLUMNS = [
  "at_utc",
  "at_almaty",
  "type",
  "source",
  "review",
  "frame_count",
  "received_at_utc",
  "data",
] as const;

const almatyTime = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** "2026-10-09 10:47:10" in Asia/Almaty. */
export function almatyStamp(value: string): string {
  const parts = Object.fromEntries(almatyTime.formatToParts(new Date(value)).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

/**
 * One CSV field (RFC 4180): quoted when it holds a comma, quote or line break, quotes doubled. A field
 * that a spreadsheet would run as a formula (=, +, -, @, tab or carriage return first) gets a leading
 * apostrophe, since notes and messages are free text.
 */
export function csvField(value: string | number | null): string {
  if (value === null) return "";
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** The session's events, oldest first, as a CSV file with a header row and CRLF line ends. */
export function eventsCsv(events: readonly CompactEvent[]): string {
  const rows = [...events]
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id))
    .map((event) =>
      [
        event.at,
        almatyStamp(event.at),
        event.type,
        event.source,
        event.review,
        event.frame_count,
        event.received_at,
        JSON.stringify(event.data),
      ]
        .map(csvField)
        .join(","),
    );
  return `${[CSV_COLUMNS.join(","), ...rows].join("\r\n")}\r\n`;
}

/** "uki-report-UKI-7K2M-9QXD-events.csv", or without the code before the report exists. */
export function csvFileName(code: string | null): string {
  return code === null ? "uki-report-events.csv" : `uki-report-${printedVerifyCode(code)}-events.csv`;
}

// ---------------------------------------------------------------------------------------------------
// The share link
// ---------------------------------------------------------------------------------------------------

/** The link create_share's path makes on this site: https://host/r/<token>. */
export function shareUrl(origin: string, path: string): string {
  return new URL(path, origin).toString();
}

/** Whole days until the share expires, at least 1: the field's "expires in 30 days". */
export function daysLeft(expiresAt: string, nowMs: number): number {
  return Math.max(1, Math.round((Date.parse(expiresAt) - nowMs) / 86_400_000));
}

/** The stills of a shared report by flag, for the report page (3.5). */
export function sharedStills(report: SharedReportResponse): Record<string, string> {
  return firstStillByFlag(report.stills);
}
