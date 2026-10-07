// The dashboard Playwright starts for both configs: `next dev` on port 3000 (UKI_E2E_PORT), reused when
// one is already running there outside CI, or none at all when UKI_E2E_BASE_URL points at a running app.
import type { PlaywrightTestConfig } from "@playwright/test";
import { ROOT } from "./env.ts";

export const CI = process.env.CI !== undefined && process.env.CI !== "" && process.env.CI !== "false";

const port = Number(process.env.UKI_E2E_PORT ?? 3000);
const external = process.env.UKI_E2E_BASE_URL;

export const baseURL = external ?? `http://localhost:${port}`;

export const webServer: PlaywrightTestConfig["webServer"] =
  external === undefined
    ? {
        // next.config.ts reads NEXT_PUBLIC_* from the root .env; nothing secret is passed on here.
        command: `pnpm --filter web exec next dev -p ${port}`,
        cwd: ROOT,
        url: `${baseURL}/sign-in`,
        reuseExistingServer: !CI,
        timeout: 240_000,
        env: { NEXT_TELEMETRY_DISABLED: "1" },
        stdout: "ignore",
        stderr: "pipe",
      }
    : undefined;
