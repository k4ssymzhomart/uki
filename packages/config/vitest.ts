import { defineConfig } from "vitest/config";

/** Shared Vitest defaults. Packages spread this and add their own environment. */
export const vitestBase = defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "test/**/*.test.ts", "test/**/*.test.tsx"],
    passWithNoTests: true,
    reporters: ["default"],
  },
});
