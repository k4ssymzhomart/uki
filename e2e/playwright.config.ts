// `pnpm e2e`: the dashboard smoke test (plan, Testing and quality gates) in Chromium against the local
// stack. Playwright starts the web app on port 3000 with `next dev`, or reuses one already running there
// outside CI (`pnpm dev`). Needs `supabase start`, `pnpm seed:staff` and `pnpm functions:serve`; the
// global setup checks each and says what is missing.
//
//   UKI_E2E_BASE_URL=http://localhost:3100 pnpm e2e   test a dashboard that is already running elsewhere
//   UKI_E2E_PORT=3100 pnpm e2e                         start `next dev` on another port
//
// The wall under 120 simulated students is a separate, slower run: e2e/simulate/playwright.config.ts.
import { defineConfig, devices } from "@playwright/test";
import { baseURL, CI, webServer } from "./support/web-server.ts";

export default defineConfig({
  testDir: ".",
  testMatch: [
    "dashboard.spec.ts",
    "language.spec.ts",
    "help.spec.ts",
    "review.spec.ts",
    "proctor.spec.ts",
    "students.spec.ts",
    "landing.spec.ts",
    "report.spec.ts",
    "reports.spec.ts",
    "wizard.spec.ts",
    "privacy.spec.ts",
  ],
  // One worker: the tests share the seeded staff accounts, and latency figures stay honest.
  fullyParallel: false,
  workers: 1,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  timeout: 300_000,
  expect: { timeout: 15_000 },
  // Under the root test-results/ that CI uploads when the stack job fails.
  outputDir: "../test-results/e2e",
  reporter: CI ? [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]] : [["list"]],
  globalSetup: "./global-setup.ts",
  use: {
    baseURL,
    locale: "en-GB",
    timezoneId: "Asia/Almaty",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      // The public pages at the Mobile 390 frame's width (WP 1.13).
      name: "landing-390",
      testMatch: ["landing.spec.ts"],
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer,
});
