// The pure parts of `pnpm judge:setup` (scripts/judge-setup.ts; docs/runbooks/judge-mode.md): the DEMO
// roster, the exam's timing and checks, the judge's password and where it is written (the gitignored env
// file and a one-pager outside the repository), and the one-pager itself. Also those of
// `pnpm judge:free-seat` (scripts/judge-free-seat.ts): which number it takes and what it reports.
import { randomBytes } from "node:crypto";
import { isAbsolute, relative, resolve } from "node:path";
import {
  DEMO_LIVE_CHECKS,
  DEMO_LIVE_CODE,
  DEMO_LIVE_DURATION_MIN,
  DEMO_LIVE_ROLLOVER_MIN,
  DEMO_LIVE_TITLE,
  demoRealAppNumbers,
  demoStudentNumbers,
  ExamChecks,
  JUDGE_EMAIL,
  type Locale,
} from "../../packages/contracts/src/index.ts";

export const DEFAULT_DASHBOARD_URL = "https://uki-web.vercel.app";
export const JUDGE_NAME = "Hackathon Judge";
export const JUDGE_PASSWORD_KEY = "JUDGE_PASSWORD";
/** The desktop app's downloads (WP 0.15; the landing's download-model.ts keeps the same link). */
export const RELEASES_URL = "https://github.com/k4ssymzhomart/uki/releases/latest";

/** 30 made-up students of group DEMO; none shares a name with the seeded staff or the demo's two students. */
const NAMES = [
  "Aruzhan Abenova",
  "Nursultan Zhaksybekov",
  "Dariga Seitkali",
  "Yerlan Mukanov",
  "Zhanel Omarova",
  "Alikhan Kassymov",
  "Kamila Iskakova",
  "Temirlan Nurlanov",
  "Ainur Sarsenova",
  "Daniyar Zhumabayev",
  "Togzhan Utegenova",
  "Asylbek Baimukhanov",
  "Inkar Kenzhebayeva",
  "Miras Smagulov",
  "Saltanat Ivanova",
  "Sanzhar Kim",
  "Malika Tsoi",
  "Ruslan Petrov",
  "Bayan Yesenova",
  "Bekzat Orazbayev",
  "Akbota Mussina",
  "Arsen Dzhaksybayev",
  "Symbat Yermekova",
  "Olzhas Kairatov",
  "Moldir Amanova",
  "Dias Tokhtarov",
  "Aisulu Zhanibekova",
  "Timur Sergeyev",
  "Laura Bekmukhambetova",
  "Adil Rakhimov",
] as const;

/** The language a simulated student joins in (apps/judge-sim, localeFor): mostly Kazakh. */
export function demoLocale(number: string): Locale {
  const last = Number(number.at(-1));
  if (last <= 5) return "kk";
  return last <= 8 ? "ru" : "en";
}

export interface DemoStudent {
  number: string;
  fullName: string;
  locale: Locale;
  seat: number;
}

export function demoRoster(): DemoStudent[] {
  return demoStudentNumbers().map((number, i) => ({
    number,
    fullName: NAMES[i] as string,
    locale: demoLocale(number),
    seat: i + 1,
  }));
}

/** DEMO-LIVE's run from `nowMs`: live now, 720 minutes, the lobby open. */
export function demoLiveRun(nowMs: number) {
  const now = new Date(nowMs).toISOString();
  return {
    starts_at: now,
    lobby_opens_at: now,
    duration_min: DEMO_LIVE_DURATION_MIN,
    status: "live" as const,
  };
}

/** Whether an existing DEMO-LIVE needs a new run now: as demo_live_tick decides. */
export function needsNewRun(
  exam: { status: string; starts_at: string; duration_min: number },
  nowMs: number,
): boolean {
  if (exam.status !== "live") return true;
  const starts = Date.parse(exam.starts_at);
  if (!Number.isFinite(starts) || starts > nowMs) return true;
  return starts + exam.duration_min * 60_000 - nowMs < DEMO_LIVE_ROLLOVER_MIN * 60_000;
}

/**
 * DEMO-LIVE's checks: the exam's stored checks with DEMO_LIVE_CHECKS on top (lock and identity off,
 * phone_score 0.55), every other check kept. Refuses stored checks the database itself would refuse.
 */
export function demoLiveChecks(current: unknown): ExamChecks {
  return { ...ExamChecks.parse(current ?? {}), ...DEMO_LIVE_CHECKS };
}

/** "20249026–20249030": the IDs the one-pager gives judges with the real app. */
export function realAppRange(): string {
  const numbers = demoRealAppNumbers();
  return `${numbers[0]}–${numbers.at(-1)}`;
}

/** A new password: 24 characters of base64url from 18 random bytes. */
export function generatePassword(bytes: (n: number) => Buffer = randomBytes): string {
  return bytes(18).toString("base64url");
}

/** The value of `KEY=value` in an env file's text, unquoted, or null. */
export function readEnvValue(text: string, key: string): string | null {
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (match?.[1] !== key) continue;
    const raw = (match[2] ?? "").trim();
    const value = raw.replace(/^(['"])(.*)\1$/, "$2");
    return value === "" ? null : value;
  }
  return null;
}

/** The text with `KEY=value` appended on its own line (the caller checked it is absent). */
export function appendEnvLine(text: string, key: string, value: string): string {
  if (!/^[A-Za-z0-9_\-.~+/=]+$/.test(value)) throw new Error(`${key}: unexpected characters in the value`);
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const base = text.length === 0 || text.endsWith("\n") ? text : `${text}${newline}`;
  return `${base}${key}=${value}${newline}`;
}

/** True when `path` lies inside `root` (the one-pager must not, so the password never reaches git). */
export function isInside(path: string, root: string): boolean {
  const rel = relative(resolve(root), resolve(path));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function liveDemoUrl(dashboardUrl: string): string {
  return `${dashboardUrl.replace(/\/+$/, "")}/sign-in?email=${encodeURIComponent(JUDGE_EMAIL)}&next=/demo/live`;
}

/** The judge one-pager, in Markdown. It holds the password, so it is written outside the repository. */
export function renderOnePager(options: {
  dashboardUrl: string;
  password: string;
  generatedAt: Date;
}): string {
  const base = options.dashboardUrl.replace(/\/+$/, "");
  return `# Üki · judge access

Üki proctors university exams on the student's own laptop: detection runs on the laptop, and only events
and flagged stills reach the proctors' dashboard. Video never leaves the laptop.

| | |
| --- | --- |
| Dashboard | ${base} |
| Live demo | ${liveDemoUrl(base)} |
| Email | ${JUDGE_EMAIL} |
| Password | ${options.password} |

**Live demo** opens the sign-in page with the email filled in. After you sign in it opens the live wall of
"${DEMO_LIVE_TITLE}", an exam that never ends: about 24 simulated students write it around the clock, with
phones, glances, a second face, an empty seat and the odd question for the proctor. The wall comes to
life within a few seconds of opening; the green "Simulator: live" line at the top says the class is
running. The exam starts afresh every 11.5 hours.

Also on the site, without signing in:

- ${base}/demo — the jury page: what Üki does and how the demo is set up.
- ${base}/try — Üki's detection running on your own camera, in the browser; nothing is uploaded.

## Three things to try

1. **Open a flagged student.** Click a tile marked Flagged (a phone or a second face): the timeline drawer
   shows each event with its time and score, and the stills the laptop sent for it.
2. **Read the help requests.** When the Requests button shows a number, open it: simulated students ask
   about a question or a break, as a real student would from the app or Üki Lock.
3. **Follow a flag to the report.** Open Review in the sidebar, pick a student with flags, and open the
   integrity report with its verify code.

Your account is read-only: it sees what a proctor of this exam sees, and Üki refuses its replies, notes,
decisions, share links and commands. Every student, flag and still in this exam is simulated, except the
ones below.

## Try the real app

Try the real app: download Üki, code ${DEMO_LIVE_CODE}, student ID ${realAppRange()}.

- Download: ${RELEASES_URL} (macOS and Windows; the page says how to open an app that is not signed yet).
- Enter the code and one of those IDs. This exam asks for no Üki Lock and no student card: after the
  camera check and the rules you write the 20 questions, and you appear on the same wall as the
  simulated class. Pick up a phone, look away or leave the picture, and watch the wall.
- An ID someone else is using answers that it is already taken: try the next one.

_Generated ${options.generatedAt.toISOString().slice(0, 16).replace("T", " ")} UTC by \`pnpm judge:setup\`. Keep this file outside the repository._
`;
}

/** The student number `pnpm judge:free-seat` was given: one of DEMO-LIVE's 30, or a usage message. */
export function parseSeatNumber(positionals: readonly string[]): { number: string } | { error: string } {
  const roster = demoStudentNumbers();
  if (positionals.length !== 1) {
    return { error: `give one student number, ${roster[0]} to ${roster.at(-1)}` };
  }
  const number = (positionals[0] as string).trim();
  if (!roster.includes(number)) {
    return { error: `${number} is not on ${DEMO_LIVE_CODE}'s roster (${roster[0]} to ${roster.at(-1)})` };
  }
  return { number };
}

/** What `pnpm judge:free-seat` deleted for one session, child rows first, as demo_live_tick does. */
export const FREE_SEAT_TABLES = [
  "reports",
  "review_decisions",
  "help_requests",
  "session_commands",
  "frames",
  "events",
  "answers",
] as const;
export type FreeSeatTable = (typeof FREE_SEAT_TABLES)[number];
export type FreeSeatCounts = Record<FreeSeatTable | "sessions", number>;

/** "1 session, 6 events, 2 frames rows, …": the counts that are not zero, sessions first. */
export function describeCounts(counts: FreeSeatCounts): string {
  const label: Record<keyof FreeSeatCounts, [string, string]> = {
    sessions: ["session", "sessions"],
    events: ["event", "events"],
    frames: ["frames row", "frames rows"],
    answers: ["answer", "answers"],
    help_requests: ["help request", "help requests"],
    session_commands: ["command", "commands"],
    review_decisions: ["decision", "decisions"],
    reports: ["report", "reports"],
  };
  const order: (keyof FreeSeatCounts)[] = [
    "sessions",
    "events",
    "frames",
    "answers",
    "help_requests",
    "session_commands",
    "review_decisions",
    "reports",
  ];
  const parts = order
    .filter((key) => counts[key] > 0)
    .map((key) => `${counts[key]} ${label[key][counts[key] === 1 ? 0 : 1]}`);
  return parts.length === 0 ? "nothing" : parts.join(", ");
}
