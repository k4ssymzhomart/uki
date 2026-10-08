import { ReviewDecisionValue, Timestamp, toMs, Uuid } from "@uki/contracts";
import type { ChipStatus, CountTone } from "@uki/ui";
import { z } from "zod";
import { almatyDay } from "../../lib/format.ts";

/**
 * A.2 Students (Figma 104:10579) as pure functions over `student_overview` rows. The view runs under the
 * caller's row-level security, so the exam office only ever has its own workspace's students here.
 * Unit-tested in students-model.test.ts.
 */

const Count = z.number().int().nonnegative();

/** One `student_overview` row with the columns A.2 reads. */
export const StudentRow = z.object({
  id: Uuid,
  student_number: z.string(),
  full_name: z.string(),
  group_id: Uuid.nullable(),
  group_code: z.string().nullable(),
  faculty_id: Uuid.nullable(),
  programme: z.string().nullable(),
  year: z.number().int().nullable(),
  exams_taken: Count,
  flags: Count,
  sessions_in_review: Count,
  last_exam_id: Uuid.nullable(),
  last_exam_title: z.string().nullable(),
  last_exam_at: Timestamp.nullable(),
  latest_decision: ReviewDecisionValue.nullable(),
});
export type StudentRow = z.infer<typeof StudentRow>;

/** The columns to select from `student_overview`. */
export const STUDENT_COLUMNS =
  "id, student_number, full_name, group_id, group_code, faculty_id, programme, year, exams_taken, flags, sessions_in_review, last_exam_id, last_exam_title, last_exam_at, latest_decision";

/** Parses the view's rows; a row that does not parse is left out rather than shown wrong. */
export function parseStudentRows(rows: readonly unknown[]): StudentRow[] {
  return rows.flatMap((row) => {
    const parsed = StudentRow.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}

/**
 * The status chip of a student (A.2) or of one exam session (A.3): a flag without a newer decision is
 * "in review"; otherwise the latest decision ("follow-up" for talk to the student, "no issue",
 * "committee"); no flag at all is "clear".
 */
export const REVIEW_STATUSES = ["inReview", "followUp", "committee", "noIssue", "clear"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const REVIEW_STATUS_CHIP: Readonly<Record<ReviewStatus, ChipStatus>> = {
  inReview: "warn",
  followUp: "warn",
  committee: "flag",
  noIssue: "ok",
  clear: "ok",
};

const DECISION_STATUS: Readonly<Record<ReviewDecisionValue, ReviewStatus>> = {
  talk: "followUp",
  no_issue: "noIssue",
  committee: "committee",
};

export function reviewStatus(input: {
  flags: number;
  open: boolean;
  decision: ReviewDecisionValue | null;
}): ReviewStatus {
  if (input.open) return "inReview";
  if (input.decision !== null) return DECISION_STATUS[input.decision];
  return input.flags > 0 ? "inReview" : "clear";
}

export function studentStatus(row: StudentRow): ReviewStatus {
  return reviewStatus({ flags: row.flags, open: row.sessions_in_review > 0, decision: row.latest_decision });
}

/** The flags Count's colour, as A.2 draws it: 0 neutral, 1 or 2 yellow, 3 or more coral. */
export function flagTone(flags: number): CountTone {
  if (flags >= 3) return "flag";
  return flags > 0 ? "warn" : "neutral";
}

// ---------------------------------------------------------------------------------------------------
// Search and filters
// ---------------------------------------------------------------------------------------------------

/** The table's tabs: everyone, or the students with a flag this term (A.2 "Flagged · 46"). */
export const STUDENT_TABS = ["all", "flagged"] as const;
export type StudentTab = (typeof STUDENT_TABS)[number];

export type StudentFilters = {
  tab: StudentTab;
  /** Name or student number, as typed. */
  query: string;
  /** A group id, or null for every group. */
  group: string | null;
  programme: string | null;
  year: number | null;
};

export const NO_FILTERS: StudentFilters = { tab: "all", query: "", group: null, programme: null, year: null };

function fold(text: string): string {
  return text.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * True when a student matches the search: every word of the query is part of the name, in any order
 * and any case ("madina", "Tulegenova Madina"), or the digits are part of the student number
 * ("20231187", "1187"). An empty query matches everyone.
 */
export function matchesQuery(row: Pick<StudentRow, "full_name" | "student_number">, query: string): boolean {
  const folded = fold(query);
  if (folded === "") return true;
  if (/^\d+$/.test(folded)) return row.student_number.includes(folded);
  const name = fold(row.full_name);
  return folded.split(" ").every((word) => name.includes(word));
}

/** The rows the table shows for the tab, the search and the three filters (plan: group, programme, year). */
export function filterStudents(
  rows: readonly StudentRow[],
  filters: StudentFilters,
  flaggedThisTerm: ReadonlySet<string>,
): StudentRow[] {
  return rows.filter(
    (row) =>
      (filters.tab === "all" || flaggedThisTerm.has(row.id)) &&
      (filters.group === null || row.group_id === filters.group) &&
      (filters.programme === null || row.programme === filters.programme) &&
      (filters.year === null || row.year === filters.year) &&
      matchesQuery(row, filters.query),
  );
}

/**
 * Most recent exam first, as A.2 lists students who sat Mathematics 2 on 9 Oct above Physics 1 on 8 Oct;
 * students without an exam last; then by name.
 */
export function sortStudents(rows: readonly StudentRow[], locale: string): StudentRow[] {
  const collator = new Intl.Collator(locale);
  return [...rows].sort((a, b) => {
    const at = a.last_exam_at === null ? Number.NEGATIVE_INFINITY : toMs(a.last_exam_at);
    const bt = b.last_exam_at === null ? Number.NEGATIVE_INFINITY : toMs(b.last_exam_at);
    if (at !== bt) return bt - at;
    return collator.compare(a.full_name, b.full_name) || a.student_number.localeCompare(b.student_number);
  });
}

export type Facet<T> = { value: T; label: string; count: number };

/**
 * The choices of the group, programme and year filters: the values the students have, with how many
 * students each, sorted (groups and years by number, programmes by name). Missing values are not a choice.
 */
export function studentFacets(
  rows: readonly StudentRow[],
  locale: string,
): { groups: Facet<string>[]; programmes: Facet<string>[]; years: Facet<number>[] } {
  const groups = new Map<string, Facet<string>>();
  const programmes = new Map<string, Facet<string>>();
  const years = new Map<number, Facet<number>>();
  for (const row of rows) {
    if (row.group_id !== null) {
      const facet = groups.get(row.group_id) ?? {
        value: row.group_id,
        label: row.group_code ?? "",
        count: 0,
      };
      facet.count += 1;
      groups.set(row.group_id, facet);
    }
    if (row.programme !== null && row.programme.trim() !== "") {
      const facet = programmes.get(row.programme) ?? { value: row.programme, label: row.programme, count: 0 };
      facet.count += 1;
      programmes.set(row.programme, facet);
    }
    if (row.year !== null) {
      const facet = years.get(row.year) ?? { value: row.year, label: String(row.year), count: 0 };
      facet.count += 1;
      years.set(row.year, facet);
    }
  }
  const numeric = new Intl.Collator(locale, { numeric: true });
  return {
    groups: [...groups.values()].sort((a, b) => numeric.compare(a.label, b.label)),
    programmes: [...programmes.values()].sort((a, b) => numeric.compare(a.label, b.label)),
    years: [...years.values()].sort((a, b) => a.value - b.value),
  };
}

// ---------------------------------------------------------------------------------------------------
// Pages and the stat tiles
// ---------------------------------------------------------------------------------------------------

/** Rows per page of the students table. */
export const PAGE_SIZE = 25;

export type StudentPage = {
  rows: StudentRow[];
  /** The page actually shown, 0-based, clamped to the pages there are. */
  page: number;
  /** 1-based positions for "1–25 of 448"; 0 and 0 when nothing matches. */
  from: number;
  to: number;
  total: number;
  pageCount: number;
};

export function pageOf(rows: readonly StudentRow[], page: number, size: number = PAGE_SIZE): StudentPage {
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(0, Math.floor(page)), pageCount - 1);
  const start = current * size;
  const slice = rows.slice(start, start + size);
  return {
    rows: slice,
    page: current,
    from: slice.length === 0 ? 0 : start + 1,
    to: start + slice.length,
    total,
    pageCount,
  };
}

export type StudentStats = {
  students: number;
  /** Faculties the students' groups belong to. */
  faculties: number;
  /** Students with at least one flag in an exam of this term. */
  flagged: number;
  /** flagged / students, 0 without students. */
  flaggedShare: number;
};

export function studentStats(
  rows: readonly StudentRow[],
  flaggedThisTerm: ReadonlySet<string>,
): StudentStats {
  const faculties = new Set(rows.flatMap((row) => (row.faculty_id === null ? [] : [row.faculty_id])));
  const flagged = rows.filter((row) => flaggedThisTerm.has(row.id)).length;
  return {
    students: rows.length,
    faculties: faculties.size,
    flagged,
    flaggedShare: rows.length === 0 ? 0 : flagged / rows.length,
  };
}

/**
 * The term a day belongs to, as the database's `term_key` writes it: 1 September to 31 January is
 * "<year>-autumn", 1 February to 31 August "<year>-spring", by the date in Asia/Almaty.
 */
export function termKey(value: string | number | Date): string {
  const [yearText, monthText] = almatyDay(value).split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (month >= 9) return `${year}-autumn`;
  if (month === 1) return `${year - 1}-autumn`;
  return `${year}-spring`;
}
