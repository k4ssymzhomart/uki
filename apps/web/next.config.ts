import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

/**
 * Local development keeps one `.env` at the repository root. Next.js only reads `apps/web/.env*`, so the
 * public NEXT_PUBLIC_* values are copied from the root file when they are not set already. Nothing else is
 * read: the secret key never reaches the web process. Vercel sets the variables itself.
 */
function loadRootPublicEnv(): void {
  const file = `${repoRoot}.env`;
  if (!existsSync(file)) return;
  const parsed = parseEnv(readFileSync(file, "utf8"));
  for (const [name, value] of Object.entries(parsed)) {
    if (name.startsWith("NEXT_PUBLIC_") && value !== undefined && process.env[name] === undefined) {
      process.env[name] = value;
    }
  }
}
loadRootPublicEnv();

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source (docs/decisions.md): Next.js compiles them.
  transpilePackages: ["@uki/ui", "@uki/tokens", "@uki/contracts", "@uki/i18n", "@uki/db"],
  typedRoutes: true,
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: { root: repoRoot },
  outputFileTracingRoot: repoRoot,
};

export default withNextIntl(nextConfig);
