// The desktop flow against the local stack (`supabase start` and `pnpm functions:serve`):
//   pnpm --filter desktop exec vitest run -c src/renderer/test/vitest.stack.config.mjs
// Not part of `pnpm check`: it needs the stack. The global setup is the functions' integration setup,
// which waits for the four Edge Functions and provides the stack's URL and keys through inject("stack").
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL("../../..", import.meta.url)),
  test: {
    name: "desktop-stack",
    environment: "node",
    include: ["src/renderer/test/**/*.integration.ts"],
    globalSetup: [fileURLToPath(new URL("../../../../../test/integration/global-setup.ts", import.meta.url))],
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 180_000,
  },
});
