// The retention function's bookkeeping, without the network, so the functions-unit tests run it under
// Node: stills removed and frames deleted per workspace across a run's batches, and the audit row each
// workspace gets.

/** One still past its workspace's retention_days, as public.retention_due returns it. */
export interface DueStill {
  frame_id: string;
  workspace_id: string;
  storage_path: string;
  captured_at: string;
}

export interface WorkspaceRun {
  /** Frames rows deleted. */
  frames: number;
  /** The oldest and newest capture time among them. */
  oldest: string;
  newest: string;
}

/** Adds one batch's deleted stills to the run's per-workspace totals. */
export function tally(
  totals: Map<string, WorkspaceRun>,
  deleted: readonly DueStill[],
): Map<string, WorkspaceRun> {
  for (const still of deleted) {
    const current = totals.get(still.workspace_id);
    if (current === undefined) {
      totals.set(still.workspace_id, { frames: 1, oldest: still.captured_at, newest: still.captured_at });
      continue;
    }
    current.frames += 1;
    if (Date.parse(still.captured_at) < Date.parse(current.oldest)) current.oldest = still.captured_at;
    if (Date.parse(still.captured_at) > Date.parse(current.newest)) current.newest = still.captured_at;
  }
  return totals;
}

/** Splits `items` into chunks of at most `size`. */
export function chunked<T>(items: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new RangeError("size must be a positive integer");
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) chunks.push(items.slice(start, start + size));
  return chunks;
}

/**
 * The audit row of one workspace's share of a run (`retention.run`, written with the secret key, so no
 * actor): A.6 shows it as the system deleting N frames older than the workspace's retention_days.
 */
export function retentionAuditRow(workspaceId: string, run: WorkspaceRun, retentionDays: number | null) {
  return {
    workspace_id: workspaceId,
    actor_id: null,
    actor_kind: "service",
    action: "retention.run",
    object_type: "workspace",
    object_id: workspaceId,
    meta: {
      frames: run.frames,
      retention_days: retentionDays,
      oldest_captured_at: run.oldest,
      newest_captured_at: run.newest,
    },
  };
}
