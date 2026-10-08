import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { ContentScriptContext } from "wxt/utils/content-script-context";
import { type BarState, STORAGE_KEYS } from "../../lib/state.ts";
import script from "./index.tsx";

const bar: BarState = {
  mode: "browser",
  title: "Physics 1 · Quiz 3",
  starts_at: "2026-10-07T09:00:00Z",
  ends_at: "2026-10-07T09:40:00Z",
  phase: "writing",
  watch: "watching",
  locale: "en",
  lms_url: "http://localhost:5180/physics-1/quiz-3",
  allowed_hosts: ["localhost:5180"],
};

/** What the guard cancels: copy, cut, paste, the context menu, drag and drop, and Cmd+P. */
const PROBES = ["copy", "cut", "paste", "contextmenu", "dragstart", "drop", "print"] as const;

function cancelled(probe: (typeof PROBES)[number]): boolean {
  const event =
    probe === "print"
      ? new KeyboardEvent("keydown", { key: "p", metaKey: true, bubbles: true, cancelable: true })
      : new Event(probe, { bubbles: true, cancelable: true });
  document.body.dispatchEvent(event);
  return event.defaultPrevented;
}

let ctx: ContentScriptContext;
beforeEach(() => {
  fakeBrowser.reset();
  ctx = new ContentScriptContext("lock-guard");
});
afterEach(() => ctx.abort());

it("cancels copy and print while locked, and gives them back to the page at release", async () => {
  await fakeBrowser.storage.local.set({ [STORAGE_KEYS.bar]: bar });
  script.main(ctx);
  await vi.waitFor(() => expect(document.querySelector("uki-lock-bar")).not.toBeNull());
  expect(document.documentElement.getAttribute("data-uki-lock")).toBe("locked");
  expect(PROBES.map(cancelled)).toEqual(PROBES.map(() => true));

  // Release: the service worker writes bar null. The script context itself stays valid.
  await fakeBrowser.storage.local.set({ [STORAGE_KEYS.bar]: null });
  await vi.waitFor(() => expect(document.querySelector("uki-lock-bar")).toBeNull());
  expect(document.documentElement.hasAttribute("data-uki-lock")).toBe(false);
  expect(ctx.isValid).toBe(true);
  expect(PROBES.map(cancelled)).toEqual(PROBES.map(() => false));

  // A later lock on the same page guards it again.
  await fakeBrowser.storage.local.set({ [STORAGE_KEYS.bar]: bar });
  await vi.waitFor(() => expect(document.querySelector("uki-lock-bar")).not.toBeNull());
  expect(PROBES.map(cancelled)).toEqual(PROBES.map(() => true));
});

it("E.1: with copy and paste and print off the page keeps them, and the print style is gone", async () => {
  const rules = { copy_paste: false, print: false, full_screen: true, calculator: true } as const;
  await fakeBrowser.storage.local.set({
    [STORAGE_KEYS.bar]: {
      ...bar,
      browser_rules: {
        ...rules,
        other_extensions: "phase2",
        devtools: "managed_only",
        screen_share: "detected",
      },
    },
  });
  script.main(ctx);
  await vi.waitFor(() => expect(document.querySelector("uki-lock-bar")).not.toBeNull());
  expect(document.documentElement.getAttribute("data-uki-lock")).toBe("locked");
  expect(PROBES.map(cancelled)).toEqual(PROBES.map(() => false));
  expect(document.querySelector("style[data-uki-lock-style]")?.textContent).not.toContain("@media print");

  // The rules come back on during the exam: the guard follows at once.
  await fakeBrowser.storage.local.set({ [STORAGE_KEYS.bar]: bar });
  await vi.waitFor(() =>
    expect(document.querySelector("style[data-uki-lock-style]")?.textContent).toContain("@media print"),
  );
  expect(PROBES.map(cancelled)).toEqual(PROBES.map(() => true));
});

it("E.8: a later Ask proctor from the popup opens the sheet in the bar; an older one does not", async () => {
  await fakeBrowser.storage.local.set({ [STORAGE_KEYS.bar]: { ...bar, ask_at: 1000 } });
  script.main(ctx);
  await vi.waitFor(() => expect(document.querySelector("uki-lock-bar")).not.toBeNull());
  const root = () => document.querySelector("uki-lock-bar")?.shadowRoot ?? null;
  await vi.waitFor(() => expect(root()?.querySelector("[role=toolbar], div")).toBeTruthy());
  expect(root()?.querySelector("[data-uki-ask]")).toBeNull();
  await fakeBrowser.storage.local.set({ [STORAGE_KEYS.bar]: { ...bar, ask_at: 2000 } });
  await vi.waitFor(() => expect(root()?.querySelector("[data-uki-ask]")).not.toBeNull());
});
