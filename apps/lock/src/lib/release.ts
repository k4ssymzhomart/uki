// When the Lock lets go (E.9, "Two exam modes" in docs/phase-0-plan.md): the first of the exam tab reaching
// exams.lms_done_path, lock.release from the app (submit, proctor end), the app reporting the exam done,
// or the Üki end time plus 2 minutes.
import { type LockExam, RELEASE_AFTER_END_MS, toMs } from "@uki/contracts";

export type ReleaseTrigger = "done_path" | "app" | "exam_done" | "deadline";

/** The end time plus 2 minutes, in ms since the epoch. */
export function releaseDeadlineMs(exam: Pick<LockExam, "ends_at">): number {
  return toMs(exam.ends_at) + RELEASE_AFTER_END_MS;
}

export function isPastDeadline(exam: Pick<LockExam, "ends_at">, nowMs: number): boolean {
  return nowMs >= releaseDeadlineMs(exam);
}

function trimSlash(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

/**
 * Whether a URL is the exam's finish page: same host as lms_url (the port too) and the path equal to
 * done_path or below it. done_path may also be a full URL.
 */
export function isDoneUrl(
  url: string | undefined | null,
  exam: Pick<LockExam, "lms_url" | "done_path">,
): boolean {
  if (!url || !exam.done_path) return false;
  let current: URL;
  let done: URL;
  try {
    current = new URL(url);
    done = new URL(exam.done_path, exam.lms_url ?? url);
  } catch {
    return false;
  }
  if (current.protocol !== "http:" && current.protocol !== "https:") return false;
  if (current.host.toLowerCase() !== done.host.toLowerCase()) return false;
  const path = trimSlash(current.pathname);
  const target = trimSlash(done.pathname);
  return path === target || path.startsWith(`${target}/`);
}

/** Whether an exam.state from the app means the locked exam is over. */
export function isExamDone(
  state: { phase: string; exam: { session_id: string } | null },
  lockedSessionId: string,
): boolean {
  return state.phase === "done" && (state.exam === null || state.exam.session_id === lockedSessionId);
}
