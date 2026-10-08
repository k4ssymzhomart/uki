// `pnpm --filter desktop e2e:realtime`: P.10, the proctor's pause reaching the student app while the
// local stack's Realtime restarts (realtime-restart.spec.ts). Local only, like the desktop e2e: it
// needs the stack, the served functions, the detection models, a display and Docker. It stops the
// stack's Realtime container for a few seconds per round, so it is not part of `e2e`; the teardown
// starts Realtime again even when the run fails.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: ["realtime-restart.spec.ts"],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 10 * 60_000,
  expect: { timeout: 20_000 },
  outputDir: "./results/playwright-realtime",
  reporter: [["list"]],
  globalSetup: "./support/global-setup.ts",
  globalTeardown: "./support/realtime-teardown.ts",
});
