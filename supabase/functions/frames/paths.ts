// Path rules for confirming stills. Pure, so Vitest runs it under Node.
import { isStillPathFor, parseStillPath } from "../_shared/contracts/index.ts";

export interface StillEvent {
  id: string;
  exam_id: string;
  session_id: string;
  frame_count: number;
}

/**
 * Why each path cannot be a still of `event`, or an empty list. A path must be exactly
 * `stillPath(exam_id, session_id, event_id, index)` of this event (so inside this session's folder),
 * with an index below the event's frame_count.
 */
export function stillPathProblems(paths: readonly string[], event: StillEvent): string[] {
  const problems: string[] = [];
  for (const path of paths) {
    const parts = parseStillPath(path);
    if (parts === null || !isStillPathFor(path, event.exam_id, event.session_id)) {
      problems.push(`${path}: not a still path of this session`);
    } else if (parts.eventId !== event.id.toLowerCase()) {
      problems.push(`${path}: belongs to another event`);
    } else if (parts.index >= event.frame_count) {
      problems.push(`${path}: index ${parts.index} is not below frame_count ${event.frame_count}`);
    }
  }
  return problems;
}

/** The folder `storage.list` reads: `<exam_id>/<session_id>`. */
export function stillFolder(event: StillEvent): string {
  return `${event.exam_id.toLowerCase()}/${event.session_id.toLowerCase()}`;
}

/** Paths whose file name is not among `objectNames` (names inside stillFolder). */
export function notUploaded(paths: readonly string[], objectNames: ReadonlySet<string>): string[] {
  return paths.filter((path) => !objectNames.has(path.slice(path.lastIndexOf("/") + 1)));
}
