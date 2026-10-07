import type { AppToLock, LockExam } from "@uki/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REDIRECT_RULE_ID } from "../lib/rules.ts";
import { STORAGE_KEYS } from "../lib/state.ts";
import {
  CONTENT_SCRIPT_FILE,
  CONTENT_SCRIPT_ID,
  createLockController,
  type LockController,
} from "./controller.ts";
import { FakeBrowser, FakeSocket, TEST_EXTENSION_ID } from "./testing.ts";

const START = Date.parse("2026-10-07T09:10:00Z");
const PORTAL = "http://localhost:5180/physics-1/quiz-3";
const BLOCKED = `chrome-extension://${TEST_EXTENSION_ID}/blocked.html`;

const browserExam: LockExam = {
  session_id: "0192f3a0-0000-7000-8000-000000000001",
  mode: "browser",
  title: "Physics 1 · Quiz 3",
  starts_at: "2026-10-07T09:00:00Z",
  ends_at: "2026-10-07T09:40:00Z",
  allowed_hosts: ["localhost:5180"],
  lms_url: PORTAL,
  done_path: "/physics-1/quiz-3/review",
};
const appExam: LockExam = {
  ...browserExam,
  session_id: "0192f3a0-0000-7000-8000-000000000002",
  mode: "app",
  title: "Mathematics 2 · Midterm",
  allowed_hosts: [],
  lms_url: null,
  done_path: null,
};

function examState(
  exam: LockExam | null,
  phase: "ready" | "writing" | "done" | "lobby" = "ready",
): AppToLock {
  return { type: "exam.state", phase, watch: "watching", locale: "ru", exam };
}

interface Harness {
  fake: FakeBrowser;
  controller: LockController;
  sockets: FakeSocket[];
  app: () => FakeSocket;
  settle: () => Promise<void>;
}

function setup(fake = new FakeBrowser()): Harness {
  const sockets: FakeSocket[] = [];
  const controller = createLockController({
    api: fake.api,
    extensionId: TEST_EXTENSION_ID,
    lockVersion: "0.0.0",
    browserName: "chrome",
    createSocket: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
    log: () => {},
  });
  const settle = async () => {
    for (let i = 0; i < 5; i += 1) {
      await controller.idle();
      await vi.advanceTimersByTimeAsync(0);
    }
  };
  return { fake, controller, sockets, app: () => sockets[sockets.length - 1] as FakeSocket, settle };
}

/** Starts the worker, connects it to the app and pairs (or reconnects as paired). */
async function connected(h: Harness, paired: boolean): Promise<FakeSocket> {
  await h.controller.start();
  const socket = h.app();
  socket.open();
  socket.receive({ type: "hello", app_version: "0.1.0", os: "windows", paired, student_name: "Aliya S." });
  await h.settle();
  return socket;
}

function lockEvents(socket: FakeSocket) {
  return socket.ofType("lock.event").map((m) => m.event);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
});
afterEach(() => vi.useRealTimers());

describe("pairing", () => {
  it("says hello with its install id, asks for a code, confirms it and remembers the pairing", async () => {
    const h = setup();
    await h.controller.start();
    expect(h.fake.icon?.["128"]).toBe("/icons/off-128.png");
    const socket = h.app();
    expect(socket.url).toBe("ws://127.0.0.1:47801");
    socket.open();
    const [hello] = socket.ofType("hello");
    expect(hello).toMatchObject({ lock_version: "0.0.0", browser: "chrome" });
    expect(h.fake.store.get(STORAGE_KEYS.installId)).toBe(hello?.install_id);
    expect(h.controller.view().link).toBe("absent");

    socket.receive({
      type: "hello",
      app_version: "0.1.0",
      os: "windows",
      paired: false,
      student_name: "Aliya S.",
    });
    await h.settle();
    expect(h.controller.view()).toMatchObject({
      link: "connected",
      app: { os: "windows", student_name: "Aliya S." },
    });

    expect(await h.controller.handleRuntimeMessage({ type: "popup.pair" })).toEqual({ ok: true });
    expect(socket.ofType("pair.request")).toHaveLength(1);
    socket.receive({ type: "pair.code", code: "482913", expires_at: "2026-10-07T09:12:00.000Z" });
    await h.settle();
    expect(h.controller.view().pair).toEqual({ code: "482913", expires_at: "2026-10-07T09:12:00.000Z" });

    await h.controller.handleRuntimeMessage({ type: "popup.confirm" });
    expect(socket.ofType("pair.confirm")).toEqual([{ type: "pair.confirm", code: "482913" }]);
    socket.receive({ type: "pair.ok" });
    await h.settle();
    expect(h.controller.view()).toMatchObject({ link: "paired", pair: null });
    expect(h.fake.store.get(STORAGE_KEYS.paired)).toBe(true);
    expect(h.fake.icon?.["16"]).toBe("/icons/ready-16.png");
    expect((h.fake.store.get(STORAGE_KEYS.view) as { link: string }).link).toBe("paired");
  });

  it("shows the app's refusal and asks for a fresh code when the old one ran out", async () => {
    const h = setup();
    const socket = await connected(h, false);
    socket.receive({ type: "pair.code", code: "111111", expires_at: "2026-10-07T09:11:00.000Z" });
    await h.settle();
    vi.setSystemTime(START + 61_000);
    await h.controller.handleRuntimeMessage({ type: "popup.confirm" });
    expect(socket.ofType("pair.confirm")).toHaveLength(0);
    expect(socket.ofType("pair.request")).toHaveLength(1);
    socket.receive({ type: "pair.fail", reason: "wrong_code" });
    await h.settle();
    expect(h.controller.view()).toMatchObject({ pair: null, pair_error: "wrong_code" });
  });

  it("keeps the same install id across restarts and refuses garbage from the popup", async () => {
    const fake = new FakeBrowser();
    const first = setup(fake);
    await first.controller.start();
    const id = first.app().ofType("hello").length === 0 ? fake.store.get(STORAGE_KEYS.installId) : undefined;
    first.controller.stop();
    const second = setup(fake);
    await second.controller.start();
    second.app().open();
    expect(second.app().ofType("hello")[0]?.install_id).toBe(id ?? fake.store.get(STORAGE_KEYS.installId));
    expect(await second.controller.handleRuntimeMessage({ type: "popup.nope" })).toEqual({ ok: false });
    expect(await second.controller.handleRuntimeMessage({ type: "popup.lock" })).toEqual({ ok: false });
  });
});

describe("exams in the app", () => {
  async function locked() {
    const fake = new FakeBrowser();
    const main = fake.addWindow(
      ["https://mail.example/", "https://news.example/", "https://notes.example/"],
      {
        focused: true,
        activeIndex: 1,
      },
    );
    const other = fake.addWindow(["https://chat.example/"]);
    const h = setup(fake);
    const socket = await connected(h, true);
    socket.receive(examState(appExam, "writing"));
    socket.receive({ type: "lock.start" });
    await h.settle();
    return { h, fake, socket, main, other };
  }

  it("keeps one tab on the block page, closes the rest and blocks every site", async () => {
    const { fake, socket, main } = await locked();
    expect(fake.tabs.map((t) => t.url)).toEqual([BLOCKED]);
    expect(fake.tabs[0]?.windowId).toBe(main);
    expect(socket.ofType("lock.started")).toEqual([{ type: "lock.started", tabs_closed: 3 }]);
    expect(fake.rules).toHaveLength(1);
    expect(fake.rules[0]?.condition).not.toHaveProperty("excludedRequestDomains");
    expect(fake.scripts).toEqual([]);
    expect(fake.popup).toBe("");
    expect(fake.icon?.["32"]).toBe("/icons/locked-32.png");
    expect(fake.windows.every((w) => w.state !== "fullscreen")).toBe(true);
  });

  it("closes new tabs at once with tab.blocked, and notes sites the rule sent to the block page", async () => {
    const { h, fake, socket, main } = await locked();
    const intruder = await fake.api.tabs.create({ windowId: main, url: "https://chat.openai.com/" });
    await h.controller.onTabCreated({ ...intruder, pendingUrl: "https://chat.openai.com/" });
    const newTab = await fake.api.tabs.create({ windowId: main });
    await h.controller.onTabCreated(newTab);
    await h.settle();
    expect(fake.tabs).toHaveLength(1);
    const kept = fake.tabs[0];
    if (!kept) throw new Error("no tab");
    await h.controller.onTabUpdated(kept.id, { url: `${BLOCKED}?host=wikipedia.org` }, kept);
    await h.settle();
    const events = lockEvents(socket);
    expect(events.map((e) => [e.type, e.data])).toEqual([
      ["tab.blocked", { host: "chat.openai.com" }],
      ["tab.blocked", { host: null }],
      ["site.closed", { host: "wikipedia.org" }],
    ]);
    expect(new Set(events.map((e) => e.id)).size).toBe(3);
  });

  it("releases on lock.release: removes the rule, restores the tabs in their windows and order", async () => {
    const { h, fake, socket, main, other } = await locked();
    socket.receive({ type: "lock.release", reason: "submitted" });
    await h.settle();
    expect(fake.rules).toEqual([]);
    expect(fake.popup).toBe("popup.html");
    expect(fake.icon?.["16"]).toBe("/icons/ready-16.png");
    expect(fake.tabsOf(main).map((t) => t.url)).toEqual([
      "https://mail.example/",
      "https://news.example/",
      "https://notes.example/",
    ]);
    expect(fake.windows.some((w) => w.id === other)).toBe(false);
    const reopened = fake.windows.find((w) => w.id !== main);
    expect(reopened && fake.tabsOf(reopened.id).map((t) => t.url)).toEqual(["https://chat.example/"]);
    expect(socket.ofType("lock.released")).toEqual([
      { type: "lock.released", tabs_restored: 4, trigger: "app" },
    ]);
    expect(fake.openPopupCalls).toBe(1);
    expect(h.controller.view().released).toMatchObject({ trigger: "app", tabs_restored: 4, mode: "app" });
    expect(h.fake.store.get(STORAGE_KEYS.lock)).toBeNull();

    socket.receive({ type: "lock.release", reason: "submitted" });
    await h.settle();
    expect(socket.ofType("lock.released")).toHaveLength(2);
    await h.controller.handleRuntimeMessage({ type: "popup.dismiss" });
    expect(h.controller.view().released).toBeNull();
  });

  it("does not lock for a Lock that is not paired", async () => {
    const fake = new FakeBrowser();
    fake.addWindow(["https://mail.example/"], { focused: true });
    const h = setup(fake);
    const socket = await connected(h, false);
    socket.receive(examState(appExam, "writing"));
    socket.receive({ type: "lock.start" });
    await h.settle();
    expect(fake.rules).toEqual([]);
    expect(socket.ofType("lock.started")).toEqual([]);
  });
});

describe("exams in the browser", () => {
  async function locked() {
    const fake = new FakeBrowser();
    const main = fake.addWindow(["https://notes.example/", PORTAL, "https://chat.example/"], {
      focused: true,
      activeIndex: 1,
    });
    const h = setup(fake);
    const socket = await connected(h, true);
    socket.receive(examState(browserExam, "ready"));
    await h.settle();
    const portal = fake.tabs.find((t) => t.url === PORTAL);
    if (!portal) throw new Error("no portal tab");
    const reply = await h.controller.handleRuntimeMessage({ type: "popup.lock", tab_id: portal.id });
    await h.settle();
    return { h, fake, socket, main, portal, reply };
  }

  it("does nothing before the start comes", async () => {
    const fake = new FakeBrowser();
    fake.addWindow([PORTAL], { focused: true });
    const h = setup(fake);
    const socket = await connected(h, true);
    socket.receive(examState(browserExam, "lobby"));
    await h.settle();
    expect(await h.controller.handleRuntimeMessage({ type: "popup.lock" })).toEqual({ ok: false });
  });

  it("Lock and start keeps the portal full screen, injects the guard and allows only the exam host", async () => {
    const { fake, socket, main, portal, reply } = await locked();
    expect(reply).toEqual({ ok: true });
    expect(fake.tabs.map((t) => t.id)).toEqual([portal.id]);
    expect(fake.windows.find((w) => w.id === main)?.state).toBe("fullscreen");
    expect(fake.rules[0]?.condition.excludedRequestDomains).toEqual(["localhost"]);
    expect(fake.scripts).toEqual([
      {
        id: CONTENT_SCRIPT_ID,
        matches: ["*://localhost/*"],
        js: [CONTENT_SCRIPT_FILE],
        runAt: "document_start",
        allFrames: false,
        persistAcrossSessions: false,
      },
    ]);
    expect(fake.injected).toEqual([{ tabId: portal.id, files: [CONTENT_SCRIPT_FILE] }]);
    expect(socket.ofType("lock.started")).toEqual([{ type: "lock.started", tabs_closed: 2 }]);
    expect(fake.store.get(STORAGE_KEYS.bar)).toMatchObject({
      mode: "browser",
      title: "Physics 1 · Quiz 3",
      locale: "ru",
      allowed_hosts: ["localhost:5180"],
    });
  });

  it("closes new tabs unless they are on an allowed host", async () => {
    const { h, fake, socket, main } = await locked();
    const allowed = await fake.api.tabs.create({ windowId: main, url: `${PORTAL}/help` });
    await h.controller.onTabCreated(allowed);
    const blocked = await fake.api.tabs.create({
      windowId: main,
      url: "https://wikipedia.org/wiki/Kinematics",
    });
    await h.controller.onTabCreated(blocked);
    await h.settle();
    expect(fake.tabs.map((t) => t.url)).toEqual([PORTAL, `${PORTAL}/help`]);
    expect(lockEvents(socket).map((e) => e.data)).toEqual([{ host: "wikipedia.org" }]);
  });

  it("notes copy attempts at most once per kind every 10 s, only from the exam host", async () => {
    const { h, socket } = await locked();
    const copy = { type: "content.blocked", kind: "copy" } as const;
    expect(await h.controller.handleRuntimeMessage(copy, PORTAL)).toEqual({ ok: true, noted: true });
    expect(await h.controller.handleRuntimeMessage(copy, PORTAL)).toEqual({ ok: true, noted: false });
    expect(await h.controller.handleRuntimeMessage({ ...copy, kind: "paste" }, PORTAL)).toEqual({
      ok: true,
      noted: true,
    });
    expect(await h.controller.handleRuntimeMessage(copy, "https://evil.example/")).toEqual({ ok: false });
    vi.setSystemTime(START + 10_000);
    expect(await h.controller.handleRuntimeMessage(copy, PORTAL)).toEqual({ ok: true, noted: true });
    expect(lockEvents(socket).map((e) => e.data)).toEqual([
      { kind: "copy" },
      { kind: "paste" },
      { kind: "copy" },
    ]);
  });

  it("asks for full screen again after an exit and counts the exits", async () => {
    const { h, fake, socket, main } = await locked();
    await vi.advanceTimersByTimeAsync(2000);
    const window = fake.windows.find((w) => w.id === main);
    if (!window) throw new Error("no window");
    window.state = "normal";
    h.controller.onWindowBoundsChanged({ id: main });
    await vi.advanceTimersByTimeAsync(500);
    await h.settle();
    expect(window.state).toBe("fullscreen");
    await vi.advanceTimersByTimeAsync(2000);
    window.state = "maximized";
    h.controller.onWindowBoundsChanged({ id: main });
    await vi.advanceTimersByTimeAsync(500);
    await h.settle();
    expect(lockEvents(socket).map((e) => [e.type, e.data])).toEqual([
      ["lock.fullscreen_exit", { count: 1 }],
      ["lock.fullscreen_exit", { count: 2 }],
    ]);
  });

  it("still catches an exit right after full screen came back", async () => {
    const { h, fake, socket, main } = await locked();
    const window = fake.windows.find((w) => w.id === main);
    if (!window) throw new Error("no window");
    await vi.advanceTimersByTimeAsync(2000);
    window.state = "normal";
    h.controller.onWindowBoundsChanged({ id: main });
    await vi.advanceTimersByTimeAsync(500);
    await h.settle();
    // Full screen is back; the student leaves again inside the transition's grace period.
    window.state = "normal";
    h.controller.onWindowBoundsChanged({ id: main });
    await vi.advanceTimersByTimeAsync(3000);
    await h.settle();
    expect(lockEvents(socket).map((e) => e.data)).toEqual([{ count: 1 }, { count: 2 }]);
    expect(window.state).toBe("fullscreen");
  });

  it("asks a browser that refuses full screen three times and logs nothing", async () => {
    const fake = new FakeBrowser();
    fake.addWindow([PORTAL], { focused: true });
    const update = fake.api.windows.update;
    fake.api.windows.update = async (id, properties) => update(id, { ...properties, state: undefined });
    const asked = vi.fn();
    const spy = fake.api.windows.update;
    fake.api.windows.update = async (id, properties) => {
      if (properties.state === "fullscreen") asked();
      return spy(id, properties);
    };
    const h = setup(fake);
    const socket = await connected(h, true);
    socket.receive(examState(browserExam, "ready"));
    await h.settle();
    await h.controller.handleRuntimeMessage({ type: "popup.lock" });
    await vi.advanceTimersByTimeAsync(30_000);
    await h.settle();
    expect(asked).toHaveBeenCalledTimes(4);
    expect(lockEvents(socket)).toEqual([]);
  });

  it("notes focus away from every browser window for 2 s once, and brings the exam back", async () => {
    const { h, fake, socket, main } = await locked();
    fake.lastFocusedFocused = false;
    h.controller.onWindowFocusChanged(-1);
    await vi.advanceTimersByTimeAsync(1999);
    expect(lockEvents(socket)).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    await h.settle();
    h.controller.onWindowFocusChanged(-1);
    await vi.advanceTimersByTimeAsync(3000);
    await h.settle();
    expect(lockEvents(socket).map((e) => [e.type, e.data])).toEqual([["tab.blocked", { host: null }]]);
    expect(fake.windows.find((w) => w.id === main)?.focused).toBe(true);

    h.controller.onWindowFocusChanged(main);
    fake.lastFocusedFocused = true;
    h.controller.onWindowFocusChanged(-1);
    h.controller.onWindowFocusChanged(main);
    await vi.advanceTimersByTimeAsync(3000);
    await h.settle();
    expect(lockEvents(socket)).toHaveLength(1);
  });

  it("releases when the exam tab reaches the done path and reports exam.submitted first", async () => {
    const { h, fake, socket, main, portal } = await locked();
    const review = `${PORTAL}/review`;
    await fake.api.tabs.update(portal.id, { url: review });
    await h.controller.onTabUpdated(portal.id, { url: review }, { ...portal, url: review });
    await h.settle();
    const types = socket.sent.map((m) => (m.type === "lock.event" ? m.event.type : m.type));
    expect(types.slice(types.indexOf("lock.started") + 1).filter((t) => t !== "ping")).toEqual([
      "exam.submitted",
      "lock.released",
    ]);
    expect(fake.windows.find((w) => w.id === main)?.state).toBe("normal");
    expect(fake.tabsOf(main).map((t) => t.url)).toEqual([
      "https://notes.example/",
      review,
      "https://chat.example/",
    ]);
    expect(fake.scripts).toEqual([]);
    expect(fake.rules).toEqual([]);
    expect(h.controller.view().released).toMatchObject({
      trigger: "done_path",
      tabs_restored: 2,
      blocked_count: 0,
    });
  });

  it("reopens the portal full screen when the student closes the exam tab", async () => {
    const { h, fake, main, portal } = await locked();
    await fake.api.tabs.remove(portal.id);
    expect(fake.windows.some((w) => w.id === main)).toBe(false);
    await h.controller.onTabRemoved(portal.id);
    await h.settle();
    expect(fake.tabs.map((t) => t.url)).toEqual([PORTAL]);
    expect(fake.windows.map((w) => w.state)).toEqual(["fullscreen"]);
    const reopened = fake.tabs[0];
    expect(h.controller.view().locked).not.toBeNull();
    expect((fake.store.get(STORAGE_KEYS.lock) as { keep: { tab_id: number } }).keep.tab_id).toBe(
      reopened?.id,
    );
  });

  it("releases itself at the end time plus 2 minutes once the app is gone", async () => {
    const { h, fake, socket } = await locked();
    socket.close();
    await h.settle();
    await vi.advanceTimersByTimeAsync(Date.parse(browserExam.ends_at) + 119_000 - START);
    await h.settle();
    expect(fake.rules).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_000);
    await h.settle();
    expect(fake.rules).toEqual([]);
    expect(h.controller.view().released?.trigger).toBe("deadline");
  });

  it("follows a later end time from exam.state and releases when the app reports the exam done", async () => {
    const { h, fake, socket } = await locked();
    const later = { ...browserExam, ends_at: "2026-10-07T09:50:00Z" };
    socket.receive(examState(later, "writing"));
    await h.settle();
    await vi.advanceTimersByTimeAsync(Date.parse(browserExam.ends_at) + 121_000 - START);
    await h.settle();
    expect(fake.rules).toHaveLength(1);
    expect(fake.store.get(STORAGE_KEYS.bar)).toMatchObject({
      ends_at: "2026-10-07T09:50:00Z",
      phase: "writing",
    });
    socket.receive(examState(later, "done"));
    await h.settle();
    expect(fake.rules).toEqual([]);
    expect(h.controller.view().released?.trigger).toBe("exam_done");
  });

  it("queues events while the app is away and sends them, once each, after it comes back", async () => {
    const { h, fake, socket, main } = await locked();
    socket.close();
    await h.settle();
    const blocked = await fake.api.tabs.create({ windowId: main, url: "https://wikipedia.org/" });
    await h.controller.onTabCreated(blocked);
    await h.settle();
    expect((fake.store.get(STORAGE_KEYS.outbox) as unknown[]).length).toBe(1);
    await vi.advanceTimersByTimeAsync(2000);
    const next = h.app();
    expect(next).not.toBe(socket);
    next.open();
    next.receive({ type: "hello", app_version: "0.1.0", os: "windows", paired: true, student_name: null });
    await h.settle();
    next.receive(examState(browserExam, "writing"));
    await h.settle();
    expect(lockEvents(next).map((e) => e.type)).toEqual(["tab.blocked"]);
    next.receive(examState(browserExam, "writing"));
    await h.settle();
    expect(lockEvents(next)).toHaveLength(1);
  });

  it("picks the lock up again after a restart without duplicating the rule or the script", async () => {
    const { fake, socket } = await locked();
    socket.close();
    const stray = await fake.api.tabs.create({ url: "https://chat.example/" });
    const restarted = setup(fake);
    await restarted.controller.start();
    await restarted.settle();
    expect(fake.rules.map((r) => r.id)).toEqual([REDIRECT_RULE_ID]);
    expect(fake.scripts.map((s) => s.id)).toEqual([CONTENT_SCRIPT_ID]);
    expect(fake.tabs.some((t) => t.id === stray.id)).toBe(false);
    expect(fake.popup).toBe("");
    expect(restarted.controller.view().locked?.mode).toBe("browser");
  });

  it("releases at once after a restart past the deadline", async () => {
    const { fake, socket } = await locked();
    socket.close();
    vi.setSystemTime(Date.parse(browserExam.ends_at) + 130_000);
    const restarted = setup(fake);
    await restarted.controller.start();
    await restarted.settle();
    expect(fake.rules).toEqual([]);
    expect(restarted.controller.view().released?.trigger).toBe("deadline");
  });

  it("sends chrome://, file:// and data: pages in a second allowed tab to the block page", async () => {
    const { h, fake, socket, main } = await locked();
    const second = await fake.api.tabs.create({ windowId: main, url: `${PORTAL}/help` });
    await h.controller.onTabCreated(second);
    for (const url of [
      "file:///Users/student/notes.pdf",
      "chrome://extensions/",
      "data:text/html,<p>x</p>",
    ]) {
      await fake.api.tabs.update(second.id as number, { url });
      await h.controller.onTabUpdated(second.id as number, { url }, { ...second, url });
      await h.settle();
      expect(fake.tabs.find((t) => t.id === second.id)?.url).toBe(BLOCKED);
    }
    expect(lockEvents(socket).map((e) => [e.type, e.data])).toEqual([
      ["tab.blocked", { host: null }],
      ["tab.blocked", { host: null }],
      ["tab.blocked", { host: null }],
    ]);
    // The second tab on the portal itself, and about:blank, stay as they are.
    for (const url of [`${PORTAL}/help`, "about:blank"]) {
      await fake.api.tabs.update(second.id as number, { url });
      await h.controller.onTabUpdated(second.id as number, { url }, { ...second, url });
    }
    await h.settle();
    expect(fake.tabs.find((t) => t.id === second.id)?.url).toBe("about:blank");
    expect(lockEvents(socket)).toHaveLength(3);
  });

  it("closes the tabs of popup, app and incognito windows at Lock and start and never saves incognito", async () => {
    const fake = new FakeBrowser();
    const main = fake.addWindow(["https://notes.example/", PORTAL], { focused: true, activeIndex: 1 });
    const popup = fake.addWindow(["https://chatgpt.com/"], { type: "popup" });
    fake.addWindow(["https://chatgpt.com/c/1"], { type: "app" });
    fake.addWindow(["https://private.example/"], { incognito: true });
    const h = setup(fake);
    const socket = await connected(h, true);
    socket.receive(examState(browserExam, "ready"));
    await h.settle();
    await h.controller.handleRuntimeMessage({ type: "popup.lock" });
    await h.settle();
    expect(fake.tabs.map((t) => t.url)).toEqual([PORTAL]);
    expect(fake.windows.map((w) => w.id)).toEqual([main]);
    expect(socket.ofType("lock.started")).toEqual([{ type: "lock.started", tabs_closed: 4 }]);
    expect(JSON.stringify(fake.store.get(STORAGE_KEYS.lock))).not.toContain("private.example");

    socket.receive({ type: "lock.release", reason: "submitted" });
    await h.settle();
    const restored = fake.tabs.map((t) => t.url);
    expect(restored).toEqual(
      expect.arrayContaining(["https://notes.example/", "https://chatgpt.com/", "https://chatgpt.com/c/1"]),
    );
    expect(restored).not.toContain("https://private.example/");
    expect(fake.windows.some((w) => w.id === popup)).toBe(false);
  });

  it("counts focus on another window as away unless it holds only allowed pages", async () => {
    const { h, fake, socket, main } = await locked();
    // A window the lock could not close, as a popup that opened past the tab check.
    const popup = fake.addWindow(["https://chatgpt.com/"], { type: "popup" });
    fake.lastFocusedId = popup;
    h.controller.onWindowFocusChanged(popup);
    await vi.advanceTimersByTimeAsync(2000);
    await h.settle();
    expect(lockEvents(socket).map((e) => [e.type, e.data])).toEqual([["tab.blocked", { host: null }]]);
    expect(fake.windows.find((w) => w.id === main)?.focused).toBe(true);

    // Back on the exam, then over to a second window on the portal: not away.
    h.controller.onWindowFocusChanged(main);
    const second = fake.addWindow([`${PORTAL}/help`]);
    fake.lastFocusedId = second;
    h.controller.onWindowFocusChanged(second);
    await vi.advanceTimersByTimeAsync(3000);
    await h.settle();
    expect(lockEvents(socket)).toHaveLength(1);
  });
});

describe("events reach only their exam", () => {
  const bExam: LockExam = {
    ...appExam,
    session_id: "0192f3a0-0000-7000-8000-000000000003",
    starts_at: "2026-10-07T12:00:00Z",
    ends_at: "2026-10-07T13:00:00Z",
  };

  async function finishedOnTheDonePath(socket: FakeSocket, h: Harness, fake: FakeBrowser) {
    const portal = fake.tabs.find((t) => t.url === PORTAL);
    if (!portal) throw new Error("no portal tab");
    const review = `${PORTAL}/review`;
    await fake.api.tabs.update(portal.id, { url: review });
    await h.controller.onTabUpdated(portal.id, { url: review }, { ...portal, url: review });
    await h.settle();
    return socket;
  }

  async function lockedBrowserExam() {
    const fake = new FakeBrowser();
    fake.addWindow(["https://notes.example/", PORTAL], { focused: true, activeIndex: 1 });
    const h = setup(fake);
    const socket = await connected(h, true);
    socket.receive(examState(browserExam, "ready"));
    await h.settle();
    await h.controller.handleRuntimeMessage({ type: "popup.lock" });
    await h.settle();
    return { h, fake, socket };
  }

  it("never resends exam A's exam.submitted to the app on exam B", async () => {
    const { h, fake, socket } = await lockedBrowserExam();
    await finishedOnTheDonePath(socket, h, fake);
    const [submitted] = socket.ofType("lock.event");
    expect(submitted).toMatchObject({
      session_id: browserExam.session_id,
      event: { type: "exam.submitted" },
    });
    socket.close();
    h.controller.stop();

    // Three hours later the worker starts again and the app is on exam B.
    vi.setSystemTime(START + 3 * 60 * 60 * 1000);
    const later = setup(fake);
    const first = await connected(later, true);
    expect(lockEvents(first)).toEqual([]);
    first.receive(examState(bExam, "writing"));
    first.receive({ type: "lock.start" });
    await later.settle();
    expect(later.controller.view().locked?.exam.session_id).toBe(bExam.session_id);
    expect(fake.store.get(STORAGE_KEYS.outbox)).toEqual([]);

    // A blip mid-exam, and the app's own hello on the new link: nothing of A comes back.
    first.close();
    await later.settle();
    await vi.advanceTimersByTimeAsync(2000);
    const next = later.app();
    next.open();
    const hello = {
      type: "hello",
      app_version: "0.1.0",
      os: "windows",
      paired: true,
      student_name: null,
    } as const;
    next.receive(hello);
    next.receive(examState(bExam, "writing"));
    next.receive(hello);
    await later.settle();
    expect(lockEvents(next)).toEqual([]);
    expect(later.controller.view().locked).not.toBeNull();
  });

  it("holds an exam's events while the app is away and gives them to the app on that exam", async () => {
    const { h, fake, socket } = await lockedBrowserExam();
    socket.close();
    await h.settle();
    await finishedOnTheDonePath(socket, h, fake);
    expect(h.controller.view().locked).toBeNull();
    await vi.advanceTimersByTimeAsync(2000);
    const next = h.app();
    next.open();
    next.receive({ type: "hello", app_version: "0.1.0", os: "windows", paired: true, student_name: null });
    await h.settle();
    // Not before the app says which exam it is on.
    expect(lockEvents(next)).toEqual([]);
    next.receive(examState(browserExam, "writing"));
    await h.settle();
    expect(next.ofType("lock.event")).toEqual([
      {
        type: "lock.event",
        session_id: browserExam.session_id,
        event: expect.objectContaining({ type: "exam.submitted" }),
      },
    ]);
    // An app on another exam makes the Lock forget them.
    next.receive(examState(bExam, "lobby"));
    await h.settle();
    expect(fake.store.get(STORAGE_KEYS.outbox)).toEqual([]);
  });

  it("drops events older than 6 hours before it sends anything", async () => {
    const { h, fake, socket } = await lockedBrowserExam();
    const main = fake.windows[0]?.id as number;
    socket.close();
    await h.settle();
    for (const url of ["https://wikipedia.org/", "https://chat.example/"]) {
      const blocked = await fake.api.tabs.create({ windowId: main, url });
      await h.controller.onTabCreated(blocked);
      await h.settle();
      // The second one comes just under 6 hours after the first.
      vi.setSystemTime(START + 6 * 60 * 60 * 1000 - 1000);
    }
    vi.setSystemTime(START + 6 * 60 * 60 * 1000 + 1);
    await vi.advanceTimersByTimeAsync(2000);
    const next = h.app();
    next.open();
    next.receive({ type: "hello", app_version: "0.1.0", os: "windows", paired: true, student_name: null });
    next.receive(examState(browserExam, "writing"));
    await h.settle();
    expect(lockEvents(next).map((e) => e.data)).toEqual([{ host: "chat.example" }]);
  });
});

describe("the server's clock", () => {
  const FAST = 40 * 60 * 1000;

  async function lockedWithFastClock() {
    // The laptop clock runs 40 minutes ahead of the server; the exam ends at 09:40 server time.
    vi.setSystemTime(START + FAST);
    const fake = new FakeBrowser();
    fake.addWindow([PORTAL, "https://chat.example/"], { focused: true });
    const h = setup(fake);
    const socket = await connected(h, true);
    socket.receive({ ...examState(browserExam, "ready"), clock_offset_ms: -FAST } as AppToLock);
    await h.settle();
    const reply = await h.controller.handleRuntimeMessage({ type: "popup.lock" });
    await h.settle();
    return { h, fake, socket, reply };
  }

  it("does not release a lock on a laptop clock that runs fast, and shows time left on the laptop's clock", async () => {
    const { h, fake, socket, reply } = await lockedWithFastClock();
    expect(reply).toEqual({ ok: true });
    expect(fake.rules).toHaveLength(1);
    expect(socket.ofType("lock.released")).toEqual([]);
    // 09:40 server time is 10:20 on this laptop, for the bar's and popup's countdowns.
    expect(fake.store.get(STORAGE_KEYS.bar)).toMatchObject({ ends_at: "2026-10-07T10:20:00.000Z" });
    expect(h.controller.view().locked?.exam.ends_at).toBe("2026-10-07T10:20:00.000Z");

    // The app goes away; the deadline is 09:42 server time, 10:22 on the laptop.
    socket.close();
    await h.settle();
    await vi.advanceTimersByTimeAsync(Date.parse(browserExam.ends_at) + 119_000 - START);
    await h.settle();
    expect(fake.rules).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_000);
    await h.settle();
    expect(fake.rules).toEqual([]);
    expect(h.controller.view().released?.trigger).toBe("deadline");
  });

  it("never lets go on its own clock while the app holds the exam, and says why when it does", async () => {
    const fake = new FakeBrowser();
    fake.addWindow([PORTAL, "https://chat.example/"], { focused: true });
    const h = setup(fake);
    const socket = await connected(h, true);
    socket.receive(examState(browserExam, "ready"));
    await h.settle();
    await h.controller.handleRuntimeMessage({ type: "popup.lock" });
    socket.receive(examState(browserExam, "writing"));
    await h.settle();

    // The student moves the clock 40 minutes on; the app's next exam.state still says writing.
    vi.setSystemTime(Date.now() + FAST);
    socket.receive(examState(browserExam, "writing"));
    await vi.advanceTimersByTimeAsync(10_000);
    await h.settle();
    expect(fake.rules).toHaveLength(1);
    expect(fake.tabs.map((t) => t.url)).toEqual([PORTAL]);
    expect(socket.ofType("lock.released")).toEqual([]);

    // An app that no longer holds the exam leaves the deadline to the Lock, which reports it.
    socket.receive({ type: "exam.state", phase: "idle", watch: "watching", locale: "ru", exam: null });
    await h.settle();
    expect(fake.rules).toEqual([]);
    expect(socket.ofType("lock.released")).toEqual([
      { type: "lock.released", tabs_restored: 1, trigger: "deadline" },
    ]);
  });

  it("follows the app's clock offset through a restart of the worker", async () => {
    const { fake, socket } = await lockedWithFastClock();
    socket.close();
    const restarted = setup(fake);
    await restarted.controller.start();
    await restarted.settle();
    expect(fake.rules).toHaveLength(1);
    expect(restarted.controller.view().locked?.exam.ends_at).toBe("2026-10-07T10:20:00.000Z");
  });
});
