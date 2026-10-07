import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";
import { lockManifest } from "./manifest.ts";

/**
 * LOCK_DEV_PUBLIC_KEY lives in the repository root's .env (WXT reads only apps/lock/.env*). Only that one
 * value is taken from it, and only when it is not set already.
 */
function lockEnv(): { LOCK_DEV_PUBLIC_KEY?: string | undefined } {
  const file = fileURLToPath(new URL("../../.env", import.meta.url));
  const fromFile = existsSync(file) ? parseEnv(readFileSync(file, "utf8")).LOCK_DEV_PUBLIC_KEY : undefined;
  return { LOCK_DEV_PUBLIC_KEY: process.env.LOCK_DEV_PUBLIC_KEY || fromFile };
}

export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-react"],
  // Explicit imports only (wxt/browser, wxt/utils/*), so plain tsc checks the code without generated globals.
  imports: false,
  targetBrowsers: ["chrome", "edge"],
  manifestVersion: 3,
  manifest: lockManifest(lockEnv()),
  vite: () => ({
    plugins: [tailwindcss()],
    resolve: { dedupe: ["react", "react-dom"] },
    // Fonts are inlined: the content script's @font-face rules move into the exam page's document, where a
    // chrome-extension:// URL would need a web-accessible resource. Bundled, never a CDN.
    build: { assetsInlineLimit: (file: string) => (file.endsWith(".woff2") ? true : undefined) },
  }),
  // Next.js has 3000 and the mock portal 5180.
  dev: { server: { port: 5183 } },
  // pnpm dev builds in watch mode; load .output/chrome-mv3-dev as an unpacked extension.
  webExt: { disabled: true },
});
