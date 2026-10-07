import { useEffect, useState } from "react";
import { browser } from "wxt/browser";
import type { z } from "zod";
import { readStored, type StorageKey } from "./state.ts";

/**
 * One chrome.storage.local value, parsed with its schema and kept up to date. The service worker writes
 * `view` and `bar`; the extension pages and the content script only read them.
 */
export function useStored<T>(key: StorageKey, schema: z.ZodType<T>, fallback: T): T {
  const [value, setValue] = useState<T>(fallback);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the schema and fallback are fixed per key
  useEffect(() => {
    let alive = true;
    void browser.storage.local.get(key).then((items) => {
      if (alive) setValue(readStored(schema, items[key], fallback));
    });
    const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      const change = changes[key];
      if (area === "local" && change) setValue(readStored(schema, change.newValue, fallback));
    };
    browser.storage.onChanged.addListener(listener);
    return () => {
      alive = false;
      browser.storage.onChanged.removeListener(listener);
    };
  }, [key]);
  return value;
}
