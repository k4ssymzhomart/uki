// The Chromium binary the Üki Lock scripts launch (smoke.ts, make-icons.ts).
import { chromium } from "@playwright/test";

/**
 * PW_CHROMIUM when set; otherwise the Chrome for Testing build that the installed Playwright downloads
 * (`pnpm exec playwright install chromium`), whatever its revision and OS. The scripts always pass it as
 * `executablePath`: headless, Playwright would otherwise start its headless shell, which cannot load
 * extensions.
 */
export function chromiumExecutable(env: NodeJS.ProcessEnv = process.env): string {
  return env.PW_CHROMIUM || chromium.executablePath();
}
