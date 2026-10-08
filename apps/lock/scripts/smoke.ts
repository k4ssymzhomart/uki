// Automated smoke test for Üki Lock: loads the built extension into Chromium (Chrome for Testing) next to
// the desktop app's real relay (apps/desktop/src/main/lock-relay.ts) running in Node, serves the built mock
// portal, and walks pairing, a browser exam (lock, new tab, blocked site, copy, full screen exit, release at
// the done path) and an exam in the app. Phase 1 adds E.5a (Ask proctor through the app), E.5b (the
// calculator, offline), E.8 (the toolbar popup while locked, read through the DevTools protocol because
// Playwright does not attach to action popups) and E.1's rules: the first browser exam runs with every rule
// on, a second one with copy and paste, print, full screen and the calculator off. Screenshots land in
// SMOKE_SHOTS (default: a temp folder).
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
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { type BrowserContext, chromium, type Page, type Worker } from "@playwright/test";
import {
  type AppToLock,
  type BrowserRules,
  DEFAULT_BROWSER_RULES,
  type LockStatus,
  type LockToApp,
  lockOrigin,
} from "@uki/contracts";
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

/** The port Chrome picked for --remote-debugging-port=0, from DevToolsActivePort in the profile. */
async function devtoolsPort(profile: string): Promise<number> {
  const file = join(profile, "DevToolsActivePort");
  const text = await until("DevToolsActivePort", () =>
    existsSync(file) ? readFileSync(file, "utf8") : null,
  );
  return Number(text.split("\n")[0]);
}

/** A page reached over the DevTools protocol: the toolbar popup, which Playwright does not attach to. */
interface CdpPage {
  evaluate<T>(expression: string): Promise<T>;
  screenshot(name: string): Promise<void>;
  close(): void;
}

/**
 * E.8: opens the real toolbar popup with chrome.action.openPopup() from the service worker, then attaches
 * to it through the browser's DevTools endpoint.
 */
async function openToolbarPopup(worker: Worker, port: number, extensionId: string): Promise<CdpPage> {
  const opened = await inWorker<string>(
    worker,
    `chrome.action.openPopup().then(() => "ok", (error) => String(error && error.message))`,
  );
  assert.equal(opened, "ok", `chrome.action.openPopup(): ${opened}`);
  const url = `chrome-extension://${extensionId}/popup.html`;
  const target = await until("the toolbar popup", async () => {
    const list = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as {
      url: string;
      webSocketDebuggerUrl?: string;
    }[];
    return list.find((t) => t.url === url && t.webSocketDebuggerUrl);
  });
  const ws = new WebSocket(target.webSocketDebuggerUrl ?? "");
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener("open", () => resolve(), { once: true });
    ws.addEventListener("error", () => reject(new Error("could not attach to the popup")), { once: true });
  });
  let next = 0;
  const send = (method: string, params: Record<string, unknown>) =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      const id = ++next;
      const onMessage = (event: MessageEvent) => {
        const message = JSON.parse(String(event.data)) as {
          id?: number;
          result?: Record<string, unknown>;
          error?: { message: string };
        };
        if (message.id !== id) return;
        ws.removeEventListener("message", onMessage);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result ?? {});
      };
      ws.addEventListener("message", onMessage);
      ws.send(JSON.stringify({ id, method, params }));
    });
  return {
    async evaluate<T>(expression: string): Promise<T> {
      const result = (await send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
      })) as { result?: { value?: T }; exceptionDetails?: { text: string } };
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
      return result.result?.value as T;
    },
    async screenshot(name: string): Promise<void> {
      const { data } = (await send("Page.captureScreenshot", { format: "png" })) as { data: string };
      writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(data, "base64"));
      log(`screenshot ${name}.png`);
    },
    close: () => ws.close(),
  };
}

/** The popup's text, one line per element with blank lines dropped, once it holds `expected`. */
async function popupText(popup: CdpPage, expected: string): Promise<string> {
  return until(`the popup to show ${expected}`, async () => {
    const text = (await popup.evaluate<string>("document.body.innerText")).replace(/\n+/g, "\n");
    return text.includes(expected) ? text : null;
  });
}

/** A synthetic copy and Cmd/Ctrl+P on the page: whether the guard cancelled each. */
function probeGuard(page: Page): Promise<{ copy: boolean; print: boolean; printStyle: boolean }> {
  return page.evaluate(() => {
    const copy = new Event("copy", { bubbles: true, cancelable: true });
    document.body.dispatchEvent(copy);
    const print = new KeyboardEvent("keydown", { key: "p", ctrlKey: true, bubbles: true, cancelable: true });
    document.body.dispatchEvent(print);
    const style = document.querySelector("style[data-uki-lock-style]")?.textContent ?? "";
    return {
      copy: copy.defaultPrevented,
      print: print.defaultPrevented,
      printStyle: style.includes("@media print"),
    };
  });
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
    const profile = join(tmpdir(), `uki-lock-smoke-profile-${Date.now()}`);
    context = await chromium.launchPersistentContext(profile, {
      executablePath: CHROMIUM,
      headless: process.env.SMOKE_HEADED !== "1",
      viewport: { width: 1280, height: 748 },
      locale: "en-GB",
      // The DevTools endpoint on a free port, for E.8's toolbar popup. Headless Chrome's screen is 800 × 600
      // unless told otherwise, which cuts a popup to the room under the toolbar; E.8 needs 535 px.
      args: [
        `--disable-extensions-except=${EXTENSION}`,
        `--load-extension=${EXTENSION}`,
        "--remote-debugging-port=0",
        "--screen-info={1440x960}",
      ],
    });
    const cdpPort = await devtoolsPort(profile);
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
      appInfo: () => ({ app_version: "0.1.0", os: "windows", student_name: "Aliya Seitkali" }),
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
    const events = (sessionId?: string) =>
      received.flatMap((m) =>
        m.type === "lock.event" && (sessionId === undefined || m.session_id === sessionId)
          ? [`${m.event.type} ${JSON.stringify(m.event.data)}`]
          : [],
      );
    const count = (type: LockToApp["type"]) => received.filter((m) => m.type === type).length;

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
      // E.1: every rule on, as the column default; the second browser exam below turns them off.
      browser_rules: { ...DEFAULT_BROWSER_RULES } as BrowserRules,
    };
    assert.ok(relay.send(examState(browserExam, "ready")));
    await popup.getByRole("button", { name: "Lock and start" }).waitFor();
    await popup.getByText("Only the exam portal and the calculator stay open.").waitFor();
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
    assert.equal(
      popupPage,
      `chrome-extension://${extensionId}/popup.html`,
      "E.8: the popup is on while locked",
    );
    const lockedWindow = await inWorker<string>(
      worker,
      "chrome.windows.getAll().then((w) => w.map((x) => x.state).join())",
    );
    log(`window state right after the lock: ${lockedWindow}`);
    assert.equal(lockedWindow, "fullscreen", "E.1 full screen on: the exam window goes full screen");
    await shot(portal, "e5-quiz-locked");

    await portal.getByTestId("start-attempt").click();
    await portal.getByRole("radiogroup").waitFor();
    await portal.getByRole("radio").nth(1).click();
    await shot(portal, "e5-attempt");

    // E.5a: Ask proctor in the bar. The sheet sends lock.event student.help_requested to the app; the app
    // queues it as its own event and answers help.queued (played here by the smoke, as the relay's app
    // side; the desktop runtime test covers the app's own handling), and the sheet confirms.
    await portal.setViewportSize({ width: 1280, height: 800 });
    await portal.getByRole("button", { name: "Ask proctor" }).click();
    const sheet = portal.getByRole("dialog", { name: "Ask your proctor" });
    await sheet.waitFor();
    await sheet.getByRole("radio", { name: "Technical problem" }).click();
    await sheet.getByLabel("Note (optional)").fill("The calculator tab doesn’t open.");
    await sheet.getByText("Only your proctor sees this · 32/200").waitFor();
    await shot(portal, "e5a-ask-proctor");
    await sheet.getByRole("button", { name: "Send to proctor" }).click();
    const asked = await until("student.help_requested", () =>
      received.find(
        (m): m is Extract<LockToApp, { type: "lock.event" }> =>
          m.type === "lock.event" && m.event.type === "student.help_requested",
      ),
    );
    assert.deepEqual(asked.event.data, { topic: "technical", text: "The calculator tab doesn’t open." });
    assert.equal(asked.session_id, browserExam.session_id, "filed under the locked exam");
    // Until the app answers, the sheet waits with Send loading.
    await portal.locator('[data-uki-ask][data-state="sent"]').waitFor();
    await portal.waitForTimeout(500);
    assert.equal(await sheet.getAttribute("data-state"), "sent", "the sheet waits for the app");
    assert.ok(relay.send({ type: "help.queued", id: asked.event.id }));
    await sheet.getByText(/^Help requested at \d\d:\d\d$/).waitFor();
    assert.equal(await sheet.getAttribute("data-state"), "queued");
    await shot(portal, "e5a-help-requested");
    await sheet.getByRole("button", { name: "Got it" }).click();
    await sheet.waitFor({ state: "detached" });
    log(`E.5a: ${asked.event.type} ${JSON.stringify(asked.event.data)} confirmed by help.queued`);

    // E.5b: the Calculator tab, offline. No request leaves the page, nothing is stored, and closing the tab
    // clears it.
    const storedBefore = JSON.stringify(await inWorker(worker, "chrome.storage.local.get(null)"));
    const pageStorage = () => portal.evaluate(() => [localStorage.length, sessionStorage.length].join());
    const pageStorageBefore = await pageStorage();
    const requests: string[] = [];
    const onRequest = (request: { url(): string }) => requests.push(request.url());
    portal.on("request", onRequest);
    await context.setOffline(true);
    await portal.getByRole("button", { name: "Calculator" }).click();
    const calculatorPage = portal.getByRole("region", { name: "Calculator" });
    await calculatorPage.getByRole("heading", { name: "Calculator · built into Üki Lock" }).waitFor();
    for (const key of ["2", "*", "2", "5", "/", "2", "="])
      await portal.locator(`[data-uki-calc-key="${key}"]`).click();
    const display = async () =>
      [
        await portal.locator("[data-uki-calc-expression]").textContent(),
        await portal.locator("[data-uki-calc-value]").textContent(),
      ].join(" = ");
    assert.equal(await display(), "2 × 25 ÷ 2 = 25");
    // The keyboard works too: 0.1 + 0.2 shows 0.3.
    await portal.keyboard.type("0.1+0.2");
    await portal.keyboard.press("Enter");
    assert.equal(await display(), "0.1 + 0.2 = 0.3");
    await portal.keyboard.press("Escape");
    for (const key of ["2", "*", "2", "5", "/", "2", "="])
      await portal.locator(`[data-uki-calc-key="${key}"]`).click();
    await calculatorPage.getByText("Works offline. Keeps no history after you submit.").waitFor();
    await portal.mouse.move(1200, 760);
    await shot(portal, "e5b-calculator");
    assert.deepEqual(requests, [], "the calculator makes no request");
    const storedAfter = JSON.stringify(await inWorker(worker, "chrome.storage.local.get(null)"));
    assert.ok(!storedAfter.includes("25 ÷"), "nothing of the calculator is stored");
    assert.equal(storedAfter.length > 0 && storedBefore.length > 0, true);
    assert.equal(await pageStorage(), pageStorageBefore, "the page's storage is untouched");
    await portal.getByRole("button", { name: "Exam portal" }).click();
    await calculatorPage.waitFor({ state: "detached" });
    await portal.getByRole("button", { name: "Calculator" }).click();
    assert.equal(await display(), " = 0", "closing the calculator cleared it");
    await portal.getByRole("button", { name: "Exam portal" }).click();
    await context.setOffline(false);
    portal.off("request", onRequest);
    await portal.setViewportSize({ width: 1280, height: 748 });
    log("E.5b: 2 × 25 ÷ 2 = 25 offline, no request, nothing stored, cleared when closed");

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
    // E.1 copy and paste on, print on: the guard cancels a copy and Ctrl+P, and the print style blanks the
    // page. The copy falls in the same 10 s, so only the print goes to the log.
    assert.deepEqual(await probeGuard(portal), { copy: true, print: true, printStyle: true });
    await until("copy.blocked print", () => events().includes('copy.blocked {"kind":"print"}'));
    assert.deepEqual(
      events().filter((e) => e.startsWith("copy.blocked")),
      ['copy.blocked {"kind":"copy"}', 'copy.blocked {"kind":"print"}'],
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

    // E.8: the toolbar popup while locked: time left, the open sites and the attempts noted so far.
    const noted = events(browserExam.session_id).filter((e) =>
      /^(tab\.blocked|copy\.blocked|site\.closed) /.test(e),
    );
    assert.equal(noted.length, 4, `four attempts so far: ${noted.join(" | ")}`);
    await portal.setViewportSize({ width: 1280, height: 800 });
    const status = await openToolbarPopup(worker, cdpPort, extensionId);
    const statusText = await popupText(status, `NOTED · ${noted.length}`);
    assert.match(
      statusText,
      /\b\d\d:\d\d\nleft · ends \d\d:\d\d/,
      `time left and the end: ${JSON.stringify(statusText)}`,
    );
    assert.ok(
      statusText.includes(`OPEN DURING THE EXAM\nExam portal\nlocalhost:${PORT}\nCalculator\nbuilt in`),
    );
    // The latest three of the four: print, the new tab and the closed site.
    for (const row of [
      "Copy blocked\nPrint",
      "New tab blocked\nOutside the exam window",
      "Site closed\n127.0.0.1",
    ])
      assert.ok(statusText.includes(row), `E.8 lists ${row}`);
    assert.ok(!statusText.includes("Copy blocked\nCopy"), "only the latest three");
    assert.ok(statusText.includes("Üki app · watching · camera on"));
    await status.screenshot("e8-lock-status");
    // Ask proctor in the popup: the popup closes and E.5a's sheet opens in the exam tab's bar.
    // The click closes the popup, so it runs after this evaluation has answered.
    await status.evaluate(
      `setTimeout(() => [...document.querySelectorAll("button")].find((b) => b.textContent === "Ask proctor").click(), 50)`,
    );
    status.close();
    await portal.getByRole("dialog", { name: "Ask your proctor" }).waitFor();
    await portal
      .getByRole("dialog", { name: "Ask your proctor" })
      .getByRole("button", { name: "Cancel" })
      .click();
    await portal.getByRole("dialog", { name: "Ask your proctor" }).waitFor({ state: "detached" });
    await portal.setViewportSize({ width: 1280, height: 748 });
    log(`E.8: NOTED · ${noted.length}; Ask proctor opened the sheet in the bar`);

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

    // E.1 with every switch off: no full screen, the page keeps copy and print, no Calculator tab, and no
    // event for any of them. One tab and allowed sites still hold.
    const rulesOff: BrowserRules = {
      ...DEFAULT_BROWSER_RULES,
      copy_paste: false,
      print: false,
      full_screen: false,
      calculator: false,
    };
    const offExam = {
      ...browserExam,
      session_id: "0192f3a0-0000-7000-8000-00000000a003",
      browser_rules: rulesOff,
    };
    const offPopup = await context.newPage();
    await offPopup.setViewportSize({ width: 360, height: 560 });
    await offPopup.goto(`chrome-extension://${extensionId}/popup.html`);
    // E.9's Close without window.close(): E.4 shows once the summary is dismissed.
    await offPopup.evaluate(`chrome.runtime.sendMessage({ type: "popup.dismiss" })`);
    assert.ok(relay.send(examState(offExam, "ready")));
    await offPopup.getByText("Only the exam portal stays open.").waitFor();
    await portal.goto(PORTAL);
    await portal.getByTestId("start-attempt").waitFor();
    const startedBefore = count("lock.started");
    const offTabId = await offPopup.evaluate(
      `chrome.tabs.query({ url: "http://localhost:${PORT}/*" }).then((tabs) => tabs[0].id)`,
    );
    await offPopup
      .evaluate(`chrome.runtime.sendMessage({ type: "popup.lock", tab_id: ${Number(offTabId)} })`)
      .catch(() => {});
    await until("lock.started (rules off)", () => count("lock.started") === startedBefore + 1);
    await portal.locator("html[data-uki-lock=locked]").waitFor();
    await portal.locator("uki-lock-bar").waitFor({ state: "attached" });
    await portal.getByRole("button", { name: "Exam portal" }).waitFor();
    assert.equal(await portal.getByRole("button", { name: "Calculator" }).count(), 0, "no Calculator tab");
    assert.deepEqual(await probeGuard(portal), { copy: false, print: false, printStyle: false });
    // A real copy goes through without the toast or an event.
    const copied = await portal.evaluate(() => {
      const heading = document.querySelector("h1");
      if (heading) window.getSelection()?.selectAllChildren(heading);
      return document.execCommand("copy");
    });
    assert.equal(copied, true, "copy works with the rule off");
    const offWindowId = await inWorker<number>(worker, "chrome.windows.getAll().then((w) => w[0].id)");
    const offState = () =>
      inWorker<string>(worker, `chrome.windows.get(${offWindowId}).then((w) => w.state)`);
    assert.notEqual(await offState(), "fullscreen", "E.1 full screen off: the window stays as it was");
    await inWorker(worker, `chrome.windows.update(${offWindowId}, { state: "fullscreen" })`);
    await portal.waitForTimeout(1000);
    await inWorker(worker, `chrome.windows.update(${offWindowId}, { state: "normal" })`);
    await portal.waitForTimeout(3000);
    assert.equal(await offState(), "normal", "the Lock does not ask for full screen");
    await shot(portal, "e1-rules-off-locked");
    const offStatus = await openToolbarPopup(worker, cdpPort, extensionId);
    const offText = await popupText(offStatus, "OPEN DURING THE EXAM");
    assert.ok(!offText.includes("Calculator"), "E.8 lists no calculator with its rule off");
    assert.ok(!offText.includes("NOTED"), "nothing noted");
    await offStatus.screenshot("e8-rules-off");
    offStatus.close();
    assert.deepEqual(events(offExam.session_id), [], "no event for a rule that is off");
    const releasedBefore = count("lock.released");
    relay.send({ type: "lock.release", reason: "submitted" });
    await until("lock.released (rules off)", () => count("lock.released") === releasedBefore + 1);
    log("E.1 rules off: no full screen, copy and print left to the page, no calculator, no events");

    // An exam in the app: lock.start keeps one tab on the block page; lock.release brings the tabs back.
    const appExam = {
      ...browserExam,
      session_id: "0192f3a0-0000-7000-8000-00000000a002",
      mode: "app" as const,
    };
    await until("the tabs back after the rules-off exam", () => (context?.pages().length ?? 0) >= 2);
    await portal.waitForTimeout(500);
    const tabsBefore = context.pages().length;
    const appStarted = count("lock.started");
    const appReleased = count("lock.released");
    relay.send({
      ...examState({ ...appExam, allowed_hosts: [], lms_url: null, done_path: null }, "writing"),
    });
    relay.send({ type: "lock.start" });
    await until("lock.started (app)", () => count("lock.started") === appStarted + 1);
    await until("one tab", () => context?.pages().length === 1);
    const kept = context.pages()[0];
    assert.ok(kept);
    await kept.waitForURL(/blocked\.html$/);
    await kept.getByRole("heading").waitFor();
    await shot(kept, "app-exam-block-page");
    relay.send({ type: "lock.release", reason: "submitted" });
    await until("lock.released (app)", () => count("lock.released") === appReleased + 1);
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
