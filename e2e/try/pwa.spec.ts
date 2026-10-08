// The dashboard PWA (judge mode): the manifest and the brand icons, Chrome's own installability check,
// and the offline page the service worker shows when a page cannot load. The worker registers in
// production builds only, so this runs against `next start` (UKI_TRY_START=1, as CI does).
import { expect, test } from "@playwright/test";
import { message } from "../support/messages.ts";

test.skip(process.env.UKI_TRY_START !== "1", "the service worker registers in production builds only");

test("the dashboard is installable and shows the offline page without a network", async ({
  page,
  context,
}) => {
  const manifest = await page.request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  const body = (await manifest.json()) as { name: string; start_url: string; icons: { src: string }[] };
  expect(body).toMatchObject({ name: message("dashboard.pwa.name"), start_url: "/", display: "standalone" });
  for (const icon of body.icons) {
    const response = await page.request.get(icon.src);
    expect(response.headers()["content-type"], icon.src).toBe("image/png");
  }

  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  const cdp = await context.newCDPSession(page);
  const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
  expect(installabilityErrors).toEqual([]);

  // Once the worker controls the page, a navigation without a network gets the offline page, styled
  // from the worker's cache, in both languages.
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await context.setOffline(true);
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: message("dashboard.pwa.offline.title") })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: message("dashboard.pwa.offline.title", "ru") }),
  ).toBeVisible();
  const display = await page.locator("main").evaluate((main) => getComputedStyle(main).display);
  expect(display).toBe("flex");
  await context.setOffline(false);
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: message("dashboard.pwa.offline.title") })).toHaveCount(0);
});
