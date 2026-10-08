// The email pilot-notify sends the Üki team for one Book a pilot request (194:4014). Pure, so the
// functions-unit tests run it under Node. The team reads it in English; the visitor's own words are
// quoted as typed. Plain text only: no HTML, no images, no tracking.
import type { PilotRequest } from "../_shared/contracts/index.ts";

/** The form's choices, as Book a pilot shows them in English (dashboard-landing.json). */
const ROLE: Readonly<Record<string, string>> = {
  exam_office: "Exam office",
  deans_office: "Dean’s office",
  teacher: "Teacher",
  it: "IT department",
  other: "Other",
};

const EXAM_SIZE: Readonly<Record<string, string>> = {
  under100: "Under 100",
  from100: "100–300",
  from300: "300–1,000",
  over1000: "Over 1,000",
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** "2026-11" as "November 2026"; anything else as stored. */
export function monthLabel(value: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
  return match && month ? `${month} ${match[1]}` : value;
}

export interface PilotEmail {
  subject: string;
  text: string;
}

/** Subject and body for one pilot_requests row. Missing optional answers are left out. */
export function pilotEmail(request: PilotRequest): PilotEmail {
  const lines: [string, string | null][] = [
    ["Name", request.name],
    ["Work email", request.email],
    ["University", request.university],
    ["Role", request.role === null ? null : (ROLE[request.role] ?? request.role)],
    [
      "Students in one exam",
      request.exam_size === null ? null : (EXAM_SIZE[request.exam_size] ?? request.exam_size),
    ],
    ["When", request.pilot_month === null ? null : monthLabel(request.pilot_month)],
    ["Demo Day invite", request.demo_invite ? "Yes, 16 October" : "No"],
    ["Received", request.created_at],
  ];
  const body = lines
    .filter((line): line is [string, string] => line[1] !== null)
    .map(([label, value]) => `${label}: ${value}`);
  const message = request.message?.trim();
  return {
    subject: `Pilot request: ${request.university}`,
    text: [
      "A pilot request came in through Book a pilot.",
      "",
      ...body,
      ...(message ? ["", "Anything we should know:", message] : []),
      "",
      `Request ${request.id}. Reply to this email to answer ${request.name}.`,
      "",
    ].join("\n"),
  };
}
