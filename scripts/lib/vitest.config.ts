// Unit tests of the repository scripts (scripts/lib, scripts/guards); `pnpm test:scripts`, part of `pnpm check`.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "scripts",
    root: fileURLToPath(new URL("../..", import.meta.url)),
    include: ["scripts/lib/**/*.test.ts", "scripts/guards/**/*.test.ts"],
    environment: "node",
  },
});
