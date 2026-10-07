// `pnpm --filter @uki/i18n test:browser`: the Kazakh Intl polyfill in a real Chromium, whose ICU has no
// Kazakh data (like Electron's). No server: the test bundles test/browser/page.ts with esbuild and runs it
// in a blank page. Needs Playwright's Chromium (`pnpm exec playwright install chromium`).
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "test/browser",
  testMatch: /.*\.browser\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  outputDir: "../../test-results/i18n-browser",
  reporter: [["list"]],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], timezoneId: "Asia/Almaty" } }],
});
