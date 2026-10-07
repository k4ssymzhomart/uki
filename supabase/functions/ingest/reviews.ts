// The review the server stores for each event of an ingest batch: the contracts REVIEW map through
// serverReview, never the client's word. Pure, so Vitest runs it under Node.
import { type EventReview, type EventType, serverReview } from "../_shared/contracts/index.ts";

export interface ReviewedEvent {
  id: string;
  type: EventType;
}

export interface StoredState {
  /** lock.fullscreen_exit events of this session already in `events`. */
  fullscreenExits: number;
  /** Ids from this batch that are already in `events` (resends); they are not counted again. */
  storedIds: ReadonlySet<string>;
}

/**
 * One review per event, in batch order. A lock.fullscreen_exit counts as the session's next exit when
 * it is new (not stored, and not an earlier repeat inside this batch); the third and every later exit
 * is a flag. `ingest_batch` repeats the count under the session's row lock, so two concurrent batches
 * still flag the third exit.
 */
export function assignReviews(events: readonly ReviewedEvent[], stored: StoredState): EventReview[] {
  let exits = stored.fullscreenExits;
  const seen = new Set<string>();
  return events.map((event) => {
    const isNew = !stored.storedIds.has(event.id) && !seen.has(event.id);
    seen.add(event.id);
    if (event.type === "lock.fullscreen_exit" && isNew) exits += 1;
    return serverReview(event.type, { fullscreenExitCount: exits });
  });
}
