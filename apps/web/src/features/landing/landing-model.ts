import type { StaffLookup } from "../../lib/auth.ts";

/**
 * Where `/` sends a signed-in staff member; visitors (no staff session) stay on the landing page.
 * The exam office lands on the overview (0.1). Proctors land on 0.9 (`/my-exams`) once WP 1.5 adds it;
 * until then they land on the overview too. A failed lookup also goes to the overview, which looks again
 * and shows Try again rather than showing a signed-in proctor the marketing page.
 */
export function homeRedirect(lookup: StaffLookup): "/overview" | null {
  if (lookup.status === "none") return null;
  return "/overview";
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

/** The languages the public pages have strings for (dashboard-landing.json is English and Russian). */
export const LANDING_LOCALES = ["ru", "en"] as const;
export type LandingLocale = (typeof LANDING_LOCALES)[number];

/** The landing locale behind a BCP 47 tag from next-intl ("ru-RU", "en-GB"); English otherwise. */
export function landingLocale(tag: string): LandingLocale {
  return tag.toLowerCase().startsWith("ru") ? "ru" : "en";
}

/** The other language, for the one-tap switch in the mobile header. */
export function otherLocale(locale: LandingLocale): LandingLocale {
  return locale === "ru" ? "en" : "ru";
}

/**
 * The language cookie the dashboard's account menu (3.4a, WP 1.2) also writes; src/i18n/request.ts reads
 * it per request. The public pages write the same cookie, so a visitor's choice follows them to sign-in.
 */
export const LOCALE_COOKIE = "uki_locale";

/** One year: the choice outlives the session, as the plan asks of the dashboard switch. */
export const LOCALE_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 365;
