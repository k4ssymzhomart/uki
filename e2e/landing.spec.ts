// The public pages (WP 1.13): /, /pilot, /privacy and /terms without a session, at the frames' widths
// (1440 in the chromium project, 390 in landing-390), and the pilot form. The page text comes from the
// generated messages, so selectors follow dashboard-landing.json.
import { expect, type Page, test } from "@playwright/test";
import { LOCALE_COOKIE } from "./support/dashboard.ts";
import { readE2eEnv } from "./support/env.ts";
import { message } from "./support/messages.ts";
import { STAFF } from "./support/seed.ts";
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
    // No login in the guide: no address and no field; the password is on the jury's one-pager.
    expect(await guide.innerText()).not.toMatch(/@/);
    await expect(guide.locator("input")).toHaveCount(0);
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

    // Every link for the jury leads to /demo.
    await launcher.click();
    await guide.getByRole("link", { name: message("dashboard.landing.guide.all") }).click();
    await expect(page).toHaveURL(/\/demo$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(message("dashboard.landing.demo.title"));

    // Live demo goes to sign-in with the jury's email filled in, then /demo/live.
    await page.goto("/");
    await launcher.click();
    await guide.getByRole("link", { name: message("dashboard.landing.guide.signIn.action") }).click();
    await expectLiveDemoSignIn(page);
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

// The judge path (user requests of 8 and 9 October; docs/decisions.md, "1.13 Landing: user decisions and
// judge path"): Live demo opens sign-in with the jury's email filled in and /demo/live as next; sign-in
// follows only a safe internal next; /demo/live sends a visitor to sign-in and staff to DEMO-LIVE's wall;
// /demo is public. The tests in "with the stack" sign in and run in CI's stack job, at 1440 only.
const LIVE_DEMO = "/sign-in?email=judge%40kru.test&next=/demo/live";
const JUDGE_EMAIL = "judge@kru.test";
const UNSAFE_NEXT = [
  "//evil.example",
  "//evil.example/demo/live",
  "/\\evil.example",
  "https://evil.example",
  "javascript:alert(1)",
  "/\t/evil.example",
  "/..//evil.example",
  "/sign-in",
] as const;

/** The sign-in form's hidden `next` field (absent when sign-in will use the role landing). */
function nextField(page: Page) {
  return page.locator('form input[type="hidden"][name="next"]');
}

function emailField(page: Page) {
  return page.getByLabel(message("dashboard.signIn.email"), { exact: true });
}

/** A.0 Sign in reached through Live demo: the jury's email filled in, /demo/live as next. */
async function expectLiveDemoSignIn(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/sign-in\?email=judge%40kru\.test&next=\/demo\/live$/);
  await expect(emailField(page)).toHaveValue(JUDGE_EMAIL);
  await expect(nextField(page)).toHaveValue("/demo/live");
  await expect(page.getByLabel(message("dashboard.signIn.password"), { exact: true })).toHaveValue("");
}

/**
 * Waits until the page's path (not its query: `/sign-in?next=/students` ends in "/students" too) is
 * `pathname`.
 */
async function expectPath(page: Page, pathname: string, message?: string): Promise<void> {
  await expect.poll(() => new URL(page.url()).pathname, { message, timeout: 90_000 }).toBe(pathname);
}

/** Signs in through the form already on screen with the seeded staff password. */
async function submitSignIn(page: Page, email: string): Promise<void> {
  await emailField(page).fill(email);
  await page
    .getByLabel(message("dashboard.signIn.password"), { exact: true })
    .fill(readE2eEnv().SEED_STAFF_PASSWORD);
  await page.getByRole("button", { name: message("dashboard.signIn.submit"), exact: true }).click();
}

test.describe("the judge path", () => {
  test("Live demo on the landing opens sign-in with the jury's email filled in", async ({ page }) => {
    await page.goto("/");
    const live = page.getByRole("link", { name: message("dashboard.landing.hero.liveDemo"), exact: true });
    await expect(live).toHaveAttribute("href", LIVE_DEMO);
    await expect(live).toBeInViewport();
    if (!desktop(page)) {
      await page.getByRole("button", { name: message("dashboard.landing.nav.openMenu") }).click();
      await expect(
        page
          .getByRole("navigation", { name: message("dashboard.landing.nav.label") })
          .getByRole("link", { name: message("dashboard.landing.nav.liveDemo"), exact: true }),
      ).toHaveAttribute("href", LIVE_DEMO);
      await page.keyboard.press("Escape");
    }
    await live.click();
    await expectLiveDemoSignIn(page);
  });

  test("/demo/live without a session goes to sign-in, which comes back to it", async ({ page }) => {
    await page.goto("/demo/live");
    await expect(page).toHaveURL(/\/sign-in\?next=\/demo\/live$/);
    await expect(nextField(page)).toHaveValue("/demo/live");
    await expect(emailField(page)).toHaveValue("");
  });

  test("sign-in carries only a safe internal next, and only an email address", async ({ page }) => {
    for (const next of UNSAFE_NEXT) {
      await page.goto(
        `/sign-in?email=${encodeURIComponent("not an email")}&next=${encodeURIComponent(next)}`,
      );
      await expect(page.getByRole("button", { name: message("dashboard.signIn.submit") })).toBeVisible();
      await expect(nextField(page), next).toHaveCount(0);
      await expect(emailField(page)).toHaveValue("");
    }
    await page.goto("/sign-in?next=%2Freview%3Fsession%3D1");
    await expect(nextField(page)).toHaveValue("/review?session=1");
  });

  test("/demo is public: the live demo, the jury's email, the files, /try and three things to try", async ({
    page,
  }) => {
    const response = await page.goto("/demo");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(message("dashboard.landing.demo.title"));
    const m = (key: string) => message(`dashboard.landing.demo.${key}`);

    const dashboard = page.getByRole("region", { name: m("dashboard.title") });
    await expect(dashboard.getByText(JUDGE_EMAIL, { exact: true })).toBeVisible();
    await expect(dashboard.getByText(m("dashboard.passwordWhere"))).toBeVisible();
    // Nothing to type a login into (the header's language forms carry only hidden fields).
    await expect(page.locator('main input:not([type="hidden"])')).toHaveCount(0);
    await expect(dashboard.getByRole("link", { name: m("dashboard.liveDemo") })).toHaveAttribute(
      "href",
      LIVE_DEMO,
    );
    await expect(dashboard.getByRole("link", { name: m("dashboard.open") })).toHaveAttribute(
      "href",
      "/sign-in",
    );

    const tries = page.getByRole("region", { name: m("tries.title") });
    await expect(tries.getByRole("heading", { level: 3 })).toHaveText(
      ["flags", "ask", "report"].map((id) => m(`tries.${id}.title`)),
    );
    await expect(page.getByRole("link", { name: m("try.action") })).toHaveAttribute("href", "/try");

    // The video's slot: the labelled placeholder until NEXT_PUBLIC_DEMO_VIDEO_URL is set (CI sets none).
    const video = page.getByRole("region", { name: m("video.title") });
    if (process.env.NEXT_PUBLIC_DEMO_VIDEO_URL) {
      await expect(video.getByRole("link")).toHaveAttribute("target", "_blank");
    } else {
      await expect(video.getByText(m("video.soon.title"))).toBeVisible();
    }

    const apps = page.getByRole("region", { name: m("apps.title") });
    const hrefs = await apps
      .getByRole("link")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")));
    expect(hrefs).toEqual([...RELEASE_FILES.map((file) => `${LATEST}/download/${file}`), LATEST]);

    await dashboard.getByRole("link", { name: m("dashboard.liveDemo") }).click();
    await expectLiveDemoSignIn(page);
    await page.goto("/demo");
    await expectWholePage(page);
  });
});

test.describe("the judge path with the stack", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "Signs in twice; runs once, at 1440");

  test("after sign-in, a safe next is followed and any other goes to the role landing", async ({
    page,
    context,
    baseURL,
  }) => {
    const url = baseURL ?? "http://localhost:3000";
    await context.addCookies([{ name: LOCALE_COOKIE, value: "en", url }]);

    // Through the form: the exam office signs in with next=/students and lands there.
    await page.goto("/sign-in?next=/students");
    await submitSignIn(page, STAFF.dana);
    await expectPath(page, "/students");
    await expect(
      page.getByRole("heading", { level: 1, name: message("dashboard.students.title") }),
    ).toBeVisible();

    // Signed in, sign-in sends a safe next on and everything else to the overview.
    await page.goto("/sign-in?next=/review");
    await expectPath(page, "/review");
    for (const next of UNSAFE_NEXT) {
      await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
      await expectPath(page, "/overview", next);
    }

    // /demo/live opens DEMO-LIVE's wall, or says the exam is not there yet (the CI seed has none).
    const { data: demo, error } = await adminClient()
      .from("exams")
      .select("id")
      .eq("code", "DEMO-LIVE")
      .maybeSingle();
    expect(error).toBeNull();
    const response = await page.goto("/demo/live");
    if (demo) {
      await expectPath(page, `/exams/${demo.id}/live`);
    } else {
      expect(response?.status()).toBe(404);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        message("dashboard.landing.demoLive.missing.title"),
      );
      await expect(page.getByText("DEMO-LIVE")).toBeVisible();
    }

    // Through the form again, signed out: a next to another site is ignored.
    await context.clearCookies();
    await context.addCookies([{ name: LOCALE_COOKIE, value: "en", url }]);
    await page.goto(`/sign-in?next=${encodeURIComponent("//evil.example")}`);
    await expect(nextField(page)).toHaveCount(0);
    await submitSignIn(page, STAFF.dana);
    await expectPath(page, "/overview");
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
    { path: "/demo", h1: "demo.title", h1Mobile: "demo.title" },
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
