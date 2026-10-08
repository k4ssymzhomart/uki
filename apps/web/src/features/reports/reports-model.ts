// A.1 Reports (Figma 102:10454) as pure functions over the term_* views (WP 1.1): the rows Zod reads,
// the terms to pick from, the tiles' numbers, the weekly series, the flag types, the decisions and the
// review times, and the variant of each card's headline. The view formats the numbers and dates.
import { shares } from "@uki/ui/charts/geometry";
import { z } from "zod";
import { termKey } from "../students/students-model.ts";

const Count = z.number().int().nonnegative();
/** A `date` column: "2026-09-01". */
const IsoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** "2026-autumn" (1 September to 31 January) or "2027-spring" (1 February to 31 August). */
export const TermKey = z.string().regex(/^\d{4}-(?:autumn|spring)$/);
export type TermKey = z.infer<typeof TermKey>;

export const TermKpiRow = z.object({
  term: TermKey,
  term_start: IsoDay,
  exams_run: Count,
  sessions: Count,
  flags: Count,
  flagged_sessions: Count,
  decisions: Count,
  committee: Count,
});
export type TermKpiRow = z.infer<typeof TermKpiRow>;
export const TERM_KPI_COLUMNS =
  "term, term_start, exams_run, sessions, flags, flagged_sessions, decisions, committee";

/** A term and its first day, for the term picker. */
export const TermRow = z.object({ term: TermKey, term_start: IsoDay });
export type TermRow = z.infer<typeof TermRow>;

export const WeeklyFlagsRow = z.object({
  week_start: IsoDay,
  sessions: Count,
  flags: Count,
  flags_per_100: z.number().nonnegative().nullable(),
});
export type WeeklyFlagsRow = z.infer<typeof WeeklyFlagsRow>;
export const WEEKLY_FLAGS_COLUMNS = "week_start, sessions, flags, flags_per_100";

export const FlagTypeRow = z.object({ type: z.string().min(1), flags: Count });
export type FlagTypeRow = z.infer<typeof FlagTypeRow>;
export const FLAG_TYPE_COLUMNS = "type, flags";

export const DECISIONS = ["no_issue", "talk", "committee"] as const;
export type Decision = (typeof DECISIONS)[number];
export const DecisionRow = z.object({ decision: z.enum(DECISIONS), sessions: Count });
export type DecisionRow = z.infer<typeof DecisionRow>;
export const DECISION_COLUMNS = "decision, sessions";

export const ReviewTimeRow = z.object({
  week_start: IsoDay,
  decisions: Count,
  median_review_s: z.number().int().nonnegative().nullable(),
});
export type ReviewTimeRow = z.infer<typeof ReviewTimeRow>;
export const REVIEW_TIME_COLUMNS = "week_start, decisions, median_review_s";

/** Every row that parses; a row that does not is left out rather than failing the page. */
export function parseRows<T>(schema: z.ZodType<T>, rows: readonly unknown[]): T[] {
  return rows.flatMap((row) => {
    const parsed = schema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}

// ---------------------------------------------------------------------------------------------------
// Terms
// ---------------------------------------------------------------------------------------------------

export type TermSeason = "autumn" | "spring";

/** "2026-autumn" gives autumn 2026, for "Autumn term 2026". */
export function termParts(term: TermKey): { season: TermSeason; year: string } {
  const [year = "", season = "autumn"] = term.split("-");
  return { season: season === "spring" ? "spring" : "autumn", year };
}

/** The first day of a term, as WP 1.1's term_start(): 1 September or 1 February. */
export function termStartOf(term: TermKey): string {
  const { season, year } = termParts(term);
  return season === "autumn" ? `${year}-09-01` : `${year}-02-01`;
}

/** The terms that have run exams, newest first, each once. */
export function termOptions(rows: readonly TermRow[]): TermRow[] {
  const byTerm = new Map<string, TermRow>();
  for (const row of rows) byTerm.set(row.term, row);
  return [...byTerm.values()].sort((a, b) => b.term_start.localeCompare(a.term_start));
}

/**
 * The term A.1 shows: the one in the address when it has run exams, else the current term when it has,
 * else the newest that has; with no exams at all, the current term (and empty cards).
 */
export function chooseTerm(requested: unknown, options: readonly TermRow[], nowMs: number): TermKey {
  const known = (term: unknown) => options.some((option) => option.term === term);
  const asked = TermKey.safeParse(requested);
  if (asked.success && known(asked.data)) return asked.data;
  const current = termKey(nowMs);
  if (known(current)) return current;
  return options[0]?.term ?? current;
}

// ---------------------------------------------------------------------------------------------------
// Days and weeks
// ---------------------------------------------------------------------------------------------------

const DAY_MS = 86_400_000;

function dayNumber(day: string): number {
  return Math.round(Date.parse(`${day}T00:00:00Z`) / DAY_MS);
}

function dayOf(number: number): string {
  return new Date(number * DAY_MS).toISOString().slice(0, 10);
}

/** "2026-09-01" plus 7 days. */
export function addDays(day: string, days: number): string {
  return dayOf(dayNumber(day) + days);
}

/** A day as a UTC noon instant, so formatting it in Asia/Almaty never moves it to another date. */
export function dayInstant(day: string): Date {
  return new Date(`${day}T12:00:00Z`);
}

// ---------------------------------------------------------------------------------------------------
// Flags per 100 sessions
// ---------------------------------------------------------------------------------------------------

/** Flags per 100 sessions to one decimal, as the view rounds it; null without sessions. */
export function ratePer100(flags: number, sessions: number): number | null {
  if (sessions <= 0) return null;
  return Math.round((flags * 1000) / sessions) / 10;
}

export type WeekPoint = { week: string; sessions: number; flags: number; rate: number | null };

/**
 * One point per week from the term's first week with sessions to its last, with the weeks between them
 * that had none as gaps (rate null), so the bars keep the calendar's spacing.
 */
export function weeklySeries(rows: readonly WeeklyFlagsRow[]): WeekPoint[] {
  const byWeek = new Map(rows.filter((row) => row.sessions > 0).map((row) => [row.week_start, row]));
  const weeks = [...byWeek.keys()].sort();
  const first = weeks[0];
  const last = weeks[weeks.length - 1];
  if (first === undefined || last === undefined) return [];
  const points: WeekPoint[] = [];
  for (let week = first; week <= last; week = addDays(week, 7)) {
    const row = byWeek.get(week);
    points.push({
      week,
      sessions: row?.sessions ?? 0,
      flags: row?.flags ?? 0,
      rate: row ? (row.flags_per_100 ?? ratePer100(row.flags, row.sessions)) : null,
    });
  }
  return points;
}

/** The first four weeks of a term (1 to 28 September, or February): the "in Sep" of the tile. */
export const FIRST_MONTH_WEEKS = 4;

export type RateTile =
  | { value: null }
  | { value: number; caption: { kind: "week"; week: string } }
  | {
      value: number;
      caption: { kind: "down" | "up" | "same"; from: number; month: "sep" | "feb" };
    };

/**
 * FLAGS PER 100 (A.1): the latest week's rate, "down from 10.5 in Sep" against the term's first four
 * weeks taken together (flags over sessions). While the latest week is one of those, it reads
 * "week of 6 Oct" instead.
 */
export function rateTile(series: readonly WeekPoint[], term: TermKey): RateTile {
  const latest = [...series].reverse().find((point) => point.rate !== null);
  if (!latest || latest.rate === null) return { value: null };
  const start = termStartOf(term);
  const monthEnd = addDays(start, FIRST_MONTH_WEEKS * 7);
  if (latest.week < monthEnd) return { value: latest.rate, caption: { kind: "week", week: latest.week } };
  const firstMonth = series.filter((point) => point.week >= start && point.week < monthEnd);
  const from = ratePer100(
    firstMonth.reduce((sum, point) => sum + point.flags, 0),
    firstMonth.reduce((sum, point) => sum + point.sessions, 0),
  );
  if (from === null) return { value: latest.rate, caption: { kind: "week", week: latest.week } };
  const kind = latest.rate < from ? "down" : latest.rate > from ? "up" : "same";
  const month = termParts(term).season === "autumn" ? "sep" : "feb";
  return { value: latest.rate, caption: { kind, from, month } };
}

export type Trend = "down" | "up" | "flat";

export function trend(first: number, last: number): Trend {
  if (last < first) return "down";
  if (last > first) return "up";
  return "flat";
}

/** The weekly card's headline: from the first week's rate to the latest over the weeks shown. */
export type WeeklyHeadline =
  | { kind: "empty" }
  | { kind: "single"; last: number; week: string }
  | { kind: Trend; first: number; last: number; weeks: number };

export function weeklyHeadline(series: readonly WeekPoint[]): WeeklyHeadline {
  const rated = series.filter((point) => point.rate !== null);
  const first = rated[0];
  const last = rated[rated.length - 1];
  if (!first || !last || first.rate === null || last.rate === null) return { kind: "empty" };
  if (rated.length === 1) return { kind: "single", last: last.rate, week: last.week };
  return { kind: trend(first.rate, last.rate), first: first.rate, last: last.rate, weeks: series.length };
}

// ---------------------------------------------------------------------------------------------------
// What gets flagged
// ---------------------------------------------------------------------------------------------------

/** A.1's six flag types, plus Other for the flags no type of A.1 names (ended by the proctor and the like). */
export const FLAG_GROUPS = [
  "looked_away",
  "phone",
  "tab_or_site",
  "no_face",
  "second_face",
  "camera_lost",
  "other",
] as const;
export type FlagGroup = (typeof FLAG_GROUPS)[number];

const GROUP_OF: Readonly<Record<string, FlagGroup>> = {
  "gaze.off_screen": "looked_away",
  "gaze.down": "looked_away",
  "phone.detected": "phone",
  "tab.blocked": "tab_or_site",
  "face.missing": "no_face",
  "face.second": "second_face",
  "camera.lost": "camera_lost",
};

export function flagGroup(type: string): FlagGroup {
  return GROUP_OF[type] ?? "other";
}

export type FlagShare = { group: FlagGroup; flags: number; share: number };

/** Flags per type, grouped as A.1 names them, most first, with whole percentages that add up to 100. */
export function flagShares(rows: readonly FlagTypeRow[]): FlagShare[] {
  const totals = new Map<FlagGroup, number>();
  for (const row of rows) {
    const group = flagGroup(row.type);
    totals.set(group, (totals.get(group) ?? 0) + row.flags);
  }
  const groups = FLAG_GROUPS.filter((group) => (totals.get(group) ?? 0) > 0).sort(
    (a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0) || FLAG_GROUPS.indexOf(a) - FLAG_GROUPS.indexOf(b),
  );
  const counts = groups.map((group) => totals.get(group) ?? 0);
  const percents = shares(counts);
  return groups.map((group, index) => ({ group, flags: counts[index] ?? 0, share: percents[index] ?? 0 }));
}

/** How big the top type is, for "almost half": over 50, exactly 50, 40 to 49, or less. */
export type ShareSize = "majority" | "half" | "almost" | "lead";

export function shareSize(share: number): ShareSize {
  if (share > 50) return "majority";
  if (share === 50) return "half";
  if (share >= 40) return "almost";
  return "lead";
}

// ---------------------------------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------------------------------

export type DecisionPart = { key: Decision | "pending"; count: number; share: number };

export type DecisionSummary = {
  /** Flagged sessions of the term (the card's overline). */
  flagged: number;
  /** No issue, talk and committee, then the flagged sessions still waiting for one, when there are any. */
  parts: DecisionPart[];
  /** The most common decision, for the headline; null before the first decision. */
  top: Decision | null;
};

/**
 * DECISIONS · 298 FLAGGED SESSIONS: each decision's share of the term's flagged sessions. Sessions with
 * a flag and no decision yet are their own part, so the parts always add up to the overline.
 */
export function decisionSummary(rows: readonly DecisionRow[], flaggedSessions: number): DecisionSummary {
  const counts = DECISIONS.map((decision) =>
    rows.filter((row) => row.decision === decision).reduce((sum, row) => sum + row.sessions, 0),
  );
  const decided = counts.reduce((sum, count) => sum + count, 0);
  const flagged = Math.max(flaggedSessions, decided);
  const pending = flagged - decided;
  const values = pending > 0 ? [...counts, pending] : counts;
  const percents = shares(values);
  const parts: DecisionPart[] = DECISIONS.map((key, index) => ({
    key,
    count: counts[index] ?? 0,
    share: percents[index] ?? 0,
  }));
  if (pending > 0) parts.push({ key: "pending", count: pending, share: percents[DECISIONS.length] ?? 0 });
  let top: Decision | null = null;
  let topCount = 0;
  for (const [index, decision] of DECISIONS.entries()) {
    const count = counts[index] ?? 0;
    if (count > topCount) {
      top = decision;
      topCount = count;
    }
  }
  return { flagged, parts, top };
}

// ---------------------------------------------------------------------------------------------------
// Median review time
// ---------------------------------------------------------------------------------------------------

export type ReviewPoint = { week: string; seconds: number; decisions: number };

/** The weeks with a median review time, in order. */
export function reviewSeries(rows: readonly ReviewTimeRow[]): ReviewPoint[] {
  return rows
    .flatMap((row) =>
      row.median_review_s === null || row.decisions === 0
        ? []
        : [{ week: row.week_start, seconds: row.median_review_s, decisions: row.decisions }],
    )
    .sort((a, b) => a.week.localeCompare(b.week));
}

export type ReviewHeadline =
  | { kind: "empty" }
  | { kind: "same"; last: number }
  | { kind: "faster" | "slower"; first: number; last: number };

/** "Reviews got faster: 2:30 → 1:40", from the first week's median to the latest. */
export function reviewHeadline(series: readonly ReviewPoint[]): ReviewHeadline {
  const first = series[0];
  const last = series[series.length - 1];
  if (!first || !last) return { kind: "empty" };
  if (series.length === 1 || minutesOf(first.seconds) === minutesOf(last.seconds)) {
    return { kind: "same", last: last.seconds };
  }
  return {
    kind: last.seconds < first.seconds ? "faster" : "slower",
    first: first.seconds,
    last: last.seconds,
  };
}

function minutesOf(seconds: number): number {
  return Math.round(seconds / 60);
}

/**
 * A review time as hours and minutes, "2:30": WP 1.1 measures it from the exam's end to the decision,
 * so it runs in hours. Rounded to the minute.
 */
export function formatReviewTime(seconds: number): string {
  const minutes = minutesOf(Math.max(0, seconds));
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------------------------------
// The tiles
// ---------------------------------------------------------------------------------------------------

export const EMPTY_KPIS: Omit<TermKpiRow, "term" | "term_start"> = {
  exams_run: 0,
  sessions: 0,
  flags: 0,
  flagged_sessions: 0,
  decisions: 0,
  committee: 0,
};

/** TO COMMITTEE: the share of the term's sessions sent to the committee, 0 to 1; null without sessions. */
export function committeeShare(committee: number, sessions: number): number | null {
  return sessions > 0 ? committee / sessions : null;
}
