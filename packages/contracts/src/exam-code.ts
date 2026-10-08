// The exam code students type on 1.1 (1.1a teaches the format), like MATH2-204-FRI. schedule_exam makes
// it in the database (public.exam_code_base in supabase/migrations/20261009000000_phase1.sql); this is
// the same rule, so 0.5 can show the code before scheduling and the tests can check both sides agree.

/**
 * Capital Cyrillic (Kazakh and Russian) and accented Latin letters, as ASCII. Anything else that is not
 * A to Z or 0 to 9 separates words. The database holds the same map.
 */
export const EXAM_CODE_LATIN: Readonly<Record<string, string>> = {
  А: "A",
  Ә: "A",
  Б: "B",
  В: "V",
  Г: "G",
  Ғ: "G",
  Д: "D",
  Е: "E",
  Ё: "E",
  Ж: "ZH",
  З: "Z",
  И: "I",
  Й: "Y",
  І: "I",
  К: "K",
  Қ: "Q",
  Л: "L",
  М: "M",
  Н: "N",
  Ң: "N",
  О: "O",
  Ө: "O",
  П: "P",
  Р: "R",
  С: "S",
  Т: "T",
  У: "U",
  Ұ: "U",
  Ү: "U",
  Ф: "F",
  Х: "KH",
  Һ: "H",
  Ц: "TS",
  Ч: "CH",
  Ш: "SH",
  Щ: "SHCH",
  Ъ: "",
  Ы: "Y",
  Ь: "",
  Э: "E",
  Ю: "YU",
  Я: "YA",
  Ä: "A",
  Á: "A",
  À: "A",
  Â: "A",
  Ç: "C",
  É: "E",
  È: "E",
  Ê: "E",
  Ë: "E",
  Ğ: "G",
  Í: "I",
  Ì: "I",
  Î: "I",
  Ï: "I",
  İ: "I",
  Ñ: "N",
  Ó: "O",
  Ò: "O",
  Ô: "O",
  Ö: "O",
  Ş: "S",
  Ú: "U",
  Ù: "U",
  Û: "U",
  Ü: "U",
  Ū: "U",
};

/** The course part holds at most this many characters, the group part at most 8. */
export const EXAM_CODE_COURSE_MAX = 10;
export const EXAM_CODE_GROUP_MAX = 8;
/** On a clash, schedule_exam tries the base code, then base + 2, base + 3, ... up to base + 99. */
export const EXAM_CODE_MAX_SUFFIX = 99;

/** Upper case, then the map above, character by character. */
export function examCodeLatin(text: string): string {
  let out = "";
  for (const char of text.toUpperCase()) out += EXAM_CODE_LATIN[char] ?? char;
  return out;
}

function words(text: string): string[] {
  return examCodeLatin(text)
    .split(/[^A-Z0-9]+/)
    .filter((word) => word !== "");
}

/**
 * The course part: the first word's first four letters and its trailing digits, then every later word
 * that holds a digit; "Mathematics 2" is MATH2, "English B2" is ENGLB2, "Математика 2" is MATE2. A course
 * with no letters or digits is EXAM.
 */
export function examCodeCourse(course: string): string {
  const [first, ...rest] = words(course);
  if (first === undefined) return "EXAM";
  let head = first.replace(/[0-9]/g, "").slice(0, 4) + (/[0-9]+$/.exec(first)?.[0] ?? "");
  if (head === "") head = first;
  for (const word of rest) if (/[0-9]/.test(word)) head += word;
  return head.slice(0, EXAM_CODE_COURSE_MAX);
}

/** The group part: the group code in Latin capitals and digits, at most 8 characters. */
export function examCodeGroup(groupCode: string | null | undefined): string {
  return examCodeLatin(groupCode ?? "")
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, EXAM_CODE_GROUP_MAX);
}

/** MON to SUN: the weekday of `startsAt` in `timeZone` (the workspace's, Asia/Almaty for KRU). */
export function examCodeDay(startsAt: Date | string | number, timeZone: string): string {
  const date = startsAt instanceof Date ? startsAt : new Date(startsAt);
  return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone }).format(date).toUpperCase();
}

export interface ExamCodeParts {
  course: string;
  /** The exam's group codes; the first in sort order names the exam. */
  groups: readonly string[];
  startsAt: Date | string | number;
  timeZone: string;
}

/** The code before a clash digit, like MATH2-204-FRI. */
export function buildExamCode(parts: ExamCodeParts): string {
  const group = [...parts.groups].sort()[0];
  return [examCodeCourse(parts.course), examCodeGroup(group), examCodeDay(parts.startsAt, parts.timeZone)]
    .filter((part) => part !== "")
    .join("-");
}

/** The codes schedule_exam tries, in order: the base, then the base followed by 2 to 99. */
export function examCodeCandidates(base: string): string[] {
  const out = [base];
  for (let digit = 2; digit <= EXAM_CODE_MAX_SUFFIX; digit += 1) out.push(`${base}${digit}`);
  return out;
}

/** The first candidate not in `taken` (compared in upper case), or null when all are taken. */
export function pickExamCode(base: string, taken: Iterable<string>): string | null {
  const used = new Set([...taken].map((code) => code.toUpperCase()));
  return examCodeCandidates(base).find((code) => !used.has(code)) ?? null;
}
