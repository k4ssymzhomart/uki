import { vitestBase } from "@uki/config/vitest";
import react from "@vitejs/plugin-react";
import { defineConfig, mergeConfig } from "vitest/config";

// Component tests run in jsdom. Other UI agents add src/<group>/*.test.tsx; test/setup.ts holds the shared setup.
export default mergeConfig(
  vitestBase,
  defineConfig({
    plugins: [react()],
    test: {
      environment: "jsdom",
      setupFiles: ["./test/setup.ts"],
      include: ["src/**/*.test.tsx", "src/**/*.test.ts", "test/**/*.test.tsx", "test/**/*.test.ts"],
      css: false,
    },
  }),
);
