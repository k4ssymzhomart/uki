// The demo exams from "Demo script and seed data" in docs/phase-0-plan.md and the times `pnpm
// demo:reset` gives them. The seed (supabase/seed.sql) uses the same rules, so a fresh `db reset` and
// a `demo:reset` produce the same schedule.

export const DEMO_EXAMS = {
  /** Mathematics 2 · Midterm: app exam, starts in 15 minutes, lobby open from 20 minutes before. */
  math: { code: "MATH2-204-FRI", durationMin: 90, startsInMin: 15, lobbyLeadMin: 20, status: "scheduled" },
  /** Physics 1 · Quiz 3: browser exam that started 5 minutes ago, so it shows as live. */
  physics: { code: "PHYS1-102-FRI", durationMin: 40, startsInMin: -5, lobbyLeadMin: 20, status: "live" },
} as const;

export type DemoExamKey = keyof typeof DEMO_EXAMS;
export const DEMO_EXAM_CODES = Object.values(DEMO_EXAMS).map((exam) => exam.code);

/** The mock portal's quiz path; `exams.lms_url` is the portal's base URL plus this. */
export const PHYSICS_LMS_PATH = "/physics-1/quiz-3";
export const PHYSICS_LMS_DONE_PATH = "/physics-1/quiz-3/review";

export interface DemoSchedule {
  starts_at: string;
  lobby_opens_at: string;
  duration_min: number;
  status: "scheduled" | "live";
}

const MINUTE = 60_000;

/** The schedule of each demo exam for a server clock at `nowMs`, on whole minutes like the seed. */
export function demoSchedule(nowMs: number): Record<DemoExamKey, DemoSchedule> {
  const minute = Math.floor(nowMs / MINUTE) * MINUTE;
  const plan = (key: DemoExamKey): DemoSchedule => {
    const exam = DEMO_EXAMS[key];
    const startsAt = minute + exam.startsInMin * MINUTE;
    return {
      starts_at: new Date(startsAt).toISOString(),
      lobby_opens_at: new Date(startsAt - exam.lobbyLeadMin * MINUTE).toISOString(),
      duration_min: exam.durationMin,
      status: exam.status,
    };
  };
  return { math: plan("math"), physics: plan("physics") };
}

/** `exams.lms_url` for a portal base URL, by the seed's rule (a URL that already ends in the path is kept). */
export function physicsLmsUrl(base: string): string {
  if (base.endsWith(PHYSICS_LMS_PATH)) return base;
  return `${base.replace(/\/+$/, "")}${PHYSICS_LMS_PATH}`;
}
