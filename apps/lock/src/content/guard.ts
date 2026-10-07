// The copy guard on allowed exam hosts ("No copy, paste or print" in docs/phase-0-plan.md): it cancels
// copy, cut, paste, the context menu, drag and drop, and Ctrl or Cmd+P, and a print style blanks the page.
// Each attempt calls onBlocked; the service worker decides which ones go to the exam log.
import type { CopyKind } from "@uki/contracts";
import { LOCK_BAR_HEIGHT } from "@uki/ui";

/** null: cancelled but not an exam event (the context menu). */
export type GuardHit = CopyKind | null;

export interface GuardTarget {
  addEventListener(type: string, listener: (event: Event) => void, options: AddEventListenerOptions): void;
}

export interface GuardOptions {
  /** Where listeners go; the content script adds them with a signal that removes them all at release. */
  listen: (target: GuardTarget, type: string, listener: (event: Event) => void) => void;
  onBlocked: (hit: GuardHit) => void;
}

const LOCK_ATTRIBUTE = "data-uki-lock";
const STYLE_ATTRIBUTE = "data-uki-lock-style";

function cancel(event: Event): void {
  event.preventDefault();
  event.stopImmediatePropagation();
}

/** What a print shortcut looks like on macOS (Cmd+P) and Windows (Ctrl+P). */
export function isPrintShortcut(
  event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey">,
): boolean {
  return (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "p";
}

/**
 * The page's own style while locked: the page moves down by the bar's height, and print shows nothing.
 * The mock portal reads data-uki-lock="locked" on <html> to enable Start attempt.
 */
export function markLocked(doc: Document): () => void {
  const root = doc.documentElement;
  root.setAttribute(LOCK_ATTRIBUTE, "locked");
  let style = doc.querySelector<HTMLStyleElement>(`style[${STYLE_ATTRIBUTE}]`);
  if (!style) {
    style = doc.createElement("style");
    style.setAttribute(STYLE_ATTRIBUTE, "");
    (doc.head ?? root).append(style);
  }
  style.textContent = [
    `html{margin-top:${LOCK_BAR_HEIGHT}px !important;}`,
    "@media print{html{display:none !important;}}",
  ].join("\n");
  return () => {
    if (root.getAttribute(LOCK_ATTRIBUTE) === "locked") root.removeAttribute(LOCK_ATTRIBUTE);
    style?.remove();
  };
}

/** Installs the listeners on the page's window. They capture first, so the page never sees the events. */
export function installGuard(win: Window, options: GuardOptions): void {
  const on = (type: string, hit: GuardHit) =>
    options.listen(win, type, (event) => {
      cancel(event);
      options.onBlocked(hit);
    });
  on("copy", "copy");
  on("cut", "cut");
  on("paste", "paste");
  on("contextmenu", null);
  on("dragstart", "copy");
  on("drop", "paste");
  options.listen(win, "keydown", (event) => {
    if (event instanceof KeyboardEvent && isPrintShortcut(event)) {
      cancel(event);
      options.onBlocked("print");
    }
  });
  // window.print() from the page cannot be cancelled here; the print style blanks it, and it is noted.
  options.listen(win, "beforeprint", () => options.onBlocked("print"));
}
