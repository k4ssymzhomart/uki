import { describe, expect, it } from "vitest";
import {
  countRestoredTabs,
  createUrl,
  isRestorableUrl,
  planLock,
  planRestore,
  type WindowSnapshot,
} from "./tab-plan.ts";

const ID = "abcdefghijklmnopabcdefghijklmnop";

function tab(
  id: number,
  windowId: number,
  index: number,
  url: string,
  extra: Partial<{ active: boolean; pinned: boolean }> = {},
) {
  return { id, windowId, index, url, pinned: false, active: false, incognito: false, ...extra };
}

const windows: WindowSnapshot[] = [
  {
    id: 1,
    focused: true,
    incognito: false,
    type: "normal",
    state: "maximized",
    tabs: [
      tab(11, 1, 0, "https://mail.example/inbox", { pinned: true }),
      tab(12, 1, 1, "http://localhost:5180/physics-1/quiz-3", { active: true }),
      tab(13, 1, 2, "https://notes.example/lecture-7"),
    ],
  },
  {
    id: 2,
    focused: false,
    incognito: false,
    type: "normal",
    state: "normal",
    left: 10,
    top: 20,
    width: 800,
    height: 600,
    tabs: [tab(21, 2, 0, "https://chat.example/group", { active: true }), tab(22, 2, 1, "chrome://newtab/")],
  },
  {
    id: 3,
    focused: false,
    incognito: true,
    type: "normal",
    tabs: [{ ...tab(31, 3, 0, "https://private.example"), incognito: true }],
  },
  { id: 4, focused: false, incognito: false, type: "popup", tabs: [tab(41, 4, 0, "https://popup.example")] },
];

describe("planLock", () => {
  it("browser exams keep the portal tab, save the rest in order and close them", () => {
    const plan = planLock(windows, { mode: "browser", allowedHosts: ["localhost:5180"], extensionId: ID });
    expect(plan.keep).toEqual({ tab_id: 12, window_id: 1, url: "http://localhost:5180/physics-1/quiz-3" });
    expect(plan.close).toEqual([11, 13, 21, 22]);
    expect(plan.saved).toEqual([
      {
        window_id: 1,
        focused: true,
        state: "maximized",
        tabs: [
          { url: "https://mail.example/inbox", pinned: true, active: false, index: 0 },
          { url: "https://notes.example/lecture-7", pinned: false, active: false, index: 2 },
        ],
      },
      {
        window_id: 2,
        focused: false,
        state: "normal",
        left: 10,
        top: 20,
        width: 800,
        height: 600,
        tabs: [
          { url: "https://chat.example/group", pinned: false, active: true, index: 0 },
          { url: "chrome://newtab/", pinned: false, active: false, index: 1 },
        ],
      },
    ]);
  });

  it("finds the portal in another tab when the active one is not on it", () => {
    const moved = windows.map((w) =>
      w.id === 1 ? { ...w, tabs: w.tabs?.map((t) => ({ ...t, active: t.id === 13 })) } : w,
    );
    expect(
      planLock(moved, { mode: "browser", allowedHosts: ["localhost"], extensionId: ID }).keep?.tab_id,
    ).toBe(12);
  });

  it("prefers the tab the student pressed Lock and start on", () => {
    expect(
      planLock(windows, { mode: "browser", allowedHosts: ["localhost"], preferredTabId: 21, extensionId: ID })
        .keep?.tab_id,
    ).toBe(21);
  });

  it("exams in the app keep the active tab of the focused window and remember its URL", () => {
    const plan = planLock(windows, { mode: "app", allowedHosts: [], extensionId: ID });
    expect(plan.keep).toEqual({ tab_id: 12, window_id: 1, url: "http://localhost:5180/physics-1/quiz-3" });
    expect(plan.close).toHaveLength(4);
  });

  it("does not save the Lock's own pages or developer tools", () => {
    const own = [
      {
        id: 5,
        focused: true,
        incognito: false,
        tabs: [
          tab(51, 5, 0, `chrome-extension://${ID}/blocked.html?host=x.org`, { active: true }),
          tab(52, 5, 1, `chrome-extension://${ID}/blocked.html`),
          tab(53, 5, 2, "devtools://devtools/bundled/inspector.html"),
        ],
      },
    ];
    const plan = planLock(own, { mode: "app", allowedHosts: [], extensionId: ID });
    expect(plan.keep).toEqual({ tab_id: 51, window_id: 5, url: null });
    expect(plan.close).toEqual([52, 53]);
    expect(plan.saved).toEqual([]);
    expect(isRestorableUrl("https://a.example", ID)).toBe(true);
    expect(isRestorableUrl(undefined, ID)).toBe(false);
  });

  it("copes with a browser without windows", () => {
    expect(planLock([], { mode: "app", allowedHosts: [], extensionId: ID })).toEqual({
      keep: null,
      saved: [],
      close: [],
    });
  });
});

describe("planRestore", () => {
  const plan = planLock(windows, { mode: "browser", allowedHosts: ["localhost"], extensionId: ID });

  it("puts tabs back into windows that are still open, at their index, and reopens closed windows", () => {
    const steps = planRestore(plan.saved, new Set([1]));
    expect(steps).toEqual([
      {
        kind: "tabs",
        windowId: 1,
        tabs: [
          { url: "https://mail.example/inbox", pinned: true, active: false, index: 0 },
          { url: "https://notes.example/lecture-7", pinned: false, active: false, index: 2 },
        ],
      },
      {
        kind: "window",
        window: { focused: false, state: "normal", left: 10, top: 20, width: 800, height: 600 },
        tabs: [
          { url: "https://chat.example/group", pinned: false, active: true, index: 0 },
          { url: "chrome://newtab/", pinned: false, active: false, index: 1 },
        ],
      },
    ]);
    expect(countRestoredTabs(steps)).toBe(4);
  });

  it("restores the original order around the kept tab when indexes are created in ascending order", () => {
    // The window holds only the kept tab (originally index 1); create at 0 then 2.
    const order = ["kept"];
    const [first] = planRestore(plan.saved, new Set([1]));
    if (first?.kind !== "tabs") throw new Error("expected tabs");
    for (const t of first.tabs) order.splice(Math.min(t.index, order.length), 0, t.url);
    expect(order).toEqual(["https://mail.example/inbox", "kept", "https://notes.example/lecture-7"]);
  });

  it("opens a new tab page without a URL", () => {
    expect(createUrl("chrome://newtab/")).toBeUndefined();
    expect(createUrl("edge://newtab/")).toBeUndefined();
    expect(createUrl("https://a.example/")).toBe("https://a.example/");
  });
});
