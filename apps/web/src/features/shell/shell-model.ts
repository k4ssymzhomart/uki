import type { LiveTarget } from "../overview/overview-model.ts";

/**
 * The dashboard shell as pure functions: which sidebar item is current, which routes are drawn dark,
 * where Live leads, and the initials shown for the workspace and the staff member.
 */

/** Phase 0 shows Overview, Exams and Live; Review, Reports, Students, Settings and Privacy stay hidden. */
export const NAV_ITEMS = ["overview", "exams", "live"] as const;
export type NavId = (typeof NAV_ITEMS)[number];

const EXAM_ROUTE = /^\/exams\/[^/]+\/(lobby|live)(?:\/|$)/;

/** The current sidebar item: Overview on /overview; Live on an exam's lobby and live wall (1.5 and 2.4). */
export function activeNav(pathname: string): NavId | null {
  if (pathname === "/overview") return "overview";
  if (EXAM_ROUTE.test(pathname)) return "live";
  return null;
}

/** The live wall and its drawer are drawn in the dark theme (Figma 2.4, 2.5), sidebar included. */
export function isDarkRoute(pathname: string): boolean {
  return /^\/exams\/[^/]+\/live(?:\/|$)/.test(pathname);
}

/** Where the sidebar's Live item leads; the overview when no exam is live or coming up. */
export function liveHref(target: LiveTarget): string {
  return target ? `/exams/${target.examId}/${target.kind}` : "/overview";
}

/** The Exams item opens the overview's exams table (the handoff links Overview and Exams to 0.1). */
export const EXAMS_HREF = "/overview#exams";

/** "KRU · Kostanay" gives "K", as the workspace avatar in Figma. */
export function workspaceInitial(name: string): string {
  return Array.from(name.trim())[0]?.toLocaleUpperCase() ?? "";
}

/** "KRU · Kostanay" gives "KRU": the short name the breadcrumb starts with. */
export function workspaceShortName(name: string): string {
  return name.split("·")[0]?.trim() || name.trim();
}
