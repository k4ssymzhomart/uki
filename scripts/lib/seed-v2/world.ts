// The KRU world of the demo as data: the workspace, faculties, groups and every student, with the
// programme and year seed v2 adds (docs/phase-1-plan.md, "Seed v2"). Phase 0's students are generated
// by supabase/seed.sql; `phase0Students` repeats its rules exactly (seed_tmp.seed_name and the group
// blocks), so `pnpm demo:reset` can put back a student the wizard's roster import renamed. Seed v2 adds
// seven Mathematics groups (201 to 208 without 204) so the Autumn 2026 term has the sessions A.1's
// frame counts with about five exams per student, as A.2 draws them.
import type { Locale } from "../../../packages/contracts/src/index.ts";

export const WORKSPACE_ID = "a0000000-0000-4000-8000-000000000001";

export const FACULTY = {
  mathematics: "a1000000-0000-4000-8000-000000000001",
  physics: "a1000000-0000-4000-8000-000000000002",
  history: "a1000000-0000-4000-8000-000000000003",
  languages: "a1000000-0000-4000-8000-000000000004",
} as const;
export type FacultyKey = keyof typeof FACULTY;

export interface GroupSeed {
  id: string;
  code: string;
  faculty: FacultyKey;
  programme: string;
  year: number;
  /** True for the groups seed v2 adds; Phase 0's seed.sql makes the others. */
  v2: boolean;
}

export function groupId(code: string): string {
  return `a2000000-0000-4000-8000-${code.padStart(12, "0")}`;
}

function group(code: string, faculty: FacultyKey, programme: string, year: number, v2 = false): GroupSeed {
  return { id: groupId(code), code, faculty, programme, year, v2 };
}

/** Group code to programme and year: the first digit of the code is the year of study. */
export const GROUPS: readonly GroupSeed[] = [
  group("204", "mathematics", "Mathematics", 2),
  group("101", "physics", "Physics", 1),
  group("102", "physics", "Physics", 1),
  group("103", "physics", "Physics", 1),
  group("110", "history", "History", 1),
  group("301", "languages", "Foreign languages", 3),
  group("201", "mathematics", "Mathematics", 2, true),
  group("202", "mathematics", "Mathematics", 2, true),
  group("203", "mathematics", "Mathematics", 2, true),
  group("205", "mathematics", "Mathematics", 2, true),
  group("206", "mathematics", "Mathematics", 2, true),
  group("207", "mathematics", "Mathematics", 2, true),
  group("208", "mathematics", "Mathematics", 2, true),
];

/** Students in each group seed v2 adds: 836 in all, so the workspace has A.2's 1,284 students. */
export const V2_GROUP_SIZES: Readonly<Record<string, number>> = {
  "201": 124,
  "202": 118,
  "203": 122,
  "205": 116,
  "206": 120,
  "207": 114,
  "208": 122,
};

export interface StudentSeed {
  id: string;
  number: string;
  fullName: string;
  email: string;
  groupCode: string;
  locale: Locale;
  programme: string | null;
  year: number | null;
}

export function studentId(number: string): string {
  return `b0000000-0000-4000-8000-${number.padStart(12, "0")}`;
}

const FEMALE = [
  "Aigerim",
  "Aruzhan",
  "Madina",
  "Zhansaya",
  "Kamila",
  "Dana",
  "Saule",
  "Ainur",
  "Akbota",
  "Aliya",
  "Asel",
  "Dariga",
  "Gulnaz",
  "Inkar",
  "Karina",
  "Laura",
  "Meruyert",
  "Nazerke",
  "Raushan",
  "Togzhan",
  "Tomiris",
  "Zarina",
  "Dilnaz",
  "Aisha",
] as const;
const MALE = [
  "Arman",
  "Dias",
  "Timur",
  "Nurlan",
  "Yerlan",
  "Daniyar",
  "Askar",
  "Erlan",
  "Bauyrzhan",
  "Alikhan",
  "Azamat",
  "Dauren",
  "Ilyas",
  "Kairat",
  "Marat",
  "Nursultan",
  "Olzhas",
  "Rustem",
  "Sanzhar",
  "Temirlan",
  "Yerzhan",
  "Zhandos",
  "Aibek",
  "Abylai",
] as const;
const SURNAMES = [
  "Abenov",
  "Akhmetov",
  "Baimukhanov",
  "Dzhaksybekov",
  "Ermekov",
  "Ibrayev",
  "Kairatov",
  "Mukanov",
  "Nurgaliyev",
  "Rakhimov",
  "Serikbayev",
  "Suleimenov",
  "Temirbekov",
  "Tursynov",
  "Utepov",
  "Zhaksylykov",
  "Zhumabayev",
  "Yessenov",
  "Alimov",
  "Baizakov",
  "Iskakov",
  "Karimov",
  "Nurpeisov",
  "Sarsenbayev",
  "Smagulov",
  "Tolegenov",
  "Zhunussov",
  "Amanov",
  "Beisenov",
  "Kuanyshev",
  "Orazov",
] as const;

/** seed_tmp.seed_name(k) of supabase/seed.sql: a Kazakh name in Latin letters, female for even k. */
export function seedName(k: number): string {
  const surname = SURNAMES[(k * 11) % 31] ?? "";
  if (k % 2 === 0) return `${FEMALE[(k * 7) % 24] ?? ""} ${surname}a`;
  return `${MALE[(k * 5) % 24] ?? ""} ${surname}`;
}

/** "Daniyar S.": the wall's short form, which seed.sql keeps unique in group 204. */
function shortForm(name: string): string {
  const [first = "", last = ""] = name.split(" ");
  return `${first} ${last.slice(0, 1)}`;
}

/** Group 204's named students (1.5 and 2.4) with their seats, as seed.sql lists them. */
export const NAMED_204: readonly { seat: number; number: string; name: string }[] = [
  { seat: 2, number: "20235002", name: "Aigerim Baimukhanova" },
  { seat: 5, number: "20230912", name: "Arman Bekzhanov" },
  { seat: 9, number: "20235009", name: "Dana Zhaksylykova" },
  { seat: 12, number: "20231044", name: "Dias Kenzhebekov" },
  { seat: 14, number: "20231219", name: "Aruzhan Kassymova" },
  { seat: 17, number: "20235017", name: "Erlan Kairatov" },
  { seat: 23, number: "20231187", name: "Madina Tulegenova" },
  { seat: 26, number: "20235026", name: "Askar Mukanov" },
  { seat: 30, number: "20235030", name: "Timur Nurgaliyev" },
  { seat: 33, number: "20231302", name: "Zhansaya Omarova" },
  { seat: 35, number: "20235035", name: "Nurlan Abenov" },
  { seat: 38, number: "20235038", name: "Kamila Rakhimova" },
  { seat: 41, number: "20230877", name: "Yerlan Tokhtarov" },
  { seat: 47, number: "20235047", name: "Daniyar Serikbayev" },
  { seat: 55, number: "20235055", name: "Saule Temirbekova" },
  { seat: 61, number: "20235061", name: "Bauyrzhan Tursynov" },
];

/** Students seed v2 gives a story; the generator keeps their term clean or uses them on purpose. */
export const PEOPLE = {
  /** The real MacBook in the demo (Mathematics 2, seat 23). */
  madina: "20231187",
  /** The browser exam in the demo (Physics 1, group 102). */
  aliya: "20231455",
  /** Mathematics 2's bounced invite (0.3b). */
  yerlan: "20230877",
  /** A.2 draws her as an exchange student; A.5 draws her copy request. */
  zhansaya: "20231302",
  /** History of Kazakhstan, seat 5: the delete request (A.5a). No flags anywhere. */
  deleteRequest: "20241005",
  /** English B2, seat 1: the shared report (A.6). */
  sharedReport: "20223001",
  /** Physics 1, group 101: the simulated student whose help request waits on 2.4d. */
  physicsHelp: "20251007",
} as const;

/** Yerlan's address on the roster: the mailbox 0.3b says does not exist (Figma 160:13301). */
export const BOUNCED_EMAIL = "yerlan.tokhtarov@kru.test";

function email(number: string): string {
  return `${number}@student.kru.test`;
}

function withGroup(
  number: string,
  fullName: string,
  code: string,
  locale: Locale,
): Omit<StudentSeed, "programme" | "year"> {
  return { id: studentId(number), number, fullName, email: email(number), groupCode: code, locale };
}

/** Phase 0's 448 students exactly as supabase/seed.sql makes them (without programme and year). */
export function phase0Students(): Omit<StudentSeed, "programme" | "year">[] {
  const rows: Omit<StudentSeed, "programme" | "year">[] = [];
  // Group 204: the named students, then generated names for the other seats; a generated name whose
  // short form a named student already has takes seed_name(seat + 1000) instead.
  const taken = new Set(NAMED_204.map((row) => shortForm(row.name)));
  const named = new Map(NAMED_204.map((row) => [row.seat, row]));
  for (let seat = 1; seat <= 128; seat += 1) {
    const row = named.get(seat);
    if (row) {
      rows.push(withGroup(row.number, row.name, "204", "kk"));
      continue;
    }
    const plain = seedName(seat);
    const name = taken.has(shortForm(plain)) ? seedName(seat + 1000) : plain;
    rows.push(withGroup(String(20235000 + seat), name, "204", seat % 5 === 0 ? "ru" : "kk"));
  }
  // Groups 101 to 103: 28 each; Aliya Seitkali takes the 28th place of 102.
  for (const g of [101, 102, 103]) {
    for (let i = 1; i <= 28; i += 1) {
      if (g === 102 && i === 28) continue;
      const n = 20250000 + (g - 100) * 1000 + i;
      rows.push(withGroup(String(n), seedName(n % 997), String(g), i % 3 === 0 ? "ru" : "kk"));
    }
  }
  rows.push(withGroup(PEOPLE.aliya, "Aliya Seitkali", "102", "kk"));
  for (let i = 1; i <= 140; i += 1) {
    const n = String(20241000 + i);
    rows.push(withGroup(n, seedName(i + 300), "110", i % 4 === 0 ? "ru" : "kk"));
  }
  for (let i = 1; i <= 96; i += 1) {
    const n = String(20223000 + i);
    const locale: Locale = i % 3 === 0 ? "en" : i % 3 === 1 ? "ru" : "kk";
    rows.push(withGroup(n, seedName(i + 600), "301", locale));
  }
  return rows;
}

/**
 * The number before the first student of a group seed v2 adds: 201 -> 20242000 (its students are
 * 20242001 to 20242124), up to 207 -> 20248000, and 208 -> 20240000. Nothing seeded uses 20249xxx: judge
 * mode's DEMO group has 20249001 to 20249030. seed.sql has the same rule.
 */
export function v2GroupBase(code: string): number {
  return 20240000 + ((Number(code) - 199) % 9) * 1000;
}

/** The 836 students of groups 201 to 208 (without 204). */
export function v2Students(): Omit<StudentSeed, "programme" | "year">[] {
  const rows: Omit<StudentSeed, "programme" | "year">[] = [];
  for (const [code, size] of Object.entries(V2_GROUP_SIZES)) {
    const base = v2GroupBase(code);
    for (let i = 1; i <= size; i += 1) {
      const n = base + i;
      rows.push(withGroup(String(n), seedName((n % 997) + 1000), code, i % 5 === 0 ? "ru" : "kk"));
    }
  }
  return rows;
}

const GROUP_BY_CODE = new Map(GROUPS.map((row) => [row.code, row]));

export function groupByCode(code: string): GroupSeed {
  const found = GROUP_BY_CODE.get(code);
  if (!found) throw new Error(`seed v2: no group ${code}`);
  return found;
}

/** Programme and year of a student: the group's, except Zhansaya, whom A.2 draws as an exchange student. */
export function programmeOf(number: string, code: string): { programme: string; year: number | null } {
  if (number === PEOPLE.zhansaya) return { programme: "Exchange student", year: null };
  const row = groupByCode(code);
  return { programme: row.programme, year: row.year };
}

/** Every student of seed v2 (Phase 0's and the new groups'), with programme, year and Yerlan's address. */
export function allStudents(): StudentSeed[] {
  return [...phase0Students(), ...v2Students()].map((row) => ({
    ...row,
    email: row.number === PEOPLE.yerlan ? BOUNCED_EMAIL : row.email,
    ...programmeOf(row.number, row.groupCode),
  }));
}
