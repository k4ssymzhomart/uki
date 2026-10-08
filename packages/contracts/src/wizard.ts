// The new-exam wizard (0.4, 0.2, E.1, 0.3, 0.3a, 0.3b, 0.5), proctor seats (0.9a), invites and the
// workspace settings (A.4): the shapes of save_exam_draft, import_roster, assign_proctors,
// schedule_exam and confirm_seats (supabase/migrations/20261009000000_phase1.sql).
import { z } from "zod";
import { StudentNumber } from "./api.ts";
import { BrowserRules, BrowserRulesPatch } from "./browser-rules.ts";
import { DEFAULT_EXAM_CHECKS, ExamChecks } from "./checks.ts";
import { Host, Timestamp, Uuid } from "./primitives.ts";
import { ExamMode, ExamStatus, Locale } from "./session.ts";

// ---------------------------------------------------------------------------------------------------
// Workspace settings (A.4)
// ---------------------------------------------------------------------------------------------------

/** `workspaces.settings`: what new exams start from and how long stills are kept. */
export const WorkspaceSettings = z.strictObject({
  retention_days: z.number().int().min(1).max(3650),
  lobby_minutes: z.number().int().min(0).max(240),
  default_duration_min: z.number().int().min(5).max(600),
  default_checks: ExamChecks,
});
export type WorkspaceSettings = z.infer<typeof WorkspaceSettings>;

export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  retention_days: 90,
  lobby_minutes: 20,
  default_duration_min: 90,
  default_checks: { ...DEFAULT_EXAM_CHECKS },
};

// ---------------------------------------------------------------------------------------------------
// rpc save_exam_draft
// ---------------------------------------------------------------------------------------------------

export const EXAM_TITLE_MAX = 200;
export const EXAM_COURSE_MAX = 120;
export const EXAM_KIND_MAX = 60;
export const EXAM_ROOM_MAX = 60;
export const EXAM_DURATION_MIN = 5;
export const EXAM_DURATION_MAX = 600;
export const ALLOWED_SITES_MAX = 20;
export const EXAM_GROUPS_MAX = 50;

/**
 * What a wizard step sends as `exam`. Without `id` a new draft is made (tomorrow 09:00 in the
 * workspace's time zone, the default duration and checks); with `id` that draft is updated. Every
 * field is optional; `checks` and `browser_rules` merge into the stored values, `group_ids` replaces
 * the exam's groups. Null clears a field.
 */
export const ExamDraftInput = z.strictObject({
  id: Uuid.optional(),
  faculty_id: Uuid.nullable().optional(),
  title: z.string().trim().max(EXAM_TITLE_MAX).nullable().optional(),
  course: z.string().trim().max(EXAM_COURSE_MAX).nullable().optional(),
  kind: z.string().trim().max(EXAM_KIND_MAX).nullable().optional(),
  mode: ExamMode.optional(),
  starts_at: Timestamp.optional(),
  duration_min: z.number().int().min(EXAM_DURATION_MIN).max(EXAM_DURATION_MAX).optional(),
  room: z.string().trim().max(EXAM_ROOM_MAX).nullable().optional(),
  rules_locale: Locale.nullable().optional(),
  checks: ExamChecks.partial().optional(),
  browser_rules: BrowserRulesPatch.optional(),
  lms_url: z
    .string()
    .trim()
    .max(2048)
    .regex(/^https?:\/\/\S+$/)
    .nullable()
    .optional(),
  lms_done_path: z
    .string()
    .trim()
    .max(512)
    .regex(/^\/\S*$/)
    .nullable()
    .optional(),
  allowed_sites: z.array(Host).max(ALLOWED_SITES_MAX).optional(),
  group_ids: z.array(Uuid).max(EXAM_GROUPS_MAX).optional(),
});
export type ExamDraftInput = z.infer<typeof ExamDraftInput>;

/** Arguments of `rpc('save_exam_draft', ...)`. */
export const SaveExamDraftInput = z.object({ exam: ExamDraftInput });
export type SaveExamDraftInput = z.infer<typeof SaveExamDraftInput>;

/** The exam row as save_exam_draft returns it: every column of `exams`, plus `group_ids`. */
export const ExamDraft = z.object({
  id: Uuid,
  workspace_id: Uuid,
  faculty_id: Uuid.nullable(),
  title: z.string(),
  course: z.string(),
  kind: z.string(),
  code: z.string().nullable(),
  mode: ExamMode,
  starts_at: Timestamp,
  duration_min: z.number().int(),
  lobby_opens_at: Timestamp,
  status: ExamStatus,
  checks: ExamChecks,
  lms_url: z.string().nullable(),
  lms_done_path: z.string().nullable(),
  allowed_sites: z.array(z.string()),
  created_by: Uuid.nullable(),
  created_at: Timestamp.nullable(),
  room: z.string().nullable(),
  rules_locale: Locale.nullable(),
  scheduled_at: Timestamp.nullable(),
  browser_rules: BrowserRules,
  group_ids: z.array(Uuid),
});
export type ExamDraft = z.infer<typeof ExamDraft>;

/** Errors the wizard functions raise besides forbidden, not_found and bad_request. */
export const WIZARD_ERROR_CODES = [
  "forbidden",
  "not_found",
  "bad_request",
  "not_draft",
  "not_editable",
  "gap",
  "overlap",
] as const;
export type WizardErrorCode = (typeof WIZARD_ERROR_CODES)[number];

// ---------------------------------------------------------------------------------------------------
// The roster CSV (0.3, 0.3a, 0.3b) and rpc import_roster
// ---------------------------------------------------------------------------------------------------

/** The CSV columns, in order: student number, full name, email, group, language. */
export const ROSTER_COLUMNS = ["student_number", "full_name", "email", "group", "locale"] as const;
export type RosterColumn = (typeof ROSTER_COLUMNS)[number];

export const ROSTER_NAME_MAX = 200;
export const ROSTER_ROWS_MAX = 2000;

const LOCALE_ALIASES: Readonly<Record<string, z.infer<typeof Locale>>> = {
  kk: "kk",
  kz: "kk",
  kaz: "kk",
  kazakh: "kk",
  қаз: "kk",
  каз: "kk",
  қазақша: "kk",
  ru: "ru",
  rus: "ru",
  russian: "ru",
  рус: "ru",
  русский: "ru",
  орысша: "ru",
  en: "en",
  eng: "en",
  english: "en",
  англ: "en",
  английский: "en",
  ағылшынша: "en",
};

/** A language cell as kk, ru or en; the usual spellings in the three languages are accepted. */
export function rosterLocale(value: unknown): z.infer<typeof Locale> | null {
  if (typeof value !== "string") return null;
  return LOCALE_ALIASES[value.trim().toLowerCase()] ?? null;
}

/** One valid roster row; `group` is a group code the workspace knows (checkRoster checks that). */
export const RosterRow = z.strictObject({
  student_number: StudentNumber,
  full_name: z.string().trim().min(1).max(ROSTER_NAME_MAX),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  group: z.string().trim().min(1).max(40),
  locale: z.preprocess((value) => rosterLocale(value) ?? value, Locale),
});
export type RosterRow = z.infer<typeof RosterRow>;

/** What 0.3a says is wrong with a row; the dashboard keys each one. */
export const ROSTER_PROBLEMS = [
  "number_invalid",
  "number_duplicate",
  "name_empty",
  "name_too_long",
  "email_empty",
  "email_no_at",
  "email_invalid",
  "group_empty",
  "group_unknown",
  "locale_invalid",
] as const;
export type RosterProblem = (typeof ROSTER_PROBLEMS)[number];

export interface RosterIssue {
  /** 1-based data row (the first row after the header is 1). */
  row: number;
  column: RosterColumn;
  problem: RosterProblem;
  /** The cell as written, trimmed. */
  value: string;
}

export interface RosterCheck {
  /** The valid rows, in file order, normalised (trimmed, lower-case email, kk/ru/en). */
  valid: RosterRow[];
  /** The 1-based numbers of the valid rows, in the same order. */
  validRows: number[];
  /** Every problem, in row and column order; a row may have several. */
  issues: RosterIssue[];
}

function cell(row: Readonly<Record<string, unknown>>, column: RosterColumn): string {
  const value = row[column];
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

/**
 * Checks parsed CSV rows (objects keyed by ROSTER_COLUMNS) against RosterRow and the workspace's group
 * codes (compared without case). A number that appears twice marks every later row with it. Nothing
 * is written until `issues` is empty (0.3a); import_roster checks the same rules again.
 */
export function checkRoster(
  rows: readonly Readonly<Record<string, unknown>>[],
  knownGroups: readonly string[],
): RosterCheck {
  const groups = new Set(knownGroups.map((code) => code.trim().toUpperCase()));
  const seen = new Set<string>();
  const valid: RosterRow[] = [];
  const validRows: number[] = [];
  const issues: RosterIssue[] = [];
  rows.forEach((row, index) => {
    const number = index + 1;
    const found: RosterIssue[] = [];
    const add = (column: RosterColumn, problem: RosterProblem) =>
      found.push({ row: number, column, problem, value: cell(row, column) });

    const studentNumber = cell(row, "student_number");
    if (!StudentNumber.safeParse(studentNumber).success) add("student_number", "number_invalid");
    else if (seen.has(studentNumber)) add("student_number", "number_duplicate");
    else seen.add(studentNumber);

    const name = cell(row, "full_name");
    if (name === "") add("full_name", "name_empty");
    else if (name.length > ROSTER_NAME_MAX) add("full_name", "name_too_long");

    const email = cell(row, "email");
    if (email === "") add("email", "email_empty");
    else if (!email.includes("@")) add("email", "email_no_at");
    else if (!RosterRow.shape.email.safeParse(email).success) add("email", "email_invalid");

    const group = cell(row, "group");
    if (group === "") add("group", "group_empty");
    else if (!groups.has(group.toUpperCase())) add("group", "group_unknown");

    if (rosterLocale(row.locale) === null) add("locale", "locale_invalid");

    if (found.length > 0) {
      issues.push(...found);
      return;
    }
    const parsed = RosterRow.safeParse({
      student_number: studentNumber,
      full_name: name,
      email,
      group,
      locale: row.locale,
    });
    if (parsed.success) {
      valid.push(parsed.data);
      validRows.push(number);
    }
  });
  return { valid, validRows, issues };
}

/** Arguments of `rpc('import_roster', ...)`: only rows checkRoster passed. */
export const ImportRosterInput = z.object({
  exam_id: Uuid,
  rows: z.array(RosterRow).min(1).max(ROSTER_ROWS_MAX),
});
export type ImportRosterInput = z.infer<typeof ImportRosterInput>;

/** New and existing students, the roster size after the import, and roster rows the file left out. */
export const ImportRosterOutput = z.object({
  inserted: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  seats: z.number().int().nonnegative(),
  removed: z.number().int().nonnegative(),
});
export type ImportRosterOutput = z.infer<typeof ImportRosterOutput>;

// ---------------------------------------------------------------------------------------------------
// Proctors: rpc assign_proctors (0.3) and rpc confirm_seats (0.9a)
// ---------------------------------------------------------------------------------------------------

export const CHANGE_REQUEST_MAX = 500;

/** One row of `proctor_assignments` with the proctor's name. */
export const ProctorAssignment = z.object({
  exam_id: Uuid,
  staff_id: Uuid,
  full_name: z.string(),
  seat_from: z.number().int().positive().nullable(),
  seat_to: z.number().int().positive().nullable(),
  languages: z.array(Locale),
  is_lead: z.boolean(),
  confirmed_at: Timestamp.nullable(),
  change_request: z.string().nullable(),
});
export type ProctorAssignment = z.infer<typeof ProctorAssignment>;

export const ProctorAssignmentInput = z
  .strictObject({
    staff_id: Uuid,
    seat_from: z.number().int().min(1),
    seat_to: z.number().int().min(1),
    languages: z.array(Locale).min(1).max(3),
    is_lead: z.boolean().optional(),
  })
  .refine((row) => row.seat_to >= row.seat_from, {
    path: ["seat_to"],
    message: "seat_to is before seat_from.",
  });
export type ProctorAssignmentInput = z.infer<typeof ProctorAssignmentInput>;

/** Arguments of `rpc('assign_proctors', ...)`: the whole proctors table. */
export const AssignProctorsInput = z.object({
  exam_id: Uuid,
  rows: z.array(ProctorAssignmentInput).max(50),
});
export type AssignProctorsInput = z.infer<typeof AssignProctorsInput>;

export const AssignProctorsOutput = z.array(ProctorAssignment);
export type AssignProctorsOutput = z.infer<typeof AssignProctorsOutput>;

export type SeatRangeProblem =
  | { problem: "gap"; from: number; to: number }
  | { problem: "overlap"; from: number; to: number };

/**
 * The first gap or overlap in a set of seat ranges, as assign_proctors finds it: sorted by seat_from,
 * the first starts at 1 and each next one starts right after the previous one ends. Null when they
 * tile 1 to the last seat.
 */
export function checkSeatRanges(
  rows: readonly { seat_from: number; seat_to: number }[],
): SeatRangeProblem | null {
  const sorted = [...rows].sort((a, b) => a.seat_from - b.seat_from || a.seat_to - b.seat_to);
  let previousTo = 0;
  for (const row of sorted) {
    if (row.seat_from <= previousTo) return { problem: "overlap", from: row.seat_from, to: previousTo };
    if (row.seat_from > previousTo + 1)
      return { problem: "gap", from: previousTo + 1, to: row.seat_from - 1 };
    previousTo = row.seat_to;
  }
  return null;
}

/** Arguments of `rpc('confirm_seats', ...)`: no text confirms, text asks the exam office for a change. */
export const ConfirmSeatsInput = z.object({
  exam_id: Uuid,
  change_request: z.string().trim().min(1).max(CHANGE_REQUEST_MAX).optional(),
});
export type ConfirmSeatsInput = z.infer<typeof ConfirmSeatsInput>;

// ---------------------------------------------------------------------------------------------------
// rpc schedule_exam (0.5)
// ---------------------------------------------------------------------------------------------------

/** The wizard steps, by their route segment under /exams/[examId]/edit/. */
export const WIZARD_STEPS = ["details", "checks", "browser", "roster", "review"] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

/** Each problem schedule_exam can raise, with the step that fixes it (the error's `details`). */
export const SCHEDULE_PROBLEMS = {
  title_missing: "details",
  course_missing: "details",
  kind_missing: "details",
  duration_invalid: "details",
  starts_in_past: "details",
  groups_missing: "details",
  code_exhausted: "details",
  checks_invalid: "checks",
  lms_url_missing: "browser",
  lms_url_invalid: "browser",
  browser_rules_invalid: "browser",
  roster_empty: "roster",
  proctors_missing: "roster",
  seats_uncovered: "roster",
} as const satisfies Record<string, WizardStep>;
export type ScheduleProblem = keyof typeof SCHEDULE_PROBLEMS;
export const SCHEDULE_PROBLEM_CODES = Object.keys(SCHEDULE_PROBLEMS) as ScheduleProblem[];

/** The problem and its step from a schedule_exam error (supabase-js `error`), or null. */
export function parseScheduleError(error: unknown): { problem: ScheduleProblem; step: WizardStep } | null {
  if (typeof error !== "object" || error === null) return null;
  const message = (error as { message?: unknown }).message;
  if (typeof message !== "string") return null;
  const problem = message.trim();
  if (!(problem in SCHEDULE_PROBLEMS)) return null;
  const known = problem as ScheduleProblem;
  return { problem: known, step: SCHEDULE_PROBLEMS[known] };
}

export const ScheduleExamInput = z.object({ exam_id: Uuid });
export type ScheduleExamInput = z.infer<typeof ScheduleExamInput>;

export const ScheduleExamOutput = z.object({
  code: z.string().min(3).max(32),
  starts_at: Timestamp,
  lobby_opens_at: Timestamp,
  status: z.literal("scheduled"),
});
export type ScheduleExamOutput = z.infer<typeof ScheduleExamOutput>;

// ---------------------------------------------------------------------------------------------------
// Invites (0.3, 0.3b, 0.8; send-invites)
// ---------------------------------------------------------------------------------------------------

/** Mirrors the SQL enum `invite_state`. `bounced` arrives through Resend's webhook in Phase 2. */
export const INVITE_STATES = ["pending", "sent", "failed", "bounced"] as const;
export const InviteState = z.enum(INVITE_STATES);
export type InviteState = z.infer<typeof InviteState>;

/**
 * `exam_students.invite_status`, which the Phase 0 lobby reads: the invite state, kept in step by the
 * invites_sync_status trigger, or `opened`, which only seed data holds (opens are not tracked).
 */
export const InviteStatus = z.enum([...INVITE_STATES, "opened"]);
export type InviteStatus = z.infer<typeof InviteStatus>;

/** One `invites` row. */
export const Invite = z.object({
  id: Uuid,
  exam_id: Uuid,
  student_id: Uuid,
  email: z.string(),
  locale: Locale,
  state: InviteState,
  provider_id: z.string().nullable(),
  error: z.string().nullable(),
  sent_at: Timestamp.nullable(),
});
export type Invite = z.infer<typeof Invite>;

/**
 * 0.3b's Save (WP 1.3): a new address for one student's invite on the exam, and whether the student's
 * roster address changes too, for later exams. The address is checked as the roster CSV checks it.
 */
export const FixInviteEmailInput = z.strictObject({
  exam_id: Uuid,
  student_id: Uuid,
  email: RosterRow.shape.email,
  roster: z.boolean(),
});
export type FixInviteEmailInput = z.infer<typeof FixInviteEmailInput>;

/** 0.3's Resend (WP 1.3): one student's invite sent again, through send-invites with `student_ids`. */
export const ResendInviteInput = z.strictObject({ exam_id: Uuid, student_id: Uuid });
export type ResendInviteInput = z.infer<typeof ResendInviteInput>;
