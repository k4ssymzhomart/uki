// What the test reads inside the student window: the frame on screen (every screen root carries
// data-frame), the moment a frame appears (for command latency), and the outbox in IndexedDB.
import type { Page } from "@playwright/test";

export const OUTBOX_DB = "uki-outbox";

export function frameLocator(page: Page, frame: string) {
  return page.locator(`[data-frame="${frame}"]`);
}

/** The frame on screen now, or null between screens. */
export async function currentFrame(page: Page): Promise<string | null> {
  return page
    .locator("[data-frame]")
    .first()
    .getAttribute("data-frame", { timeout: 1000 })
    .catch(() => null);
}

export async function waitForFrame(page: Page, frame: string, timeout = 30_000): Promise<void> {
  await frameLocator(page, frame).waitFor({ state: "visible", timeout });
}

/**
 * Starts watching for a frame before the action that should bring it, and resolves with the laptop
 * time (Date.now in the renderer, the same clock as the test) when it appeared.
 */
export async function armFrameWatch(page: Page, frame: string): Promise<() => Promise<number>> {
  const key = `uki-watch-${frame}-${Date.now()}`;
  await page.evaluate(
    ({ key, frame }) => {
      const store = window as unknown as Record<string, Promise<number>>;
      store[key] = new Promise<number>((resolve) => {
        const seen = () => document.querySelector(`[data-frame="${frame}"]`) !== null;
        if (seen()) {
          resolve(Date.now());
          return;
        }
        const observer = new MutationObserver(() => {
          if (!seen()) return;
          observer.disconnect();
          resolve(Date.now());
        });
        observer.observe(document.body, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ["data-frame"],
        });
      });
    },
    { key, frame },
  );
  return () =>
    page.evaluate(
      (key) => (window as unknown as Record<string, Promise<number>>)[key] ?? Promise.reject(),
      key,
    );
}

export interface OutboxAnswer {
  sessionId: string;
  questionId: string;
  choiceId: string;
  savedAt: string;
  syncedAt: number | null;
}

export interface OutboxEvent {
  id: string;
  sessionId: string;
  seq: number;
  flag: boolean;
  storedAt: number | null;
  envelope: { type: string; data: Record<string, unknown> };
}

/** Every row of one outbox table (raw IndexedDB; Dexie's database of the same name). */
export async function outboxRows<T>(
  page: Page,
  table: "answers" | "events" | "stills" | "commands",
): Promise<T[]> {
  return page.evaluate(
    ({ name, table }) =>
      new Promise<T[]>((resolve, reject) => {
        const open = indexedDB.open(name);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains(table)) {
            db.close();
            resolve([]);
            return;
          }
          const request = db.transaction(table, "readonly").objectStore(table).getAll();
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const rows = (request.result as Array<Record<string, unknown>>).map((row) => {
              // Still bytes are large and not needed here.
              const { bytes: _bytes, ...rest } = row;
              return rest;
            });
            db.close();
            resolve(rows as T[]);
          };
        };
      }),
    { name: OUTBOX_DB, table },
  );
}

/** Sets the synthetic camera's scene (integration/synthetic-camera.ts). */
export async function setScene(
  page: Page,
  scene: {
    subject?: "present" | "phone" | "absent";
    card?: "auto" | "shown" | "hidden";
    /** The number printed on the card; null prints the joined student's. */
    cardNumber?: string | null;
  },
): Promise<void> {
  await page.waitForFunction(() => "ukiSyntheticCamera" in window, undefined, { timeout: 30_000 });
  await page.evaluate((patch) => {
    (window as unknown as { ukiSyntheticCamera: { set(patch: unknown): unknown } }).ukiSyntheticCamera.set(
      patch,
    );
  }, scene);
}

export interface DetectionNumbers {
  fps: number | null;
  faces: number | null;
  phoneScore: number | null;
  phoneMs: number | null;
  phoneChecksPerS: number | null;
  degraded: boolean;
  paused: boolean;
}

/** The detection worker's numbers every 500 ms for `ms` (window.ukiDetectionDebug, synthetic builds). */
export async function sampleDetection(page: Page, ms: number): Promise<DetectionNumbers[]> {
  const samples: DetectionNumbers[] = [];
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const sample = await page.evaluate(() => {
      const read = (window as unknown as { ukiDetectionDebug?: () => unknown }).ukiDetectionDebug;
      const debug = (read?.() ?? null) as {
        fps?: number;
        faces?: number;
        phoneScore?: number | null;
        phoneMs?: number | null;
        phoneChecksPerS?: number | null;
        degraded?: boolean;
        rules?: { paused?: unknown } | null;
      } | null;
      return debug
        ? {
            fps: debug.fps ?? null,
            faces: debug.faces ?? null,
            phoneScore: debug.phoneScore ?? null,
            phoneMs: debug.phoneMs ?? null,
            phoneChecksPerS: debug.phoneChecksPerS ?? null,
            degraded: debug.degraded ?? false,
            paused: Boolean(debug.rules?.paused),
          }
        : null;
    });
    if (sample) samples.push(sample);
    await page.waitForTimeout(500);
  }
  return samples;
}
