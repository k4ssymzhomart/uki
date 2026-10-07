// The live wall under load (WP 0.7 exit: "with pnpm demo:simulate running 120 sessions, the wall follows
// events within 1 s; a proctor sees only assigned exams"). Not part of `pnpm e2e`: it runs the
// simulator for several minutes against the seeded Mathematics 2, which must be open (lobby or live;
// `pnpm demo:reset` sets that up).
//
//   pnpm exec playwright test -c e2e/simulate/playwright.config.ts
//
// UKI_E2E_LOAD_SECONDS sets the measuring window (default 240); UKI_E2E_START=1 lets the run start a
// scheduled Mathematics 2 through the simulator's --start-after instead of waiting for its clock.
import { defineConfig, devices } from "@playwright/test";
import { baseURL, webServer } from "../support/web-server.ts";

export default defineConfig({
  testDir: ".",
  testMatch: ["wall-under-load.spec.ts"],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 40 * 60_000,
  expect: { timeout: 30_000 },
  outputDir: "../../test-results/simulate",
  reporter: [["list"]],
  globalSetup: "../global-setup.ts",
  use: {
    baseURL,
    locale: "en-GB",
    timezoneId: "Asia/Almaty",
    trace: "off",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer,
});
