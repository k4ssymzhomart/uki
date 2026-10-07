// Saving and restoring the student's tabs ("One tab" in docs/phase-0-plan.md). At the start the Lock keeps
// one tab of a normal window (the exam tab) and closes every other tab of every window it can see: popup
// and app windows too, and incognito ones when the student allowed Üki Lock there. It saves the closed
// tabs, except incognito ones, and at release puts them back in their windows and order. Both plans are
// pure, so they are tested without a browser.
import { z } from "zod";
import { isAllowedUrl } from "./hosts.ts";

/** The parts of chrome.tabs.Tab the plans read. */
export interface TabSnapshot {
  id?: number;
  windowId: number;
  index: number;
  url?: string;
  pendingUrl?: string;
  pinned: boolean;
  active: boolean;
  incognito: boolean;
}

/** The parts of chrome.windows.Window the plans read. */
export interface WindowSnapshot {
  id?: number;
  focused: boolean;
  incognito: boolean;
  type?: string;
  state?: string;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  tabs?: TabSnapshot[];
}

export const SavedTab = z.object({
  url: z.string().min(1),
  pinned: z.boolean(),
  active: z.boolean(),
  index: z.number().int().nonnegative(),
});
export type SavedTab = z.infer<typeof SavedTab>;

const Bound = z.number().int().optional();

export const SavedWindow = z.object({
  window_id: z.number().int(),
  focused: z.boolean(),
  state: z.enum(["normal", "maximized"]),
  left: Bound,
  top: Bound,
  width: Bound,
  height: Bound,
  tabs: z.array(SavedTab),
});
export type SavedWindow = z.infer<typeof SavedWindow>;

export const KeptTab = z.object({
  tab_id: z.number().int(),
  window_id: z.number().int(),
  /** The tab's URL before the lock; exams in the app send it back there at release. */
  url: z.string().nullable(),
});
export type KeptTab = z.infer<typeof KeptTab>;

export interface LockPlan {
  keep: KeptTab | null;
  saved: SavedWindow[];
  close: number[];
}

export interface LockPlanOptions {
  mode: "app" | "browser";
  allowedHosts: readonly string[];
  /** The tab the student pressed Lock and start on, when known. */
  preferredTabId?: number;
  extensionId: string;
}

function tabUrl(tab: TabSnapshot): string | undefined {
  return tab.url || tab.pendingUrl || undefined;
}

/** Whether a URL can be opened again at release: not the Lock's own pages and not developer tools. */
export function isRestorableUrl(url: string | undefined, extensionId: string): url is string {
  if (!url) return false;
  if (url.startsWith(`chrome-extension://${extensionId}/`)) return false;
  return !url.startsWith("devtools://");
}

/** Windows the exam tab may be kept in: normal and not incognito. */
export function examWindows(windows: readonly WindowSnapshot[]): WindowSnapshot[] {
  return windows.filter((w) => w.id !== undefined && !w.incognito && (w.type ?? "normal") === "normal");
}

function chooseKeep(windows: readonly WindowSnapshot[], options: LockPlanOptions): TabSnapshot | null {
  const tabs = windows.flatMap((w) => (w.tabs ?? []).filter((t) => t.id !== undefined && !t.incognito));
  if (tabs.length === 0) return null;
  const preferred = tabs.find((t) => t.id === options.preferredTabId);
  if (preferred) return preferred;
  const focused = windows.find((w) => w.focused) ?? windows[0];
  const activeInFocused = focused?.tabs?.find((t) => t.active && t.id !== undefined);
  if (options.mode === "browser") {
    if (activeInFocused && isAllowedUrl(tabUrl(activeInFocused), options.allowedHosts))
      return activeInFocused;
    const onPortal = tabs.find((t) => isAllowedUrl(tabUrl(t), options.allowedHosts));
    if (onPortal) return onPortal;
  }
  return activeInFocused ?? tabs[0] ?? null;
}

/** What to keep, what to save and what to close when the lock starts. */
export function planLock(windows: readonly WindowSnapshot[], options: LockPlanOptions): LockPlan {
  const kept = chooseKeep(examWindows(windows), options);
  const saved: SavedWindow[] = [];
  const close: number[] = [];
  for (const window of windows) {
    if (window.id === undefined || window.type === "devtools") continue;
    const tabs = [...(window.tabs ?? [])].sort((a, b) => a.index - b.index);
    const savedTabs: SavedTab[] = [];
    for (const tab of tabs) {
      if (tab.id === undefined || tab.id === kept?.id) continue;
      close.push(tab.id);
      // Incognito tabs close without a trace: their URLs are never written to storage.
      if (window.incognito || tab.incognito) continue;
      const url = tabUrl(tab);
      if (isRestorableUrl(url, options.extensionId))
        savedTabs.push({ url, pinned: tab.pinned, active: tab.active, index: tab.index });
    }
    if (savedTabs.length === 0) continue;
    saved.push({
      window_id: window.id as number,
      focused: window.focused,
      state: window.state === "maximized" ? "maximized" : "normal",
      ...(window.state === "normal"
        ? { left: window.left, top: window.top, width: window.width, height: window.height }
        : {}),
      tabs: savedTabs,
    });
  }
  const keepUrl = kept ? tabUrl(kept) : undefined;
  return {
    keep: kept
      ? {
          tab_id: kept.id as number,
          window_id: kept.windowId,
          url: isRestorableUrl(keepUrl, options.extensionId) ? keepUrl : null,
        }
      : null,
    saved,
    close,
  };
}

export type RestoreStep =
  /** Into a window that still exists: create each tab at its saved index, in ascending order. */
  | { kind: "tabs"; windowId: number; tabs: SavedTab[] }
  /** A window that is gone: open a new one with the tabs in order. */
  | { kind: "window"; window: Omit<SavedWindow, "window_id" | "tabs">; tabs: SavedTab[] };

/** How to put the saved tabs back, given the ids of the windows that are still open. */
export function planRestore(
  saved: readonly SavedWindow[],
  openWindowIds: ReadonlySet<number>,
): RestoreStep[] {
  return saved
    .filter((window) => window.tabs.length > 0)
    .map((window): RestoreStep => {
      const tabs = [...window.tabs].sort((a, b) => a.index - b.index);
      if (openWindowIds.has(window.window_id)) return { kind: "tabs", windowId: window.window_id, tabs };
      const { window_id: _id, tabs: _tabs, ...rest } = window;
      return { kind: "window", window: rest, tabs };
    });
}

/** How many tabs a restore opens. */
export function countRestoredTabs(steps: readonly RestoreStep[]): number {
  return steps.reduce((sum, step) => sum + step.tabs.length, 0);
}

/** A new tab page cannot be opened by URL everywhere; an empty create opens one. */
export function createUrl(url: string): string | undefined {
  return /^(?:chrome|edge):\/\/newtab\/?$/.test(url) ? undefined : url;
}
