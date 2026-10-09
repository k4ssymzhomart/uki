// /try, the in-browser detection demo (judge mode): the page opens without a session, Start opens the
// fake camera, the detection worker loads the models from the web app itself, and the numbers update.
// Chromium's fake camera draws a test pattern with no face, so the rules engine counts towards
// face.missing and the pause; a second run feeds the brand kit's evidence pictures as the camera
// (--use-file-for-fake-video-capture) to see a face and a phone. Every request the page makes must stay
// on the web app's own origin: no Supabase, no CDN, no upload.
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { type Browser, chromium, expect, type Page, test } from "@playwright/test";
import { WorkerToMain } from "../../packages/detection/src/protocol.ts";
import { ROOT } from "../support/env.ts";
import { message } from "../support/messages.ts";

const FAKE_CAMERA = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"];
const EVIDENCE = join(ROOT, "apps/desktop/src/renderer/screens/gallery-assets");
const CAMERA_FILES = join(ROOT, "test-results/e2e-try-camera");

/** A one-frame Motion JPEG of an evidence picture, which Chromium's file camera repeats. */
function cameraFile(name: "normal" | "phone"): string {
  mkdirSync(CAMERA_FILES, { recursive: true });
  const target = join(CAMERA_FILES, `${name}.mjpeg`);
  copyFileSync(join(EVIDENCE, `uki-evidence-${name}.jpg`), target);
  return target;
}

/** Requests that leave the page's origin; data: and blob: URLs stay in the browser. */
function watchRequests(page: Page, origin: string): string[] {
  const outside: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (url.startsWith("data:") || url.startsWith("blob:")) return;
    if (new URL(url).origin !== origin) outside.push(url);
  });
  return outside;
}

/** The value next to a label in one of the demo's label and value lists. */
function row(page: Page, testId: string, labelKey: string) {
  return page
    .getByTestId(testId)
    .locator("dt", { hasText: message(labelKey) })
    .locator("xpath=following-sibling::dd[1]");
}

async function startDemo(page: Page): Promise<void> {
  await page.getByRole("button", { name: message("dashboard.try.start.button") }).click();
  await expect(page.getByTestId("try-status")).toHaveAttribute("data-status", "running", {
    timeout: 120_000,
  });
}

test.use({ launchOptions: { args: FAKE_CAMERA } });

test.describe("the /try detection demo", () => {
  test("opens without a session and runs the detection worker on the fake camera", async ({
    page,
    baseURL,
  }) => {
    const origin = new URL(baseURL ?? "").origin;
    const outside = watchRequests(page, origin);
    const workers: string[] = [];
    page.on("worker", (worker) => workers.push(worker.url()));

    const response = await page.goto("/try");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(message("dashboard.try.band.title"));
    await expect(page.getByText(message("dashboard.try.band.notice"))).toBeVisible();
    await expect(page.getByText(message("dashboard.try.privacy.title"))).toBeVisible();

    await startDemo(page);
    expect(workers.length).toBeGreaterThan(0);
    await expect(page.getByLabel(message("dashboard.try.camera.label"))).toBeVisible();

    // The worker's overlay data arrives twice a second, each with its frame's time since the start.
    const frameTime = row(page, "try-overlay", "dashboard.try.overlay.elapsed");
    await expect(frameTime).toHaveText(/^\d\d:\d\d$/);
    const first = await frameTime.textContent();
    await expect.poll(async () => frameTime.textContent(), { timeout: 15_000 }).not.toBe(first);

    // The rest of the overlay fills in.
    await expect(row(page, "try-overlay", "dashboard.try.overlay.source")).toHaveText(
      "MediaStreamTrackProcessor",
    );
    await expect(row(page, "try-overlay", "dashboard.try.overlay.fps")).toHaveText(/\d fps$/);
    await expect(row(page, "try-overlay", "dashboard.try.overlay.input")).toHaveText(/\d+ × \d+/);
    await expect(row(page, "try-overlay", "dashboard.try.overlay.delegate")).toHaveText(
      /^face (GPU|CPU) · phone (GPU|CPU)$/,
    );
    await expect(page.getByTestId("try-faces").locator("p").nth(1)).toHaveText("0");

    // No face in the test pattern: the face.missing timer runs, and after face_missing_s (10 s) the
    // rules engine sends face.missing and, in an app exam, the pause.
    await expect(row(page, "try-timers", "dashboard.try.timers.noFace")).not.toHaveText(/^0\.0 /);
    const events = page.getByTestId("try-events");
    await expect(events).toContainText("face.missing", { timeout: 30_000 });
    await expect(events).toContainText("session.paused");
    await expect(page.getByText(message("dashboard.try.paused.title"))).toBeVisible();
    await expect(page.getByRole("button", { name: message("dashboard.try.paused.resume") })).toBeDisabled();

    await page.getByRole("button", { name: message("dashboard.try.stop") }).click();
    await expect(page.getByTestId("try-status")).toHaveAttribute("data-status", "idle");
    await expect(page.getByLabel(message("dashboard.try.camera.label"))).toHaveCount(0);

    expect(outside).toEqual([]);
  });
});

/** A browser whose camera is the evidence picture `name`, and a page of it on /try, started. */
async function demoOnPicture(
  baseURL: string | undefined,
  name: "normal" | "phone",
): Promise<{ browser: Browser; page: Page }> {
  const browser = await chromium.launch({
    args: [...FAKE_CAMERA, `--use-file-for-fake-video-capture=${cameraFile(name)}`],
  });
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto("/try");
  await startDemo(page);
  return { browser, page };
}

test.describe("the /try demo on the evidence pictures", () => {
  test("counts the student's face", async ({ baseURL }) => {
    const { browser, page } = await demoOnPicture(baseURL, "normal");
    try {
      await expect(page.getByTestId("try-faces").locator("p").nth(1)).toHaveText("1");
      await expect(row(page, "try-overlay", "dashboard.try.overlay.yaw")).toHaveText(/-?\d+\.\d°/);
    } finally {
      await browser.close();
    }
  });

  test("scores the phone", async ({ baseURL }) => {
    const { browser, page } = await demoOnPicture(baseURL, "phone");
    try {
      const value = page.getByTestId("try-phone").locator("p").nth(1);
      await expect
        .poll(async () => Number((await value.textContent())?.replace(",", ".")), { timeout: 60_000 })
        .toBeGreaterThanOrEqual(0.5);
    } finally {
      await browser.close();
    }
  });
});

test.describe("the /try demo without a camera", () => {
  for (const [name, problem] of [
    ["NotAllowedError", "denied"],
    ["NotFoundError", "missing"],
  ] as const) {
    test(`says so when getUserMedia fails with ${name}`, async ({ page }) => {
      await page.addInitScript((errorName) => {
        navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("camera", errorName));
      }, name);
      await page.goto("/try");
      await page.getByRole("button", { name: message("dashboard.try.start.button") }).click();
      await expect(page.getByText(message(`dashboard.try.error.${problem}.title`))).toBeVisible();
      await expect(page.getByText(message(`dashboard.try.error.${problem}.body`))).toBeVisible();
      await expect(page.getByRole("button", { name: message("dashboard.try.retry") })).toBeVisible();
      await expect(page.getByTestId("try-status")).toHaveAttribute("data-status", "failed");
    });
  }
});

/**
 * The page's detection worker messages of type `geometry` (Phase F, A3), recorded by wrapping the
 * page's Worker before the app starts one. The app itself only subscribes; nothing draws them yet.
 */
async function recordGeometry(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const scope = window as unknown as { Worker: typeof Worker; ukiGeometry: unknown[] };
    const Original = scope.Worker;
    scope.ukiGeometry = [];
    scope.Worker = class extends Original {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener("message", (event: MessageEvent<unknown>) => {
          const data = event.data as { type?: unknown } | null;
          if (data?.type === "geometry" && scope.ukiGeometry.length < 500) scope.ukiGeometry.push(data);
        });
      }
    };
  });
}

test.describe("the /try demo's geometry, on the real models", () => {
  for (const name of ["normal", "phone"] as const) {
    test(`posts face${name === "phone" ? " and phone" : ""} boxes that pass the protocol (${name} picture)`, async ({
      baseURL,
    }) => {
      const browser = await chromium.launch({
        args: [...FAKE_CAMERA, `--use-file-for-fake-video-capture=${cameraFile(name)}`],
      });
      try {
        const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
        const page = await context.newPage();
        await recordGeometry(page);
        await page.goto("/try");
        await startDemo(page);
        const recorded = async () =>
          page.evaluate(() => (window as unknown as { ukiGeometry: unknown[] }).ukiGeometry);
        const withPhone = (messages: unknown[]) =>
          messages.filter(
            (m) =>
              ((m as { geometry: { phone: { detections: unknown[] } | null } }).geometry.phone?.detections
                .length ?? 0) > 0,
          );
        await expect.poll(async () => (await recorded()).length, { timeout: 60_000 }).toBeGreaterThan(20);
        if (name === "phone") {
          await expect
            .poll(async () => withPhone(await recorded()).length, { timeout: 60_000 })
            .toBeGreaterThan(0);
        }
        const messages = await recorded();
        for (const value of messages) {
          const parsed = WorkerToMain.safeParse(value);
          expect(parsed.success, JSON.stringify(value)).toBe(true);
        }
        if (name === "normal") {
          const faces = messages.flatMap((m) => (m as { geometry: { faces: unknown[] } }).geometry.faces);
          expect(faces.length).toBeGreaterThan(0);
        }
        if (name === "phone") {
          const phones = withPhone(messages);
          console.log(
            `[geometry] ${name}: ${messages.length} messages, a phone box in ${phones.length}, e.g. ${JSON.stringify((phones[0] as { geometry: unknown }).geometry)}`,
          );
        } else {
          console.log(
            `[geometry] ${name}: ${messages.length} messages, e.g. ${JSON.stringify((messages.at(-1) as { geometry: unknown }).geometry)}`,
          );
        }
      } finally {
        await browser.close();
      }
    });
  }
});
