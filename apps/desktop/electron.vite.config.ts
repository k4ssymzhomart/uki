import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "electron-vite";
import type { Plugin } from "vite";
import { buildCsp } from "./src/shared/csp.ts";

/** One .env at the repository root; Vite exposes only VITE_* (and MAIN_VITE_*, PRELOAD_VITE_*) from it. */
const envDir = fileURLToPath(new URL("../..", import.meta.url));

/** Writes the policy into index.html's CSP meta: the build policy, or the dev server's relaxed one. */
function cspMeta(supabaseUrl: string | undefined): Plugin {
  return {
    name: "uki-csp-meta",
    transformIndexHtml: {
      order: "pre",
      handler: (html, context) =>
        html.replace("__UKI_CSP__", buildCsp({ supabaseUrl, dev: context.server !== undefined })),
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, "VITE_");
  const supabaseUrl = env.VITE_SUPABASE_URL || undefined;
  if (!supabaseUrl) {
    console.warn(
      "[desktop] VITE_SUPABASE_URL is not set: the CSP allows no Supabase host (see .env.example)",
    );
  }

  return {
    // Main: everything bundled (workspace packages ship TypeScript source), so the packaged app needs no
    // node_modules. electron and Node built-ins stay external.
    main: {
      envDir,
      build: { externalizeDeps: false },
    },
    // Preload: sandboxed, so one self-contained CommonJS file that requires only "electron".
    preload: {
      envDir,
      build: {
        externalizeDeps: false,
        lib: { entry: "src/preload/index.ts", formats: ["cjs"], fileName: () => "index.cjs" },
      },
    },
    renderer: {
      envDir,
      plugins: [react(), tailwindcss(), cspMeta(supabaseUrl)],
      resolve: { dedupe: ["react", "react-dom"] },
      worker: { format: "es" },
      server: { port: 5173, strictPort: true },
    },
  };
});
