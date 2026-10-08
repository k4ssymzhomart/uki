import { defineConfig } from "vitest/config";

/** Shared Vitest defaults. Packages spread this and add their own environment. */
export const vitestBase = defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "test/**/*.test.ts", "test/**/*.test.tsx"],
    passWithNoTests: true,
    reporters: ["default"],
    // Component tests in jsdom run several times slower on GitHub's Windows runners and on a loaded
    // laptop; Vitest's 5 s default failed them there while they pass in under a second elsewhere.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
