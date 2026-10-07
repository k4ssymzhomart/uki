// The service worker's brain ("Üki Lock" in docs/phase-0-plan.md). It owns the link with the app, the
// pairing, the lock and the release. It never talks to the server: every event goes to the app as
// lock.event, and the app sends it on with source "lock".
//
// Lock: save every tab, keep one. Exams in the app point that tab at the block page with its title line
// only; exams in the browser keep the portal tab, make its window full screen, inject the bar and the copy
// guard, and close new tabs that are not on an allowed host. A declarativeNetRequest session rule sends
// every other site to the block page. Release, on the first trigger in release.ts, undoes all of it and
// puts the tabs back. State lives in chrome.storage.local, so a restarted worker or browser picks up a
// running lock again.
import {
  type AppToLock,
  type CopyKind,
  type LockEvent,
  LockEvent as LockEventSchema,
  type LockEventType,
  type LockExam,
  type LockToApp,
  type ReleaseReason,
  uuidv7,
} from "@uki/contracts";
import { eventHost, hostnameOf, isAllowedUrl, matchPatterns } from "../lib/hosts.ts";
import { type RuntimeReply, RuntimeRequest } from "../lib/messages.ts";
import { isDoneUrl, isExamDone, isPastDeadline, releaseDeadlineMs } from "../lib/release.ts";
import {
  BLOCKED_PAGE,
  blockedHostFromUrl,
  isBlockedPageUrl,
  lockRulesUpdate,
  releaseRulesUpdate,
} from "../lib/rules.ts";
import {
  type BarState,
  ExamStateMessage,
  InstallId,
  type LinkState,
  LockRecord,
  type LockView,
  Outbox,
  type OutboxEntry,
  ReleasedSummary,
  readStored,
  STORAGE_KEYS,
} from "../lib/state.ts";
import { countRestoredTabs, createUrl, planLock, planRestore } from "../lib/tab-plan.ts";
import { createKindThrottle } from "../lib/throttle.ts";
import { type AppLink, createAppLink, realTimers, type SocketLike, type Timers } from "./app-link.ts";
import { type LockApi, WINDOW_ID_NONE, type WindowInfo } from "./lock-api.ts";

/** The runtime-registered content script: copy guard, Lock bar and E.6 toast on allowed hosts. */
export const CONTENT_SCRIPT_ID = "uki-lock-guard";
export const CONTENT_SCRIPT_FILE = "content-scripts/lock-guard.js";
export const POPUP_PAGE = "popup.html";

/** Figma Ext/Toolbar icon: off until paired, ready while paired, locked during an exam. */
export type ToolbarState = "off" | "ready" | "locked";
const ICON_SIZES = [16, 32, 48, 128] as const;

export function toolbarIconPaths(state: ToolbarState): Record<string, string> {
  return Object.fromEntries(ICON_SIZES.map((size) => [String(size), `/icons/${state}-${size}.png`]));
}

/** Events kept for resending; older ones are dropped. */
const OUTBOX_MAX = 200;
const OUTBOX_MAX_AGE_MS = 6 * 60 * 60 * 1000;
/** Bounds events settle this long before the window state is read. */
const BOUNDS_SETTLE_MS = 400;
/** After asking for full screen, the transition's own bounds events are not exits. */
const FULLSCREEN_GRACE_MS = 1500;
/** Requests for full screen that were never granted, before the Lock stops asking. */
const MAX_FULLSCREEN_RETRIES = 3;
/** The longest timer browsers accept. */
const MAX_TIMER_MS = 2_147_483_647;

/** Blocked attempts counted on E.9. */
const BLOCKED_TYPES: ReadonlySet<LockEventType> = new Set(["tab.blocked", "site.closed", "copy.blocked"]);

type ExamState = Extract<AppToLock, { type: "exam.state" }>;
type AppHello = Extract<AppToLock, { type: "hello" }>;
type ReleaseTrigger = "done_path" | "app" | "exam_done" | "deadline";

export interface LockControllerDeps {
  api: LockApi;
  extensionId: string;
  lockVersion: string;
  /** "chrome" or "edge", for the app's hello. */
  browserName: string;
  createSocket: (url: string) => SocketLike;
  timers?: Timers;
  now?: () => number;
  ports?: readonly number[];
  retryMs?: number;
  pingMs?: number;
  focusLossMs?: number;
  log?: (message: string) => void;
}

/** A tab event as the controller needs it. */
export interface TabEventInfo {
  id?: number;
  windowId: number;
  url?: string;
  pendingUrl?: string;
}

export interface LockController {
  start(): Promise<void>;
  stop(): void;
  handleRuntimeMessage(raw: unknown, senderUrl?: string): Promise<RuntimeReply>;
  onTabCreated(tab: TabEventInfo): Promise<void>;
  onTabUpdated(tabId: number, change: { url?: string }, tab: TabEventInfo): Promise<void>;
  onTabRemoved(tabId: number): Promise<void>;
  onWindowBoundsChanged(window: { id?: number }): void;
  onWindowFocusChanged(windowId: number): void;
  /** Resolves once every queued operation has run (tests). */
  idle(): Promise<void>;
  /** The popup's view as published to storage (tests). */
  view(): LockView;
}

export function createLockController(deps: LockControllerDeps): LockController {
  const { api, extensionId } = deps;
  const timers = deps.timers ?? realTimers;
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((message: string) => console.info(`[uki-lock] ${message}`));
  const focusLossMs = deps.focusLossMs ?? 2000;

  let installId = "";
  let paired = false;
  let link: LinkState = "absent";
  let app: AppHello | null = null;
  let pair: { code: string; expires_at: string } | null = null;
  let pairError: LockView["pair_error"] = null;
  let examState: ExamState | null = null;
  let lock: LockRecord | null = null;
  let released: ReleasedSummary | null = null;
  let outbox: OutboxEntry[] = [];
  const sentThisLink = new Set<string>();
  const copyThrottle = createKindThrottle<CopyKind>();
  const written = new Map<string, string>();
  let toolbar: ToolbarState | null = null;

  let deadlineTimer: unknown = null;
  let focusTimer: unknown = null;
  let focusAway = false;
  let boundsTimer: unknown = null;
  let ignoreBoundsUntil = 0;
  /** Whether the exam window was seen in full screen since the last request: only then is a change an exit. */
  let fullScreenSeen = false;
  let fullScreenRetries = 0;

  // Every state change runs in this queue, one at a time, so tab events never see half a lock.
  let queue: Promise<unknown> = Promise.resolve();
  function serial<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task);
    queue = run.catch((error: unknown) => log(`task failed: ${String(error)}`));
    return run;
  }

  const appLink: AppLink = createAppLink({
    createSocket: deps.createSocket,
    timers,
    now,
    ports: deps.ports,
    retryMs: deps.retryMs,
    pingMs: deps.pingMs,
    log,
    keepAlive: () => api.runtime.keepAlive(),
    onOpen: () => {
      appLink.send({
        type: "hello",
        lock_version: deps.lockVersion,
        browser: deps.browserName,
        install_id: installId,
      });
    },
    onMessage: (message) => void serial(() => handleAppMessage(message)),
    onClose: () =>
      void serial(async () => {
        link = "absent";
        app = null;
        pair = null;
        sentThisLink.clear();
        await publish();
      }),
  });

  // ---- storage and views ----

  function currentLocale() {
    return lock?.locale ?? examState?.locale ?? released?.locale ?? "kk";
  }

  function buildView(): LockView {
    return {
      link,
      app: app ? { os: app.os, student_name: app.student_name, app_version: app.app_version } : null,
      pair,
      pair_error: pairError,
      exam_state: examState,
      locked: lock
        ? { mode: lock.mode, exam: lock.exam, started_at: lock.started_at, locale: currentLocale() }
        : null,
      released,
    };
  }

  function buildBar(): BarState | null {
    if (!lock) return null;
    const sameExam = examState?.exam?.session_id === lock.exam.session_id;
    return {
      mode: lock.mode,
      title: lock.exam.title,
      starts_at: lock.exam.starts_at,
      ends_at: lock.exam.ends_at,
      phase: sameExam && examState ? examState.phase : "writing",
      watch: sameExam && examState ? examState.watch : "watching",
      locale: currentLocale(),
      lms_url: lock.exam.lms_url,
      allowed_hosts: lock.mode === "browser" ? lock.exam.allowed_hosts : [],
    };
  }

  async function updateToolbar(): Promise<void> {
    const next: ToolbarState = lock ? "locked" : link === "paired" ? "ready" : "off";
    if (next === toolbar) return;
    toolbar = next;
    await api.action.setIcon({ path: toolbarIconPaths(next) }).catch((error: unknown) => {
      log(`setIcon: ${String(error)}`);
    });
  }

  /** Writes every key whose value changed since the last write, and follows with the toolbar icon. */
  async function publish(): Promise<void> {
    await updateToolbar();
    const values: Record<string, unknown> = {
      [STORAGE_KEYS.installId]: installId,
      [STORAGE_KEYS.paired]: paired,
      [STORAGE_KEYS.lock]: lock,
      [STORAGE_KEYS.released]: released,
      [STORAGE_KEYS.examState]: examState,
      [STORAGE_KEYS.outbox]: outbox,
      [STORAGE_KEYS.view]: buildView(),
      [STORAGE_KEYS.bar]: buildBar(),
    };
    const changed: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(values)) {
      const json = JSON.stringify(value);
      if (written.get(key) === json) continue;
      written.set(key, json);
      changed[key] = value;
    }
    if (Object.keys(changed).length > 0) await api.storage.set(changed);
  }

  async function load(): Promise<void> {
    const stored = await api.storage.get(Object.values(STORAGE_KEYS));
    installId = readStored(InstallId, stored[STORAGE_KEYS.installId], "") || uuidv7(now());
    paired = stored[STORAGE_KEYS.paired] === true;
    lock = readStored(LockRecord.nullable(), stored[STORAGE_KEYS.lock], null);
    released = readStored(ReleasedSummary.nullable(), stored[STORAGE_KEYS.released], null);
    examState = readStored(ExamStateMessage.nullable(), stored[STORAGE_KEYS.examState], null);
    outbox = readStored(Outbox, stored[STORAGE_KEYS.outbox], []);
  }

  // ---- events to the app ----

  function trimOutbox(): void {
    const oldest = now() - OUTBOX_MAX_AGE_MS;
    outbox = outbox.filter((entry) => entry.queued_at >= oldest).slice(-OUTBOX_MAX);
  }

  function flush(): void {
    if (link !== "paired") return;
    for (const { event } of outbox) {
      if (sentThisLink.has(event.id)) continue;
      if (appLink.send({ type: "lock.event", event })) sentThisLink.add(event.id);
    }
  }

  function emit(type: LockEventType, data: Record<string, unknown>): LockEvent | null {
    const parsed = LockEventSchema.safeParse({
      id: uuidv7(now()),
      at: new Date(now()).toISOString(),
      type,
      data,
    });
    if (!parsed.success) {
      log(`dropped an invalid ${type}: ${parsed.error.message.slice(0, 200)}`);
      return null;
    }
    outbox.push({ event: parsed.data, queued_at: now() });
    trimOutbox();
    if (lock && BLOCKED_TYPES.has(type)) lock.blocked_count += 1;
    flush();
    return parsed.data;
  }

  function sendToApp(message: LockToApp): void {
    if (!appLink.send(message)) log(`could not send ${message.type}: the app is not connected`);
  }

  // ---- app messages ----

  async function handleAppMessage(message: AppToLock): Promise<void> {
    switch (message.type) {
      case "hello":
        app = message;
        paired = message.paired;
        link = message.paired ? "paired" : "connected";
        if (paired) pairError = null;
        sentThisLink.clear();
        flush();
        break;
      case "pair.code":
        pair = { code: message.code, expires_at: message.expires_at };
        pairError = null;
        break;
      case "pair.ok":
        paired = true;
        link = "paired";
        pair = null;
        pairError = null;
        flush();
        break;
      case "pair.fail":
        pair = null;
        pairError = message.reason;
        break;
      case "exam.state":
        await applyExamState(message);
        break;
      case "lock.start":
        if (link === "paired") await startLock(examState?.exam?.mode ?? "app");
        break;
      case "lock.release":
        await release("app", message.reason);
        break;
      default:
        return;
    }
    await publish();
  }

  async function applyExamState(message: ExamState): Promise<void> {
    examState = message;
    if (!lock) return;
    if (message.exam && message.exam.session_id === lock.exam.session_id) {
      lock.exam = message.exam;
      lock.locale = message.locale;
      scheduleDeadline();
    }
    if (isExamDone(message, lock.exam.session_id)) await release("exam_done");
  }

  // ---- lock ----

  function blockedPageUrl(host?: string): string {
    const base = api.runtime.getURL(`/${BLOCKED_PAGE}`);
    return host ? `${base}?host=${encodeURIComponent(host)}` : base;
  }

  function allowedHosts(record: LockRecord): readonly string[] {
    return record.mode === "browser" ? record.exam.allowed_hosts : [];
  }

  async function registerScripts(record: LockRecord): Promise<void> {
    const matches = matchPatterns(allowedHosts(record));
    await unregisterScripts();
    if (matches.length === 0) return;
    await api.scripting.registerContentScripts([
      {
        id: CONTENT_SCRIPT_ID,
        matches,
        js: [CONTENT_SCRIPT_FILE],
        runAt: "document_start",
        allFrames: false,
        persistAcrossSessions: false,
      },
    ]);
  }

  async function unregisterScripts(): Promise<void> {
    const registered = await api.scripting.getRegisteredContentScripts().catch(() => []);
    if (registered.some((script) => script.id === CONTENT_SCRIPT_ID))
      await api.scripting.unregisterContentScripts({ ids: [CONTENT_SCRIPT_ID] });
  }

  /** The rule, the scripts and the switched-off popup. Safe to run again after a restart. */
  async function enforce(record: LockRecord): Promise<void> {
    await api.rules.updateSessionRules(lockRulesUpdate(allowedHosts(record), extensionId));
    await registerScripts(record);
    await api.action.setPopup({ popup: "" });
  }

  async function injectInto(tabId: number): Promise<void> {
    try {
      await api.scripting.executeScript({ target: { tabId }, files: [CONTENT_SCRIPT_FILE] });
    } catch (error) {
      // The tab may still be loading; the registered script covers the load.
      log(`could not inject into tab ${tabId}: ${String(error)}`);
    }
  }

  async function goFullScreen(windowId: number): Promise<void> {
    ignoreBoundsUntil = now() + FULLSCREEN_GRACE_MS;
    const updated = await api.windows
      .update(windowId, { state: "fullscreen", focused: true })
      .catch((error: unknown) => log(`could not make window ${windowId} full screen: ${String(error)}`));
    if ((updated as WindowInfo | undefined)?.state === "fullscreen") fullScreenSeen = true;
    // Check once the transition is over, even if no bounds event comes.
    scheduleBoundsCheck(FULLSCREEN_GRACE_MS + BOUNDS_SETTLE_MS);
  }

  function scheduleBoundsCheck(delayMs: number): void {
    if (boundsTimer !== null) timers.clearTimeout(boundsTimer);
    boundsTimer = timers.setTimeout(() => {
      boundsTimer = null;
      void serial(checkFullScreen);
    }, delayMs);
  }

  /** Opens the portal again when the exam tab is gone (browser exams). */
  async function reopenPortal(record: LockRecord): Promise<void> {
    const url = record.exam.lms_url ?? undefined;
    const windowId = record.keep?.window_id;
    if (windowId !== undefined) {
      const window = await api.windows.get(windowId).catch(() => null);
      if (window) {
        const tab = await api.tabs.create({ windowId, url, active: true });
        if (tab.id !== undefined) record.keep = { tab_id: tab.id, window_id: windowId, url: null };
        return;
      }
    }
    const created = await api.windows.create({ url, focused: true });
    const tab = created?.tabs?.[0];
    if (created?.id !== undefined && tab?.id !== undefined) {
      record.keep = { tab_id: tab.id, window_id: created.id, url: null };
      await goFullScreen(created.id);
    }
  }

  async function startLock(mode: "app" | "browser", preferredTabId?: number): Promise<void> {
    if (lock) {
      sendToApp({ type: "lock.started", tabs_closed: lock.tabs_closed });
      return;
    }
    const state = examState;
    if (!state?.exam) {
      log("lock refused: the app has sent no exam");
      return;
    }
    const exam: LockExam = state.exam;
    const allowed = mode === "browser" ? exam.allowed_hosts : [];
    const windows = await api.windows.getAll({ populate: true, windowTypes: ["normal"] });
    const plan = planLock(windows, { mode, allowedHosts: allowed, preferredTabId, extensionId });
    const record: LockRecord = {
      mode,
      exam,
      locale: state.locale,
      started_at: now(),
      keep: plan.keep,
      saved: plan.saved,
      tabs_closed: plan.close.length,
      fullscreen_exits: 0,
      blocked_count: 0,
    };
    lock = record;
    released = null;
    copyThrottle.reset();
    fullScreenSeen = false;
    fullScreenRetries = 0;
    // Saved before anything closes: a crash from here on still restores the tabs.
    await publish();
    await enforce(record);

    if (mode === "app") {
      if (record.keep) await api.tabs.update(record.keep.tab_id, { url: blockedPageUrl(), active: true });
    } else if (record.keep) {
      const keep = record.keep;
      if (isAllowedUrl(keep.url, allowed)) await injectInto(keep.tab_id);
      else await api.tabs.update(keep.tab_id, { url: exam.lms_url ?? undefined, active: true });
      await api.tabs.update(keep.tab_id, { active: true });
      await goFullScreen(keep.window_id);
    } else {
      await reopenPortal(record);
    }

    if (plan.close.length > 0)
      await api.tabs
        .remove(plan.close)
        .catch((error: unknown) => log(`could not close tabs: ${String(error)}`));
    scheduleDeadline();
    await publish();
    sendToApp({ type: "lock.started", tabs_closed: record.tabs_closed });
  }

  // ---- release ----

  async function release(trigger: ReleaseTrigger, _reason?: ReleaseReason): Promise<void> {
    const record = lock;
    if (!record) {
      if (trigger === "app")
        sendToApp({ type: "lock.released", tabs_restored: released?.tabs_restored ?? 0 });
      return;
    }
    lock = null;
    clearLockTimers();
    await api.rules
      .updateSessionRules(releaseRulesUpdate())
      .catch((error: unknown) => log(`could not remove the rule: ${String(error)}`));
    await unregisterScripts().catch((error: unknown) =>
      log(`could not remove the scripts: ${String(error)}`),
    );
    if (record.mode === "browser" && record.keep)
      await api.windows.update(record.keep.window_id, { state: "normal" }).catch(() => {});

    const open = await api.windows.getAll({ populate: false, windowTypes: ["normal"] }).catch(() => []);
    const openIds = new Set(open.map((w) => w.id).filter((id): id is number => id !== undefined));
    const steps = planRestore(record.saved, openIds);
    let restored = 0;
    for (const step of steps) {
      try {
        if (step.kind === "tabs") {
          for (const tab of step.tabs) {
            await api.tabs.create({
              windowId: step.windowId,
              index: tab.index,
              url: createUrl(tab.url),
              pinned: tab.pinned,
              active: false,
            });
            restored += 1;
          }
        } else {
          const { state, focused: _focused, ...bounds } = step.window;
          const created = await api.windows.create({
            url: step.tabs.map((tab) => tab.url),
            focused: false,
            ...(state === "maximized" ? { state } : bounds),
          });
          restored += step.tabs.length;
          const createdTabs = created?.tabs ?? [];
          for (const [index, tab] of step.tabs.entries()) {
            const id = createdTabs[index]?.id;
            if (id !== undefined && (tab.pinned || tab.active))
              await api.tabs.update(id, { pinned: tab.pinned, active: tab.active });
          }
        }
      } catch (error) {
        log(`could not restore a window: ${String(error)}`);
      }
    }
    if (record.mode === "app" && record.keep) {
      const back = record.keep.url ? createUrl(record.keep.url) : undefined;
      await api.tabs
        .update(record.keep.tab_id, { url: back ?? "chrome://newtab/" })
        .then(() => {
          if (record.keep?.url) restored += 1;
        })
        .catch(() => {});
    }
    if (countRestoredTabs(steps) > restored) log(`restored ${restored} of ${countRestoredTabs(steps)} tabs`);

    await api.action.setPopup({ popup: POPUP_PAGE }).catch(() => {});
    released = {
      trigger,
      mode: record.mode,
      released_at: now(),
      started_at: record.started_at,
      tabs_restored: restored,
      blocked_count: record.blocked_count,
      locale: record.locale,
    };
    await publish();
    sendToApp({ type: "lock.released", tabs_restored: restored });
    // E.9 now; when Chrome refuses, the popup shows E.9 on its next open.
    await api.action.openPopup().catch((error: unknown) => log(`openPopup: ${String(error)}`));
  }

  function clearLockTimers(): void {
    if (deadlineTimer !== null) timers.clearTimeout(deadlineTimer);
    if (focusTimer !== null) timers.clearTimeout(focusTimer);
    if (boundsTimer !== null) timers.clearTimeout(boundsTimer);
    deadlineTimer = null;
    focusTimer = null;
    boundsTimer = null;
    focusAway = false;
  }

  function scheduleDeadline(): void {
    if (deadlineTimer !== null) timers.clearTimeout(deadlineTimer);
    deadlineTimer = null;
    if (!lock) return;
    const wait = Math.min(MAX_TIMER_MS, Math.max(0, releaseDeadlineMs(lock.exam) - now()));
    deadlineTimer = timers.setTimeout(() => {
      deadlineTimer = null;
      void serial(async () => {
        if (!lock) return;
        if (isPastDeadline(lock.exam, now())) await release("deadline");
        else scheduleDeadline();
      });
    }, wait);
  }

  // ---- browser events ----

  /** Shows the exam tab again; `window` also raises its window (focus left the browser). */
  function focusExam(record: LockRecord, options: { window: boolean }): void {
    const keep = record.keep;
    if (!keep) return;
    void api.tabs.update(keep.tab_id, { active: true }).catch(() => {});
    if (options.window) void api.windows.update(keep.window_id, { focused: true }).catch(() => {});
  }

  async function onTabCreated(tab: TabEventInfo): Promise<void> {
    const record = lock;
    if (!record || tab.id === undefined || tab.id === record.keep?.tab_id) return;
    const url = tab.pendingUrl || tab.url;
    if (record.mode === "browser" && isAllowedUrl(url, record.exam.allowed_hosts)) return;
    await api.tabs.remove(tab.id).catch(() => {});
    emit("tab.blocked", { host: eventHost(hostnameOf(url)) });
    // In exams in the app the app's own window stays in front; only the browser exam pulls focus back.
    if (record.mode === "browser") focusExam(record, { window: tab.windowId !== record.keep?.window_id });
    await publish();
  }

  async function onTabUpdated(tabId: number, change: { url?: string }): Promise<void> {
    const record = lock;
    const url = change.url;
    if (!record || !url) return;
    const blockedHost = blockedHostFromUrl(url, extensionId);
    if (blockedHost !== null) {
      const host = eventHost(blockedHost);
      if (host) emit("site.closed", { host });
      await publish();
      return;
    }
    if (record.mode !== "browser" || tabId !== record.keep?.tab_id) return;
    if (isDoneUrl(url, record.exam)) {
      emit("exam.submitted", {});
      await release("done_path");
      return;
    }
    const isWeb = hostnameOf(url) !== null;
    if (!isWeb && !isBlockedPageUrl(url, extensionId) && url !== "about:blank") {
      // chrome:// and other pages the redirect rule cannot see.
      await api.tabs.update(tabId, { url: blockedPageUrl() }).catch(() => {});
      emit("tab.blocked", { host: null });
      await publish();
    }
  }

  async function onTabRemoved(tabId: number): Promise<void> {
    const record = lock;
    if (record?.mode !== "browser" || tabId !== record.keep?.tab_id) return;
    await reopenPortal(record);
    await publish();
  }

  /**
   * An exit counts only after the window was seen in full screen, so a browser that refuses full screen is
   * asked a few times without filling the exam log.
   */
  async function checkFullScreen(): Promise<void> {
    const record = lock;
    if (record?.mode !== "browser" || !record.keep) return;
    if (now() < ignoreBoundsUntil) {
      scheduleBoundsCheck(ignoreBoundsUntil - now() + BOUNDS_SETTLE_MS);
      return;
    }
    const window: WindowInfo | null = await api.windows.get(record.keep.window_id).catch(() => null);
    if (!window) return;
    if (window.state === "fullscreen") {
      fullScreenSeen = true;
      fullScreenRetries = 0;
      return;
    }
    if (fullScreenSeen) {
      fullScreenSeen = false;
      record.fullscreen_exits += 1;
      emit("lock.fullscreen_exit", { count: record.fullscreen_exits });
      await publish();
    } else if (fullScreenRetries >= MAX_FULLSCREEN_RETRIES) {
      log("the browser keeps refusing full screen");
      return;
    } else {
      fullScreenRetries += 1;
    }
    await goFullScreen(record.keep.window_id);
  }

  function onWindowBoundsChanged(window: { id?: number }): void {
    if (lock?.mode !== "browser" || window.id !== lock.keep?.window_id) return;
    scheduleBoundsCheck(Math.max(BOUNDS_SETTLE_MS, ignoreBoundsUntil - now() + BOUNDS_SETTLE_MS));
  }

  function onWindowFocusChanged(windowId: number): void {
    if (lock?.mode !== "browser") return;
    if (windowId !== WINDOW_ID_NONE) {
      if (focusTimer !== null) timers.clearTimeout(focusTimer);
      focusTimer = null;
      focusAway = false;
      return;
    }
    if (focusTimer !== null || focusAway) return;
    focusTimer = timers.setTimeout(() => {
      focusTimer = null;
      void serial(async () => {
        const record = lock;
        if (!record) return;
        const focused = await api.windows.getLastFocused().catch(() => null);
        if (focused?.focused) return;
        // One event per time away; the exam window is asked to come back.
        focusAway = true;
        emit("tab.blocked", { host: null });
        focusExam(record, { window: true });
        await publish();
      });
    }, focusLossMs);
  }

  // ---- after a worker or browser restart ----

  async function resume(record: LockRecord): Promise<void> {
    if (isPastDeadline(record.exam, now())) {
      await release("deadline");
      return;
    }
    await enforce(record);
    const windows = await api.windows.getAll({ populate: true, windowTypes: ["normal"] });
    const tabs = windows.flatMap((w) => w.tabs ?? []);
    const kept = tabs.find((t) => t.id === record.keep?.tab_id);
    if (record.mode === "browser") {
      const exam = kept ?? tabs.find((t) => isAllowedUrl(t.url || t.pendingUrl, record.exam.allowed_hosts));
      if (exam?.id !== undefined) {
        record.keep = { tab_id: exam.id, window_id: exam.windowId, url: record.keep?.url ?? null };
        const strays = tabs
          .filter((t) => t.id !== exam.id && !isAllowedUrl(t.url || t.pendingUrl, record.exam.allowed_hosts))
          .map((t) => t.id)
          .filter((id): id is number => id !== undefined);
        if (strays.length > 0) await api.tabs.remove(strays).catch(() => {});
        await injectInto(exam.id);
        await goFullScreen(exam.windowId);
      } else {
        await reopenPortal(record);
      }
    } else if (!kept) {
      const first = tabs.find((t) => t.id !== undefined);
      if (first?.id !== undefined) {
        record.keep = { tab_id: first.id, window_id: first.windowId, url: record.keep?.url ?? null };
        await api.tabs.update(first.id, { url: blockedPageUrl() }).catch(() => {});
        const strays = tabs
          .map((t) => t.id)
          .filter((id): id is number => id !== undefined && id !== first.id);
        if (strays.length > 0) await api.tabs.remove(strays).catch(() => {});
      }
    }
    scheduleDeadline();
  }

  // ---- popup and content script ----

  async function handleRuntimeMessage(raw: unknown, senderUrl?: string): Promise<RuntimeReply> {
    const parsed = RuntimeRequest.safeParse(raw);
    if (!parsed.success) return { ok: false };
    const request = parsed.data;
    return serial(async () => {
      switch (request.type) {
        case "popup.pair":
          if (link !== "connected" || paired) return { ok: false };
          pairError = null;
          sendToApp({ type: "pair.request" });
          await publish();
          return { ok: true };
        case "popup.confirm":
          if (link !== "connected") return { ok: false };
          if (pair && Date.parse(pair.expires_at) > now())
            sendToApp({ type: "pair.confirm", code: pair.code });
          else sendToApp({ type: "pair.request" });
          return { ok: true };
        case "popup.lock": {
          const exam = examState?.exam;
          const ready = examState?.phase === "ready" || examState?.phase === "writing";
          if (link !== "paired" || !exam || exam.mode !== "browser" || !ready) return { ok: false };
          await startLock("browser", request.tab_id);
          return { ok: lock !== null };
        }
        case "popup.dismiss":
          released = null;
          await publish();
          return { ok: true };
        case "content.blocked": {
          const record = lock;
          if (record?.mode !== "browser") return { ok: false };
          if (!isAllowedUrl(senderUrl, record.exam.allowed_hosts)) return { ok: false };
          const noted = copyThrottle.take(request.kind, now());
          if (noted) {
            emit("copy.blocked", { kind: request.kind });
            await publish();
          }
          return { ok: true, noted };
        }
      }
    });
  }

  return {
    async start() {
      await serial(async () => {
        await load();
        if (lock) await resume(lock);
        else await api.action.setPopup({ popup: POPUP_PAGE }).catch(() => {});
        await publish();
      });
      appLink.start();
    },
    stop() {
      appLink.stop();
      clearLockTimers();
    },
    handleRuntimeMessage,
    onTabCreated: (tab) => serial(() => onTabCreated(tab)),
    onTabUpdated: (tabId, change) => serial(() => onTabUpdated(tabId, change)),
    onTabRemoved: (tabId) => serial(() => onTabRemoved(tabId)),
    onWindowBoundsChanged,
    onWindowFocusChanged,
    idle: () => queue.then(() => undefined),
    view: buildView,
  };
}
