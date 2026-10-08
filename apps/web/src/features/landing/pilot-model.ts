import { z } from "zod";

/**
 * Book a pilot (Figma 194:4014, Sent 195:4090): the form's fields, their checks and the states the
 * page moves through. Pure, so the checks run the same in the browser, the server action and the tests.
 */

/** Lengths the form allows; the message counter shows the last one ("Optional · 80/500"). */
export const PILOT_LIMITS = { name: 120, email: 254, university: 160, message: 500 } as const;

/** "Your role": Exam office is the frame's value; the others are drafts (dashboard-landing.json). */
export const PILOT_ROLES = ["exam_office", "deans_office", "teacher", "it", "other"] as const;
export type PilotRole = (typeof PILOT_ROLES)[number];

/** "Students in one exam": 100–300 is the frame's value. */
export const STUDENT_RANGES = ["under100", "from100", "from300", "over1000"] as const;
export type StudentRange = (typeof STUDENT_RANGES)[number];

/** A month as "2026-11", the value of the When select. */
export const MonthValue = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

/** The next `count` months after `now`'s month, in Asia/Almaty, as When offers them; November first in October. */
export function pilotMonths(now: Date, count = 6): string[] {
  const [year, month] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Almaty",
    year: "numeric",
    month: "2-digit",
  })
    .format(now)
    .split("-")
    .map(Number) as [number, number];
  return Array.from({ length: count }, (_, index) => {
    const zeroBased = month + index; // month is 1-based, so this is next month's zero-based index
    const y = year + Math.floor(zeroBased / 12);
    const m = (zeroBased % 12) + 1;
    return `${y}-${String(m).padStart(2, "0")}`;
  });
}

/** The first day of a "2026-11" month at noon UTC, for formatting its name in any time zone. */
export function monthDate(value: string): Date {
  const [year, month] = value.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(year, month - 1, 1, 12));
}

const trimmed = (max: number) => z.string().trim().max(max);

/** What the form sends, checked in the browser and again in the server action. */
export const PilotForm = z.object({
  name: trimmed(PILOT_LIMITS.name).min(1),
  email: z.string().trim().max(PILOT_LIMITS.email).pipe(z.email()),
  university: trimmed(PILOT_LIMITS.university).min(1),
  role: z.enum(PILOT_ROLES),
  students: z.enum(STUDENT_RANGES),
  when: MonthValue,
  message: trimmed(PILOT_LIMITS.message),
  demoDay: z.boolean(),
});
export type PilotForm = z.infer<typeof PilotForm>;

/** Which line under a field says what is wrong. */
export type PilotFieldError = "nameRequired" | "emailInvalid" | "universityRequired" | "tooLong";
export type PilotErrors = Partial<Record<"name" | "email" | "university" | "message", PilotFieldError>>;

/** The form as typed, so a refused or invalid submit keeps every value. */
export type PilotValues = Record<
  "name" | "email" | "university" | "role" | "students" | "when" | "message",
  string
> & {
  demoDay: boolean;
};

export type PilotFormState =
  | { status: "editing"; values: PilotValues; errors: PilotErrors }
  /** request_pilot refused a fourth request from this address today. */
  | { status: "rateLimited"; values: PilotValues; errors: PilotErrors }
  /** The request did not reach the database; nothing was stored. */
  | { status: "failed"; values: PilotValues; errors: PilotErrors }
  /** Sent replaces the form. `reference` is shown when the server gives one. */
  | { status: "sent"; request: PilotForm; reference: string | null };

export function initialPilotState(months: readonly string[]): PilotFormState {
  return {
    status: "editing",
    errors: {},
    values: {
      name: "",
      email: "",
      university: "",
      role: "exam_office",
      students: "from100",
      when: months[0] ?? "",
      message: "",
      demoDay: true,
    },
  };
}

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

/** The submitted values, as typed. The checkbox posts "on" only when ticked. */
export function pilotValues(form: FormData): PilotValues {
  return {
    name: text(form, "name"),
    email: text(form, "email"),
    university: text(form, "university"),
    role: text(form, "role"),
    students: text(form, "students"),
    when: text(form, "when"),
    message: text(form, "message"),
    demoDay: form.get("demoDay") === "on",
  };
}

/** Checks the values: the parsed request, or the line to show under each field that is wrong. */
export function checkPilotValues(
  values: PilotValues,
): { ok: true; request: PilotForm } | { ok: false; errors: PilotErrors } {
  const parsed = PilotForm.safeParse(values);
  if (parsed.success) return { ok: true, request: parsed.data };
  const errors: PilotErrors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (field === "name") errors.name = issue.code === "too_big" ? "tooLong" : "nameRequired";
    else if (field === "email") errors.email = "emailInvalid";
    else if (field === "university")
      errors.university = issue.code === "too_big" ? "tooLong" : "universityRequired";
    else if (field === "message") errors.message = "tooLong";
  }
  // A role, size or month outside the lists only comes from a hand-made request: refuse it quietly.
  return { ok: false, errors };
}

/** Demo Day as an all-day event (16 October 2026) for "Add Demo Day to calendar", in iCalendar text. */
export function demoDayCalendar({
  title,
  place,
  stamp,
}: {
  title: string;
  place: string;
  stamp: Date;
}): string {
  const escapeText = (value: string) =>
    value.replace(/[\\;,]/g, (match) => `\\${match}`).replace(/\n/g, "\\n");
  const utc = stamp
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Uki//Landing//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    "UID:demo-day-2026-10-16@uki.test",
    `DTSTAMP:${utc}`,
    "DTSTART;VALUE=DATE:20261016",
    "DTEND;VALUE=DATE:20261017",
    `SUMMARY:${escapeText(title)}`,
    `LOCATION:${escapeText(place)}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
