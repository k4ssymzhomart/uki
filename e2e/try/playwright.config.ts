// `pnpm e2e:try`: the /try detection demo (judge mode) in Chromium with a fake camera
// (--use-fake-device-for-media-stream), and the dashboard PWA (pwa.spec.ts, production builds only).
// It needs no database and no Supabase: the page makes no call to either, and try.spec.ts fails if it
// requests anything outside the web app's own origin. The web app serves the models from
// apps/web/public/models (`pnpm --filter web models`, or the build).
//
//   pnpm e2e:try                          `next dev` on 3430, or reuse one already running there
//   UKI_TRY_START=1 pnpm e2e:try          `next start` on 3430 after `pnpm --filter web build` (CI)
//   UKI_E2E_BASE_URL=http://localhost:3000 pnpm e2e:try   a web app that is already running
import { defineConfig, devices } from "@playwright/test";

const CI = process.env.CI !== undefined && process.env.CI !== "" && process.env.CI !== "false";
const port = Number(process.env.UKI_TRY_PORT ?? 3430);
const external = process.env.UKI_E2E_BASE_URL;
const baseURL = external ?? `http://localhost:${port}`;
const mode = process.env.UKI_TRY_START === "1" ? "start" : "dev";

export default defineConfig({
  testDir: ".",
  testMatch: ["try.spec.ts", "pwa.spec.ts"],
  fullyParallel: false,
  workers: 1,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  timeout: 180_000,
  expect: { timeout: 60_000 },
  outputDir: "../../test-results/e2e-try",
  reporter: CI ? [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]] : [["list"]],
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
  ],
  webServer:
    external === undefined
      ? {
          command: `pnpm --filter web exec next ${mode} -p ${port}`,
          url: `${baseURL}/try`,
          reuseExistingServer: !CI,
          timeout: 240_000,
          env: { NEXT_TELEMETRY_DISABLED: "1" },
          stdout: "ignore",
          stderr: "pipe",
        }
      : undefined,
});
