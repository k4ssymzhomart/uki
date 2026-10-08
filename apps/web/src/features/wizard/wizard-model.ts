import {
  BROWSER_RULE_SWITCHES,
  type BrowserRuleSwitch,
  checkSeatRanges,
  ExamDraft,
  type ExamDraftInput,
  type ExamMode,
  type InviteStatus,
  type Locale,
  type ProctorAssignment,
  parseScheduleError,
  type ScheduleProblem,
  type SeatRangeProblem,
  toMs,
  WIZARD_STEPS,
  type WizardStep,
  WorkspaceSettings,
} from "@uki/contracts";
import { TIME_ZONE } from "@uki/i18n";
import type { ChipStatus, StepState } from "@uki/ui";
import { z } from "zod";

/**
 * The new-exam wizard (0.4, 0.2, 0.2a, E.1, 0.3, 0.3a, 0.3b, 0.5) as pure functions: which steps an
 * exam has and where Next and Back lead, what the four-step stepper shows, the Asia/Almaty date and
 * time fields, the choices the selects offer, the proctor seat ranges and the summary of 0.5.
 * Unit-tested in wizard-model.test.ts; the roster CSV lives in roster-csv.ts.
 */

// ---------------------------------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------------------------------

/** The four items of the stepper (Figma Step 46:2106): E.1 belongs to Checks. */
export const STEPPER_ITEMS = ["details", "checks", "roster", "review"] as const;
export type StepperItem = (typeof STEPPER_ITEMS)[number];

/** The pages an exam's wizard has: E.1 (browser) only for an exam that runs in the LMS with Üki Lock. */
export function wizardSteps(mode: ExamMode): WizardStep[] {
  return WIZARD_STEPS.filter((step) => step !== "browser" || mode === "browser");
}

/** The stepper item a page belongs to. */
export function stepperItem(step: WizardStep): StepperItem {
  return step === "browser" ? "checks" : step;
}

/** Done before the current item, current, upcoming after it. */
export function stepperStates(current: WizardStep): Record<StepperItem, StepState> {
  const at = STEPPER_ITEMS.indexOf(stepperItem(current));
  const states = {} as Record<StepperItem, StepState>;
  STEPPER_ITEMS.forEach((item, index) => {
    states[item] = index < at ? "done" : index === at ? "current" : "upcoming";
  });
  return states;
}

/** Where Next leads from a page: Checks goes to E.1 for a browser exam (plan, Screens: /edit/checks). */
export function nextStep(step: WizardStep, mode: ExamMode): WizardStep | null {
  const steps = wizardSteps(mode);
  const at = steps.indexOf(step);
  if (at === -1) return step === "browser" ? "roster" : null;
  return steps[at + 1] ?? null;
}

/** Where Back leads from a page. */
export function previousStep(step: WizardStep, mode: ExamMode): WizardStep | null {
  const steps = wizardSteps(mode);
  const at = steps.indexOf(step);
  if (at === -1) return step === "browser" ? "checks" : null;
  return at > 0 ? (steps[at - 1] ?? null) : null;
}

export function stepHref(examId: string, step: WizardStep): `/exams/${string}/edit/${WizardStep}` {
  return `/exams/${examId}/edit/${step}`;
}

/** A step segment from the URL, or null. */
export function parseWizardStep(value: unknown): WizardStep | null {
  return typeof value === "string" && (WIZARD_STEPS as readonly string[]).includes(value)
    ? (value as WizardStep)
    : null;
}

/**
 * Which page of the wizard an exam may open. A draft opens every page it has (E.1 only for a browser
 * exam, else Checks). A scheduled exam keeps only the roster (0.3b fixes a bounced address after the
 * invites went out); its other pages lead there. Any other exam has left the wizard: the lobby.
 */
export function allowedStep(
  exam: Pick<ExamDraft, "status" | "mode">,
  step: WizardStep,
): { ok: true } | { ok: false; redirect: WizardStep | "lobby" } {
  if (exam.status === "draft") {
    if (step === "browser" && exam.mode !== "browser") return { ok: false, redirect: "checks" };
    return { ok: true };
  }
  if (exam.status === "scheduled")
    return step === "roster" ? { ok: true } : { ok: false, redirect: "roster" };
  return { ok: false, redirect: "lobby" };
}

// ---------------------------------------------------------------------------------------------------
// The draft's saves
// ---------------------------------------------------------------------------------------------------

/** What a step changes in the draft: save_exam_draft's input without the id. */
export type DraftPatch = Omit<ExamDraftInput, "id">;
type Patch = DraftPatch;

/** Two patches as one: later fields win; `checks` and `browser_rules` merge, as save_exam_draft merges them. */
export function mergePatch(a: Patch, b: Patch): Patch {
  const merged: Patch = { ...a, ...b };
  if (a.checks || b.checks) merged.checks = { ...a.checks, ...b.checks };
  if (a.browser_rules || b.browser_rules) merged.browser_rules = { ...a.browser_rules, ...b.browser_rules };
  return merged;
}

/** The exam as the page shows it while a patch is on its way. */
export function applyPatch(exam: ExamDraft, patch: Patch): ExamDraft {
  const { checks, browser_rules, title, course, kind, room, lms_url, lms_done_path, ...rest } = patch;
  const next: ExamDraft = { ...exam, ...(rest as Partial<ExamDraft>) };
  if (checks) next.checks = { ...exam.checks, ...checks };
  if (browser_rules) next.browser_rules = { ...exam.browser_rules, ...browser_rules };
  if (title !== undefined) next.title = title ?? "";
  if (course !== undefined) next.course = course ?? "";
  if (kind !== undefined) next.kind = kind ?? "";
  if (room !== undefined) next.room = room;
  if (lms_url !== undefined) next.lms_url = lms_url;
  if (lms_done_path !== undefined) next.lms_done_path = lms_done_path;
  return next;
}

// ---------------------------------------------------------------------------------------------------
// Rows read from the database
// ---------------------------------------------------------------------------------------------------

/** An `exams` row with its `exam_groups`, as the wizard pages read it under RLS. */
export function examDraftFromRow(row: unknown): ExamDraft | null {
  if (typeof row !== "object" || row === null) return null;
  const { exam_groups: groups, ...rest } = row as { exam_groups?: unknown };
  const groupIds = Array.isArray(groups)
    ? groups.flatMap((group) =>
        typeof group === "object" && group !== null && "group_id" in group ? [String(group.group_id)] : [],
      )
    : [];
  const parsed = ExamDraft.safeParse({ ...rest, group_ids: groupIds });
  return parsed.success ? parsed.data : null;
}

/** `workspaces.settings`; a row that does not parse gives the plan's defaults' shape back as null. */
export function parseSettings(value: unknown): WorkspaceSettings | null {
  const parsed = WorkspaceSettings.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** A group of the workspace, with how many students it has (0.4's chips: "Group 204 · 128 students"). */
export const WizardGroup = z.object({
  id: z.uuid(),
  code: z.string(),
  students: z.number().int().nonnegative(),
});
export type WizardGroup = z.infer<typeof WizardGroup>;

/** PostgREST's `students(count)` embed: [{ count: n }]. */
export function groupFromRow(row: unknown): WizardGroup | null {
  if (typeof row !== "object" || row === null) return null;
  const { students, ...rest } = row as { students?: unknown };
  const count =
    Array.isArray(students) && typeof students[0] === "object" && students[0] !== null
      ? (students[0] as { count?: unknown }).count
      : 0;
  const parsed = WizardGroup.safeParse({ ...rest, students: count });
  return parsed.success ? parsed.data : null;
}

/** Sorted the way Figma lists groups: by code, numbers in order. */
export function sortGroups<T extends { code: string }>(groups: readonly T[]): T[] {
  return [...groups].sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }));
}

/** A proctor the exam office can assign (0.3's proctors card). */
export const WizardProctor = z.object({
  id: z.uuid(),
  full_name: z.string(),
  languages: z.array(z.enum(["kk", "ru", "en"])),
});
export type WizardProctor = z.infer<typeof WizardProctor>;

// ---------------------------------------------------------------------------------------------------
// Date and time in Asia/Almaty (0.4 and its date picker)
// ---------------------------------------------------------------------------------------------------

const partsFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** The calendar day ("2026-10-09") and the time ("10:00") of an instant in Asia/Almaty. */
export function almatyParts(value: string | number | Date): { date: string; time: string } {
  const parts = partsFormat.formatToParts(new Date(toMs(value)));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}`,
  };
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Minutes Asia/Almaty is ahead of UTC at an instant. */
function offsetMinutes(utcMs: number): number {
  const { date, time } = almatyParts(utcMs);
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const [h, mi] = time.split(":").map(Number) as [number, number];
  return Math.round((Date.UTC(y, m - 1, d, h, mi) - Math.floor(utcMs / 60_000) * 60_000) / 60_000);
}

/** The instant of a day ("2026-10-09") and a time ("10:00") in Asia/Almaty, as ISO 8601 UTC; or null. */
export function fromAlmaty(date: string, time: string): string | null {
  const day = DATE_PATTERN.exec(date);
  const clock = TIME_PATTERN.exec(time);
  if (!day || !clock) return null;
  const local = Date.UTC(
    Number(day[1]),
    Number(day[2]) - 1,
    Number(day[3]),
    Number(clock[1]),
    Number(clock[2]),
  );
  if (Number.isNaN(local)) return null;
  const guess = local - offsetMinutes(local) * 60_000;
  const exact = local - offsetMinutes(guess) * 60_000;
  return new Date(exact).toISOString();
}

/** "2026-10" plus `delta` months. */
export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export type CalendarDay = { date: string; day: number; inMonth: boolean };

/**
 * The weeks of a month as the date picker draws them (Popover/Date picker 147:2727): Monday first, the
 * days of the months before and after filling the first and last week.
 */
export function monthGrid(month: string): CalendarDay[][] {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const total = Math.ceil((lead + daysInMonth) / 7) * 7;
  const days: CalendarDay[] = [];
  for (let index = 0; index < total; index += 1) {
    const date = new Date(Date.UTC(y, m - 1, 1 - lead + index));
    days.push({
      date: date.toISOString().slice(0, 10),
      day: date.getUTCDate(),
      inMonth: date.getUTCMonth() === m - 1,
    });
  }
  const weeks: CalendarDay[][] = [];
  for (let index = 0; index < days.length; index += 7) weeks.push(days.slice(index, index + 7));
  return weeks;
}

/** A Date at noon UTC of a calendar day, for formatting the day itself in Asia/Almaty. */
export function dayInstant(date: string): string {
  return `${date}T12:00:00Z`;
}

/** 0.4's At a glance: when the lobby opens and the exam ends. */
export function examTimes(
  startsAt: string,
  durationMin: number,
  lobbyMinutes: number,
): { lobbyOpensAt: string; endsAt: string } {
  const start = toMs(startsAt);
  return {
    lobbyOpensAt: new Date(start - lobbyMinutes * 60_000).toISOString(),
    endsAt: new Date(start + durationMin * 60_000).toISOString(),
  };
}

// ---------------------------------------------------------------------------------------------------
// Choices
// ---------------------------------------------------------------------------------------------------

/** Exam types (`exams.kind`). Stored in English, as the seed does; the app maps them to exam.type.*. */
export const EXAM_KINDS = ["Midterm", "Final", "Quiz", "Test"] as const;

/** The choices of a select: the fixed list plus the current value when it is not on it. */
export function withCurrent<T extends string | number>(
  options: readonly T[],
  current: T | null | undefined,
): T[] {
  if (current === null || current === undefined || current === "" || options.includes(current)) {
    return [...options];
  }
  const all = [...options, current];
  return typeof current === "number" ? all.sort((a, b) => Number(a) - Number(b)) : all;
}

/** 0.4 Duration, in minutes. */
export const DURATION_OPTIONS = [30, 40, 45, 50, 60, 75, 90, 120, 150, 180] as const;
/** 0.2 Gaze threshold, in seconds: 0.2a's Strict, Default and Calm. */
export const GAZE_OPTIONS = [1, 2, 3] as const;
/** 0.2 Phone confidence. */
export const PHONE_OPTIONS = [0.75, 0.8, 0.85, 0.9, 0.95] as const;

/** The courses already in the workspace, for 0.4's course field: distinct, sorted, never empty. */
export function courseSuggestions(courses: readonly string[]): string[] {
  return [...new Set(courses.map((course) => course.trim()).filter((course) => course !== ""))].sort((a, b) =>
    a.localeCompare(b, "en", { numeric: true }),
  );
}

/**
 * E.1's switchable rules in the frame's order. Developer tools, other extensions and screen sharing
 * are fixed by Phase 0's decisions and are not switches.
 */
export const BROWSER_RULE_ORDER: readonly BrowserRuleSwitch[] = ["copy_paste", "print", "full_screen"];
export const CALCULATOR_RULE: BrowserRuleSwitch = "calculator";
export { BROWSER_RULE_SWITCHES };

/** The exam's own host, which E.1 lists first and locked, from its LMS link. */
export function lmsHost(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host.toLowerCase() || null;
  } catch {
    return null;
  }
}

/** A host typed into Add site: trimmed, lower case, without a scheme or path; null if it is not one. */
export function normaliseHost(input: string): string | null {
  let value = input.trim().toLowerCase();
  if (value === "") return null;
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  value = value.split(/[/?#]/)[0] ?? "";
  return /^(?:\[[0-9a-f:.]+\]|[a-z0-9_-]+(?:\.[a-z0-9_-]+)*\.?)(?::\d{1,5})?$/.test(value) ? value : null;
}

// ---------------------------------------------------------------------------------------------------
// Proctors (0.3)
// ---------------------------------------------------------------------------------------------------

export type ProctorRow = {
  staff_id: string;
  seat_from: number;
  seat_to: number;
  languages: Locale[];
  is_lead?: boolean;
};

/** The table assign_proctors receives, in seat order. */
export function assignmentRows(assignments: readonly ProctorAssignment[]): ProctorRow[] {
  return [...assignments]
    .filter((row) => row.seat_from !== null && row.seat_to !== null)
    .sort((a, b) => (a.seat_from ?? 0) - (b.seat_from ?? 0))
    .map((row) => ({
      staff_id: row.staff_id,
      seat_from: row.seat_from ?? 1,
      seat_to: row.seat_to ?? 1,
      languages: row.languages,
      is_lead: row.is_lead,
    }));
}

/** The table with one proctor's row added or replaced. */
export function upsertProctor(rows: readonly ProctorRow[], row: ProctorRow): ProctorRow[] {
  const others = rows.filter((item) => item.staff_id !== row.staff_id);
  return [...others, row].sort((a, b) => a.seat_from - b.seat_from);
}

/** The table without one proctor; the lead goes to whoever then holds seat 1 (assign_proctors decides). */
export function removeProctor(rows: readonly ProctorRow[], staffId: string): ProctorRow[] {
  return rows
    .filter((row) => row.staff_id !== staffId)
    .map(({ is_lead: _lead, ...rest }) => rest)
    .sort((a, b) => a.seat_from - b.seat_from);
}

/** The seats Add proctor suggests: right after the last range, to the end of the roster. */
export function nextSeatRange(rows: readonly ProctorRow[], rosterSize: number): { from: number; to: number } {
  const last = rows.reduce((max, row) => Math.max(max, row.seat_to), 0);
  const from = last + 1;
  return { from, to: Math.max(from, rosterSize) };
}

/** The first gap or overlap of a table as 0.3 states it, checked before assign_proctors is called. */
export function seatProblem(rows: readonly ProctorRow[]): SeatRangeProblem | null {
  return checkSeatRanges(rows);
}

/** assign_proctors' gap or overlap error ("seats 13 to 24"), as a problem with its seats. */
export function parseSeatError(error: unknown): SeatRangeProblem | null {
  if (typeof error !== "object" || error === null) return null;
  const { message, details } = error as { message?: unknown; details?: unknown };
  if (message !== "gap" && message !== "overlap") return null;
  const seats = typeof details === "string" ? /seats (\d+) to (\d+)/.exec(details) : null;
  return { problem: message, from: Number(seats?.[1] ?? 0), to: Number(seats?.[2] ?? 0) };
}

/** Seats the proctors do not cover yet, from the end of the last range to the roster size. */
export function uncoveredSeats(
  rows: readonly ProctorRow[],
  rosterSize: number,
): { from: number; to: number } | null {
  if (rosterSize === 0) return null;
  const last = rows.reduce((max, row) => Math.max(max, row.seat_to), 0);
  return last < rosterSize ? { from: last + 1, to: rosterSize } : null;
}

/** The proctor of a seat, for the PROCTOR column of 0.3. */
export function proctorOfSeat<T extends { seat_from: number | null; seat_to: number | null }>(
  assignments: readonly T[],
  seat: number | null,
): T | null {
  if (seat === null) return null;
  return (
    assignments.find(
      (row) => row.seat_from !== null && row.seat_to !== null && seat >= row.seat_from && seat <= row.seat_to,
    ) ?? null
  );
}

// ---------------------------------------------------------------------------------------------------
// Invites in the students table (0.3, 0.3a, 0.3b)
// ---------------------------------------------------------------------------------------------------

/**
 * send-invites (WP 1.4) does not exist yet. Until it lands, Send a test invite and Resend stay
 * disabled with the reason shown; WP 1.4 turns this on together with the function.
 */
export const SEND_INVITES_READY = false;

export type InviteChip = { status: ChipStatus; key: "notSent" | "sent" | "opened" | "bounced" | "failed" };

/** The INVITE chip of a roster row: 0.3a's "Not sent", 0.3's "Sent · not opened", "Opened", "Email bounced". */
export function inviteChip(status: InviteStatus | "parsed"): InviteChip {
  switch (status) {
    case "parsed":
    case "pending":
      return { status: "idle", key: "notSent" };
    case "sent":
      return { status: "idle", key: "sent" };
    case "opened":
      return { status: "ok", key: "opened" };
    case "bounced":
      return { status: "flag", key: "bounced" };
    case "failed":
      return { status: "flag", key: "failed" };
  }
}

/** The row action: Edit before the invite goes out, Fix email after it failed, Resend after it went out. */
export function inviteAction(status: InviteStatus | "parsed"): "edit" | "fixEmail" | "resend" {
  if (status === "parsed" || status === "pending") return "edit";
  if (status === "bounced" || status === "failed") return "fixEmail";
  return "resend";
}

/** 0.3's tabs: All, Invited, Not opened. Opens are not tracked, so only seed rows are ever `opened`. */
export const ROSTER_TABS = ["all", "invited", "notOpened"] as const;
export type RosterTab = (typeof ROSTER_TABS)[number];

export function inTab(status: InviteStatus | "parsed", tab: RosterTab): boolean {
  if (tab === "all") return true;
  if (tab === "invited") return status === "sent" || status === "opened";
  return status === "sent";
}

/** Search on 0.3: a part of the name or of the student number, without case. */
export function matchesSearch(row: { full_name: string; student_number: string }, query: string): boolean {
  const q = query.trim().toLocaleLowerCase();
  if (q === "") return true;
  return row.full_name.toLocaleLowerCase().includes(q) || row.student_number.includes(q);
}

/** 0.3b's input: the new address of one student's invite, and whether the roster keeps it too. */
export const FixInviteEmailInput = z.object({
  exam_id: z.uuid(),
  student_id: z.uuid(),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  roster: z.boolean(),
});
export type FixInviteEmailInput = z.infer<typeof FixInviteEmailInput>;

// ---------------------------------------------------------------------------------------------------
// Review (0.5)
// ---------------------------------------------------------------------------------------------------

/** The check chips of 0.5, in the frame's order; `on` false draws the muted chip. */
export function checkChips(exam: Pick<ExamDraft, "checks">): { key: string; on: boolean; value?: number }[] {
  return [
    { key: "lock", on: exam.checks.lock },
    { key: "gaze", on: true, value: exam.checks.gaze_s },
    { key: "phone", on: true, value: exam.checks.phone_score },
    { key: "identity", on: exam.checks.identity },
    { key: "secondPerson", on: true },
    { key: "microphone", on: false },
  ];
}

/** A schedule_exam error as the problem and the page that fixes it, or `failed` for anything else. */
export function scheduleFailure(error: unknown): { problem: ScheduleProblem; step: WizardStep } | null {
  return parseScheduleError(error);
}

/** "MATH2-204-FRI": what the overview's toast may show from its query string. */
export const ExamCodeParam = z.string().regex(/^[A-Z0-9-]{3,40}$/);
