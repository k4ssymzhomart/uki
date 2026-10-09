import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeBridge } from "../test/fakes.ts";
import { GUARDED_EVENTS, guardClipboard } from "./clipboard-guard.ts";
import { ExamGuard } from "./exam-guard.ts";

/** Dispatches `type` on `target` as the browser would (bubbling, cancelable); true when cancelled. */
function cancelled(type: string, target: EventTarget = document.body): boolean {
  const event = new Event(type, { bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event.defaultPrevented;
}

/** What typing into a text field fires. */
const TYPING = ["keydown", "keypress", "beforeinput", "input", "keyup", "compositionstart", "compositionend"];

let release: (() => void) | null = null;

afterEach(() => {
  release?.();
  release = null;
  document.body.innerHTML = "";
});

describe("the clipboard guard", () => {
  it("cancels copy, cut, paste, the context menu and drop on the window, from any element", () => {
    document.body.innerHTML = "<p>Question 1</p><textarea></textarea>";
    const textarea = document.querySelector("textarea");
    const question = document.querySelector("p");
    if (!textarea || !question) throw new Error("no fixture");
    release = guardClipboard(window);
    expect([...GUARDED_EVENTS]).toEqual(["copy", "cut", "paste", "contextmenu", "drop"]);
    for (const type of GUARDED_EVENTS) {
      expect(cancelled(type, textarea), `${type} in a text field`).toBe(true);
      expect(cancelled(type, question), `${type} on the question`).toBe(true);
    }
  });

  it("listens in the capture phase, so an element that stops the event cannot let it through", () => {
    document.body.innerHTML = "<textarea></textarea>";
    const textarea = document.querySelector("textarea");
    if (!textarea) throw new Error("no fixture");
    textarea.addEventListener("paste", (event) => event.stopPropagation());
    release = guardClipboard(window);
    expect(cancelled("paste", textarea)).toBe(true);
  });

  it("leaves typing alone: no key, input or composition event is cancelled", () => {
    document.body.innerHTML = "<textarea></textarea>";
    const textarea = document.querySelector("textarea");
    if (!textarea) throw new Error("no fixture");
    release = guardClipboard(window);
    for (const type of TYPING) expect(cancelled(type, textarea), type).toBe(false);
    // The field still takes the text it is given.
    textarea.value = "x = 4";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    expect(textarea.value).toBe("x = 4");
  });

  it("stops cancelling when released", () => {
    const stop = guardClipboard(window);
    expect(cancelled("paste")).toBe(true);
    stop();
    for (const type of GUARDED_EVENTS) expect(cancelled(type), type).toBe(false);
  });
});

describe("the exam guard's clipboard block", () => {
  function makeGuard(page?: EventTarget | null) {
    const bridge = new FakeBridge();
    return new ExamGuard({ bridge, onBlocked: vi.fn(), ...(page === undefined ? {} : { page }) });
  }

  it("blocks on the renderer's window while locked, and releases on unlock and on stop", () => {
    const guard = makeGuard();
    expect(guard.blockingClipboard).toBe(false);
    expect(cancelled("paste")).toBe(false);

    guard.blockClipboard(true);
    guard.blockClipboard(true);
    expect(guard.blockingClipboard).toBe(true);
    expect(cancelled("paste")).toBe(true);

    guard.blockClipboard(false);
    expect(guard.blockingClipboard).toBe(false);
    expect(cancelled("paste")).toBe(false);

    guard.blockClipboard(true);
    guard.stop();
    expect(guard.blockingClipboard).toBe(false);
    expect(cancelled("copy")).toBe(false);
  });

  it("adds each listener once however often lockdown is applied", () => {
    const page = new EventTarget();
    const add = vi.spyOn(page, "addEventListener");
    const remove = vi.spyOn(page, "removeEventListener");
    const guard = makeGuard(page);
    guard.blockClipboard(true);
    guard.blockClipboard(true);
    expect(add).toHaveBeenCalledTimes(GUARDED_EVENTS.length);
    guard.blockClipboard(false);
    guard.blockClipboard(false);
    expect(remove).toHaveBeenCalledTimes(GUARDED_EVENTS.length);
    expect(remove.mock.calls).toEqual(add.mock.calls);
  });

  it("does nothing without a page", () => {
    const guard = makeGuard(null);
    guard.blockClipboard(true);
    expect(guard.blockingClipboard).toBe(false);
    expect(cancelled("paste")).toBe(false);
  });
});
