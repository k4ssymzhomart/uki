// Rows for the A.2, A.3 and A.4 component tests and their Russian render test, shaped as the views get
// them from the server: the A.2 frame's students, and Madina's profile with one exam per state.
import { DEFAULT_WORKSPACE_SETTINGS } from "@uki/contracts";
import type { StudentProfileData } from "./students-data.ts";
import { parseStudentRows, type StudentRow } from "./students-model.ts";

export const G204 = "a2000000-0000-4000-8000-000000000204";
export const G102 = "a2000000-0000-4000-8000-000000000102";
const MATH = "a1000000-0000-4000-8000-000000000001";
const PHYS = "a1000000-0000-4000-8000-000000000002";
export const WORKSPACE = "a0000000-0000-4000-8000-000000000001";

export const studentId = (number: string) => `b0000000-0000-4000-8000-0000${number}`;

function row(number: string, fullName: string, patch: Partial<StudentRow> = {}) {
  return {
    id: studentId(number),
    student_number: number,
    full_name: fullName,
    group_id: G204,
    group_code: "204",
    faculty_id: MATH,
    programme: "Mathematics",
    year: 2,
    exams_taken: 6,
    flags: 0,
    sessions_in_review: 0,
    last_exam_id: "e0000000-0000-4000-8000-000000000001",
    last_exam_title: "Mathematics 2 · Midterm",
    last_exam_at: "2026-10-09T05:00:00+00:00",
    latest_decision: null,
    ...patch,
  };
}

/** The seven students A.2 draws. */
export const STUDENTS: StudentRow[] = parseStudentRows([
  row("20231187", "Madina Tulegenova", { flags: 3, latest_decision: "talk" }),
  row("20230912", "Arman Bekzhanov", { flags: 2, sessions_in_review: 1 }),
  row("20231044", "Dias Kenzhebekov", { exams_taken: 5, flags: 3, latest_decision: "no_issue" }),
  row("20231377", "Timur Nurlanov", { exams_taken: 4, flags: 1, sessions_in_review: 1 }),
  row("20231302", "Zhansaya Omarova", {
    exams_taken: 3,
    flags: 1,
    latest_decision: "no_issue",
    programme: null,
    year: null,
  }),
  row("20231219", "Aruzhan Kassymova"),
  row("20231451", "Aliya Seitkali", {
    group_id: G102,
    group_code: "102",
    faculty_id: PHYS,
    programme: "Physics",
    year: 1,
    exams_taken: 3,
    last_exam_title: "Physics 1 · Quiz 3",
    last_exam_at: "2026-10-08T09:00:00+00:00",
  }),
]);

/** This term's flagged students: the five with flags. */
export const FLAGGED = STUDENTS.filter((student) => student.flags > 0).map((student) => student.id);

const MADINA = STUDENTS[0] as StudentRow;
const sessionId = (n: number) => `5e000000-0000-4000-8000-00000000000${n}`;

/** Madina's A.3: a flagged midterm decided "talk", a clear reading test and a quiz still in review. */
export const MADINA_PROFILE: StudentProfileData = {
  student: { ...MADINA, locale: "kk" },
  sessions: [
    {
      id: sessionId(1),
      exam_id: "e0000000-0000-4000-8000-000000000001",
      state: "submitted",
      joined_at: "2026-10-09T04:40:00+00:00",
      last_seen_at: "2026-10-09T06:27:00+00:00",
      time_used_s: 87 * 60,
      device: { os: "macos", app_version: "0.1.0" },
      rules_accepted_at: "2026-10-09T04:58:00+00:00",
      rules_locale: "kk",
      exams: {
        title: "Mathematics 2 · Midterm",
        course: "Mathematics 2",
        starts_at: "2026-10-09T05:00:00+00:00",
        duration_min: 90,
      },
    },
    {
      id: sessionId(2),
      exam_id: "e0000000-0000-4000-8000-000000000005",
      state: "submitted",
      joined_at: "2026-10-03T09:50:00+00:00",
      last_seen_at: "2026-10-03T10:48:00+00:00",
      time_used_s: 48 * 60,
      device: { os: "windows", app_version: "0.1.0", browser: "Chrome", lock_version: "0.1.0" },
      rules_accepted_at: "2026-10-03T09:55:00+00:00",
      rules_locale: "ru",
      exams: {
        title: "English B2 · Reading",
        course: "English B2",
        starts_at: "2026-10-03T10:00:00+00:00",
        duration_min: 50,
      },
    },
    {
      id: sessionId(3),
      exam_id: "e0000000-0000-4000-8000-000000000006",
      state: "time_up",
      joined_at: "2026-09-24T03:50:00+00:00",
      last_seen_at: "2026-09-24T04:40:00+00:00",
      time_used_s: 0,
      device: { os: "macos", app_version: "0.1.0" },
      rules_accepted_at: null,
      rules_locale: null,
      exams: {
        title: "Linear Algebra · Quiz 1",
        course: "Linear Algebra",
        starts_at: "2026-09-24T04:00:00+00:00",
        duration_min: 40,
      },
    },
  ],
  flags: [
    { session_id: sessionId(1), received_at: "2026-10-09T05:20:00+00:00" },
    { session_id: sessionId(1), received_at: "2026-10-09T05:30:00+00:00" },
    { session_id: sessionId(1), received_at: "2026-10-09T05:40:00+00:00" },
    { session_id: sessionId(3), received_at: "2026-09-24T04:10:00+00:00" },
  ],
  decisions: [{ session_id: sessionId(1), decision: "talk", decided_at: "2026-10-09T08:00:00+00:00" }],
  frames: [
    { session_id: sessionId(1), captured_at: "2026-10-09T05:20:00+00:00" },
    { session_id: sessionId(1), captured_at: "2026-10-09T05:30:00+00:00" },
    { session_id: sessionId(1), captured_at: "2026-10-09T05:40:00+00:00" },
    { session_id: sessionId(3), captured_at: "2026-09-24T04:10:00+00:00" },
  ],
  retentionDays: 90,
};

export const SETTINGS = DEFAULT_WORKSPACE_SETTINGS;
