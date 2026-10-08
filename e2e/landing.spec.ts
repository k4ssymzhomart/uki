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
    // The page renders again in Russian through src/i18n/request.ts, which reads the same cookie as 3.4a.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      message("dashboard.landing.privacyPolicy.title", "ru"),
    );
    await expect(page.locator("html")).toHaveAttribute("lang", /^ru/);
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

// The user's landing decisions of 8 October (docs/decisions.md, "1.13 Landing: user decisions 8 Oct"):
// Sign in opens /sign-in, every Book a pilot opens the form at /pilot, the download block links the
// latest GitHub release, and the jury guide opens from its floating button and closes again.
const LATEST = "https://github.com/k4ssymzhomart/uki/releases/latest";
const RELEASE_FILES = [
  "Uki-mac-arm64.dmg",
  "Uki-mac-x64.dmg",
  "Uki-Setup-win-x64.exe",
  "Uki-win-x64.zip",
  "Uki-Lock-chrome.zip",
  "Uki-Lock-edge.zip",
] as const;

/** Only fades move: no transform, no keyframe animation, and transitions on opacity and colour only. */
async function expectFadesOnly(page: Page, selector: string): Promise<void> {
  const motion = await page.locator(selector).evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      transform: style.transform,
      animation: style.animationName,
      properties: style.transitionProperty.split(",").map((name) => name.trim()),
    };
  });
  expect(motion.transform).toBe("none");
  expect(motion.animation).toBe("none");
  for (const name of motion.properties) expect(["opacity", "background-color"]).toContain(name);
}

test.describe("the landing: user decisions of 8 October", () => {
  test("Sign in opens /sign-in", async ({ page }) => {
    await page.goto("/");
    const signIn = message("dashboard.landing.nav.signIn");
    if (desktop(page)) {
      await page.getByRole("link", { name: signIn, exact: true }).click();
    } else {
      await page.getByRole("button", { name: message("dashboard.landing.nav.openMenu") }).click();
      await page
        .getByRole("navigation", { name: message("dashboard.landing.nav.label") })
        .getByRole("link", { name: signIn, exact: true })
        .click();
    }
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole("button", { name: message("dashboard.signIn.submit") })).toBeVisible();
  });

  test("every Book a pilot opens the form at /pilot", async ({ page }) => {
    await page.goto("/");
    const links = page.getByRole("link", { name: message("dashboard.landing.hero.bookPilot"), exact: true });
    // The header (1440) or the hero and the CTA band (both widths), and Universities at 1440.
    expect(await links.count()).toBeGreaterThanOrEqual(desktop(page) ? 4 : 2);
    for (const href of await links.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")))) {
      expect(href).toBe("/pilot");
    }
    await links.first().click();
    await expect(page).toHaveURL(/\/pilot$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      message("dashboard.landing.pilot.title"),
    );
  });

  test("Download links each file of the latest GitHub release", async ({ page }) => {
    await page.goto("/");
    const block = page.getByRole("region", { name: message("dashboard.landing.download.title") });
    // The footer's Üki app leads to the block.
    await page
      .getByRole("contentinfo")
      .getByRole("link", { name: message("dashboard.landing.footer.app"), exact: true })
      .click();
    await expect(block).toBeInViewport();
    const hrefs = await block
      .getByRole("link")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")));
    expect(hrefs).toEqual([...RELEASE_FILES.map((file) => `${LATEST}/download/${file}`), LATEST]);
    for (const browser of ["chrome", "edge"] as const) {
      await expect(
        block.getByRole("link", { name: message(`dashboard.landing.download.lock.${browser}Label`) }),
      ).toHaveAttribute("href", `${LATEST}/download/Uki-Lock-${browser}.zip`);
    }
    await expectWholePage(page);
  });

  test("the jury guide opens and closes by mouse and by keyboard, and its links work", async ({ page }) => {
    await page.goto("/");
    const launcher = page.getByRole("button", { name: message("dashboard.landing.guide.title") });
    const guide = page.getByRole("dialog", { name: message("dashboard.landing.guide.title") });
    const close = guide.getByRole("button", { name: message("dashboard.landing.guide.close") });
    // A small floating button, inside the window at both widths.
    await expect(launcher).toBeInViewport({ ratio: 1 });
    await expect(guide).toBeHidden();

    await launcher.click();
    await expect(guide).toBeVisible();
    await expect(guide.getByRole("heading", { level: 3 })).toHaveCount(5);
    await expect(guide.getByText(message("dashboard.landing.guide.hello"))).toBeVisible();
    const box = await guide.boundingBox();
    expect(
      (box?.x ?? -1) >= 0 && (box?.x ?? 0) + (box?.width ?? 0) <= (page.viewportSize()?.width ?? 0),
    ).toBe(true);
    // The demo login is given in person: no address and no password on the page.
    expect(await guide.innerText()).not.toMatch(/@|password/i);
    await expectFadesOnly(page, "[role=dialog]");
    await close.click();
    await expect(guide).toBeHidden();
    await expect(launcher).toBeFocused();

    // Keyboard only: Enter opens it with the focus inside, Tab stays inside, Escape closes it.
    await page.keyboard.press("Enter");
    await expect(guide).toBeVisible();
    await expect(close).toBeFocused();
    for (let step = 0; step < 6; step += 1) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => document.activeElement?.closest("[role=dialog]") !== null)).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(guide).toBeHidden();
    await expect(launcher).toBeFocused();

    // Get the app closes the guide on the download block.
    await launcher.click();
    await guide.getByRole("link", { name: message("dashboard.landing.guide.app.action") }).click();
    await expect(guide).toBeHidden();
    await expect(
      page.getByRole("region", { name: message("dashboard.landing.download.title") }),
    ).toBeInViewport();

    // Sign in goes to the dashboard's sign-in.
    await launcher.click();
    await guide.getByRole("link", { name: message("dashboard.landing.guide.signIn.action") }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test("with reduced motion the guide still only fades", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const launcher = page.getByRole("button", { name: message("dashboard.landing.guide.title") });
    await expectFadesOnly(page, "button[aria-haspopup=dialog]");
    await launcher.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectFadesOnly(page, "[role=dialog]");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  });
});

test.describe("the public pages in Russian", () => {
  // The real cookie, as the switch and 3.4a write it: src/i18n/request.ts reads it on every request.
  test.beforeEach(async ({ context, baseURL }) => {
    await context.addCookies([{ name: "uki_locale", value: "ru", url: baseURL ?? "http://localhost:3000" }]);
  });

  for (const target of [
    { path: "/", h1: "hero.title.line1", h1Mobile: "hero.title.mobile" },
    { path: "/pilot", h1: "pilot.title", h1Mobile: "pilot.title" },
    { path: "/privacy", h1: "privacyPolicy.title", h1Mobile: "privacyPolicy.title" },
    { path: "/terms", h1: "termsOfUse.title", h1Mobile: "termsOfUse.title" },
  ] as const) {
    test(`${target.path} renders in Russian with no raw key`, async ({ page }) => {
      await page.goto(target.path);
      await expect(page.locator("html")).toHaveAttribute("lang", /^ru/);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(
        message(`dashboard.landing.${desktop(page) ? target.h1 : target.h1Mobile}`, "ru"),
      );
      // A message missing in Russian would show as its key (next-intl's fallback).
      expect(await page.locator("body").innerText()).not.toMatch(/dashboard\.[a-z]/i);
      await expectWholePage(page);
    });
  }

  test("the jury guide and the download block are in Russian", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("region", { name: message("dashboard.landing.download.title", "ru") }),
    ).toBeAttached();
    await page.getByRole("button", { name: message("dashboard.landing.guide.title", "ru") }).click();
    const guide = page.getByRole("dialog", { name: message("dashboard.landing.guide.title", "ru") });
    await expect(guide).toBeVisible();
    await expect(
      guide.getByRole("heading", { name: message("dashboard.landing.guide.look.title", "ru") }),
    ).toBeVisible();
    expect(await guide.innerText()).not.toMatch(/dashboard\.[a-z]/i);
    await page.keyboard.press("Escape");
    await expect(guide).toBeHidden();
  });

  test("Book a pilot's checks and Sent are in Russian", async ({ page }) => {
    const admin = adminClient();
    const email = `pilot-e2e-ru-${Date.now()}@kru.test`;
    try {
      await page.goto("/pilot");
      await page.getByRole("button", { name: message("dashboard.landing.pilot.form.submit", "ru") }).click();
      await expect(
        page.getByText(message("dashboard.landing.pilot.form.error.nameRequired", "ru")),
      ).toBeVisible();
      await page.getByLabel(message("dashboard.landing.pilot.form.name", "ru")).fill("Дана Ахметова");
      await page.getByLabel(message("dashboard.landing.pilot.form.email", "ru")).fill(email);
      await page.getByLabel(message("dashboard.landing.pilot.form.university", "ru")).fill("КРУ · Костанай");
      await page.getByRole("button", { name: message("dashboard.landing.pilot.form.submit", "ru") }).click();
      await expect(
        page.getByRole("heading", { name: message("dashboard.landing.pilot.sent.title", "ru") }),
      ).toBeVisible();
      await expect(page.getByText(email)).toBeVisible();
      expect(await page.locator("body").innerText()).not.toMatch(/dashboard\.[a-z]/i);
      await expectWholePage(page);
    } finally {
      await admin.from("pilot_requests").delete().eq("email", email);
    }
  });
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
          // Next.js's route announcer is an empty alert too, so look for the form's line by its text.
          await expect(
            page
              .getByRole("alert")
              .filter({ hasText: message("dashboard.landing.pilot.form.error.rateLimited") }),
          ).toBeVisible();
          const { count } = await admin
            .from("pilot_requests")
            .select("id", { count: "exact", head: true })
            .eq("email", email);
          expect(count).toBe(3);
        }
      }
    } finally {
      await admin.from("pilot_requests").delete().eq("email", email);
    }
  });
});
