import { vitestBase } from "@uki/config/vitest";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(
  vitestBase,
  defineConfig({
    test: {
      environment: "node",
      // The bundle test builds dist/ with esbuild and starts it; the Windows test registers scheduled tasks.
      testTimeout: 120_000,
    },
  }),
);
