// The browser APIs the service worker uses, as one narrow interface. background.ts adapts WXT's `browser`
// to it; the controller tests pass an in-memory browser instead.
import type { RedirectRule, SessionRulesUpdate } from "../lib/rules.ts";
import type { TabSnapshot, WindowSnapshot } from "../lib/tab-plan.ts";

export type WindowState = "normal" | "minimized" | "maximized" | "fullscreen" | "locked-fullscreen";

/** chrome.windows.WindowType values the Lock asks for. */
export type WindowKind = "normal" | "popup" | "app";
/** Every window a student can read a page in: normal, popup (window.open) and app (installed sites). */
export const LOCK_WINDOW_TYPES: WindowKind[] = ["normal", "popup", "app"];

export interface TabInfo extends TabSnapshot {
  id?: number;
  title?: string;
}

export interface WindowInfo extends WindowSnapshot {
  id?: number;
  state?: WindowState;
  tabs?: TabInfo[];
}

export interface ContentScriptRegistration {
  id: string;
  matches: string[];
  js: string[];
  runAt: "document_start";
  allFrames: boolean;
  persistAcrossSessions: false;
}

export interface LockApi {
  storage: {
    get(keys: string[]): Promise<Record<string, unknown>>;
    set(items: Record<string, unknown>): Promise<void>;
  };
  tabs: {
    get(tabId: number): Promise<TabInfo>;
    create(properties: {
      windowId?: number;
      url?: string;
      index?: number;
      active?: boolean;
      pinned?: boolean;
    }): Promise<TabInfo>;
    update(tabId: number, properties: { url?: string; active?: boolean; pinned?: boolean }): Promise<unknown>;
    remove(tabIds: number | number[]): Promise<void>;
  };
  windows: {
    getAll(query: { populate: boolean; windowTypes: WindowKind[] }): Promise<WindowInfo[]>;
    get(windowId: number): Promise<WindowInfo>;
    getLastFocused(query?: { populate: boolean; windowTypes: WindowKind[] }): Promise<WindowInfo>;
    create(properties: {
      url?: string | string[];
      focused?: boolean;
      state?: WindowState;
      left?: number;
      top?: number;
      width?: number;
      height?: number;
    }): Promise<WindowInfo | undefined>;
    update(windowId: number, properties: { state?: WindowState; focused?: boolean }): Promise<unknown>;
  };
  rules: {
    updateSessionRules(update: SessionRulesUpdate): Promise<void>;
    getSessionRules(): Promise<RedirectRule[] | { id: number }[]>;
  };
  scripting: {
    registerContentScripts(scripts: ContentScriptRegistration[]): Promise<void>;
    unregisterContentScripts(filter: { ids: string[] }): Promise<void>;
    getRegisteredContentScripts(): Promise<{ id: string }[]>;
    executeScript(injection: { target: { tabId: number }; files: string[] }): Promise<unknown>;
  };
  action: {
    setPopup(details: { popup: string }): Promise<void>;
    openPopup(): Promise<void>;
    /** Paths by size, for example { 16: "/icons/ready-16.png" }. */
    setIcon(details: { path: Record<string, string> }): Promise<void>;
  };
  runtime: {
    getURL(path: string): string;
    /** Any extension API call resets the worker's idle timer; the link calls this while it retries. */
    keepAlive(): void;
  };
}

/** chrome.windows.WINDOW_ID_NONE: focus left every browser window. */
export const WINDOW_ID_NONE = -1;
