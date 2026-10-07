// Starts the built app (`electron-vite build --mode e2e`, so out/ holds the e2e renderer with the
// synthetic camera) under Playwright's Electron driver, each launch in its own userData folder: a new
// anonymous student, an empty outbox and its own single-instance lock.
//
// Development flags (src/main/dev-flags.ts, ignored by packaged builds):
//   UKI_DEV_IGNORE_APPS=1   this Mac runs Telegram, WhatsApp and Claude; 1.2 would refuse to continue
//   UKI_DEV_NO_KIOSK=1      lockdown keeps quit blocked without taking the screen (UKI_E2E_KIOSK=1 runs
//                           the real kiosk; the app leaves it at 3.1 or 2.1d)
//   UKI_ALLOW_CAPTURE=1     content protection off, so screenshots show the window
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron, type ElectronApplication, type Page } from "@playwright/test";

export const DESKTOP_DIR = fileURLToPath(new URL("../..", import.meta.url));
const require = createRequire(import.meta.url);
/** The electron package's main export is the path of its binary. */
const ELECTRON = require("electron") as unknown as string;

export interface LaunchedApp {
  app: ElectronApplication;
  page: Page;
  /** Main and renderer output, newest last, for failure reports. */
  logs: string[];
  close(): Promise<void>;
}

export async function launchApp(name: string, options: { kiosk?: boolean } = {}): Promise<LaunchedApp> {
  const userData = mkdtempSync(join(tmpdir(), `uki-e2e-${name}-`));
  const app = await _electron.launch({
    executablePath: ELECTRON,
    args: [DESKTOP_DIR],
    cwd: DESKTOP_DIR,
    env: {
      ...process.env,
      UKI_USER_DATA_DIR: userData,
      UKI_DEV_IGNORE_APPS: "1",
      UKI_DEV_NO_KIOSK: options.kiosk ? "0" : "1",
      UKI_ALLOW_CAPTURE: "1",
    },
  });
  const logs: string[] = [];
  const keep = (line: string) => {
    logs.push(line);
    if (logs.length > 2000) logs.shift();
  };
  app.process().stdout?.on("data", (data: Buffer) => keep(`[main] ${data.toString().trimEnd()}`));
  app.process().stderr?.on("data", (data: Buffer) => keep(`[main] ${data.toString().trimEnd()}`));
  const page = await app.firstWindow();
  page.on("console", (message) => keep(`[renderer:${message.type()}] ${message.text()}`));
  page.on("pageerror", (error) => keep(`[renderer:pageerror] ${error.message}`));
  page.on("crash", () => keep("[renderer:crash]"));
  page.on("framenavigated", (frame) => keep(`[renderer:navigated] ${frame.url()}`));

  return {
    app,
    page,
    logs,
    async close() {
      // Quit waits while the exam holds the app; a test that failed mid-exam kills it instead.
      const closed = app.close().then(
        () => true,
        () => false,
      );
      const timedOut = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 10_000));
      if (!(await Promise.race([closed, timedOut]))) app.process().kill("SIGKILL");
      try {
        rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
      } catch {
        // Electron may still be flushing its profile; the folder is in the system's temp directory.
      }
    },
  };
}
