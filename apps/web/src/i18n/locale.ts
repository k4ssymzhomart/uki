import { z } from "zod";

/**
 * The dashboard's languages (Phase 1 plan, Decisions: Dashboard language): English and Russian, chosen
 * in the account menu (3.4a) and kept in the `uki_locale` cookie. Without the cookie a staff member gets
 * their first language: Russian, unless it is English. Pages without a staff member (sign-in, the public
 * pages) default to English, the language of the frames. Safe to import from client code.
 */
export const DASHBOARD_LOCALES = ["en", "ru"] as const;
export const DashboardLocale = z.enum(DASHBOARD_LOCALES);
export type DashboardLocale = z.infer<typeof DashboardLocale>;

/** Without a cookie or a staff member. */
export const FALLBACK_DASHBOARD_LOCALE: DashboardLocale = "en";

/** The language cookie: read per request by src/i18n/request.ts, written by the account menu. */
export const LOCALE_COOKIE = "uki_locale";

/** A year, so the choice outlives the browser session and a sign-out. */
export const LOCALE_COOKIE_MAX_AGE_S = 365 * 24 * 60 * 60;

/** The cookie's value when it is a dashboard language, else null (missing, empty or tampered with). */
export function parseDashboardLocale(value: unknown): DashboardLocale | null {
  const parsed = DashboardLocale.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** A staff member's default: Russian, unless their first language (staff.languages[0]) is English. */
export function staffDefaultLocale(languages: readonly string[]): DashboardLocale {
  return languages[0] === "en" ? "en" : "ru";
}

/**
 * The language of a request: the cookie when it holds a dashboard language, else the staff member's
 * first language, else English.
 */
export function resolveDashboardLocale(
  cookie: string | undefined,
  staffLanguages: readonly string[] | null,
): DashboardLocale {
  return (
    parseDashboardLocale(cookie) ??
    (staffLanguages ? staffDefaultLocale(staffLanguages) : FALLBACK_DASHBOARD_LOCALE)
  );
}

/** The dashboard language of a BCP 47 tag from next-intl ("ru-RU" gives "ru"); English otherwise. */
export function dashboardLocaleOf(tag: string): DashboardLocale {
  return tag.toLowerCase().startsWith("ru") ? "ru" : "en";
}

/** The other language: what the account menu's Language row switches to. */
export function otherDashboardLocale(locale: DashboardLocale): DashboardLocale {
  return locale === "en" ? "ru" : "en";
}
