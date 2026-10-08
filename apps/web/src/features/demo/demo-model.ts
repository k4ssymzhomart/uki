import type { IconName } from "@uki/ui/icons";
import type { Route } from "next";
import { z } from "zod";

/**
 * The judge path (user requests of 8 and 9 October; no Figma frame, docs/decisions.md): the landing's
 * Live demo button, the public jury page `/demo`, and `/demo/live`, which takes a signed-in staff member
 * to the live wall of the always-live exam. The constants are shared with the seed and the judge account
 * (judge mode); the judge's password is never in the repository.
 */

/** The always-live exam's code in the KRU workspace ("Demo · Live"). */
export const DEMO_LIVE_CODE = "DEMO-LIVE";

/** The judge's staff account: a read-only observer of DEMO-LIVE. Shown on /demo; the password never is. */
export const JUDGE_EMAIL = "judge@kru.test";

/** The route that finds DEMO-LIVE under the signed-in staff member's RLS and opens its live wall. */
export const DEMO_LIVE_PATH = "/demo/live" satisfies Route;

/** The public jury page. */
export const DEMO_PAGE_PATH = "/demo" satisfies Route;

/** The in-browser detection demo, built on its own branch (wp/judge-try). */
export const TRY_PATH = "/try" as Route;

/**
 * The landing's Live demo button: sign-in with the judge's email filled in, then /demo/live
 * (`/sign-in?email=judge%40kru.test&next=/demo/live`, as the user gave it).
 */
export const LIVE_DEMO_HREF = signInHref(JUDGE_EMAIL, DEMO_LIVE_PATH);

/** Sign-in that comes back to /demo/live, for a visitor without a staff session. */
export const DEMO_LIVE_SIGN_IN = signInHref(null, DEMO_LIVE_PATH);

/** Sign-in's address for an email and a next path, with the email encoded and the path kept readable. */
export function signInHref(email: string | null, next: Route): Route {
  const query = [email === null ? null : `email=${encodeURIComponent(email)}`, `next=${next}`]
    .filter((part) => part !== null)
    .join("&");
  return `/sign-in?${query}` as Route;
}

/** An exam's live wall (2.4). */
export function liveWallPath(examId: string): Route {
  return `/exams/${examId}/live` as Route;
}

/** What `/demo/live` found: the exam's id, no exam (missing or not visible to this staff member), or no answer. */
export type DemoLiveExam = { status: "found"; examId: string } | { status: "missing" } | { status: "failed" };

/** The exams row `/demo/live` reads under RLS: only its id. */
export const DemoLiveRow = z.object({ id: z.uuid() });

/** The demo video's slot on /demo: a labelled placeholder, or the address of the video. */
export type DemoVideo = { kind: "none" } | { kind: "link"; url: string };

/** An https address; anything else (unset, empty, http, not a URL) leaves the placeholder. */
const VideoUrl = z.url({ protocol: /^https$/ });

/**
 * The demo video from the public `NEXT_PUBLIC_DEMO_VIDEO_URL`: a labelled placeholder until the user
 * sets it (on Vercel, then a redeploy). The video opens in a new tab rather than playing in the page,
 * so no third-party player loads on /demo.
 */
export function demoVideo(source: string | undefined): DemoVideo {
  const parsed = VideoUrl.safeParse(source?.trim());
  return parsed.success ? { kind: "link", url: parsed.data } : { kind: "none" };
}

/**
 * The three things to try on /demo, in order: the live wall's flags and the drawer's stills (2.4, 2.5),
 * Ask proctor and the proctor's reply (2.4d), and a report with its share link and /verify (3.4, 3.5).
 * Strings are `dashboard.landing.demo.tries.<id>.*`.
 */
export const DEMO_TRIES = [
  { id: "flags", icon: "flag" },
  { id: "ask", icon: "hand" },
  { id: "report", icon: "report" },
] as const satisfies readonly { id: string; icon: IconName }[];
