// Adapts WXT's `browser` (chrome.* in Chromium) to the narrow LockApi the controller uses.
import { browser } from "wxt/browser";
import type { LockApi, TabInfo, WindowInfo } from "./lock-api.ts";

/** Chrome's own enums and branded paths are wider than LockApi's literals; the shapes are the same. */
function loose<T>(value: unknown): T {
  return value as T;
}

export function browserLockApi(): LockApi {
  return {
    storage: {
      get: (keys) => browser.storage.local.get(keys),
      set: (items) => browser.storage.local.set(items),
    },
    tabs: {
      get: async (tabId) => loose<TabInfo>(await browser.tabs.get(tabId)),
      create: async (properties) => loose<TabInfo>(await browser.tabs.create(properties)),
      update: (tabId, properties) => browser.tabs.update(tabId, properties),
      remove: (tabIds) => browser.tabs.remove(Array.isArray(tabIds) ? tabIds : [tabIds]),
    },
    windows: {
      getAll: async (query) => loose<WindowInfo[]>(await browser.windows.getAll(loose(query))),
      get: async (windowId) => loose<WindowInfo>(await browser.windows.get(windowId)),
      getLastFocused: async (query) => loose<WindowInfo>(await browser.windows.getLastFocused(loose(query))),
      create: async (properties) =>
        loose<WindowInfo | undefined>(await browser.windows.create(loose(properties))),
      update: (windowId, properties) => browser.windows.update(windowId, loose(properties)),
    },
    rules: {
      updateSessionRules: (update) => browser.declarativeNetRequest.updateSessionRules(loose(update)),
      getSessionRules: async () => loose(await browser.declarativeNetRequest.getSessionRules()),
    },
    scripting: {
      registerContentScripts: (scripts) => browser.scripting.registerContentScripts(loose(scripts)),
      unregisterContentScripts: (filter) => browser.scripting.unregisterContentScripts(filter),
      getRegisteredContentScripts: () => browser.scripting.getRegisteredContentScripts(),
      executeScript: (injection) => browser.scripting.executeScript(loose(injection)),
    },
    action: {
      setPopup: (details) => browser.action.setPopup(details),
      openPopup: () => browser.action.openPopup(),
      setIcon: (details) => browser.action.setIcon(details),
    },
    runtime: {
      getURL: (path) => browser.runtime.getURL(loose(path)),
      keepAlive: () => {
        void browser.runtime.getPlatformInfo();
      },
    },
  };
}

/** The browser's name for the app's hello: Edge, Yandex and Opera say so in their user agent. */
export function browserName(userAgent: string): string {
  if (/\bEdg\//.test(userAgent)) return "edge";
  if (/\bYaBrowser\//.test(userAgent)) return "yandex";
  if (/\bOPR\//.test(userAgent)) return "opera";
  return "chrome";
}
