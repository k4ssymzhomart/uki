import { afterEach, describe, expect, it, vi } from "vitest";
import { type GuardHit, installGuard, isPrintShortcut, markLocked } from "./guard.ts";

let scope = new AbortController();
afterEach(() => {
  scope.abort();
  scope = new AbortController();
});

function guarded() {
  const hits: GuardHit[] = [];
  const pageListener = vi.fn();
  const { signal } = scope;
  for (const type of ["copy", "cut", "paste", "contextmenu", "dragstart", "drop", "keydown"])
    document.addEventListener(type, pageListener, { signal });
  installGuard(window, {
    listen: (target, type, listener) => target.addEventListener(type, listener, { capture: true, signal }),
    onBlocked: (hit) => hits.push(hit),
  });
  return { hits, pageListener };
}

describe("the copy guard", () => {
  it("cancels copy, cut, paste, the context menu, drag and drop before the page sees them", () => {
    const { hits, pageListener } = guarded();
    for (const type of ["copy", "cut", "paste", "contextmenu", "dragstart", "drop"]) {
      const event = new Event(type, { bubbles: true, cancelable: true });
      document.body.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }
    expect(hits).toEqual(["copy", "cut", "paste", null, "copy", "paste"]);
    expect(pageListener).not.toHaveBeenCalled();
  });

  it("cancels Ctrl+P and Cmd+P, and notes window.print()", () => {
    const { hits } = guarded();
    const ctrl = new KeyboardEvent("keydown", { key: "p", ctrlKey: true, bubbles: true, cancelable: true });
    document.body.dispatchEvent(ctrl);
    const cmd = new KeyboardEvent("keydown", { key: "P", metaKey: true, bubbles: true, cancelable: true });
    document.body.dispatchEvent(cmd);
    const typing = new KeyboardEvent("keydown", { key: "p", bubbles: true, cancelable: true });
    document.body.dispatchEvent(typing);
    window.dispatchEvent(new Event("beforeprint"));
    expect([ctrl.defaultPrevented, cmd.defaultPrevented, typing.defaultPrevented]).toEqual([
      true,
      true,
      false,
    ]);
    expect(hits).toEqual(["print", "print", "print"]);
    expect(isPrintShortcut({ key: "p", ctrlKey: true, metaKey: false, altKey: true })).toBe(false);
  });

  it("marks the page locked, pushes it below the bar, blanks print, and undoes it all", () => {
    const undo = markLocked(document);
    expect(document.documentElement.getAttribute("data-uki-lock")).toBe("locked");
    const style = document.querySelector("style[data-uki-lock-style]");
    expect(style?.textContent).toContain("margin-top:52px");
    expect(style?.textContent).toContain("@media print{html{display:none !important;}}");
    markLocked(document);
    expect(document.querySelectorAll("style[data-uki-lock-style]")).toHaveLength(1);
    undo();
    expect(document.documentElement.hasAttribute("data-uki-lock")).toBe(false);
    expect(document.querySelector("style[data-uki-lock-style]")).toBeNull();
  });
});
