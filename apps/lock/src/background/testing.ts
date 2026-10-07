// Test doubles for the service worker: an in-memory browser behind LockApi and a scripted socket.
// Only *.test.ts files import this module.
import { type AppToLock, encodeLockMessage, type LockToApp, parseLockToApp } from "@uki/contracts";
import type { RedirectRule, SessionRulesUpdate } from "../lib/rules.ts";
import type { SocketLike } from "./app-link.ts";
import type { ContentScriptRegistration, LockApi, TabInfo, WindowInfo, WindowState } from "./lock-api.ts";

export const TEST_EXTENSION_ID = "abcdefghijklmnopabcdefghijklmnop";

/** A socket the test drives: open it, feed it app messages, read what the Lock sent. */
export class FakeSocket implements SocketLike {
  readyState = 0;
  sent: LockToApp[] = [];
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  /** Answers the Lock's pings like the app does; switch off to test a silent app. */
  autoPong = true;
  constructor(readonly url: string) {}
  send(data: string): void {
    const parsed = parseLockToApp(data);
    if (!parsed.ok) throw new Error(`the Lock sent an invalid frame: ${parsed.error}`);
    this.sent.push(parsed.message);
    if (this.autoPong && parsed.message.type === "ping") queueMicrotask(() => this.receive({ type: "pong" }));
  }
  close(): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.({});
  }
  open(): void {
    this.readyState = 1;
    this.onopen?.({});
  }
  refuse(): void {
    this.readyState = 3;
    this.onerror?.({});
    this.onclose?.({});
  }
  receive(message: AppToLock): void {
    this.onmessage?.({ data: encodeLockMessage(message) });
  }
  /** Messages of one type the Lock sent, oldest first. */
  ofType<T extends LockToApp["type"]>(type: T): Extract<LockToApp, { type: T }>[] {
    return this.sent.filter((m): m is Extract<LockToApp, { type: T }> => m.type === type);
  }
}

interface FakeTab extends TabInfo {
  id: number;
}
interface FakeWindow {
  id: number;
  focused: boolean;
  state: WindowState;
  type: "normal";
  incognito: false;
}

/** An in-memory browser: windows, tabs, the session rules, registered scripts, the action and storage. */
export class FakeBrowser {
  windows: FakeWindow[] = [];
  tabs: FakeTab[] = [];
  store = new Map<string, unknown>();
  rules: RedirectRule[] = [];
  scripts: ContentScriptRegistration[] = [];
  injected: { tabId: number; files: string[] }[] = [];
  popup = "popup.html";
  icon: Record<string, string> | null = null;
  openPopupCalls = 0;
  keepAliveCalls = 0;
  lastFocusedFocused = true;
  private nextId = 100;

  addWindow(
    urls: string[],
    options: { focused?: boolean; state?: WindowState; activeIndex?: number } = {},
  ): number {
    const id = this.nextId++;
    this.windows.push({
      id,
      focused: options.focused ?? false,
      state: options.state ?? "normal",
      type: "normal",
      incognito: false,
    });
    urls.forEach((url, index) => {
      this.tabs.push({
        id: this.nextId++,
        windowId: id,
        index,
        url,
        pinned: false,
        active: index === (options.activeIndex ?? 0),
        incognito: false,
      });
    });
    return id;
  }

  tabsOf(windowId: number): FakeTab[] {
    return this.tabs.filter((t) => t.windowId === windowId).sort((a, b) => a.index - b.index);
  }

  private reindex(windowId: number): void {
    this.tabsOf(windowId).forEach((t, i) => {
      t.index = i;
    });
  }

  private insertTab(
    windowId: number,
    url: string | undefined,
    index: number | undefined,
    extra: Partial<FakeTab> = {},
  ): FakeTab {
    const list = this.tabsOf(windowId);
    const at = Math.min(index ?? list.length, list.length);
    for (const t of list) if (t.index >= at) t.index += 1;
    const created: FakeTab = {
      id: this.nextId++,
      windowId,
      index: at,
      url: url ?? "chrome://newtab/",
      pinned: false,
      active: false,
      incognito: false,
      ...extra,
    };
    this.tabs.push(created);
    return created;
  }

  readonly api: LockApi = {
    storage: {
      get: async (keys) =>
        Object.fromEntries(
          keys.filter((k) => this.store.has(k)).map((k) => [k, structuredClone(this.store.get(k))]),
        ),
      set: async (items) => {
        for (const [k, v] of Object.entries(items)) this.store.set(k, structuredClone(v));
      },
    },
    tabs: {
      get: async (tabId) => {
        const found = this.tabs.find((t) => t.id === tabId);
        if (!found) throw new Error(`no tab ${tabId}`);
        return { ...found };
      },
      create: async ({ windowId, url, index, active, pinned }) => {
        const target = windowId ?? this.windows[0]?.id;
        if (target === undefined || !this.windows.some((w) => w.id === target)) throw new Error("no window");
        return {
          ...this.insertTab(target, url, index, { active: active ?? false, pinned: pinned ?? false }),
        };
      },
      update: async (tabId, properties) => {
        const found = this.tabs.find((t) => t.id === tabId);
        if (!found) throw new Error(`no tab ${tabId}`);
        if (properties.url !== undefined) found.url = properties.url;
        if (properties.pinned !== undefined) found.pinned = properties.pinned;
        if (properties.active) {
          for (const t of this.tabsOf(found.windowId)) t.active = t.id === tabId;
        }
        return { ...found };
      },
      remove: async (tabIds) => {
        const ids = new Set(Array.isArray(tabIds) ? tabIds : [tabIds]);
        const touched = new Set(this.tabs.filter((t) => ids.has(t.id)).map((t) => t.windowId));
        this.tabs = this.tabs.filter((t) => !ids.has(t.id));
        for (const windowId of touched) {
          if (this.tabsOf(windowId).length === 0)
            this.windows = this.windows.filter((w) => w.id !== windowId);
          else this.reindex(windowId);
        }
      },
    },
    windows: {
      getAll: async ({ populate }) =>
        this.windows.map(
          (w): WindowInfo => ({
            ...w,
            ...(populate ? { tabs: this.tabsOf(w.id).map((t) => ({ ...t })) } : {}),
          }),
        ),
      get: async (windowId) => {
        const found = this.windows.find((w) => w.id === windowId);
        if (!found) throw new Error(`no window ${windowId}`);
        return { ...found };
      },
      getLastFocused: async () => ({
        ...(this.windows[0] ?? { id: -1, incognito: false }),
        focused: this.lastFocusedFocused,
      }),
      create: async ({ url, focused, state }) => {
        const urls = url === undefined ? ["chrome://newtab/"] : Array.isArray(url) ? url : [url];
        const id = this.addWindow(urls, { focused: focused ?? false, state: state ?? "normal" });
        return {
          id,
          focused: focused ?? false,
          incognito: false,
          tabs: this.tabsOf(id).map((t) => ({ ...t })),
        };
      },
      update: async (windowId, properties) => {
        const found = this.windows.find((w) => w.id === windowId);
        if (!found) throw new Error(`no window ${windowId}`);
        if (properties.state) found.state = properties.state;
        if (properties.focused) for (const w of this.windows) w.focused = w.id === windowId;
        return { ...found };
      },
    },
    rules: {
      updateSessionRules: async (update: SessionRulesUpdate) => {
        this.rules = this.rules.filter((r) => !update.removeRuleIds.includes(r.id));
        for (const rule of update.addRules ?? []) {
          if (this.rules.some((r) => r.id === rule.id)) throw new Error(`duplicate rule ${rule.id}`);
          this.rules.push(rule);
        }
      },
      getSessionRules: async () => this.rules,
    },
    scripting: {
      registerContentScripts: async (scripts) => {
        for (const script of scripts) {
          if (this.scripts.some((s) => s.id === script.id))
            throw new Error(`Duplicate script ID '${script.id}'`);
          this.scripts.push(script);
        }
      },
      unregisterContentScripts: async ({ ids }) => {
        this.scripts = this.scripts.filter((s) => !ids.includes(s.id));
      },
      getRegisteredContentScripts: async () => this.scripts.map((s) => ({ id: s.id })),
      executeScript: async ({ target, files }) => {
        this.injected.push({ tabId: target.tabId, files });
      },
    },
    action: {
      setPopup: async ({ popup }) => {
        this.popup = popup;
      },
      openPopup: async () => {
        this.openPopupCalls += 1;
      },
      setIcon: async ({ path }) => {
        this.icon = path;
      },
    },
    runtime: {
      getURL: (path) => `chrome-extension://${TEST_EXTENSION_ID}${path.startsWith("/") ? path : `/${path}`}`,
      keepAlive: () => {
        this.keepAliveCalls += 1;
      },
    },
  };
}
