// WP 1.2: the dashboard language. A staff member whose first language is Russian opens the dashboard in
// Russian; the account menu (3.4a) switches to English and back; the uki_locale cookie keeps the choice
// through a sign-out, a new sign-in and a new browser session. Runs against the local stack with the
// seeded KRU staff (Dana's languages are {ru}).
import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { LOCALE_COOKIE, signIn } from "./support/dashboard.ts";
import { type DashboardLocale, message } from "./support/messages.ts";
import { STAFF } from "./support/seed.ts";

async function expectOverviewIn(page: Page, locale: DashboardLocale): Promise<void> {
  await expect(
    page.getByRole("heading", { level: 1, name: message("dashboard.overview.title", locale), exact: true }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", locale === "ru" ? "ru-RU" : "en-GB");
  await expect(
    page.getByRole("navigation", { name: message("dashboard.shell.navLabel", locale) }),
  ).toContainText(message("dashboard.shell.nav.live", locale));
}

/** Opens 3.4a from the sidebar's user block and picks Language, which switches to the other language. */
async function switchLanguage(page: Page, from: DashboardLocale): Promise<void> {
  await page.getByRole("button", { name: /Dana Akhmetova/ }).click();
  const language = page.getByRole("menuitem", {
    name: new RegExp(message("dashboard.shell.account.language", from)),
  });
  await expect(language).toContainText(message(`language.${from}`));
  await language.click();
}

async function localeCookie(context: BrowserContext): Promise<string | undefined> {
  return (await context.cookies()).find((cookie) => cookie.name === LOCALE_COOKIE)?.value;
}

test("the dashboard opens in the staff member's language, and the switch survives a new session", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  // No cookie: Dana's first language is Russian.
  await signIn(page, STAFF.dana, { locale: null });
  await expectOverviewIn(page, "ru");
  expect(await localeCookie(context)).toBeUndefined();

  // 3.4a: Language РУС switches to English, for this page and the next.
  await switchLanguage(page, "ru");
  await expectOverviewIn(page, "en");
  expect(await localeCookie(context)).toBe("en");
  const cookie = (await context.cookies()).find((item) => item.name === LOCALE_COOKIE);
  expect(cookie?.expires ?? 0).toBeGreaterThan(Date.now() / 1000 + 300 * 24 * 3600);

  // Log out and sign in again: still English, sign-in page included.
  await page.getByRole("button", { name: /Dana Akhmetova/ }).click();
  await page.getByRole("menuitem", { name: message("dashboard.shell.signOut", "en") }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(
    page.getByRole("heading", { level: 1, name: message("dashboard.signIn.title", "en"), exact: true }),
  ).toBeVisible();
  await signIn(page, STAFF.dana, { locale: null });
  await expectOverviewIn(page, "en");

  // A new browser session with the same cookies (closing the browser keeps a cookie with an expiry).
  const state = await context.storageState();
  await context.close();
  const next = await browser.newContext({ storageState: state });
  const again = await next.newPage();
  await again.goto("/overview");
  await expectOverviewIn(again, "en");

  // And back to Russian.
  await switchLanguage(again, "en");
  await expectOverviewIn(again, "ru");
  expect(await localeCookie(next)).toBe("ru");
  await next.close();
});
