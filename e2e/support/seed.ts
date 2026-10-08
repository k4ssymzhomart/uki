// The KRU world the smoke test relies on: supabase/seed.sql (exams, workspace) and
// scripts/seed-staff.ts (staff and their assignments). The global setup checks these against the
// database before any test runs.

export const KRU = {
  workspaceId: "a0000000-0000-4000-8000-000000000001",
  mathFacultyId: "a1000000-0000-4000-8000-000000000001",
} as const;

export interface SeededExam {
  id: string;
  title: string;
  code: string | null;
}

export const EXAMS = {
  math2: {
    id: "e0000000-0000-4000-8000-000000000001",
    title: "Mathematics 2 · Midterm",
    code: "MATH2-204-FRI",
  },
  physics1: {
    id: "e0000000-0000-4000-8000-000000000002",
    title: "Physics 1 · Quiz 3",
    code: "PHYS1-102-FRI",
  },
  history: { id: "e0000000-0000-4000-8000-000000000003", title: "History of Kazakhstan · Test", code: null },
  linearAlgebra: { id: "e0000000-0000-4000-8000-000000000004", title: "Linear Algebra · Final", code: null },
  english: { id: "e0000000-0000-4000-8000-000000000005", title: "English B2 · Reading", code: null },
} as const satisfies Record<string, SeededExam>;

export const ALL_EXAMS: readonly SeededExam[] = Object.values(EXAMS);

export const STAFF = {
  /** Exam office, Faculty of Mathematics: sees every exam of the workspace. */
  dana: "dana.akhmetova@kru.test",
  /** Lead proctor of Mathematics 2. */
  aigerim: "aigerim.sadykova@kru.test",
  /** Lead proctor of Physics 1 only. */
  gulnara: "gulnara.kassenova@kru.test",
  /** Proctor of Mathematics 2, seats 65 to 128, not lead (0.9, WP 1.5). */
  nurlan: "nurlan.bekov@kru.test",
} as const;
export type StaffKey = keyof typeof STAFF;
