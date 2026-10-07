// `pnpm test:integration`: two projects.
//   functions-unit  pure modules of supabase/functions (CORS, errors, rate limit, review and path
//                   rules); needs nothing running.
//   integration     test/integration against the local stack and `pnpm functions:serve`; the global
//                   setup stops with a clear message when either is missing.
// Run one with `pnpm test:integration --project functions-unit`.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "functions-unit",
          environment: "node",
          include: ["supabase/functions/**/*.test.ts"],
          exclude: ["supabase/functions/_shared/contracts/**", "**/node_modules/**"],
        },
      },
      {
        test: {
          name: "integration",
          environment: "node",
          include: ["test/integration/**/*.test.ts"],
          globalSetup: ["test/integration/global-setup.ts"],
          // One file at a time: latency figures stay honest and the per-session rate limit is not shared.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
