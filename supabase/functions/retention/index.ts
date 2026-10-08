// POST /functions/v1/retention: the nightly cleanup (Phase 1 plan: Decisions "Retention"; Edge Functions;
// WP 1.12). retention_nightly (pg_cron, 22:00 UTC, 03:00 in Almaty) calls it through pg_net with the
// secret key from Vault (`auth: "secret"`, verify_jwt = false in config.toml).
//
// It deletes the stills older than each workspace's settings.retention_days (90 by default), oldest
// first: public.retention_due picks RETENTION_BATCH of them, the function removes their objects from the
// frames bucket, then their frames rows, and goes on until none is due (at most RETENTION_MAX_BATCHES
// batches a run; the next night carries on). Storage goes first, so a failure in between leaves rows
// whose objects are already gone, which the next run removes again harmlessly. Events stay: the plan
// deletes them only on a data request. Each workspace that lost stills gets one `retention.run` audit
// row for the run.
import { z } from "zod";
import {
  FRAMES_BUCKET,
  RETENTION_BATCH,
  RETENTION_MAX_BATCHES,
  RetentionInput,
  RetentionOutput,
  Timestamp,
  Uuid,
  WorkspaceSettings,
} from "../_shared/contracts/index.ts";
import { ApiFailure, fromDatabaseError } from "../_shared/errors.ts";
import { type ServiceApiContext, serveApi } from "../_shared/http.ts";
import { retryOnGateway } from "../_shared/retry.ts";
import { parseRow } from "../_shared/rows.ts";
import { chunked, type DueStill, retentionAuditRow, tally, type WorkspaceRun } from "./runs.ts";

/** Objects per Storage remove call and ids per `in.(…)` filter. */
const CHUNK = 100;

const DueRow = z.object({
  frame_id: Uuid,
  workspace_id: Uuid,
  storage_path: z.string().min(1),
  captured_at: Timestamp,
});

async function removeObjects(ctx: ServiceApiContext, paths: readonly string[]): Promise<number> {
  let removed = 0;
  for (const chunk of chunked(paths, CHUNK)) {
    const result = await retryOnGateway(() => ctx.supabaseAdmin.storage.from(FRAMES_BUCKET).remove(chunk));
    if (result.error) throw new ApiFailure("internal", `remove stills: ${result.error.message}`);
    removed += result.data?.length ?? 0;
  }
  return removed;
}

async function deleteRows(ctx: ServiceApiContext, ids: readonly string[]): Promise<number> {
  let deleted = 0;
  for (const chunk of chunked(ids, CHUNK)) {
    const result = await retryOnGateway(() =>
      ctx.supabaseAdmin.from("frames").delete({ count: "exact" }).in("id", chunk),
    );
    if (result.error) throw fromDatabaseError(result.error, "frames");
    deleted += result.count ?? 0;
  }
  return deleted;
}

async function retentionDays(ctx: ServiceApiContext, ids: readonly string[]): Promise<Map<string, number>> {
  const days = new Map<string, number>();
  if (ids.length === 0) return days;
  const read = await retryOnGateway(() =>
    ctx.supabaseAdmin
      .from("workspaces")
      .select("id, settings")
      .in("id", [...ids]),
  );
  if (read.error) throw fromDatabaseError(read.error, "workspaces");
  for (const row of read.data ?? []) {
    const parsed = z.object({ id: Uuid, settings: WorkspaceSettings }).safeParse(row);
    if (parsed.success) days.set(parsed.data.id, parsed.data.settings.retention_days);
  }
  return days;
}

async function retention(_input: RetentionInput, ctx: ServiceApiContext): Promise<RetentionOutput> {
  const runs = new Map<string, WorkspaceRun>();
  let stills = 0;
  let frames = 0;
  for (let batch = 0; batch < RETENTION_MAX_BATCHES; batch += 1) {
    const picked = await retryOnGateway(() =>
      ctx.supabaseAdmin.rpc("retention_due", { p_limit: RETENTION_BATCH }),
    );
    if (picked.error) throw fromDatabaseError(picked.error, "retention_due");
    const due: DueStill[] = parseRow(DueRow.array(), picked.data ?? [], "retention_due");
    if (due.length === 0) break;
    stills += await removeObjects(
      ctx,
      due.map((still) => still.storage_path),
    );
    const deleted = await deleteRows(
      ctx,
      due.map((still) => still.frame_id),
    );
    frames += deleted;
    tally(runs, due);
    // Nothing deleted means the rows are held elsewhere; stop rather than pick the same batch again.
    if (deleted === 0 || due.length < RETENTION_BATCH) break;
  }

  if (runs.size > 0) {
    const days = await retentionDays(ctx, [...runs.keys()]);
    const rows = [...runs].map(([workspaceId, run]) =>
      retentionAuditRow(workspaceId, run, days.get(workspaceId) ?? null),
    );
    // Not retried: an insert is not idempotent.
    const audit = await ctx.supabaseAdmin.from("audit_log").insert(rows);
    if (audit.error) throw fromDatabaseError(audit.error, "audit_log");
  }
  return { stills, frames, workspaces: runs.size };
}

Deno.serve(
  serveApi({
    name: "retention",
    auth: "secret",
    input: RetentionInput,
    output: RetentionOutput,
    handle: retention,
  }),
);
