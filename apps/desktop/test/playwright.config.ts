// `pnpm --filter desktop e2e`: the student path from join to receipt in the real Electron app against the
// local stack (`supabase start` and `pnpm functions:serve`), with the synthetic camera of the e2e build.
// It needs the detection models (`pnpm models`) and a display, and takes about 4 minutes.
//
// Local only for now. CI would need a macOS or Windows runner with a display, `supabase start`,
// `supabase functions serve` and the models fetched (about 20 MB); the Linux CI job has none of these.
// Run it on a quiet stack: other runs that load the same local Edge Runtime (the 120-student
// simulation) slow every command and make the 1 s budget meaningless.
//
//   UKI_E2E_OFFLINE_S=120   length of the network cut (default 20; exit criterion 8 asks for 120)
//   UKI_E2E_KIOSK=1         real kiosk lockdown during the exam (takes the screen; default off)
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: ["e2e.spec.ts"],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 20 * 60_000,
  expect: { timeout: 20_000 },
  outputDir: "./results/playwright",
  reporter: [["list"]],
  globalSetup: "./support/global-setup.ts",
});
