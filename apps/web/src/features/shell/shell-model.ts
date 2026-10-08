import type { StaffRole } from "@uki/contracts";
import type { IconName } from "@uki/ui";
import type { Route } from "next";
import type { LiveTarget } from "../overview/overview-model.ts";

/**
 * The dashboard shell as pure functions: which sidebar items a role sees, which one is current, which
 * routes are drawn dark, where Live and a role's home lead, and the initials shown for the workspace
 * and the staff member.
 */

/** Every sidebar item Phase 1 has, in Figma's order (0.1 for the exam office, 0.9 for proctors). */
export const NAV_ITEMS = [
  "overview",
  "exams",
  "live",
  "review",
  "reports",
  "students",
  "settings",
  "privacy",
] as const;
export type NavId = (typeof NAV_ITEMS)[number];

export type NavSectionId = "workspace" | "admin";

export type NavSpec = {
  section: NavSectionId;
  icon: IconName;
  /** The roles the frames show the item for: 0.1 (exam office) and 0.9 (proctors). */
  roles: readonly StaffRole[];
  /**
   * False until the item's page is built; the item stays hidden until then. Each package turns its own
   * item on when its page lands: Review with 1.8, Reports with 1.10, Students and Settings with 1.11,
   * Privacy with 1.12. Phase 2 and 3 entry points (A.4a to A.4d, A.7, A.8) are not items at all.
   */
  built: boolean;
};

const OFFICE: readonly StaffRole[] = ["exam_office", "admin"];
const EVERYONE: readonly StaffRole[] = ["exam_office", "admin", "proctor"];

export const NAV: Readonly<Record<NavId, NavSpec>> = {
  overview: { section: "workspace", icon: "layout-grid", roles: EVERYONE, built: true },
  exams: { section: "workspace", icon: "exam", roles: EVERYONE, built: true },
  live: { section: "workspace", icon: "eyes", roles: EVERYONE, built: true },
  review: { section: "workspace", icon: "flag", roles: EVERYONE, built: true },
  reports: { section: "workspace", icon: "report", roles: OFFICE, built: true },
  students: { section: "workspace", icon: "users", roles: OFFICE, built: true },
  settings: { section: "admin", icon: "settings", roles: OFFICE, built: true },
  privacy: { section: "admin", icon: "shield", roles: OFFICE, built: true },
};

/** Where the fixed items lead. Privacy is /privacy-centre, because /privacy is the public policy page. */
export const NAV_HREFS: Readonly<Record<Exclude<NavId, "overview" | "exams" | "live">, string>> = {
  review: "/review",
  reports: "/reports",
  students: "/students",
  settings: "/settings",
  privacy: "/privacy-centre",
};

/** The sidebar of a role: its built items, grouped into Workspace and Admin; an empty section is left out. */
export function navSections(
  role: StaffRole,
  spec: Readonly<Record<NavId, NavSpec>> = NAV,
): { id: NavSectionId; items: NavId[] }[] {
  const sections: { id: NavSectionId; items: NavId[] }[] = [
    { id: "workspace", items: [] },
    { id: "admin", items: [] },
  ];
  for (const id of NAV_ITEMS) {
    const item = spec[id];
    if (!item.built || !item.roles.includes(role)) continue;
    sections.find((section) => section.id === item.section)?.items.push(id);
  }
  return sections.filter((section) => section.items.length > 0);
}

const EXAM_ROUTE = /^\/exams\/[^/]+\/(lobby|live)(?:\/|$)/;
/** The new-exam wizard: /exams/new and /exams/[examId]/edit/* (0.4 to 0.5 mark Exams). */
const WIZARD_ROUTE = /^\/exams\/(?:new|[^/]+\/edit)(?:\/|$)/;
const startsWith = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

/**
 * The current sidebar item: Overview on /overview and a proctor's /my-exams (0.9 marks Overview); Live
 * on an exam's lobby and live wall (1.5 and 2.4); Exams in the new-exam wizard (0.4 to 0.5); the Phase 1
 * items on their own routes.
 */
export function activeNav(pathname: string): NavId | null {
  if (pathname === "/overview" || startsWith(pathname, "/my-exams")) return "overview";
  if (EXAM_ROUTE.test(pathname)) return "live";
  if (WIZARD_ROUTE.test(pathname)) return "exams";
  for (const [id, href] of Object.entries(NAV_HREFS)) {
    if (startsWith(pathname, href)) return id as NavId;
  }
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

/**
 * Proctors land on 0.9 (/my-exams) after sign-in (Phase 1 plan, Decisions: Proctor landing); WP 1.5
 * turned it on with the page. 0.9 marks Overview, so a proctor's Overview item leads there too.
 */
export const PROCTORS_LAND_ON_MY_EXAMS = true;

/** Where a staff member lands after sign-in and on `/`, and where their Overview item leads. */
export function staffHomePath(role: StaffRole, myExamsBuilt: boolean = PROCTORS_LAND_ON_MY_EXAMS): Route {
  return role === "proctor" && myExamsBuilt ? "/my-exams" : "/overview";
}

/** "KRU · Kostanay" gives "K", as the workspace avatar in Figma. */
export function workspaceInitial(name: string): string {
  return Array.from(name.trim())[0]?.toLocaleUpperCase() ?? "";
}

/** "KRU · Kostanay" gives "KRU": the short name the breadcrumb starts with. */
export function workspaceShortName(name: string): string {
  return name.split("·")[0]?.trim() || name.trim();
}
