// POST /functions/v1/data-request: the exam office acts on a student's data request (A.5a, A.5b) (Phase 1
// plan: Decisions "Data requests"; Edge Functions; WP 1.12).
//
//   delete  removes the student's stills from Storage (every object in their sessions' still folders,
//           confirmed or not), then, in one transaction, their frames and events, their identity score
//           and their device record (privacy_delete_student). Answers, receipts, the sessions, review
//           decisions and integrity reports stay: they are the exam result.
//   copy    writes one JSON file to the private exports bucket (privacy_export's package, with each
//           still's image) and signs a 7-day link to it.
//   reply   answers the request with a reason instead (privacy_reply).
//
// Only the exam office (or an admin) of the request's workspace may call: the request must be visible to
// the caller under row-level security, which shows data requests to nobody else, and the database
// functions, which run with the secret key, check the caller again as the actor. Each action writes one
// audit row in the same transaction as its change: data_request.delete with the counts,
// data_request.copy with the file's size, data_request.reply with the reason's length.

import { z } from "zod";
import { mapLimit } from "../_shared/async.ts";
import {
  DataCopyPackage,
  DataRequest,
  DataRequestActionInput,
  DataRequestActionOutput,
  type DataRequestActionReply,
  DataRequestDeletePlan,
  DataRequestDeleteResult,
  EXPORT_LINK_TTL_S,
  EXPORTS_BUCKET,
  exportPath,
  FRAMES_BUCKET,
  Uuid,
} from "../_shared/contracts/index.ts";
import { ApiFailure, fromDatabaseError } from "../_shared/errors.ts";
import { type ApiContext, serveApi } from "../_shared/http.ts";
import { publicOrigin, toPublicUrl } from "../_shared/public-url.ts";
import { retryOnGateway } from "../_shared/retry.ts";
import { parseRow } from "../_shared/rows.ts";
import { buildCopyFile, objectsToRemove } from "./copy-file.ts";

/** Storage calls in flight at once. */
const STORAGE_CONCURRENCY = 4;
/** Objects per Storage remove call. */
const REMOVE_CHUNK = 100;
/** Objects per Storage list page. */
const LIST_PAGE = 1000;

const VisibleRequest = z.object({ id: Uuid, workspace_id: Uuid });
type VisibleRequest = z.infer<typeof VisibleRequest>;

/**
 * The request as the caller sees it under RLS: 404 when it does not exist, 403 when it exists but the
 * caller is not the exam office of its workspace (a proctor, another workspace's office, a student).
 */
async function visibleRequest(ctx: ApiContext, requestId: string): Promise<VisibleRequest> {
  if (ctx.isAnonymous) throw new ApiFailure("forbidden", "students cannot act on data requests");
  const visible = await retryOnGateway(() =>
    ctx.supabase.from("data_requests").select("id, workspace_id").eq("id", requestId).maybeSingle(),
  );
  if (visible.error) throw fromDatabaseError(visible.error, "data_requests");
  if (visible.data !== null) return parseRow(VisibleRequest, visible.data, "data_requests");
  const exists = await retryOnGateway(() =>
    ctx.supabaseAdmin.from("data_requests").select("id").eq("id", requestId).maybeSingle(),
  );
  if (exists.error) throw fromDatabaseError(exists.error, "data_requests");
  throw exists.data === null
    ? new ApiFailure("not_found", "no such request")
    : new ApiFailure("forbidden", "only the exam office of the workspace acts on its data requests");
}

/** Every object inside one still folder (`<exam_id>/<session_id>`), page by page. */
async function folderObjects(ctx: ApiContext, folder: string): Promise<string[]> {
  const bucket = ctx.supabaseAdmin.storage.from(FRAMES_BUCKET);
  const paths: string[] = [];
  for (let offset = 0; ; offset += LIST_PAGE) {
    const listed = await retryOnGateway(() => bucket.list(folder, { limit: LIST_PAGE, offset }));
    if (listed.error) throw new ApiFailure("internal", `list ${folder}: ${listed.error.message}`);
    const page = listed.data ?? [];
    // Sub-folders come back with a null id; stills are files directly in the folder.
    for (const object of page) if (object.id !== null) paths.push(`${folder}/${object.name}`);
    if (page.length < LIST_PAGE) return paths;
  }
}

async function remove(ctx: ApiContext, paths: readonly string[]): Promise<number> {
  const chunks: string[][] = [];
  for (let start = 0; start < paths.length; start += REMOVE_CHUNK) {
    chunks.push(paths.slice(start, start + REMOVE_CHUNK));
  }
  const removed = await mapLimit(chunks, STORAGE_CONCURRENCY, async (chunk) => {
    const result = await retryOnGateway(() => ctx.supabaseAdmin.storage.from(FRAMES_BUCKET).remove(chunk));
    if (result.error) throw new ApiFailure("internal", `remove stills: ${result.error.message}`);
    return result.data?.length ?? 0;
  });
  return removed.reduce((sum, count) => sum + count, 0);
}

async function deleteData(request: VisibleRequest, ctx: ApiContext): Promise<DataRequestActionReply> {
  // The checks (kind, status, the actor, not during a live exam) run before anything is removed.
  const planned = await ctx.supabaseAdmin.rpc("privacy_delete_plan", {
    p_request_id: request.id,
    p_actor: ctx.userId,
  });
  if (planned.error) throw fromDatabaseError(planned.error, "privacy_delete_plan");
  const plan = parseRow(DataRequestDeletePlan, planned.data, "privacy_delete_plan");

  const listed = await mapLimit(plan.folders, STORAGE_CONCURRENCY, (folder) => folderObjects(ctx, folder));
  const stills = await ctx.timing.measure("storage", () => remove(ctx, objectsToRemove(plan, listed.flat())));

  // Not retried: it deletes and writes the audit row in one transaction; a repeat would answer conflict.
  const deleted = await ctx.supabaseAdmin.rpc("privacy_delete_student", {
    p_request_id: request.id,
    p_actor: ctx.userId,
    p_stills: stills,
  });
  if (deleted.error) throw fromDatabaseError(deleted.error, "privacy_delete_student");
  const result = parseRow(DataRequestDeleteResult, deleted.data, "privacy_delete_student");
  return {
    request: result.request,
    link: null,
    deleted: {
      stills,
      frames: result.frames,
      events: result.events,
      identity_scores: result.identity_scores,
      devices: result.devices,
    },
  };
}

async function copyData(request: VisibleRequest, ctx: ApiContext): Promise<DataRequestActionReply> {
  const exported = await ctx.supabaseAdmin.rpc("privacy_export", {
    p_request_id: request.id,
    p_actor: ctx.userId,
  });
  if (exported.error) throw fromDatabaseError(exported.error, "privacy_export");
  const pkg = parseRow(DataCopyPackage, exported.data, "privacy_export");

  const images = new Map<string, Uint8Array>();
  const paths = pkg.flags.flatMap((flag) => flag.frames.map((frame) => frame.storage_path));
  await mapLimit(paths, STORAGE_CONCURRENCY, async (path) => {
    const still = await retryOnGateway(() => ctx.supabaseAdmin.storage.from(FRAMES_BUCKET).download(path));
    // A still retention removed meanwhile stays listed without its image.
    if (still.error === null && still.data) images.set(path, new Uint8Array(await still.data.arrayBuffer()));
  });
  const file = buildCopyFile(pkg, images);

  const path = exportPath(request.workspace_id, request.id);
  const exports = ctx.supabaseAdmin.storage.from(EXPORTS_BUCKET);
  const uploaded = await retryOnGateway(() =>
    exports.upload(path, new Blob([file.json], { type: "application/json" }), {
      contentType: "application/json",
      upsert: true,
    }),
  );
  if (uploaded.error) throw new ApiFailure("internal", `upload the copy: ${uploaded.error.message}`);
  const signed = await retryOnGateway(() =>
    exports.createSignedUrl(path, EXPORT_LINK_TTL_S, {
      download: `uki-data-${pkg.student.student_number}.json`,
    }),
  );
  if (signed.error || !signed.data?.signedUrl) {
    throw new ApiFailure("internal", `sign the copy: ${signed.error?.message ?? "no URL"}`);
  }
  const expiresAt = new Date(Date.now() + EXPORT_LINK_TTL_S * 1000).toISOString();

  const done = await ctx.supabaseAdmin.rpc("privacy_export_done", {
    p_request_id: request.id,
    p_actor: ctx.userId,
    p_path: path,
    p_bytes: file.bytes,
    p_expires_at: expiresAt,
  });
  if (done.error) throw fromDatabaseError(done.error, "privacy_export_done");
  const origin = publicOrigin(ctx.supabaseUrl, ctx.request.headers);
  return {
    request: parseRow(DataRequest, done.data, "privacy_export_done"),
    link: { url: toPublicUrl(signed.data.signedUrl, ctx.supabaseUrl, origin), expires_at: expiresAt },
    deleted: null,
  };
}

async function reply(
  request: VisibleRequest,
  text: string,
  ctx: ApiContext,
): Promise<DataRequestActionReply> {
  const replied = await ctx.supabaseAdmin.rpc("privacy_reply", {
    p_request_id: request.id,
    p_actor: ctx.userId,
    p_reply: text,
  });
  if (replied.error) throw fromDatabaseError(replied.error, "privacy_reply");
  return { request: parseRow(DataRequest, replied.data, "privacy_reply"), link: null, deleted: null };
}

async function dataRequest(input: DataRequestActionInput, ctx: ApiContext): Promise<DataRequestActionReply> {
  const request = await visibleRequest(ctx, input.request_id);
  switch (input.action) {
    case "delete":
      return await deleteData(request, ctx);
    case "copy":
      return await copyData(request, ctx);
    case "reply":
      return await reply(request, input.reply, ctx);
  }
}

Deno.serve(
  serveApi({
    name: "data-request",
    input: DataRequestActionInput,
    output: DataRequestActionOutput,
    handle: dataRequest,
  }),
);
