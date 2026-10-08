// Seed v2's "Autumn 2026" term (docs/phase-1-plan.md, "Seed v2"): 42 past exams in three faculties from
// 1 September to 7 October 2026, with rosters, sessions, flags, decisions and review times, generated
// from a fixed random seed. A.1 (Figma 102:10454) shows the term for the Faculty of Mathematics, and its
// numbers are built in: the Mathematics exams are tuned so the term_* views (WP 1.1) return exactly the
// frame's figures. Physics and History add two exams each with figures of the same kind.
//
// The tuning is solved by hand once and kept as constants (MATH_WEEKS, MATH_FLAG_TYPES, MATH_DECISIONS):
// each week's sessions and flags round to the frame's rate, September's four weeks round to 10.5, the
// flag types and decisions round to the frame's shares. The random seed then decides who is absent, who
// is flagged, which flag is which, the decisions and the review times; term.test.ts pins the result.
import type { EventType, Locale } from "../../../packages/contracts/src/index.ts";
import { createRng, type Rng } from "../sim/rng.ts";
import {
  type FacultyKey,
  GROUPS,
  type GroupSeed,
  PEOPLE,
  phase0Students,
  type StudentSeed,
  v2Students,
} from "./world.ts";

export const TERM_SEED = 20_260_901;
export const TERM_KEY = "2026-autumn";
export const TERM_START = "2026-09-01";

/** The frame's figures (A.1, Faculty of Mathematics, Autumn term 2026, all exams). */
export const A1_FRAME = {
  examsRun: 38,
  firstDay: "2026-09-01",
  sessions: 4912,
  flagsPer100Latest: 8.4,
  flagsPer100September: 10.5,
  committee: 23,
  committeePercent: 0.5,
  weekly: [
    { week: "2026-09-01", rate: 11.6 },
    { week: "2026-09-08", rate: 10.8 },
    { week: "2026-09-15", rate: 10.1 },
    { week: "2026-09-22", rate: 9.4 },
    { week: "2026-09-29", rate: 8.9 },
    { week: "2026-10-06", rate: 8.4 },
  ],
  flagShares: { looked_away: 46, phone: 18, tab_or_site: 14, no_face: 12, second_face: 6, camera_lost: 4 },
  flaggedSessions: 298,
  decisions: { no_issue: 214, talk: 61, committee: 23 },
  decisionShares: { no_issue: 72, talk: 20, committee: 8 },
  /** Median review time per week, "2:30" to "1:40" (hours and minutes), in seconds. */
  medianReviewS: [9000, 7800, 7500, 6900, 6300, 6000],
} as const;

/** Per week of the Mathematics faculty: sessions, flags and flagged sessions that give the frame's rates. */
export const MATH_WEEKS = [
  { week: "2026-09-01", sessions: 956, flags: 111, flagged: 67 },
  { week: "2026-09-08", sessions: 925, flags: 100, flagged: 60 },
  { week: "2026-09-15", sessions: 940, flags: 95, flagged: 57 },
  { week: "2026-09-22", sessions: 925, flags: 87, flagged: 52 },
  { week: "2026-09-29", sessions: 809, flags: 72, flagged: 44 },
  { week: "2026-10-06", sessions: 357, flags: 30, flagged: 18 },
] as const;

/** The Mathematics faculty's 495 flags by type: A.1's six groups at 46, 18, 14, 12, 6 and 4 per cent. */
export const MATH_FLAG_TYPES: Readonly<Partial<Record<EventType, number>>> = {
  "gaze.off_screen": 170,
  "gaze.down": 58,
  "phone.detected": 89,
  "tab.blocked": 69,
  "face.missing": 59,
  "face.second": 30,
  "camera.lost": 20,
};

export const MATH_DECISIONS = { committee: 23, talk: 61, no_issue: 214 } as const;

export type Decision = "no_issue" | "talk" | "committee";
/** Seeded staff who decided the term's flags (scripts/seed-staff.ts), by first name. */
export type Reviewer = "dana" | "aigerim" | "nurlan" | "gulnara";

export interface TermExam {
  index: number;
  id: string;
  faculty: FacultyKey;
  title: string;
  course: string;
  kind: string;
  groups: string[];
  /** UTC ISO time; the exams start on whole Almaty hours. */
  startsAt: string;
  durationMin: number;
  /** The Almaty day and the term week it falls in (term_exams.day and week_start). */
  day: string;
  week: string;
}

export interface TermRosterRow {
  examId: string;
  studentId: string;
  seat: number;
}

export interface TermSession {
  id: string;
  examId: string;
  studentId: string;
  number: string;
  authUid: string;
  state: "submitted" | "time_up";
  locale: Locale;
  os: "windows" | "macos";
  identityScore: number;
  joinedAt: string;
  rulesAcceptedAt: string;
  startedAt: string;
  submittedAt: string;
  timeUsedS: number;
  receiptId: string;
}

export interface TermEvent {
  id: string;
  sessionId: string;
  examId: string;
  type: EventType;
  source: "app";
  seq: number;
  at: string;
  receivedAt: string;
  data: Record<string, unknown>;
}

export interface TermDecision {
  sessionId: string;
  examId: string;
  decision: Decision;
  note: string | null;
  reviewer: Reviewer;
  decidedAt: string;
}

export interface TermPlan {
  exams: TermExam[];
  roster: TermRosterRow[];
  /** Who missed each exam, by student number (seed.sql lists them; everyone else wrote). */
  absent: { examIndex: number; numbers: string[] }[];
  sessions: TermSession[];
  events: TermEvent[];
  decisions: TermDecision[];
}

// ---------------------------------------------------------------------------------------------------
// Ids: fixed, in the UUID v4 layout the contracts accept, under prefixes Phase 0's seed does not use.
// ---------------------------------------------------------------------------------------------------

const pad2 = (n: number) => String(n).padStart(2, "0");
const pad12 = (value: string | number) => String(value).padStart(12, "0");

export function termExamId(index: number): string {
  return `e0000000-0000-4000-8100-${pad12(pad2(index))}`;
}
export function termSessionId(index: number, number: string): string {
  return `d1000000-0000-4000-81${pad2(index)}-${pad12(number)}`;
}
function termAuthUid(index: number, number: string): string {
  return `f1000000-0000-4000-81${pad2(index)}-${pad12(number)}`;
}
function termEventId(index: number, k: number): string {
  return `e1100000-0000-4000-81${pad2(index)}-${pad12(k)}`;
}

/** True for every id seed v2's term uses for an exam. */
export function isTermExamId(id: string): boolean {
  return id.startsWith("e0000000-0000-4000-8100-");
}

// ---------------------------------------------------------------------------------------------------
// The schedule
// ---------------------------------------------------------------------------------------------------

const MATH_COURSES = [
  "Mathematical Analysis 3",
  "Linear Algebra",
  "Discrete Mathematics",
  "Probability Theory",
  "Differential Equations",
  "Programming in Python",
  "Analytic Geometry",
  "Numerical Methods",
] as const;
const MATH_KINDS = ["Quiz 1", "Quiz 1", "Test", "Quiz 2", "Colloquium", "Quiz 2"] as const;
const OTHER_GROUPS = ["201", "202", "203", "205", "206", "207", "208"] as const;
/** Group 204 (Mathematics 2's group) has its own five, ending two days before the Midterm. */
const COURSES_204: Readonly<Record<number, [string, string]>> = {
  0: ["Mathematics 2", "Quiz 1"],
  1: ["Linear Algebra", "Quiz 1"],
  2: ["Discrete Mathematics", "Test"],
  3: ["Probability Theory", "Quiz 1"],
  5: ["Mathematics 2", "Quiz 2"],
};

/** [groups, day offset from the week's Tuesday, Almaty start] per Mathematics exam, by week. */
const MATH_SCHEDULE: readonly (readonly [readonly string[], number, string])[][] = [
  [
    [["201", "202"], 0, "10:00"],
    [["204"], 1, "10:00"],
    [["203"], 1, "14:00"],
    [["205"], 2, "10:00"],
    [["206"], 2, "14:00"],
    [["207"], 3, "10:00"],
    [["208"], 6, "10:00"],
  ],
  [
    [["201"], 0, "10:00"],
    [["202"], 0, "14:00"],
    [["203", "205"], 1, "10:00"],
    [["204"], 2, "10:00"],
    [["206"], 2, "14:00"],
    [["207"], 3, "10:00"],
    [["208"], 6, "10:00"],
  ],
  [
    [["201"], 0, "10:00"],
    [["202"], 0, "14:00"],
    [["203"], 1, "10:00"],
    [["204"], 1, "14:00"],
    [["205"], 2, "10:00"],
    [["206", "207"], 3, "10:00"],
    [["208"], 6, "10:00"],
  ],
  [
    [["201", "208"], 0, "10:00"],
    [["202"], 1, "10:00"],
    [["203"], 1, "14:00"],
    [["204"], 2, "10:00"],
    [["205"], 2, "14:00"],
    [["206"], 3, "10:00"],
    [["207"], 6, "10:00"],
  ],
  [
    [["201"], 0, "10:00"],
    [["202"], 0, "14:00"],
    [["203"], 1, "10:00"],
    [["205"], 1, "14:00"],
    [["206"], 2, "10:00"],
    [["207"], 3, "10:00"],
    [["208"], 6, "10:00"],
  ],
  [
    [["201"], 0, "10:00"],
    [["202"], 0, "14:00"],
    [["204"], 1, "10:00"],
  ],
];

const DAY_MS = 86_400_000;

export function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** An Almaty wall-clock time (UTC+5 all year since 2024) as a UTC ISO string. */
export function almatyIso(day: string, time: string): string {
  return new Date(`${day}T${time}:00+05:00`).toISOString();
}

function durationOf(kind: string): number {
  return kind.startsWith("Quiz") ? 40 : 60;
}

function makeExam(
  index: number,
  faculty: FacultyKey,
  course: string,
  kind: string,
  groups: string[],
  day: string,
  time: string,
  week: string,
): TermExam {
  return {
    index,
    id: termExamId(index),
    faculty,
    title: `${course} · ${kind}`,
    course,
    kind,
    groups,
    startsAt: almatyIso(day, time),
    durationMin: durationOf(kind),
    day,
    week,
  };
}

/** The 38 Mathematics exams (indexes 1 to 38), then Physics (39, 40) and History (41, 42). */
export function termExams(): TermExam[] {
  const exams: TermExam[] = [];
  let index = 0;
  MATH_SCHEDULE.forEach((week, w) => {
    const weekStart = addDays(TERM_START, w * 7);
    for (const [groups, offset, time] of week) {
      index += 1;
      const first = groups[0] ?? "";
      const [course, kind] =
        first === "204"
          ? (COURSES_204[w] ?? ["Mathematics 2", "Quiz"])
          : [
              MATH_COURSES[(OTHER_GROUPS.indexOf(first as (typeof OTHER_GROUPS)[number]) + w) % 8] ?? "",
              MATH_KINDS[w] ?? "Quiz",
            ];
      exams.push(
        makeExam(
          index,
          "mathematics",
          course,
          kind,
          [...groups],
          addDays(weekStart, offset),
          time,
          weekStart,
        ),
      );
    }
  });
  const other: [FacultyKey, string, string, string[], string, string][] = [
    ["physics", "Physics 1", "Quiz 1", ["101", "102", "103"], "2026-09-10", "10:00"],
    ["physics", "Physics 1", "Quiz 2", ["101", "102", "103"], "2026-09-24", "10:00"],
    ["history", "History of Kazakhstan", "Quiz 1", ["110"], "2026-09-15", "11:00"],
    ["history", "History of Kazakhstan", "Quiz 2", ["110"], "2026-09-29", "11:00"],
  ];
  for (const [faculty, course, kind, groups, day, time] of other) {
    index += 1;
    const days = Math.round((Date.parse(day) - Date.parse(TERM_START)) / DAY_MS);
    exams.push(
      makeExam(index, faculty, course, kind, groups, day, time, addDays(TERM_START, days - (days % 7))),
    );
  }
  return exams;
}

// ---------------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------------

function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng.next() * (i + 1));
    const a = out[i] as T;
    out[i] = out[j] as T;
    out[j] = a;
  }
  return out;
}

/** Splits `total` over `weights` in whole numbers by largest remainder (ties to the earlier one). */
export function apportion(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (total * w) / sum);
  const out = exact.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = exact
    .map((value, index) => ({ index, rest: value - Math.floor(value) }))
    .sort((a, b) => b.rest - a.rest || a.index - b.index);
  for (const { index } of order) {
    if (left <= 0) break;
    out[index] = (out[index] ?? 0) + 1;
    left -= 1;
  }
  return out;
}

const iso = (ms: number) => new Date(ms).toISOString();
const round2 = (value: number) => Math.round(value * 100) / 100;

/** make_receipt_id's shape: UKI-<group>-<4 digits>-<initials>. */
function receiptInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  const initial = (word: string | undefined) => {
    const letter = (word ?? "").slice(0, 1).toUpperCase();
    return /^[A-Z]$/.test(letter) ? letter : "X";
  };
  return initial(words[0]) + initial(words[words.length - 1]);
}

/** Where each flag type's data comes from on the laptop (packages/contracts EVENT_DATA). */
function flagData(type: EventType, rng: Rng): Record<string, unknown> {
  switch (type) {
    case "gaze.off_screen":
      return { duration_ms: rng.int(2100, 6400), direction: rng.pick(["left", "right", "up"] as const) };
    case "gaze.down":
      return { duration_ms: rng.int(2100, 5200) };
    case "phone.detected":
      return { score: round2(rng.between(0.86, 0.97)), held_ms: rng.int(800, 6000) };
    case "tab.blocked":
      return { app: rng.pick(["Telegram", "WhatsApp"] as const) };
    case "face.missing":
      return { duration_ms: rng.int(10_000, 42_000) };
    case "face.second":
      return { duration_ms: rng.int(2000, 8000), faces: 2 };
    case "camera.lost":
      return { reason: rng.pick(["ended", "muted", "error"] as const) };
    default:
      return {};
  }
}

const SEVERITY: Readonly<Partial<Record<EventType, number>>> = {
  "phone.detected": 3,
  "face.second": 3,
  "tab.blocked": 2,
  "camera.lost": 1,
  "face.missing": 1,
  "gaze.off_screen": 1,
  "gaze.down": 1,
};

const NOTES: Readonly<Record<Decision, readonly (string | null)[]>> = {
  no_issue: [null, null, null, "Looked at the ceiling while thinking.", "Glare on the camera."],
  talk: [
    "Talked after the exam; the phone was face down.",
    "Asked to keep the desk clear next time.",
    "Reminded about other apps during the exam.",
  ],
  committee: [
    "Phone in hand while answering; sent to the committee.",
    "A second person read out answers.",
    "Repeated phone use after a warning.",
  ],
};

/** `count` review times around `median` with that exact median (percentile_cont, then ::int). */
export function reviewTimes(count: number, median: number, rng: Rng): number[] {
  const values = Array.from({ length: count }, () => Math.round((median * rng.between(0.45, 2.2)) / 10) * 10);
  values.sort((a, b) => a - b);
  const mid = Math.floor(count / 2);
  const middle = count % 2 === 1 ? [mid] : [mid - 1, mid];
  for (const i of middle) values[i] = median;
  for (let i = 0; i < (middle[0] ?? 0); i += 1) values[i] = Math.min(values[i] ?? median, median);
  for (let i = (middle[middle.length - 1] ?? 0) + 1; i < count; i += 1) {
    values[i] = Math.max(values[i] ?? median, median);
  }
  return values;
}

// ---------------------------------------------------------------------------------------------------
// A term session's details: the same formulas as seed_v2.mix and the term sessions in supabase/seed.sql
// ---------------------------------------------------------------------------------------------------

const MIX_MOD = 2_147_483_647;

/**
 * A deterministic whole number in [0, 2^31 - 1) from three small whole numbers (a Lehmer step twice
 * over a linear mix). Every intermediate stays below 2^53, so Postgres' bigint gives the same value:
 * supabase/seed.sql's seed_v2.mix is this function.
 */
export function mix(a: number, b: number, salt: number): number {
  let h = (a * 73_856_093 + b * 19_349_663 + salt * 83_492_791) % MIX_MOD;
  h = (h * 48_271) % MIX_MOD;
  return (h * 48_271) % MIX_MOD;
}

/** The salts of mix() for each detail of a term session (seed.sql uses the same numbers). */
export const SALT = {
  joined: 1,
  rules: 2,
  started: 3,
  used: 4,
  os: 5,
  identity: 6,
  timeUp: 7,
} as const;

/** The receipt's four digits: distinct for every exam and place in the group, so never reused. */
export function receiptDigits(examIndex: number, groupPos: number): string {
  return String((((examIndex - 1) * 150 + groupPos) * 7919) % 10_000).padStart(4, "0");
}

/**
 * One student's session of a term exam, from the exam, the student number and the student's place in
 * their group (1 = lowest number): joined 4 to 14 minutes before the start, the rules 1 to 3 minutes
 * later, started within 50 s of the start, 55 % to all but a minute of the time used, 1 in 100 out of
 * time, 6 in 10 on Windows, an identity score from 0.70 to 0.96.
 */
export function termSession(
  exam: TermExam,
  student: Omit<StudentSeed, "programme" | "year">,
  groupPos: number,
): TermSession {
  const n = Number(student.number);
  const m = (salt: number) => mix(exam.index, n, salt);
  const start = Date.parse(exam.startsAt);
  const durationS = exam.durationMin * 60;
  const joined = start - (240 + (m(SALT.joined) % 601)) * 1000;
  const accepted = Math.min(joined + (60 + (m(SALT.rules) % 121)) * 1000, start - 30_000);
  const started = start + (m(SALT.started) % 51) * 1000;
  const timeUp = m(SALT.timeUp) % 100 === 0;
  const low = Math.floor((exam.durationMin * 55 + 50) / 100) * 60;
  const usedS = timeUp ? durationS : low + (m(SALT.used) % (durationS - 60 - low + 1));
  const submitted = timeUp ? start + durationS * 1000 : started + usedS * 1000;
  return {
    id: termSessionId(exam.index, student.number),
    examId: exam.id,
    studentId: student.id,
    number: student.number,
    authUid: termAuthUid(exam.index, student.number),
    state: timeUp ? "time_up" : "submitted",
    locale: student.locale,
    os: m(SALT.os) % 10 < 6 ? "windows" : "macos",
    identityScore: (70 + (m(SALT.identity) % 27)) / 100,
    joinedAt: iso(joined),
    rulesAcceptedAt: iso(accepted),
    startedAt: iso(started),
    submittedAt: iso(submitted),
    timeUsedS: usedS,
    receiptId: `UKI-${student.groupCode}-${receiptDigits(exam.index, groupPos)}-${receiptInitials(student.fullName)}`,
  };
}

// ---------------------------------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------------------------------

interface Built {
  exam: TermExam;
  sessions: TermSession[];
}

/** Students no term flag or absence touches: the demo's own stories. */
const PROTECTED = new Set<string>([PEOPLE.madina, PEOPLE.aliya, PEOPLE.deleteRequest]);

/**
 * Students who missed every term exam, so Phase 0's world stays as it was for them: History seats 7 and
 * 21 sat only the History of Kazakhstan · Test, and WP 1.12's pgTAP test counts their exams, events and
 * devices as Phase 0's seed made them. They count towards their exam's absences.
 */
const MISSED_TERM = new Set<string>(["20241007", "20241021"]);

function studentsByGroup(): Map<string, Omit<StudentSeed, "programme" | "year">[]> {
  const map = new Map<string, Omit<StudentSeed, "programme" | "year">[]>();
  for (const student of [...phase0Students(), ...v2Students()]) {
    const list = map.get(student.groupCode) ?? [];
    list.push(student);
    map.set(student.groupCode, list);
  }
  for (const list of map.values()) list.sort((a, b) => a.number.localeCompare(b.number));
  return map;
}

/** Builds the term from `seed`. Pure: the same seed gives the same plan, row for row. */
export function buildTermPlan(seed: number = TERM_SEED): TermPlan {
  const root = createRng(seed);
  const exams = termExams();
  const byGroup = studentsByGroup();
  const groupPos = new Map<string, number>();
  for (const list of byGroup.values()) {
    list.forEach((student, i) => {
      groupPos.set(student.number, i + 1);
    });
  }
  const roster: TermRosterRow[] = [];
  const rosterOf = new Map<string, Omit<StudentSeed, "programme" | "year">[]>();
  for (const exam of exams) {
    const students = exam.groups.flatMap((code) => byGroup.get(code) ?? []);
    rosterOf.set(exam.id, students);
    students.forEach((student, i) => {
      roster.push({ examId: exam.id, studentId: student.id, seat: i + 1 });
    });
  }

  // Absences: Mathematics per week to hit MATH_WEEKS' sessions, shared by roster size; others at 3 %.
  const absentCount = new Map<string, number>();
  MATH_WEEKS.forEach((target, w) => {
    const weekExams = exams.filter((exam) => exam.faculty === "mathematics" && exam.week === target.week);
    const sizes = weekExams.map((exam) => rosterOf.get(exam.id)?.length ?? 0);
    const absent = sizes.reduce((a, b) => a + b, 0) - target.sessions;
    if (absent < 0) throw new Error(`seed v2: week ${w + 1} has fewer students than sessions`);
    apportion(absent, sizes).forEach((count, i) => {
      const exam = weekExams[i];
      if (exam) absentCount.set(exam.id, count);
    });
  });
  for (const exam of exams.filter((row) => row.faculty !== "mathematics")) {
    absentCount.set(exam.id, Math.round((rosterOf.get(exam.id)?.length ?? 0) * 0.03));
  }

  const absent = new Map<number, string[]>();
  const built: Built[] = exams.map((exam) => {
    const rng = root.fork(`sessions:${exam.index}`);
    const students = rosterOf.get(exam.id) ?? [];
    const missed = students.filter((student) => MISSED_TERM.has(student.number));
    const absentees = [
      ...missed,
      ...shuffle(
        students.filter((student) => !PROTECTED.has(student.number) && !MISSED_TERM.has(student.number)),
        rng,
      ).slice(0, Math.max(0, (absentCount.get(exam.id) ?? 0) - missed.length)),
    ]
      .map((student) => student.number)
      .sort();
    absent.set(exam.index, absentees);
    const away = new Set(absentees);
    const sessions = students
      .filter((student) => !away.has(student.number))
      .map((student) => termSession(exam, student, groupPos.get(student.number) ?? 0));
    return { exam, sessions };
  });

  const events: TermEvent[] = [];
  const decisions: TermDecision[] = [];
  const eventCounter = new Map<number, number>();
  const nextEventId = (exam: TermExam) => {
    const k = (eventCounter.get(exam.index) ?? 0) + 1;
    eventCounter.set(exam.index, k);
    return termEventId(exam.index, k);
  };

  /** Writes `flags` (types in order) for one session at random times inside its attempt. */
  const writeFlags = (exam: TermExam, session: TermSession, types: EventType[], rng: Rng): TermEvent[] => {
    const start = Date.parse(session.startedAt);
    const latest = Date.parse(session.submittedAt) - 60_000;
    const times = types
      .map(() => start + rng.int(3 * 60, Math.max(3 * 60 + 1, Math.floor((latest - start) / 1000))) * 1000)
      .sort((a, b) => a - b);
    return types.map((type, i) => {
      const at = times[i] ?? start;
      return {
        id: nextEventId(exam),
        sessionId: session.id,
        examId: exam.id,
        type,
        source: "app" as const,
        seq: 10 * (i + 1),
        at: iso(at),
        receivedAt: iso(at + rng.int(1, 3) * 1000),
        data: flagData(type, rng),
      };
    });
  };

  // Mathematics: per week, the flagged sessions and their flag counts; then the types, shuffled once.
  const mathFlagged: { exam: TermExam; session: TermSession; count: number; week: number }[] = [];
  MATH_WEEKS.forEach((target, w) => {
    const rng = root.fork(`flags:week:${w}`);
    const pool = built
      .filter((entry) => entry.exam.faculty === "mathematics" && entry.exam.week === target.week)
      .flatMap((entry) =>
        entry.sessions
          .filter((session) => !PROTECTED.has(session.number))
          .map((session) => ({ exam: entry.exam, session })),
      );
    const chosen = shuffle(pool, rng).slice(0, target.flagged);
    const counts = chosen.map(() => 1);
    for (let extra = target.flags - target.flagged; extra > 0; extra -= 1) {
      const open = counts.map((count, i) => ({ count, i })).filter((entry) => entry.count < 4);
      const pick = open[Math.floor(rng.next() * open.length)];
      if (pick) counts[pick.i] = (counts[pick.i] ?? 0) + 1;
    }
    chosen
      .map((entry, i) => ({ ...entry, count: counts[i] ?? 1, week: w }))
      .sort((a, b) => a.exam.index - b.exam.index || a.session.number.localeCompare(b.session.number))
      .forEach((entry) => {
        mathFlagged.push(entry);
      });
  });
  const typeBag = shuffle(
    Object.entries(MATH_FLAG_TYPES).flatMap(([type, count]) =>
      Array.from({ length: count ?? 0 }, () => type as EventType),
    ),
    root.fork("flags:types"),
  );
  let taken = 0;
  const mathRng = root.fork("flags:times");
  const mathSessions = mathFlagged.map((entry) => {
    const types = typeBag.slice(taken, taken + entry.count);
    taken += entry.count;
    const written = writeFlags(entry.exam, entry.session, types, mathRng);
    events.push(...written);
    return { ...entry, flags: written };
  });

  // Mathematics decisions: the most serious sessions go to the committee, the next to a talk.
  const decideRng = root.fork("decisions:math");
  const ranked = mathSessions
    .map((entry) => ({
      entry,
      score:
        entry.flags.reduce((sum, flag) => sum + (SEVERITY[flag.type] ?? 1), 0) + decideRng.between(0, 2.5),
    }))
    .sort((a, b) => b.score - a.score);
  const decisionOf = new Map<string, Decision>();
  ranked.forEach(({ entry }, i) => {
    decisionOf.set(
      entry.session.id,
      i < MATH_DECISIONS.committee
        ? "committee"
        : i < MATH_DECISIONS.committee + MATH_DECISIONS.talk
          ? "talk"
          : "no_issue",
    );
  });
  MATH_WEEKS.forEach((_, w) => {
    const rng = root.fork(`review:math:${w}`);
    const week = mathSessions.filter((entry) => entry.week === w);
    const times = shuffle(reviewTimes(week.length, A1_FRAME.medianReviewS[w] ?? 7200, rng), rng);
    week.forEach((entry, i) => {
      const decision = decisionOf.get(entry.session.id) ?? "no_issue";
      const end = Date.parse(entry.exam.startsAt) + entry.exam.durationMin * 60_000;
      decisions.push({
        sessionId: entry.session.id,
        examId: entry.exam.id,
        decision,
        note: rng.pick(NOTES[decision]),
        reviewer: rng.chance(0.6) ? "aigerim" : "nurlan",
        decidedAt: iso(end + (times[i] ?? 7200) * 1000),
      });
    });
  });

  // Physics and History: about 7 in 100 sessions flagged, decided by Gulnara and Dana.
  const OTHER_TYPES: EventType[] = [
    "gaze.off_screen",
    "gaze.off_screen",
    "gaze.off_screen",
    "gaze.down",
    "phone.detected",
    "tab.blocked",
    "face.missing",
    "face.second",
    "camera.lost",
  ];
  for (const entry of built.filter((row) => row.exam.faculty !== "mathematics")) {
    const rng = root.fork(`other:${entry.exam.index}`);
    const pool = entry.sessions.filter((session) => !PROTECTED.has(session.number));
    const chosen = shuffle(pool, rng)
      .slice(0, Math.round(entry.sessions.length * 0.07))
      .sort((a, b) => a.number.localeCompare(b.number));
    const reviews = shuffle(reviewTimes(chosen.length, 7200, rng), rng);
    chosen.forEach((session, i) => {
      const types = Array.from({ length: rng.chance(0.3) ? 2 : 1 }, () => rng.pick(OTHER_TYPES));
      const written = writeFlags(entry.exam, session, types, rng);
      events.push(...written);
      const roll = rng.next();
      const decision: Decision = roll < 0.75 ? "no_issue" : roll < 0.93 ? "talk" : "committee";
      const end = Date.parse(entry.exam.startsAt) + entry.exam.durationMin * 60_000;
      decisions.push({
        sessionId: session.id,
        examId: entry.exam.id,
        decision,
        note: rng.pick(NOTES[decision]),
        reviewer: entry.exam.faculty === "physics" ? "gulnara" : "dana",
        decidedAt: iso(end + (reviews[i] ?? 7200) * 1000),
      });
    });
  }

  // The delete request's student (A.5a): two flags in History of Kazakhstan · Quiz 1 and one in Quiz 2,
  // each with a still (story.ts), so a privacy delete has frames and events from two exams to remove.
  const deleteRng = root.fork("delete-request");
  for (const [course, kind, types, decision, note, reviewS] of DELETE_STUDENT_FLAGS) {
    const entry = built.find((row) => row.exam.course === course && row.exam.kind === kind);
    const session = entry?.sessions.find((row) => row.number === PEOPLE.deleteRequest);
    if (!entry || !session)
      throw new Error(`seed v2: the delete request's student missed ${course} · ${kind}`);
    events.push(...writeFlags(entry.exam, session, [...types], deleteRng));
    const end = Date.parse(entry.exam.startsAt) + entry.exam.durationMin * 60_000;
    decisions.push({
      sessionId: session.id,
      examId: entry.exam.id,
      decision,
      note,
      reviewer: "dana",
      decidedAt: iso(end + reviewS * 1000),
    });
  }

  return {
    exams,
    roster,
    absent: [...absent].map(([examIndex, numbers]) => ({ examIndex, numbers })),
    sessions: built.flatMap((entry) => entry.sessions),
    events,
    decisions,
  };
}

/** The delete request's student's flags: course, kind, flag types, decision, note, review seconds. */
const DELETE_STUDENT_FLAGS: readonly (readonly [
  string,
  string,
  readonly EventType[],
  Decision,
  string | null,
  number,
])[] = [
  [
    "History of Kazakhstan",
    "Quiz 1",
    ["gaze.off_screen", "phone.detected"],
    "talk",
    "Talked after the exam; the phone was face down.",
    6600,
  ],
  ["History of Kazakhstan", "Quiz 2", ["gaze.down"], "no_issue", null, 5400],
];

/** The groups seed v2 needs in the database (Phase 0's and its own). */
export function termGroups(): readonly GroupSeed[] {
  return GROUPS;
}
