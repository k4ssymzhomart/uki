// The content script on allowed exam hosts. The service worker registers it at lock time with
// chrome.scripting.registerContentScripts (document_start, not persisted across sessions) and injects it
// into the exam tab that is already open. It marks the page locked, cancels copy and print, and draws the
// Lock bar and the E.6 toast in a shadow root, so page styles and Üki styles never mix. It talks only to
// the service worker; the bar's data comes from chrome.storage.local. At release (the bar goes away) it
// takes all of it off the page again, the copy guard's listeners included. Phase 1: the exam's rules
// (E.1) in the bar state switch the copy guard and the print style, and show the Calculator tab (E.5b).
// First: Kazakh Intl for Chrome, whose ICU has no Kazakh (the toast prints a time), before anything
// creates a formatter. Content scripts have their own Intl, so the pages' own is untouched.
import "@uki/i18n/polyfill";

import { type AskReason, effectiveBrowserRules } from "@uki/contracts";
import { isLocale } from "@uki/i18n";
import { createRoot, type Root } from "react-dom/client";
import { browser } from "wxt/browser";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { createShadowRootUi, type ShadowRootContentScriptUi } from "wxt/utils/content-script-ui/shadow-root";
import { defineContentScript } from "wxt/utils/define-content-script";
import { type GuardHit, installGuard, markLocked } from "../../content/guard.ts";
import { LockOverlay, type ToastRequest } from "../../content/lock-overlay.tsx";
import { LockIntlProvider } from "../../lib/intl.tsx";
import { RuntimeReply, type RuntimeRequest } from "../../lib/messages.ts";
import { BarState, readStored, STORAGE_KEYS } from "../../lib/state.ts";
import css from "../../styles.css?inline";

/** Tokens are declared on :root; inside the shadow root they belong on :host. */
const shadowCss = css.replaceAll(":root", ":host");

async function readBar(): Promise<BarState | null> {
  const items = await browser.storage.local.get(STORAGE_KEYS.bar);
  return readStored(BarState.nullable(), items[STORAGE_KEYS.bar], null);
}

function domReady(): Promise<void> {
  if (document.readyState !== "loading") return Promise.resolve();
  return new Promise((resolve) =>
    document.addEventListener("DOMContentLoaded", () => resolve(), { once: true }),
  );
}

async function run(ctx: ContentScriptContext): Promise<void> {
  let bar = await readBar();
  /** E.8: the popup's Ask proctor presses after this page loaded; an older one never reopens the sheet. */
  let askSeen = bar?.ask_at ?? 0;
  let askRequests = 0;
  let toast: ToastRequest | null = null;
  let unmark: (() => void) | null = null;
  let ui: ShadowRootContentScriptUi<Root> | null = null;
  /** The copy guard's listeners, removed together at release. */
  let guard: AbortController | null = null;

  /** E.5a: Send to proctor goes to the service worker, which answers with the event id. */
  const askHelp = async (topic: AskReason, text: string | null): Promise<string | null> => {
    const request: RuntimeRequest =
      text === null ? { type: "content.help", topic } : { type: "content.help", topic, text };
    const reply = RuntimeReply.safeParse(await browser.runtime.sendMessage(request).catch(() => null));
    return reply.success && reply.data.ok ? (reply.data.id ?? null) : null;
  };

  const render = () => {
    const root = ui?.mounted;
    if (!root || !bar) return;
    const locale = isLocale(bar.locale) ? bar.locale : "kk";
    root.render(
      <LockIntlProvider locale={locale}>
        <LockOverlay bar={bar} toast={toast} locale={locale} onAskHelp={askHelp} askRequests={askRequests} />
      </LockIntlProvider>,
    );
  };

  const onBlocked = (hit: GuardHit) => {
    toast = { id: (toast?.id ?? 0) + 1, at: Date.now() };
    render();
    if (hit === null) return;
    const request: RuntimeRequest = { type: "content.blocked", kind: hit };
    void browser.runtime.sendMessage(request).catch(() => {});
  };

  const rules = () => effectiveBrowserRules(bar?.browser_rules);

  const activate = async () => {
    // Called on every change of the bar: the print style follows the print rule.
    unmark = markLocked(document, { blockPrint: rules().print });
    if (!guard) {
      // Not ctx.addEventListener: it replaces the signal with the context's own, which outlives a release.
      const scope = new AbortController();
      guard = scope;
      installGuard(window, {
        listen: (target, type, listener) =>
          target.addEventListener(type, listener, { capture: true, signal: scope.signal }),
        onBlocked: (hit) => {
          if (bar) onBlocked(hit);
        },
        rules,
      });
    }
    if (!ui) {
      await domReady();
      if (ctx.isInvalid || !bar) return;
      ui = await createShadowRootUi(ctx, {
        name: "uki-lock-bar",
        position: "inline",
        anchor: "body",
        append: "first",
        css: shadowCss,
        onMount: (container) => createRoot(container),
        onRemove: (root) => root?.unmount(),
      });
      ui.mount();
    }
    render();
  };

  const deactivate = () => {
    guard?.abort();
    guard = null;
    unmark?.();
    unmark = null;
    ui?.remove();
    ui = null;
  };

  const onChanged = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    const change = changes[STORAGE_KEYS.bar];
    if (area !== "local" || !change) return;
    bar = readStored(BarState.nullable(), change.newValue, null);
    const askAt = bar?.ask_at ?? 0;
    if (askAt > askSeen) {
      askSeen = askAt;
      askRequests += 1;
    }
    if (bar?.mode === "browser") void activate();
    else deactivate();
  };
  browser.storage.onChanged.addListener(onChanged);
  ctx.onInvalidated(() => {
    browser.storage.onChanged.removeListener(onChanged);
    deactivate();
  });

  if (bar?.mode === "browser") await activate();
}

export default defineContentScript({
  registration: "runtime",
  runAt: "document_start",
  cssInjectionMode: "manual",
  main(ctx) {
    void run(ctx);
  },
});
