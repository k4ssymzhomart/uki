// A.1's term as the frame draws it (Figma 102:10454), as the term_* views return it: six weeks from
// 1 September at 11.6 down to 8.4 flags per 100 sessions, 485 flags in six types, 298 flagged sessions
// decided 214, 61 and 23, and a median review time from 2:30 down to 1:40. Shared by the model, view and
// Russian tests.
import type { ReportsData } from "./reports-data.ts";
import type { FlagTypeRow, ReviewTimeRow, WeeklyFlagsRow } from "./reports-model.ts";

export const MATH = "a1000000-0000-4000-8000-000000000001";
export const PHYSICS = "a1000000-0000-4000-8000-000000000002";
export const FACULTIES = [
  { id: MATH, name: "Faculty of Mathematics" },
  { id: PHYSICS, name: "Faculty of Physics" },
] as const;

const WEEKS = ["2026-09-01", "2026-09-08", "2026-09-15", "2026-09-22", "2026-09-29", "2026-10-06"] as const;
const SESSIONS = [820, 818, 819, 818, 819, 818] as const;
const FLAGS = [95, 88, 83, 77, 73, 69] as const;
const RATES = [11.6, 10.8, 10.1, 9.4, 8.9, 8.4] as const;
const MEDIANS = [9000, 7800, 7500, 6900, 6300, 6000] as const;

export const WEEKLY: WeeklyFlagsRow[] = WEEKS.map((week_start, index) => ({
  week_start,
  sessions: SESSIONS[index] ?? 0,
  flags: FLAGS[index] ?? 0,
  flags_per_100: RATES[index] ?? null,
}));

export const TYPES: FlagTypeRow[] = [
  { type: "gaze.off_screen", flags: 223 },
  { type: "phone.detected", flags: 87 },
  { type: "tab.blocked", flags: 68 },
  { type: "face.missing", flags: 58 },
  { type: "face.second", flags: 29 },
  { type: "camera.lost", flags: 20 },
];

export const REVIEW_TIMES: ReviewTimeRow[] = WEEKS.map((week_start, index) => ({
  week_start,
  decisions: 50,
  median_review_s: MEDIANS[index] ?? null,
}));

export const FRAME_DATA: ReportsData = {
  terms: [
    { term: "2026-autumn", term_start: "2026-09-01" },
    { term: "2026-spring", term_start: "2026-02-01" },
  ],
  term: "2026-autumn",
  kpis: {
    exams_run: 38,
    sessions: 4912,
    flags: 485,
    flagged_sessions: 298,
    decisions: 298,
    committee: 23,
  },
  weekly: WEEKLY,
  types: TYPES,
  decisions: [
    { decision: "no_issue", sessions: 214 },
    { decision: "talk", sessions: 61 },
    { decision: "committee", sessions: 23 },
  ],
  reviewTimes: REVIEW_TIMES,
};

/** A term with no exams yet: every view empty. */
export const EMPTY_DATA: ReportsData = {
  terms: [],
  term: "2027-spring",
  kpis: { exams_run: 0, sessions: 0, flags: 0, flagged_sessions: 0, decisions: 0, committee: 0 },
  weekly: [],
  types: [],
  decisions: [],
  reviewTimes: [],
};
