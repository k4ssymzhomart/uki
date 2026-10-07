import { vitestBase } from "@uki/config/vitest";
import { defineConfig, mergeConfig } from "vitest/config";
import { WxtVitest } from "wxt/testing/vitest-plugin";

// WxtVitest wires WXT's config and an in-memory fake `browser` (wxt/testing/fake-browser) into tests.
export default mergeConfig(
  vitestBase,
  defineConfig({
    plugins: [WxtVitest()],
    test: {
      environment: "jsdom",
      css: false,
      include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.ts", "*.test.ts"],
    },
  }),
);
