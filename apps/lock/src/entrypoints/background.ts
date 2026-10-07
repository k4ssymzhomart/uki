// The Üki Lock service worker ("Üki Lock" in docs/phase-0-plan.md). It owns the link with the Üki app and
// the lock itself; see background/controller.ts. Listeners are added synchronously here, so Chrome wakes the
// worker for them after it was stopped; the controller queues them behind its start-up.
import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import type { SocketLike } from "../background/app-link.ts";
import { browserLockApi, browserName } from "../background/browser-api.ts";
import { createLockController } from "../background/controller.ts";

export default defineBackground({
  type: "module",
  main() {
    const controller = createLockController({
      api: browserLockApi(),
      extensionId: browser.runtime.id,
      lockVersion: browser.runtime.getManifest().version,
      browserName: browserName(navigator.userAgent),
      // The browser's WebSocket; its handler types are wider than SocketLike's, the shape is the same.
      createSocket: (url) => new WebSocket(url) as unknown as SocketLike,
    });

    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      void controller
        .handleRuntimeMessage(message, sender.tab?.url ?? sender.url)
        .then(sendResponse, () => sendResponse({ ok: false }));
      return true;
    });
    browser.tabs.onCreated.addListener((tab) => void controller.onTabCreated(tab));
    browser.tabs.onUpdated.addListener(
      (tabId, change, tab) => void controller.onTabUpdated(tabId, change, tab),
    );
    browser.tabs.onRemoved.addListener((tabId) => void controller.onTabRemoved(tabId));
    browser.windows.onBoundsChanged.addListener((window) => controller.onWindowBoundsChanged(window));
    browser.windows.onFocusChanged.addListener((windowId) => controller.onWindowFocusChanged(windowId));

    void controller.start();
  },
});
