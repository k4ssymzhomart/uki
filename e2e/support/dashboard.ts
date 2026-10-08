// Page helpers for the dashboard: A.0 sign-in through the real form, the 0.1 exams table, and waiting
// for the live wall's private channel.
import { expect, type Locator, type Page, type Response } from "@playwright/test";
import { readE2eEnv } from "./env.ts";
import { type DashboardLocale, message } from "./messages.ts";
import { baseURL } from "./web-server.ts";

const SIGN_IN_ERRORS = [
  "credentials",
  "rateLimited",
  "unavailable",
  "notStaff",
  "email",
  "password",
] as const;
const ATTEMPTS = 3;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The sign-in form's own error messages that are on screen. */
async function signInErrors(page: Page, locale: DashboardLocale): Promise<string[]> {
  const shown: string[] = [];
  for (const code of SIGN_IN_ERRORS) {
    const text = message(`dashboard.signIn.error.${code}`, locale);
    if (await page.getByText(text, { exact: true }).isVisible()) shown.push(text);
  }
  return shown;
}

/** The dashboard language cookie (apps/web/src/i18n/locale.ts). */
export const LOCALE_COOKIE = "uki_locale";

/**
 * Signs in on A.0 with the seeded staff password and lands on the overview. "Sign-in is unavailable"
 * (Auth answered 5xx or timed out, which a loaded local stack does) is retried twice; any other form
 * error fails at once with its text.
 *
 * The seeded staff's first language is Russian, so the dashboard would open in Russian; the Phase 0
 * tests read English, so `locale` sets the language cookie first. Pass null to keep the browser's own
 * cookies, as the language test does.
 */
export async function signIn(
  page: Page,
  email: string,
  options: { locale?: "en" | "ru" | null } = {},
): Promise<void> {
  const locale = options.locale === undefined ? "en" : options.locale;
  if (locale !== null) {
    await page.context().addCookies([{ name: LOCALE_COOKIE, value: locale, url: baseURL }]);
  }
  // The sign-in page follows the cookie; without one (no staff member yet) it is English.
  const form: DashboardLocale = locale ?? "en";
  const unavailable = message("dashboard.signIn.error.unavailable", form);
  const anyError = page.getByText(
    new RegExp(
      SIGN_IN_ERRORS.map((code) => escapeRegExp(message(`dashboard.signIn.error.${code}`, form))).join("|"),
    ),
  );
  for (let attempt = 1; ; attempt += 1) {
    await page.goto("/sign-in");
    await page.getByLabel(message("dashboard.signIn.email", form), { exact: true }).fill(email);
    await page
      .getByLabel(message("dashboard.signIn.password", form), { exact: true })
      .fill(readE2eEnv().SEED_STAFF_PASSWORD);
    await page.getByRole("button", { name: message("dashboard.signIn.submit", form), exact: true }).click();
    const outcome = await Promise.race([
      page
        .waitForURL(/\/overview$/, { timeout: 90_000 })
        .then(() => "signed in")
        .catch(() => "timeout"),
      anyError
        .first()
        .waitFor({ state: "visible", timeout: 90_000 })
        .then(() => "form error")
        .catch(() => "timeout"),
    ]);
    if (outcome === "signed in") break;
    const shown = await signInErrors(page, form);
    if (attempt < ATTEMPTS && shown.length === 1 && shown[0] === unavailable) {
      console.warn(`e2e: sign-in for ${email} was unavailable (attempt ${attempt}); trying again`);
      await page.waitForTimeout(3000);
      continue;
    }
    throw new Error(
      `e2e: ${email} did not reach /overview (${shown.join(" ") || outcome}). ` +
        "Check SEED_STAFF_PASSWORD and run `pnpm seed:staff`.",
    );
  }
  // With the browser's own cookies the overview may be in either language.
  const titles = (locale === null ? (["en", "ru"] as const) : [locale]).map((language) =>
    escapeRegExp(message("dashboard.overview.title", language)),
  );
  await expect(
    page.getByRole("heading", { level: 1, name: new RegExp(`^(?:${titles.join("|")})$`) }),
  ).toBeVisible();
}

/** The rows of the 0.1 exams table. */
export function examRows(page: Page): Locator {
  return page
    .getByRole("region", { name: message("dashboard.overview.exams.title"), exact: true })
    .locator("tbody tr");
}

export function examRow(page: Page, title: string): Locator {
  return examRows(page).filter({ hasText: title });
}

/**
 * Resolves when the wall has joined exam:{id}: after SUBSCRIBED it asks PostgREST for the events it
 * may have missed, which is the first events request the browser itself makes (the page's first
 * render reads them on the server). Register before navigating.
 */
export function waitForWallSubscribed(page: Page, examId: string): Promise<Response> {
  const supabaseUrl = readE2eEnv().SUPABASE_URL;
  return page.waitForResponse(
    (response) =>
      response.url().startsWith(`${supabaseUrl}/rest/v1/events?`) &&
      response.url().includes(examId) &&
      response.request().method() === "GET",
    { timeout: 120_000 },
  );
}

export function wallTile(page: Page, sessionId: string): Locator {
  return page.locator(`[data-session-id="${sessionId}"]`);
}

/**
 * The HTTP status of a dashboard page. A 5xx (a statement timeout on a loaded local stack) is not an
 * answer about rights, so it is asked again, up to three times.
 */
export async function pageStatus(page: Page, path: string): Promise<number | undefined> {
  let status: number | undefined;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    status = (await page.goto(path))?.status();
    if (status !== undefined && status < 500) return status;
  }
  return status;
}
