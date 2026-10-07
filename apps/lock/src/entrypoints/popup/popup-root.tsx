import { BCP47, isLocale } from "@uki/i18n";
import { useEffect, useState } from "react";
import { browser } from "wxt/browser";
import { LockIntlProvider } from "../../lib/intl.tsx";
import type { RuntimeRequest } from "../../lib/messages.ts";
import { EMPTY_VIEW, LockView, STORAGE_KEYS } from "../../lib/state.ts";
import { useNow } from "../../lib/use-now.ts";
import { useStored } from "../../lib/use-stored.ts";
import { type PopupActions, PopupApp, popupScreen } from "./popup-app.tsx";

function ask(request: RuntimeRequest): void {
  void browser.runtime.sendMessage(request).catch(() => {});
}

/** The tab the popup was opened on, and how many other tabs Lock and start would close. */
async function activeTabInfo(): Promise<{ tabId: number | undefined; others: number }> {
  const [active] = await browser.tabs.query({ active: true, currentWindow: true });
  const all = await browser.tabs.query({ windowType: "normal" });
  return { tabId: active?.id, others: Math.max(0, all.length - 1) };
}

/**
 * The popup page: reads the service worker's view from storage and follows the app's locale (kk until the
 * app sends one). Opening it while the app is connected but not paired asks for a code at once.
 */
export function PopupRoot() {
  const view = useStored(STORAGE_KEYS.view, LockView, EMPTY_VIEW);
  const now = useNow();
  const [tabs, setTabs] = useState<{ tabId: number | undefined; others: number }>({
    tabId: undefined,
    others: 0,
  });
  const screen = popupScreen(view);

  useEffect(() => {
    void activeTabInfo().then(setTabs);
  }, []);

  const wantsCode = screen === "pair" && view.pair === null && view.pair_error === null;
  useEffect(() => {
    if (wantsCode) ask({ type: "popup.pair" });
  }, [wantsCode]);

  const actions: PopupActions = {
    pair: () => ask({ type: "popup.pair" }),
    confirm: () => ask({ type: "popup.confirm" }),
    lock: () => ask({ type: "popup.lock", tab_id: tabs.tabId }),
    dismiss: () => {
      ask({ type: "popup.dismiss" });
      window.close();
    },
  };

  const candidate = view.locked?.locale ?? view.exam_state?.locale ?? view.released?.locale;
  const locale = isLocale(candidate) ? candidate : "kk";
  useEffect(() => {
    document.documentElement.lang = BCP47[locale];
  }, [locale]);
  return (
    <LockIntlProvider locale={locale}>
      <PopupApp view={view} otherTabs={tabs.others} nowMs={now} locale={locale} actions={actions} />
    </LockIntlProvider>
  );
}
