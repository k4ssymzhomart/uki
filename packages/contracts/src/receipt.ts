// Receipt ids like UKI-204-0942-MT, issued by `submit_session` and shown on 3.1 and 2.1d.
//
// Format: UKI-<group code>-<4 digits>-<2 initials>
// - group code: the student's `groups.code`, upper-cased, with every character outside A-Z and 0-9
//   removed, at most 12 characters; `X` when the student has no group or nothing is left.
// - 4 digits: random, zero-padded (0000 to 9999). `sessions.receipt_id` is unique, so the database
//   draws again on a collision.
// - 2 initials: the first letter of the first and of the last word of `students.full_name`,
//   upper-cased; a letter outside A-Z becomes `X`, and a one-word name repeats its initial.
//   "Madina Tulegenova" gives MT.
//
// SQL that produces the same ids (for submit_session):
//   'UKI-' || coalesce(nullif(left(regexp_replace(upper(g.code), '[^A-Z0-9]', '', 'g'), 12), ''), 'X')
//   || '-' || lpad(floor(random() * 10000)::int::text, 4, '0')
//   || '-' || <initial of the first word> || <initial of the last word>
import { z } from "zod";

export const RECEIPT_ID_PATTERN = /^UKI-[A-Z0-9]{1,12}-\d{4}-[A-Z]{2}$/;
export const ReceiptId = z.string().regex(RECEIPT_ID_PATTERN);
export type ReceiptId = z.infer<typeof ReceiptId>;

function initial(word: string | undefined): string {
  const letter = (word ?? "").charAt(0).toUpperCase();
  return /^[A-Z]$/.test(letter) ? letter : "X";
}

/** The two initials for a full name, as the database derives them. */
export function receiptInitials(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  return initial(words[0]) + initial(words.length > 1 ? words[words.length - 1] : words[0]);
}

/** The group part of a receipt id. */
export function receiptGroupCode(groupCode: string | null | undefined): string {
  const cleaned = (groupCode ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
  return cleaned === "" ? "X" : cleaned;
}

/** Builds a receipt id; `number` is 0 to 9999. Reference for the SQL above and for tests and seeds. */
export function formatReceiptId(input: {
  groupCode: string | null;
  number: number;
  fullName: string;
}): string {
  const digits = String(Math.min(9999, Math.max(0, Math.floor(input.number)))).padStart(4, "0");
  return `UKI-${receiptGroupCode(input.groupCode)}-${digits}-${receiptInitials(input.fullName)}`;
}
