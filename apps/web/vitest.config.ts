import { vitestBase } from "@uki/config/vitest";
import { defineConfig, mergeConfig } from "vitest/config";

// Unit and component tests in jsdom. Modules that need a request (next/headers) are mocked per test;
// test/setup.ts cleans up after each test and stubs the browser APIs Radix needs.
export default mergeConfig(
  vitestBase,
  defineConfig({ test: { environment: "jsdom", css: false, setupFiles: ["./test/setup.ts"] } }),
);
