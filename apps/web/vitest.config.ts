import { vitestBase } from "@uki/config/vitest";
import { defineConfig, mergeConfig } from "vitest/config";

// Unit and component tests in jsdom. Modules that need a request (next/headers) are mocked per test;
// test/setup.ts cleans up after each test and stubs the browser APIs Radix needs. The first render of a
// file pays for importing the whole wall: 4.3 to 4.6 s for the Russian wall test on CI, so the Windows
// runner crossed Vitest's 5 s default once the wall grew (WP 1.6); 20 s leaves room without hiding a hang.
export default mergeConfig(
  vitestBase,
  defineConfig({
    test: { environment: "jsdom", css: false, setupFiles: ["./test/setup.ts"], testTimeout: 20_000 },
  }),
);
