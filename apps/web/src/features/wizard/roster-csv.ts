import {
  checkRoster,
  ROSTER_COLUMNS,
  ROSTER_ROWS_MAX,
  type RosterCheck,
  type RosterColumn,
  type RosterIssue,
  type RosterProblem,
} from "@uki/contracts";
import Papa from "papaparse";

/**
 * The roster CSV of 0.3 in the browser (plan, Decisions: Roster CSV): Papa Parse reads the file, the
 * header row maps the columns, and checkRoster from the contracts checks every row with RosterRow and
 * the workspace's group codes. Nothing is written while a row has a problem (0.3a); import_roster
 * checks the same rules again.
 */

/** One data row, keyed by the plan's columns; every cell is a trimmed string. */
export type RosterCells = Record<RosterColumn, string>;

/** The header names a dean's office export may use for each column, compared without case or spaces. */
const HEADER_ALIASES: Readonly<Record<string, RosterColumn>> = {
  studentnumber: "student_number",
  studentid: "student_number",
  number: "student_number",
  id: "student_number",
  номерстудента: "student_number",
  номер: "student_number",
  fullname: "full_name",
  name: "full_name",
  student: "full_name",
  фио: "full_name",
  имя: "full_name",
  email: "email",
  mail: "email",
  emailaddress: "email",
  почта: "email",
  group: "group",
  groupcode: "group",
  группа: "group",
  топ: "group",
  language: "locale",
  locale: "locale",
  lang: "locale",
  язык: "locale",
  тіл: "locale",
};

function headerKey(cell: string): string {
  return cell
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s_\-.]+/g, "");
}

/** The default language when the file has no language column: students see Kazakh by default. */
export const DEFAULT_ROSTER_LOCALE = "kk";

export type ParsedRoster =
  | { ok: true; rows: RosterCells[]; hasLocaleColumn: boolean }
  | { ok: false; reason: "empty" | "tooMany" | "unreadable" };

/**
 * Reads CSV text. A first row whose cells name at least three columns is the header and maps the
 * columns in any order; otherwise the columns are taken in the plan's order with no header. A file
 * without a language column gives every student Kazakh. Blank lines are skipped.
 */
export function parseRosterCsv(text: string): ParsedRoster {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  if (clean.trim() === "") return { ok: false, reason: "empty" };
  const parsed = Papa.parse<string[]>(clean, { skipEmptyLines: "greedy" });
  const table = parsed.data.filter((row): row is string[] => Array.isArray(row));
  if (table.length === 0) return { ok: false, reason: parsed.errors.length > 0 ? "unreadable" : "empty" };

  const first = table[0] ?? [];
  const mapped = first.map((cell) => HEADER_ALIASES[headerKey(String(cell))] ?? null);
  const named = new Set(mapped.filter((column): column is RosterColumn => column !== null));
  const hasHeader = named.size >= 3;
  const columns: (RosterColumn | null)[] = hasHeader ? mapped : [...ROSTER_COLUMNS];
  const body = hasHeader ? table.slice(1) : table;
  const hasLocaleColumn = columns.includes("locale");

  if (body.length === 0) return { ok: false, reason: "empty" };
  if (body.length > ROSTER_ROWS_MAX) return { ok: false, reason: "tooMany" };

  const rows = body.map((cells) => {
    const row: RosterCells = { student_number: "", full_name: "", email: "", group: "", locale: "" };
    columns.forEach((column, index) => {
      if (column !== null && row[column] === "") row[column] = String(cells[index] ?? "").trim();
    });
    if (!hasLocaleColumn) row.locale = DEFAULT_ROSTER_LOCALE;
    return row;
  });
  return { ok: true, rows, hasLocaleColumn };
}

/** checkRoster over parsed cells. */
export function checkRosterCells(rows: readonly RosterCells[], knownGroups: readonly string[]): RosterCheck {
  return checkRoster(rows, knownGroups);
}

/** One bad row of 0.3a: its number, the name as written ("—" in the frame when empty) and its problems. */
export type BadRow = { row: number; name: string; issues: RosterIssue[] };

/** The problems grouped by row, in file order. */
export function badRows(rows: readonly RosterCells[], issues: readonly RosterIssue[]): BadRow[] {
  const byRow = new Map<number, RosterIssue[]>();
  for (const issue of issues) byRow.set(issue.row, [...(byRow.get(issue.row) ?? []), issue]);
  return [...byRow.entries()]
    .sort(([a], [b]) => a - b)
    .map(([row, list]) => ({ row, name: rows[row - 1]?.full_name ?? "", issues: list }));
}

/** The message key of a problem (dashboard.wizard.roster.problem.*); an empty number has its own line. */
export function problemKey(issue: RosterIssue): RosterProblem | "number_empty" {
  return issue.problem === "number_invalid" && issue.value === "" ? "number_empty" : issue.problem;
}

/** The rows with one row's cells changed (0.3b's Save on a row of the file). */
export function replaceRow(
  rows: readonly RosterCells[],
  row: number,
  cells: Partial<RosterCells>,
): RosterCells[] {
  return rows.map((item, index) => (index === row - 1 ? { ...item, ...cells } : item));
}

/** The rows without the bad ones (0.3a's Skip). */
export function skipRows(rows: readonly RosterCells[], bad: readonly number[]): RosterCells[] {
  const skip = new Set(bad);
  return rows.filter((_, index) => !skip.has(index + 1));
}

/** 0.3a's Download error report: one CSV line per problem, with the row and its cells. */
export function errorReportCsv(
  rows: readonly RosterCells[],
  issues: readonly RosterIssue[],
  problemText: (issue: RosterIssue) => string,
  header: readonly string[],
): string {
  const lines = issues.map((issue) => {
    const cells = rows[issue.row - 1];
    return [
      String(issue.row),
      ...ROSTER_COLUMNS.map((column) => cells?.[column] ?? ""),
      issue.column,
      problemText(issue),
    ];
  });
  return Papa.unparse({ fields: [...header], data: lines }, { newline: "\n" });
}
