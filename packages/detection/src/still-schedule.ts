// When to take each requested still: at the crossing, then 1 s and 2 s later (THRESHOLDS.stills). Pure;
// the pipeline asks `due(at)` on every frame and captures that frame for each still that is due.
import type { StillRequest } from "./rules.ts";

export interface DueStill {
  eventId: string;
  /** 0, 1 or 2: the still's position, as in the frames/ path `<event>-<index>.jpg`. */
  index: number;
  dueAt: number;
}

export interface StillSchedule {
  request(request: StillRequest): void;
  /** Removes and returns every still due at `at`, oldest first. */
  due(at: number): DueStill[];
  /** Drops every pending still (the camera is gone). Returns what was dropped. */
  cancel(): DueStill[];
  readonly pending: number;
}

export function createStillSchedule(): StillSchedule {
  let queue: DueStill[] = [];
  return {
    request(request) {
      request.offsetsMs.forEach((offset, index) => {
        queue.push({ eventId: request.eventId, index, dueAt: request.at + offset });
      });
      queue.sort((a, b) => a.dueAt - b.dueAt);
    },
    due(at) {
      const ready = queue.filter((still) => still.dueAt <= at);
      if (ready.length > 0) queue = queue.filter((still) => still.dueAt > at);
      return ready;
    },
    cancel() {
      const dropped = queue;
      queue = [];
      return dropped;
    },
    get pending() {
      return queue.length;
    },
  };
}
