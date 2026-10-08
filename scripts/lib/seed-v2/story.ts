// The rows of seed v2 that tell the demo's story (docs/phase-1-plan.md, "Seed v2" and "Script"), apart
// from the term: Mathematics 2's invites with one bounced address (0.3b), Nurlan's unconfirmed seats
// (0.9a), History of Kazakhstan's seven flags with stills (3.2), an open help request from a simulated
// student on Physics 1 (2.4d), two data requests (A.5), a shared English B2 report (A.6), a still 91 days
// old (retention) and Dana's languages. Times are relative to the server's clock when they must be.
// supabase/seed.sql writes the invites, the help request and the delete request the same way on a
// fresh reset; `pnpm demo:reset` writes all of it.
import {
  type EventType,
  type HelpTopic,
  type Locale,
  stillPath,
} from "../../../packages/contracts/src/index.ts";
import { createRng } from "../sim/rng.ts";
import { addDays, almatyIso, type TermPlan } from "./term.ts";
import { BOUNCED_EMAIL, PEOPLE, phase0Students, studentId, WORKSPACE_ID } from "./world.ts";

/** Phase 0's exams (supabase/seed.sql). */
export const EXAM = {
  math2: "e0000000-0000-4000-8000-000000000001",
  physics1: "e0000000-0000-4000-8000-000000000002",
  history: "e0000000-0000-4000-8000-000000000003",
  linearAlgebra: "e0000000-0000-4000-8000-000000000004",
  english: "e0000000-0000-4000-8000-000000000005",
} as const;

/** Seed v2's exam 91 days back, in the spring term, which holds the still retention removes. */
export const OLD_EXAM_ID = "e0000000-0000-4000-8200-000000000001";

/**
 * Judge mode's always-live exam (another package seeds it). `pnpm demo:reset` never deletes it, its
 * roster or its help requests, though its id is not one of the seed's.
 */
export const JUDGE_EXAM_CODE = "DEMO-LIVE";

/** Every exam id the seed owns; `pnpm demo:reset` deletes any other exam of the workspace but DEMO-LIVE. */
export function isSeedExamId(id: string): boolean {
  return (
    (Object.values(EXAM) as string[]).includes(id) ||
    id.startsWith("e0000000-0000-4000-8100-") ||
    id === OLD_EXAM_ID
  );
}

/** Every student id the seed owns (Phase 0's and seed v2's use the same scheme). */
export function isSeedStudentId(id: string): boolean {
  return /^b0000000-0000-4000-8000-0000\d{8}$/.test(id);
}

export const STAFF_EMAIL = {
  dana: "dana.akhmetova@kru.test",
  aigerim: "aigerim.sadykova@kru.test",
  nurlan: "nurlan.bekov@kru.test",
  gulnara: "gulnara.kassenova@kru.test",
} as const;
export type StaffKey = keyof typeof STAFF_EMAIL;

/** Dana's languages, English first, so the dashboard opens in English without a cookie (WP 1.2). */
export const DANA_LANGUAGES: Locale[] = ["en", "ru"];

/**
 * Mathematics 2's proctors as scripts/seed-staff.ts makes them. Aigerim, the lead, confirmed her seats
 * when the invites went out; Nurlan has not, so he confirms 65 to 128 on stage (0.9a).
 */
export const MATH2_PROCTORS = [
  {
    staff: "aigerim",
    seatFrom: 1,
    seatTo: 64,
    isLead: true,
    languages: ["kk", "ru"] as Locale[],
    confirmed: true,
  },
  {
    staff: "nurlan",
    seatFrom: 65,
    seatTo: 128,
    isLead: false,
    languages: ["ru", "en"] as Locale[],
    confirmed: false,
  },
] as const;

// ---------------------------------------------------------------------------------------------------
// Mathematics 2's invites
// ---------------------------------------------------------------------------------------------------

export interface InviteSeed {
  examId: string;
  studentId: string;
  email: string;
  locale: Locale;
  state: "sent" | "bounced";
}

/** One invite per Mathematics 2 student: sent, except Yerlan's, which bounced at his roster address. */
export function math2Invites(): InviteSeed[] {
  return phase0Students()
    .filter((student) => student.groupCode === "204")
    .map((student) => ({
      examId: EXAM.math2,
      studentId: student.id,
      email: student.number === PEOPLE.yerlan ? BOUNCED_EMAIL : student.email,
      locale: student.locale,
      state: student.number === PEOPLE.yerlan ? "bounced" : "sent",
    }));
}

/** When the seeded invites went out: two days before the reset. */
export const INVITES_SENT_DAYS_AGO = 2;

// ---------------------------------------------------------------------------------------------------
// Physics 1: the simulated student's open help request (2.4d)
// ---------------------------------------------------------------------------------------------------

export const PHYSICS_HELP = {
  studentId: studentId(PEOPLE.physicsHelp),
  /** Seat 7 of Physics 1 (group 101, seventh by number). */
  sessionId: "d0000000-0000-4000-8002-000000000007",
  authUid: "f0000000-0000-4000-8002-000000000007",
  eventId: "e1000000-0000-4000-8002-000000000001",
  topic: "question" as HelpTopic,
  text: "Q 6: should the answer be in m/s or km/h?",
  /** Minutes after Physics 1's start: joined, accepted the rules, asked, submitted. */
  joinedMin: -6,
  rulesMin: -3,
  askedMin: 2,
  submittedMin: 4,
} as const;

// ---------------------------------------------------------------------------------------------------
// Data requests (A.5)
// ---------------------------------------------------------------------------------------------------

export const DATA_REQUEST = {
  /** "Delete my data" from a History of Kazakhstan student, received 3 days ago, due 7 days after. */
  delete: {
    id: "da000000-0000-4000-8000-000000000001",
    studentId: studentId(PEOPLE.deleteRequest),
    receivedDaysAgo: 3,
  },
  /** "Copy of my data" from Zhansaya Omarova, received 10 days ago, done 8 days ago by Dana. */
  copy: {
    id: "da000000-0000-4000-8000-000000000002",
    studentId: studentId(PEOPLE.zhansaya),
    receivedDaysAgo: 10,
    doneDaysAgo: 8,
    bytes: 18_432,
  },
  dueDays: 7,
} as const;

export function copyExportPath(): string {
  return `${WORKSPACE_ID}/${DATA_REQUEST.copy.id}.json`;
}

/**
 * What a privacy delete clears for the delete request's student (WP 1.12's privacy_delete_student):
 * the identity score and the device record of every session; seed v2 gives the student no events or
 * stills. History seat 5 as seed.sql writes it.
 */
export const DELETE_STUDENT_HISTORY_SESSION = {
  id: "d0000000-0000-4000-8003-000000000005",
  identityScore: 0.75,
  device: { os: "macos", app_version: "0.1.0" },
} as const;

// ---------------------------------------------------------------------------------------------------
// History of Kazakhstan's stills (3.2, 3.3)
// ---------------------------------------------------------------------------------------------------

/** The generated evidence images in demo/stills (brand/images/evidence/web), all under 200 KB. */
export const STILL_FILES = {
  phone: "uki-evidence-phone.jpg",
  lookedAway: "uki-evidence-looked-away.jpg",
  lookingDown: "uki-evidence-looking-down.jpg",
  secondPerson: "uki-evidence-second-person.jpg",
  emptySeat: "uki-evidence-empty-seat.jpg",
  normal: "uki-evidence-normal.jpg",
} as const;
export type StillFile = (typeof STILL_FILES)[keyof typeof STILL_FILES];

export interface StillSeed {
  frameId: string;
  eventId: string;
  sessionId: string;
  examId: string;
  path: string;
  file: StillFile;
}

/** History's seven flags (seed.sql events 1 to 7), one still each, at the flag's time. */
export function historyStills(): StillSeed[] {
  const flags: [number, number, StillFile][] = [
    [1, 7, STILL_FILES.phone],
    [2, 7, STILL_FILES.lookedAway],
    [3, 21, STILL_FILES.secondPerson],
    [4, 33, STILL_FILES.phone],
    [5, 48, STILL_FILES.normal],
    [6, 48, STILL_FILES.lookingDown],
    [7, 64, STILL_FILES.emptySeat],
  ];
  return flags.map(([n, seat, file]) => {
    const eventId = `e1000000-0000-4000-8003-${String(n).padStart(12, "0")}`;
    const sessionId = `d0000000-0000-4000-8003-${String(seat).padStart(12, "0")}`;
    return {
      frameId: `fa000000-0000-4000-8003-${String(n).padStart(12, "0")}`,
      eventId,
      sessionId,
      examId: EXAM.history,
      path: stillPath(EXAM.history, sessionId, eventId, 0),
      file,
    };
  });
}

/** The evidence picture for a flag type. */
function stillFor(type: EventType): StillFile {
  switch (type) {
    case "phone.detected":
      return STILL_FILES.phone;
    case "gaze.down":
      return STILL_FILES.lookingDown;
    case "face.second":
      return STILL_FILES.secondPerson;
    case "face.missing":
    case "camera.lost":
      return STILL_FILES.emptySeat;
    default:
      return STILL_FILES.lookedAway;
  }
}

/**
 * The delete request's student's term flags (term.ts gives them three in two History of Kazakhstan
 * quizzes), one still each, so A.5a has frames from two exams to delete.
 */
export function deleteStudentStills(plan: TermPlan): StillSeed[] {
  const sessions = new Set(
    plan.sessions.filter((session) => session.number === PEOPLE.deleteRequest).map((session) => session.id),
  );
  return plan.events
    .filter((event) => sessions.has(event.sessionId))
    .map((event) => ({
      frameId: `fa100000${event.id.slice(8)}`,
      eventId: event.id,
      sessionId: event.sessionId,
      examId: event.examId,
      path: stillPath(event.examId, event.sessionId, event.id, 0),
      file: stillFor(event.type),
    }));
}

/** History's own events (seed.sql numbers 1 to 10); `pnpm demo:reset` removes any other, such as notes. */
export function isHistorySeedEvent(id: string): boolean {
  return /^e1000000-0000-4000-8003-0000000000(0[1-9]|10)$/.test(id);
}

// ---------------------------------------------------------------------------------------------------
// The English B2 report, shared (A.6)
// ---------------------------------------------------------------------------------------------------

export const SHARED_REPORT = {
  /** English B2, seat 1 (student 20223001): submitted, no flags. */
  sessionId: "d0000000-0000-4000-8005-000000000001",
  /** Made and shared two days before the reset; opened from the link a day later and yesterday. */
  sharedHoursAgo: 48,
  viewsHoursAgo: [26, 20],
} as const;

// ---------------------------------------------------------------------------------------------------
// The still 91 days old (retention): Mechanics · Final, spring term, Faculty of Physics
// ---------------------------------------------------------------------------------------------------

export interface OldExamPlan {
  exam: {
    id: string;
    title: string;
    course: string;
    kind: string;
    startsAt: string;
    durationMin: number;
    groups: string[];
  };
  roster: { studentId: string; seat: number }[];
  sessions: {
    id: string;
    studentId: string;
    authUid: string;
    locale: Locale;
    os: "windows" | "macos";
    startedAt: string;
    submittedAt: string;
    timeUsedS: number;
    identityScore: number;
  }[];
  flag: { id: string; sessionId: string; at: string; receivedAt: string; score: number; heldMs: number };
  still: { frameId: string; path: string; capturedAt: string; file: StillFile };
  decidedAt: string;
}

export const OLD_STILL_DAYS = 91;

/** The Almaty date `days` before the server's `nowMs`. */
export function almatyDaysAgo(nowMs: number, days: number): string {
  const today = new Date(nowMs + 5 * 3_600_000).toISOString().slice(0, 10);
  return addDays(today, -days);
}

/** Mechanics · Final on the Almaty day 91 days before `nowMs`, 10:00, with one phone flag and its still. */
export function oldExamPlan(nowMs: number): OldExamPlan {
  const rng = createRng("seed-v2:old-exam");
  const day = almatyDaysAgo(nowMs, OLD_STILL_DAYS);
  const startsAt = almatyIso(day, "10:00");
  const start = Date.parse(startsAt);
  const students = phase0Students()
    .filter((student) => ["101", "102", "103"].includes(student.groupCode))
    .sort((a, b) => a.groupCode.localeCompare(b.groupCode) || a.number.localeCompare(b.number));
  const roster = students.map((student, i) => ({ studentId: student.id, seat: i + 1 }));
  const absent = new Set([students[11]?.id, students[52]?.id]);
  const sessions = students
    .filter((student) => !absent.has(student.id))
    .map((student) => {
      const started = start + rng.int(0, 50) * 1000;
      const used = rng.int(50, 88) * 60;
      return {
        id: `d2000000-0000-4000-8200-${student.number.padStart(12, "0")}`,
        studentId: student.id,
        authUid: `f2000000-0000-4000-8200-${student.number.padStart(12, "0")}`,
        locale: student.locale,
        os: (rng.chance(0.6) ? "windows" : "macos") as "windows" | "macos",
        startedAt: new Date(started).toISOString(),
        submittedAt: new Date(started + used * 1000).toISOString(),
        timeUsedS: used,
        identityScore: Math.round(rng.between(0.7, 0.96) * 100) / 100,
      };
    });
  const flagged = sessions[20];
  if (!flagged) throw new Error("seed v2: the old exam has too few sessions");
  const at = Date.parse(flagged.startedAt) + 23 * 60_000;
  const flagId = "e1200000-0000-4000-8200-000000000001";
  return {
    exam: {
      id: OLD_EXAM_ID,
      title: "Mechanics · Final",
      course: "Mechanics",
      kind: "Final",
      startsAt,
      durationMin: 90,
      groups: ["101", "102", "103"],
    },
    roster,
    sessions,
    flag: {
      id: flagId,
      sessionId: flagged.id,
      at: new Date(at).toISOString(),
      receivedAt: new Date(at + 2000).toISOString(),
      score: 0.91,
      heldMs: 3200,
    },
    still: {
      frameId: "fa000000-0000-4000-8200-000000000001",
      path: stillPath(OLD_EXAM_ID, flagged.id, flagId, 0),
      capturedAt: new Date(at).toISOString(),
      file: STILL_FILES.phone,
    },
    decidedAt: new Date(start + 90 * 60_000 + 3 * 3_600_000).toISOString(),
  };
}
