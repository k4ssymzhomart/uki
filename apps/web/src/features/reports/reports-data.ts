// A.1's reads: the term_* views of WP 1.1 (security_invoker, so the caller's row-level security decides
// which exams count), for one term and either all faculties (their `all_faculties` row) or one faculty.
// The views hold counts, not a student's data, but they are built from students' sessions, so each view
// of the page writes one `reports.read` audit row (object `workspace`, id `<term>` or `<term>:<faculty>`)
// before the term's numbers are read. Rows are parsed with Zod.
import { auditRead } from "../students/students-data.ts";
import type { AnyClient } from "../wall/queries.ts";
import {
  chooseTerm,
  DECISION_COLUMNS,
  DecisionRow,
  EMPTY_KPIS,
  FLAG_TYPE_COLUMNS,
  FlagTypeRow,
  parseRows,
  REVIEW_TIME_COLUMNS,
  ReviewTimeRow,
  TERM_KPI_COLUMNS,
  type TermKey,
  TermKpiRow,
  TermRow,
  termOptions,
  WEEKLY_FLAGS_COLUMNS,
  WeeklyFlagsRow,
} from "./reports-model.ts";

type Result = { data: unknown; error: { message: string } | null };

function rowsOf(result: Result, what: string): unknown[] {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return Array.isArray(result.data) ? result.data : [];
}

/** A term has at most 22 weeks and a handful of flag types: one request per view is enough. */
const MAX_ROWS = 200;
/** PostgREST answers at most this many rows (supabase/config.toml max_rows): years of exams. */
const MAX_EXAMS = 1000;

export type ReportsData = {
  /** The terms that ran exams, newest first. */
  terms: TermRow[];
  term: TermKey;
  kpis: Omit<TermKpiRow, "term" | "term_start">;
  weekly: WeeklyFlagsRow[];
  types: FlagTypeRow[];
  decisions: DecisionRow[];
  reviewTimes: ReviewTimeRow[];
};

/** The audit row's object id: the term, and the faculty when one is chosen. */
export function reportsAuditId(term: TermKey, facultyId: string | null): string {
  return facultyId === null ? term : `${term}:${facultyId}`;
}

/**
 * A.1 for `requestedTerm` (the address's ?term=, checked against the terms that ran exams) within the
 * faculty chosen in the workspace menu (0.1c), or all faculties.
 */
export async function loadReports(
  client: AnyClient,
  requestedTerm: unknown,
  facultyId: string | null,
  nowMs: number,
): Promise<ReportsData> {
  // The terms come from the exams alone (term_exams), so listing them reads no session.
  const terms = termOptions(
    parseRows(
      TermRow,
      rowsOf(
        await client
          .from("term_exams")
          .select("term, term_start")
          .order("term_start", { ascending: false })
          .limit(MAX_EXAMS),
        "term_exams",
      ),
    ),
  );
  const term = chooseTerm(requestedTerm, terms, nowMs);
  await auditRead(client, {
    action: "reports.read",
    object_type: "workspace",
    object_id: reportsAuditId(term, facultyId),
  });

  const view = (name: string, columns: string) => {
    // Every view has a row per faculty and one for all faculties (all_faculties true).
    const query = client.from(name).select(columns).eq("term", term);
    return facultyId === null
      ? query.eq("all_faculties", true)
      : query.eq("all_faculties", false).eq("faculty_id", facultyId);
  };
  const [kpis, weekly, types, decisions, reviewTimes] = await Promise.all([
    view("term_kpis", TERM_KPI_COLUMNS).limit(1),
    view("term_weekly_flags", WEEKLY_FLAGS_COLUMNS).order("week_start").limit(MAX_ROWS),
    view("term_flag_types", FLAG_TYPE_COLUMNS).limit(MAX_ROWS),
    view("term_decisions", DECISION_COLUMNS).limit(MAX_ROWS),
    view("term_review_time", REVIEW_TIME_COLUMNS).order("week_start").limit(MAX_ROWS),
  ]);
  const kpiRow = parseRows(TermKpiRow, rowsOf(kpis, "term_kpis"))[0];
  return {
    terms,
    term,
    kpis: kpiRow ?? EMPTY_KPIS,
    weekly: parseRows(WeeklyFlagsRow, rowsOf(weekly, "term_weekly_flags")),
    types: parseRows(FlagTypeRow, rowsOf(types, "term_flag_types")),
    decisions: parseRows(DecisionRow, rowsOf(decisions, "term_decisions")),
    reviewTimes: parseRows(ReviewTimeRow, rowsOf(reviewTimes, "term_review_time")),
  };
}
