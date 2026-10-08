// The public pages (WP 1.13): /, /pilot, /privacy and /terms without a session, at the frames' widths
// (1440 in the chromium project, 390 in landing-390), and the pilot form. The page text comes from the
// generated messages, so selectors follow dashboard-landing.json.
import { expect, type Page, test } from "@playwright/test";
import { message } from "./support/messages.ts";
import { adminClient } from "./support/supabase.ts";

const desktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;

/** Every image on screen loaded (art exported from Figma into public/landing), and nothing scrolls sideways. */
async function expectWholePage(page: Page): Promise<void> {
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState("networkidle");
  const broken = await page.evaluate(() =>
    [...document.images]
      .filter((image) => image.offsetParent !== null && (!image.complete || image.naturalWidth === 0))
      .map((image) => image.currentSrc || image.src),
  );
  expect(broken).toEqual([]);
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(page.viewportSize()?.width ?? 0);
}

test.describe("the landing site", () => {
  test("/ shows visitors the landing page with every section, without a session", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      desktop(page)
        ? message("dashboard.landing.hero.title.line1")
        : message("dashboard.landing.hero.title.mobile"),
    );
    for (const key of [
      "pillars.title",
      "how.title",
      "flag.title",
      "universities.title",
      "faq.title",
      "cta.title",
    ] as const) {
      await expect(
        page.getByRole("heading", { name: message(`dashboard.landing.${key}`) }).first(),
      ).toBeVisible();
    }
    if (desktop(page)) {
      await expect(
        page.getByRole("heading", { name: message("dashboard.landing.features.lock.title") }),
      ).toBeVisible();
      await expect(page.getByRole("link", { name: message("dashboard.landing.nav.signIn") })).toHaveAttribute(
        "href",
        "/sign-in",
      );
    } else {
      // The 390 frame has no feature rows; the menu holds the header links.
      await expect(
        page.getByRole("heading", { name: message("dashboard.landing.features.lock.title") }),
      ).toBeHidden();
      await page.getByRole("button", { name: message("dashboard.landing.nav.openMenu") }).click();
      const menu = page.getByRole("navigation", { name: message("dashboard.landing.nav.label") });
      await expect(menu.getByRole("link", { name: message("dashboard.landing.nav.faq") })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();
    }
    await expectWholePage(page);
  });

  test("a FAQ question opens to its answer", async ({ page }) => {
    await page.goto("/#faq");
    const answer = page.getByText(message("dashboard.landing.faq.lms.answer"));
    await expect(answer).toBeHidden();
    await page.getByText(message("dashboard.landing.faq.lms.question")).click();
    await expect(answer).toBeVisible();
  });

  test("the language switch keeps the choice in the uki_locale cookie", async ({ page, context }) => {
    await page.goto("/privacy");
    const russian = page.getByRole("contentinfo").getByRole("button", { name: "РУС" });
    await russian.click();
    await expect
      .poll(async () => (await context.cookies()).find((cookie) => cookie.name === "uki_locale")?.value)
      .toBe("ru");
    await context.clearCookies({ name: "uki_locale" });
  });

  for (const page of [
    { path: "/privacy", title: "privacyPolicy.title", sections: 9, first: "privacyPolicy.whoWeAre.title" },
    { path: "/terms", title: "termsOfUse.title", sections: 10, first: "termsOfUse.audience.title" },
  ] as const) {
    test(`${page.path} is the draft for legal review, with its sections`, async ({ page: browserPage }) => {
      await browserPage.goto(page.path);
      await expect(browserPage.getByRole("heading", { level: 1 })).toHaveText(
        message(`dashboard.landing.${page.title}`),
      );
      await expect(browserPage.getByText(message("dashboard.landing.legal.draft"))).toBeVisible();
      await expect(browserPage.locator("article section")).toHaveCount(page.sections);
      await expect(
        browserPage.getByRole("heading", { name: message(`dashboard.landing.${page.first}`) }),
      ).toBeVisible();
      await expectWholePage(browserPage);
    });
  }
});

test.describe("Book a pilot", () => {
  test("shows each field's line when the form is sent empty", async ({ page }) => {
    await page.goto("/pilot");
    await expect(
      page.getByRole("heading", { name: message("dashboard.landing.pilot.form.title") }),
    ).toBeVisible();
    await page.getByRole("button", { name: message("dashboard.landing.pilot.form.submit") }).click();
    await expect(page.getByText(message("dashboard.landing.pilot.form.error.nameRequired"))).toBeVisible();
    await expect(page.getByText(message("dashboard.landing.pilot.form.error.emailInvalid"))).toBeVisible();
    await expect(
      page.getByText(message("dashboard.landing.pilot.form.error.universityRequired")),
    ).toBeVisible();
    await expectWholePage(page);
  });

  test("stores a request, shows Sent, and refuses a fourth one from the same address", async ({ page }) => {
    const admin = adminClient();
    // request_pilot and pilot_requests arrive with WP 1.1 (20261009000000_phase1.sql).
    const probe = await admin
      .from("pilot_requests" as never)
      .select("id")
      .limit(1);
    test.skip(probe.error !== null, "pilot_requests is not in this database yet (WP 1.1)");

    const email = `pilot-e2e-${Date.now()}@kru.test`;
    try {
      for (let attempt = 1; attempt <= 4; attempt += 1) {
        await page.goto("/pilot");
        await page.getByLabel(message("dashboard.landing.pilot.form.name")).fill("Dana Akhmetova");
        await page.getByLabel(message("dashboard.landing.pilot.form.email")).fill(email);
        await page.getByLabel(message("dashboard.landing.pilot.form.university")).fill("KRU · Kostanay");
        await page.getByRole("button", { name: message("dashboard.landing.pilot.form.submit") }).click();
        if (attempt < 4) {
          await expect(
            page.getByRole("heading", { name: message("dashboard.landing.pilot.sent.title") }),
          ).toBeVisible();
          await expect(page.getByText(email)).toBeVisible();
        } else {
          await expect(page.getByRole("alert")).toHaveText(
            message("dashboard.landing.pilot.form.error.rateLimited"),
          );
        }
      }
    } finally {
      await admin
        .from("pilot_requests" as never)
        .delete()
        .eq("email" as never, email as never);
    }
  });
});
