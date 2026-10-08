// What demo-live-purge deletes, as pure functions so the functions-unit tests run them under Node:
// demo_live_orphans' rows, reduced to well-formed still paths (<exam>/<session>/<event>-<n>.jpg, the only
// shape `ingest` signs), in batches for Storage's remove.
import { z } from "zod";
import { parseStillPath } from "../_shared/contracts/index.ts";

/** What `demo_live_orphans(p_limit)` returns. */
export const OrphanRows = z.array(z.object({ storage_path: z.string().min(1) }));
export type OrphanRows = z.infer<typeof OrphanRows>;

/** Paths per Storage remove call. */
export const REMOVE_BATCH = 100;

/**
 * The paths to remove: only exact still paths, each once, in the order listed. Anything else under the
 * bucket is left alone, even if the database lists it.
 */
export function stillsToRemove(rows: OrphanRows): string[] {
  const seen = new Set<string>();
  for (const { storage_path } of rows) {
    if (parseStillPath(storage_path) !== null) seen.add(storage_path);
  }
  return [...seen];
}

/** `items` in slices of at most `size`. */
export function batches<T>(items: readonly T[], size: number = REMOVE_BATCH): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new RangeError(`batch size ${size}`);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
