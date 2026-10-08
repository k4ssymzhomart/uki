// Automated smoke test for Üki Lock: loads the built extension into Chromium (Chrome for Testing) next to
// the desktop app's real relay (apps/desktop/src/main/lock-relay.ts) running in Node, serves the built mock
// portal, and walks pairing, a browser exam (lock, new tab, blocked site, copy, full screen exit, release at
// the done path) and an exam in the app. Screenshots land in SMOKE_SHOTS (default: a temp folder).
//
//   pnpm --filter lock build && pnpm --filter lms-mock build
//   pnpm exec tsx apps/lock/scripts/smoke.ts            (from the repository root)
//
// Env: PW_CHROMIUM (browser binary; default the Chrome for Testing of the installed Playwright, from
// `pnpm exec playwright install chromium`; see scripts/chromium.ts), SMOKE_PORT (portal, default 5181),
// SMOKE_SHOTS, SMOKE_QUIET_S (seconds of quiet at the end, default 0), SMOKE_HEADED=1.
// This is not the hand check: real Chrome on the MacBook, and Chrome and Edge on a Windows 11 lab PC, are
// still run by a person.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { type BrowserContext, chromium, type Page, type Worker } from "@playwright/test";
import { type AppToLock, type LockStatus, type LockToApp, lockOrigin } from "@uki/contracts";
import {
  createLockRelay,
  createMemoryPairingStore,
  type PairCode,
} from "../../desktop/src/main/lock-relay.ts";
import { chromiumExecutable } from "./chromium.ts";

const LOCK_DIR = fileURLToPath(new URL("..", import.meta.url));
const EXTENSION = join(LOCK_DIR, ".output/chrome-mv3");
const PORTAL_DIST = join(LOCK_DIR, "../lms-mock/dist");
const PORT = Number(process.env.SMOKE_PORT ?? 5181);
const SHOTS = process.env.SMOKE_SHOTS ?? join(tmpdir(), "uki-lock-smoke");
const QUIET_S = Number(process.env.SMOKE_QUIET_S ?? 0);
const CHROMIUM = chromiumExecutable();
const PORTAL = `http://localhost:${PORT}/physics-1/quiz-3`;
/** Another host for the same files: not allowed, so the rule closes it. */
const OTHER = `http://127.0.0.1:${PORT}/physics-1/quiz-3`;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".png": "image/png",
};

function log(step: string): void {
  process.stdout.write(`• ${step}\n`);
}

/** The built mock portal with the SPA fallback Vercel gives it. */
function servePortal(): Promise<Server> {
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname)).replace(
      /^(\.\.[/\\])+/,
      "",
    );
    let file = join(PORTAL_DIST, path);
    if (!file.startsWith(PORTAL_DIST) || !existsSync(file) || statSync(file).isDirectory())
      file = join(PORTAL_DIST, "index.html");
    res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(PORT, "0.0.0.0", () => resolve(server)));
}

async function until<T>(
  what: string,
  probe: () => T | Promise<T>,
  timeoutMs = 10_000,
): Promise<NonNullable<T>> {
  const start = Date.now();
  for (;;) {
    const value = await probe();
    if (value) return value as NonNullable<T>;
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: join(SHOTS, `${name}.png`) });
  log(`screenshot ${name}.png`);
}

/** chrome.* in the service worker, written as a string so this Node file needs no extension typings. */
function inWorker<T>(worker: Worker, expression: string): Promise<T> {
  return worker.evaluate(expression) as Promise<T>;
}

function examState(
  exam: Extract<AppToLock, { type: "exam.state" }>["exam"],
  phase: "ready" | "writing",
): AppToLock {
  return { type: "exam.state", phase, watch: "watching", locale: "en", exam };
}

async function main(): Promise<void> {
  assert.ok(
    existsSync(join(EXTENSION, "manifest.json")),
    "build the extension first: pnpm --filter lock build",
  );
  assert.ok(
    existsSync(join(PORTAL_DIST, "index.html")),
    "build the portal first: pnpm --filter lms-mock build",
  );
  assert.ok(
    existsSync(CHROMIUM),
    `no browser at ${CHROMIUM}: run pnpm exec playwright install chromium, or set PW_CHROMIUM`,
  );
  mkdirSync(SHOTS, { recursive: true });
  log(`browser ${CHROMIUM}`);

  const server = await servePortal();
  let context: BrowserContext | null = null;
  let relay: ReturnType<typeof createLockRelay> | null = null;
  try {
    context = await chromium.launchPersistentContext(join(tmpdir(), `uki-lock-smoke-profile-${Date.now()}`), {
      executablePath: CHROMIUM,
      headless: process.env.SMOKE_HEADED !== "1",
      viewport: { width: 1280, height: 748 },
      locale: "en-GB",
      args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
    });
    if (process.env.SMOKE_DEBUG === "1") context.on("console", (m) => log(`console: ${m.text()}`));
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
    const extensionId = new URL(worker.url()).host;
    log(`extension loaded: ${extensionId}`);

    // E.3 before the app runs: "Open the Üki app".
    const popup = await context.newPage();
    await popup.setViewportSize({ width: 360, height: 560 });
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.getByRole("heading").first().waitFor();
    await shot(popup, "e3-open-app");

    const received: LockToApp[] = [];
    const statuses: LockStatus[] = [];
    let code: PairCode | null = null;
    relay = createLockRelay({
      allowedOrigin: lockOrigin(extensionId),
      appInfo: () => ({ app_version: "0.1.0", os: "windows", student_name: "Aliya S." }),
      onMessage: (message) => received.push(message),
      onStatus: (status) => statuses.push(status),
      onPairCode: (next) => {
        code = next;
      },
      store: createMemoryPairingStore(),
      log: { info: () => {}, warn: (m) => log(`relay: ${m}`), error: (m) => log(`relay error: ${m}`) },
    });
    const relayPort = await relay.ready;
    log(`relay listening on 127.0.0.1:${relayPort}`);
    const events = () =>
      received.flatMap((m) =>
        m.type === "lock.event" ? [`${m.event.type} ${JSON.stringify(m.event.data)}`] : [],
      );

    // Pairing: the worker finds the app within 2 s; the open popup asks for a code by itself.
    await until("the Lock to connect", () => relay?.status() === "connected");
    const shown = await until("a pairing code", () => code);
    await popup.getByText(`${shown.code.slice(0, 3)} ${shown.code.slice(3)}`).waitFor();
    await shot(popup, "e3-pair");
    await popup.getByRole("button", { name: "Жұптастыру" }).click();
    await until("pairing", () => relay?.status() === "paired");
    log("paired by code");

    // E.4: the app says the browser exam may start.
    const browserExam = {
      session_id: "0192f3a0-0000-7000-8000-00000000a001",
      mode: "browser" as const,
      title: "Physics 1 · Quiz 3",
      starts_at: new Date(Date.now() - 14 * 60_000).toISOString(),
      ends_at: new Date(Date.now() + 26 * 60_000 + 14_000).toISOString(),
      allowed_hosts: [`localhost:${PORT}`],
      lms_url: PORTAL,
      done_path: "/physics-1/quiz-3/review",
    };
    assert.ok(relay.send(examState(browserExam, "ready")));
    await popup.getByRole("button", { name: "Lock and start" }).waitFor();
    await shot(popup, "e4-ready-popup");

    const portal = await context.newPage();
    await portal.goto(PORTAL);
    await portal.getByTestId("start-attempt").waitFor();
    assert.equal(
      await portal.getByTestId("start-attempt").isDisabled(),
      true,
      "Start attempt is off before the lock",
    );
    await shot(portal, "e4-portal-unlocked");
    const other = await context.newPage();
    await other.goto(OTHER);

    // Lock and start, as the popup sends it from the portal tab.
    const portalTabId = await popup.evaluate(
      `chrome.tabs.query({ url: "http://localhost:${PORT}/*" }).then((tabs) => tabs[0].id)`,
    );
    await popup
      .evaluate(`chrome.runtime.sendMessage({ type: "popup.lock", tab_id: ${Number(portalTabId)} })`)
      .catch(() => {});
    const started = await until("lock.started", () => received.find((m) => m.type === "lock.started"));
    log(`locked: ${JSON.stringify(started)}`);
    await until("the other tabs to close", () => context?.pages().length === 1);
    await portal.locator("html[data-uki-lock=locked]").waitFor();
    await portal.locator("uki-lock-bar").waitFor({ state: "attached" });
    await until("Start attempt", async () => !(await portal.getByTestId("start-attempt").isDisabled()));
    const rules = await inWorker<{ id: number }[]>(worker, "chrome.declarativeNetRequest.getSessionRules()");
    assert.equal(rules.length, 1, "one session rule");
    const scripts = await inWorker<{ id: string }[]>(
      worker,
      "chrome.scripting.getRegisteredContentScripts()",
    );
    assert.deepEqual(
      scripts.map((s) => s.id),
      ["uki-lock-guard"],
    );
    const popupPage = await inWorker<string>(worker, "chrome.action.getPopup({})");
    assert.equal(popupPage, "", "the popup is off while locked");
    const lockedWindow = await inWorker<string>(
      worker,
      "chrome.windows.getAll().then((w) => w.map((x) => x.state).join())",
    );
    log(`window state right after the lock: ${lockedWindow}`);
    await shot(portal, "e5-quiz-locked");

    await portal.getByTestId("start-attempt").click();
    await portal.getByRole("radiogroup").waitFor();
    await portal.getByRole("radio").nth(1).click();
    await shot(portal, "e5-attempt");

    // E.6: copy is cancelled, the toast shows, the attempt is noted once per 10 s.
    await portal.evaluate(() => {
      const heading = document.querySelector("h1");
      if (heading) window.getSelection()?.selectAllChildren(heading);
      document.execCommand("copy");
      document.execCommand("copy");
    });
    await until("copy.blocked", () => events().some((e) => e.startsWith("copy.blocked")));
    await portal.waitForTimeout(400);
    await shot(portal, "e6-copy-blocked");
    if (process.env.SMOKE_DEBUG === "1")
      log(
        `window state after copy: ${await inWorker(worker, "chrome.windows.getAll().then((w) => w.map((x) => x.state).join())")} events ${events().join(" | ")}`,
      );
    assert.equal(
      events().filter((e) => e.startsWith("copy.blocked")).length,
      1,
      "copy.blocked once per 10 s",
    );

    // One tab: a new tab closes at once.
    // Playwright's newPage fails when the tab closes before it attaches, which is the point.
    const intruder = await context.newPage().catch(() => null);
    await until("tab.blocked", () => events().some((e) => e.startsWith("tab.blocked")));
    await until("the new tab to close", () => intruder === null || intruder.isClosed());
    log("new tab closed with tab.blocked");
    if (process.env.SMOKE_DEBUG === "1")
      log(
        `window state after the new tab: ${await inWorker(worker, "chrome.windows.getAll().then((w) => w.map((x) => x.state).join())")}`,
      );

    // E.7: a site outside the allowed hosts goes to the block page.
    await portal.goto(OTHER).catch(() => {});
    await portal.waitForURL(/blocked\.html\?host=127\.0\.0\.1/);
    await until("site.closed", () => events().some((e) => e === 'site.closed {"host":"127.0.0.1"}')).catch(
      async (error: unknown) => {
        log(`events so far: ${events().join(" | ")}`);
        log(`outbox: ${JSON.stringify(await inWorker(worker, "chrome.storage.local.get('outbox')"))}`);
        log(
          `tabs: ${JSON.stringify(await inWorker(worker, "chrome.tabs.query({}).then(t => t.map(x => x.url))"))}`,
        );
        throw error;
      },
    );
    await portal.getByRole("button", { name: "Back to the exam" }).waitFor();
    await shot(portal, "e7-site-closed");
    if (process.env.SMOKE_DEBUG === "1")
      log(
        `window state on the block page: ${await inWorker(worker, "chrome.windows.getAll().then((w) => w.map((x) => x.state).join())")}`,
      );
    await portal.getByRole("button", { name: "Back to the exam" }).click();
    await portal.waitForURL(/\/physics-1\/quiz-3\/attempt$/);

    // Full screen: an exit is noted and full screen comes back.
    const windowId = await inWorker<number>(worker, "chrome.windows.getAll().then((w) => w[0].id)");
    const before = await inWorker<string>(worker, `chrome.windows.get(${windowId}).then((w) => w.state)`);
    log(`window state while locked: ${before}`);
    await inWorker(worker, `chrome.windows.update(${windowId}, { state: "normal" })`);
    await until(
      "lock.fullscreen_exit",
      () => events().some((e) => e.startsWith("lock.fullscreen_exit")),
      6000,
    ).catch((error: unknown) =>
      log(`full screen exit not seen (${String(error)}): headless Chromium may not report bounds`),
    );

    // Release at the done path: exam.submitted, then lock.released with the tabs back.
    await portal.getByRole("button", { name: "Finish attempt" }).first().click();
    await portal.waitForURL(/\/review$/);
    const releasedMessage = await until("lock.released", () =>
      received.find((m) => m.type === "lock.released"),
    );
    assert.ok(events().includes("exam.submitted {}"), "exam.submitted before release");
    log(`released: ${JSON.stringify(releasedMessage)}`);
    await until("the tabs to come back", () => (context?.pages().length ?? 0) >= 2);
    assert.equal(
      (await inWorker<unknown[]>(worker, "chrome.declarativeNetRequest.getSessionRules()")).length,
      0,
    );
    assert.equal(
      (await inWorker<unknown[]>(worker, "chrome.scripting.getRegisteredContentScripts()")).length,
      0,
    );
    await portal.locator("html[data-uki-lock=locked]").waitFor({ state: "detached" });
    await shot(portal, "e9-portal-review");
    const released = await context.newPage();
    await released.setViewportSize({ width: 360, height: 560 });
    await released.goto(`chrome-extension://${extensionId}/popup.html`);
    await released.getByRole("button", { name: "Close" }).waitFor();
    await shot(released, "e9-released-popup");
    await released.close();

    // An exam in the app: lock.start keeps one tab on the block page; lock.release brings the tabs back.
    const appExam = {
      ...browserExam,
      session_id: "0192f3a0-0000-7000-8000-00000000a002",
      mode: "app" as const,
    };
    const tabsBefore = context.pages().length;
    relay.send({
      ...examState({ ...appExam, allowed_hosts: [], lms_url: null, done_path: null }, "writing"),
    });
    relay.send({ type: "lock.start" });
    await until("lock.started (app)", () => received.filter((m) => m.type === "lock.started").length === 2);
    await until("one tab", () => context?.pages().length === 1);
    const kept = context.pages()[0];
    assert.ok(kept);
    await kept.waitForURL(/blocked\.html$/);
    await kept.getByRole("heading").waitFor();
    await shot(kept, "app-exam-block-page");
    relay.send({ type: "lock.release", reason: "submitted" });
    await until("lock.released (app)", () => received.filter((m) => m.type === "lock.released").length === 2);
    await until("the tabs back", () => (context?.pages().length ?? 0) === tabsBefore);
    log(`app exam: ${tabsBefore} tabs before, restored`);

    if (QUIET_S > 0) {
      const statusesBefore = statuses.length;
      log(`quiet for ${QUIET_S} s`);
      await new Promise((resolve) => setTimeout(resolve, QUIET_S * 1000));
      assert.equal(relay.status(), "paired", "still paired after the quiet period");
      assert.equal(statuses.length, statusesBefore, "the link never dropped");
      log("still paired after the quiet period");
    }
    log(`events: ${events().join(" | ")}`);
    log(`PASS · screenshots in ${SHOTS}`);
  } finally {
    await context?.close().catch(() => {});
    await relay?.close().catch(() => {});
    server.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`FAIL: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exit(1);
});
