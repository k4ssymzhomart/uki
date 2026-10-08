"use server";

import { Uuid } from "@uki/contracts";
import { cookies } from "next/headers";
import { DashboardLocale, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE_S } from "../../i18n/locale.ts";
import { requireStaff } from "../../lib/auth.ts";
import { FACULTY_COOKIE, FACULTY_COOKIE_MAX_AGE_S, scopesFaculty } from "./scope.ts";

export type PreferenceResult = { ok: true } | { ok: false; error: "invalid" | "failed" | "forbidden" };

/** Preference cookies: only the server reads them, on every page, for a year. */
function preferenceCookie(maxAge: number) {
  return {
    path: "/",
    maxAge,
    sameSite: "lax" as const,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  };
}

/**
 * 3.4a's Language row: keeps the dashboard language in the `uki_locale` cookie for a year, so it holds
 * after a sign-out and in a new browser session. Setting the cookie re-renders the page in it.
 */
export async function setDashboardLocale(locale: unknown): Promise<PreferenceResult> {
  const parsed = DashboardLocale.safeParse(locale);
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (!(await requireStaff())) return { ok: false, error: "failed" };
  (await cookies()).set(LOCALE_COOKIE, parsed.data, preferenceCookie(LOCALE_COOKIE_MAX_AGE_S));
  return { ok: true };
}

/**
 * 0.1c's workspace menu: a faculty id filters the overview to that faculty, null shows all faculties.
 * Only the exam office has the menu. The id is only a filter over rows RLS already allows.
 */
export async function setOverviewFaculty(facultyId: unknown): Promise<PreferenceResult> {
  const parsed = Uuid.nullable().safeParse(facultyId);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const staff = await requireStaff();
  if (!staff) return { ok: false, error: "failed" };
  if (!scopesFaculty(staff.role)) return { ok: false, error: "forbidden" };
  const store = await cookies();
  if (parsed.data === null) store.delete(FACULTY_COOKIE);
  else store.set(FACULTY_COOKIE, parsed.data, preferenceCookie(FACULTY_COOKIE_MAX_AGE_S));
  return { ok: true };
}
