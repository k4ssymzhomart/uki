import type { Route } from "next";
import { type DashboardLocale, dashboardLocaleOf, otherDashboardLocale } from "../../i18n/locale.ts";
import type { StaffLookup } from "../../lib/auth.ts";
import { staffHomePath } from "../shell/shell-model.ts";

/**
 * Where `/` sends a signed-in staff member; visitors (no staff session) stay on the landing page.
 * Staff go to their home (WP 1.2's staffHomePath): the overview (0.1) for the exam office and admins,
 * and for proctors 0.9 (`/my-exams`) once WP 1.5 turns PROCTORS_LAND_ON_MY_EXAMS on. A failed lookup
 * goes to the overview, which looks again and shows Try again rather than showing a signed-in proctor
 * the marketing page.
 */
export function homeRedirect(lookup: StaffLookup): Route | null {
  if (lookup.status === "none") return null;
  return lookup.status === "staff" ? staffHomePath(lookup.staff.role) : "/overview";
}

/** Section anchors on `/`, shared by the header, the footer and the sections themselves. */
export const SECTION = {
  /** What Üki does: the pillars, on both layouts. */
  product: "product",
  /** The three feature rows, 1024 and up only. */
  liveWall: "live-wall",
  lock: "lock",
  review: "review",
  howItWorks: "how-it-works",
  privacy: "privacy",
  universities: "universities",
  faq: "faq",
  /** The installers from the latest release (decided by the user on 8 October; no frame). */
  download: "download",
} as const;
export type SectionId = (typeof SECTION)[keyof typeof SECTION];

/** Header links, in the order of the Figma Nav (114:2041). */
export const NAV_LINKS = [
  { key: "product", section: SECTION.product },
  { key: "howItWorks", section: SECTION.howItWorks },
  { key: "privacy", section: SECTION.privacy },
  { key: "universities", section: SECTION.universities },
  { key: "faq", section: SECTION.faq },
] as const;

/** A link on the public pages: a section of `/`, or another public page. */
export function sectionHref(section: SectionId): `/#${SectionId}` {
  return `/#${section}`;
}

/**
 * The languages the public pages have strings for (dashboard-landing.json is English and Russian), in
 * the switch's order. They are the dashboard's languages, so the switch writes the same `uki_locale`
 * cookie as 3.4a (WP 1.2) and a visitor's choice follows them to sign-in and the dashboard.
 */
export const LANDING_LOCALES = ["ru", "en"] as const satisfies readonly DashboardLocale[];
export type LandingLocale = DashboardLocale;

/** The landing locale behind a BCP 47 tag from next-intl ("ru-RU", "en-GB"); English otherwise. */
export const landingLocale: (tag: string) => LandingLocale = dashboardLocaleOf;

/** The other language, for the one-tap switch in the mobile header. */
export const otherLocale: (locale: LandingLocale) => LandingLocale = otherDashboardLocale;
