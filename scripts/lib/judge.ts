// The pure parts of `pnpm judge:setup` (scripts/judge-setup.ts; docs/runbooks/judge-mode.md): the DEMO
// roster, the exam's timing, the judge's password and where it is written (the gitignored env file and
// a one-pager outside the repository), and the one-pager itself.
import { randomBytes } from "node:crypto";
import { isAbsolute, relative, resolve } from "node:path";
import {
  DEMO_LIVE_DURATION_MIN,
  DEMO_LIVE_ROLLOVER_MIN,
  DEMO_LIVE_TITLE,
  demoStudentNumbers,
  JUDGE_EMAIL,
  type Locale,
} from "../../packages/contracts/src/index.ts";

export const DEFAULT_DASHBOARD_URL = "https://uki-web.vercel.app";
export const JUDGE_NAME = "Hackathon Judge";
export const JUDGE_PASSWORD_KEY = "JUDGE_PASSWORD";

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
decisions, share links and commands. Every student, flag and still in this exam is simulated.

_Generated ${options.generatedAt.toISOString().slice(0, 16).replace("T", " ")} UTC by \`pnpm judge:setup\`. Keep this file outside the repository._
`;
}
