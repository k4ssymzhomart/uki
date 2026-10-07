// Records, inside the dashboard page, when each live-wall tile and each Live events row changes in the
// DOM. A MutationObserver stamps every change with the page's Date.now(), which is the same system
// clock the test (or the simulator) used for an event's `at`, so `change.t - at` is the latency from
// the event on the laptop to the proctor's screen. Polling only reads the log afterwards; it never
// adds to the measured time.
//
// The socket recorder splits that time on the same clock: it stamps each WebSocket frame the page
// receives, by the UUIDs in it, before Realtime's client parses it. `frame - at` is the server side
// (ingest, the database, the broadcast trigger and Realtime) and `tile - frame` is the dashboard.
// Database timestamps such as received_at are not used for this: they come from the Docker VM's
// clock, which drifts from the host's by up to seconds on a loaded laptop.
import type { Page } from "@playwright/test";

export interface TileChange {
  /** Page Date.now() when the tile's state or text changed. */
  t: number;
  sessionId: string;
  /** data-wall-state: on_screen, warning, flagged, paused, no_signal or done. */
  state: string | null;
  text: string;
}

export interface FeedRowSeen {
  /** Page Date.now() when the row first appeared. */
  t: number;
  /** The row's <time datetime>, the event's `at`. */
  at: string;
  title: string;
}

interface RecorderLog {
  tiles: TileChange[];
  feed: FeedRowSeen[];
}

/** Starts recording; call once the wall has rendered. Safe to call twice. */
export async function installWallRecorder(page: Page): Promise<void> {
  await page.evaluate(() => {
    const host = window as unknown as { __ukiWall?: RecorderLog };
    if (host.__ukiWall) return;
    const log: RecorderLog = { tiles: [], feed: [] };
    host.__ukiWall = log;
    const lastTile = new Map<string, string>();
    const seenFeed = new Set<string>();

    const tileKey = (tile: Element) => `${tile.getAttribute("data-wall-state")}|${tile.textContent ?? ""}`;
    const feedKey = (row: Element) => {
      const at = row.querySelector("time")?.getAttribute("datetime") ?? "";
      return { at, title: row.querySelector("p")?.textContent ?? "" };
    };
    const feedSection = () => document.querySelector("section li time")?.closest("section") ?? null;

    for (const tile of document.querySelectorAll("[data-session-id]")) {
      const id = tile.getAttribute("data-session-id");
      if (id) lastTile.set(id, tileKey(tile));
    }
    for (const row of document.querySelectorAll("section li")) {
      if (!row.querySelector("time")) continue;
      const { at, title } = feedKey(row);
      seenFeed.add(`${at}|${title}`);
    }

    const observer = new MutationObserver((mutations) => {
      const t = Date.now();
      const tiles = new Set<Element>();
      const rows = new Set<Element>();
      for (const mutation of mutations) {
        const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
        const tile = target?.closest("[data-session-id]");
        if (tile) tiles.add(tile);
        const row = target?.closest("li");
        if (row?.querySelector("time")) rows.add(row);
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.matches("[data-session-id]")) tiles.add(node);
          for (const inner of node.querySelectorAll("[data-session-id]")) tiles.add(inner);
          if (node.matches("li") && node.querySelector("time")) rows.add(node);
          for (const inner of node.querySelectorAll("li")) if (inner.querySelector("time")) rows.add(inner);
        }
      }
      for (const tile of tiles) {
        const id = tile.getAttribute("data-session-id");
        if (!id) continue;
        const key = tileKey(tile);
        if (lastTile.get(id) === key) continue;
        lastTile.set(id, key);
        log.tiles.push({
          t,
          sessionId: id,
          state: tile.getAttribute("data-wall-state"),
          text: tile.textContent ?? "",
        });
      }
      const section = feedSection();
      for (const row of rows) {
        if (section !== null && !section.contains(row)) continue;
        const { at, title } = feedKey(row);
        const key = `${at}|${title}`;
        if (at === "" || seenFeed.has(key)) continue;
        seenFeed.add(key);
        log.feed.push({ t, at, title });
      }
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["data-wall-state"],
    });
  });
}

/** How many tile changes the page has logged so far (pass it to waitForTileChange as `after`). */
export async function tileChangeCount(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __ukiWall?: RecorderLog }).__ukiWall?.tiles.length ?? 0);
}

export interface TileMatch {
  sessionId: string;
  /** Only changes logged after this many entries. */
  after: number;
  state?: string;
  textIncludes?: string;
}

/** The first logged change of a tile that matches, waiting up to `timeoutMs`. */
export async function waitForTileChange(
  page: Page,
  match: TileMatch,
  timeoutMs = 10_000,
): Promise<TileChange> {
  const handle = await page.waitForFunction(
    (m: TileMatch) => {
      const log = (window as unknown as { __ukiWall?: RecorderLog }).__ukiWall;
      if (!log) return null;
      for (const change of log.tiles.slice(m.after)) {
        if (change.sessionId !== m.sessionId) continue;
        if (m.state !== undefined && change.state !== m.state) continue;
        if (m.textIncludes !== undefined && !change.text.includes(m.textIncludes)) continue;
        return change;
      }
      return null;
    },
    match,
    { timeout: timeoutMs, polling: 50 },
  );
  return (await handle.jsonValue()) as TileChange;
}

export async function readWallLog(page: Page): Promise<RecorderLog> {
  return page.evaluate(
    () => (window as unknown as { __ukiWall?: RecorderLog }).__ukiWall ?? { tiles: [], feed: [] },
  );
}

/**
 * Call before the page loads (an init script): wraps the page's WebSocket so every received frame is
 * stamped with Date.now() under each UUID it carries, first arrival only.
 */
export async function installSocketRecorder(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const host = window as unknown as { __ukiFrames?: Record<string, number> };
    if (host.__ukiFrames) return;
    const seen: Record<string, number> = {};
    host.__ukiFrames = seen;
    const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
    const note = (text: string, t: number) => {
      for (const id of text.match(uuid) ?? []) if (!(id in seen)) seen[id] = t;
    };
    const Native = window.WebSocket;
    class RecordingWebSocket extends Native {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        // Registered before Realtime sets onmessage, so it runs first.
        this.addEventListener("message", (event: MessageEvent) => {
          const t = Date.now();
          const data: unknown = event.data;
          if (typeof data === "string") note(data, t);
          else if (data instanceof ArrayBuffer) note(new TextDecoder().decode(data), t);
          else if (data instanceof Blob) void data.text().then((text) => note(text, t));
        });
      }
    }
    window.WebSocket = RecordingWebSocket;
  });
}

/** Page clock times at which frames carrying these ids first arrived (missing ids are left out). */
export async function frameTimes(page: Page, ids: readonly string[]): Promise<Record<string, number>> {
  return page.evaluate((wanted: readonly string[]) => {
    const seen = (window as unknown as { __ukiFrames?: Record<string, number> }).__ukiFrames ?? {};
    const found: Record<string, number> = {};
    for (const id of wanted) {
      const t = seen[id];
      if (t !== undefined) found[id] = t;
    }
    return found;
  }, ids);
}
