import { vitestBase } from "@uki/config/vitest";
import { defineConfig, mergeConfig } from "vitest/config";

// Renderer tests run in jsdom; main-process tests start with `// @vitest-environment node` and mock "electron".
export default mergeConfig(
  vitestBase,
  defineConfig({
    test: { environment: "jsdom", css: false, include: ["src/**/*.test.ts", "src/**/*.test.tsx"] },
  }),
);
