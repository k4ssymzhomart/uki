// POST /functions/v1/frames: confirms flagged stills the app uploaded through ingest's signed URLs
// ("Endpoints" in docs/phase-0-plan.md).
//
// The session owner sends the event id and 1 to 3 paths. Each path must be that event's still path
// inside `frames/{exam_id}/{session_id}/`, below the event's frame_count, and the object must exist.
// `confirm_frames` then inserts the rows (idempotent per path) and the frames_broadcast trigger sends
// `frame` to `exam:{exam_id}`, so this function does not broadcast itself.
import { FRAMES_BUCKET, FramesRequest, FramesResponse } from "../_shared/contracts/index.ts";
import { ApiFailure, fromDatabaseError } from "../_shared/errors.ts";
import { type ApiContext, serveApi } from "../_shared/http.ts";
import { requireSessionOwner } from "../_shared/owner.ts";
import { retryOnGateway } from "../_shared/retry.ts";
import { EventRow, parseRow, UuidList } from "../_shared/rows.ts";
import { notUploaded, stillFolder, stillPathProblems } from "./paths.ts";

async function frames(request: FramesRequest, ctx: ApiContext): Promise<FramesResponse> {
  const found = await retryOnGateway(() =>
    ctx.supabaseAdmin
      .from("events")
      .select("id, session_id, exam_id, review, frame_count")
      .eq("id", request.event_id)
      .maybeSingle(),
  );
  if (found.error) throw fromDatabaseError(found.error, "events");
  if (found.data === null) throw new ApiFailure("not_found", "no such event");
  const event = parseRow(EventRow, found.data, "events");
  await requireSessionOwner(ctx, event.session_id);

  const problems = stillPathProblems(request.paths, event);
  if (problems.length > 0) throw new ApiFailure("bad_request", problems.join("; "));

  const listed = await retryOnGateway(() =>
    ctx.supabaseAdmin.storage.from(FRAMES_BUCKET).list(stillFolder(event), { search: event.id, limit: 100 }),
  );
  if (listed.error) throw new ApiFailure("internal", `storage list: ${listed.error.message}`);
  const names = new Set((listed.data ?? []).map((object: { name: string }) => object.name));
  const missing = notUploaded(request.paths, names);
  if (missing.length > 0) throw new ApiFailure("not_found", `not uploaded: ${missing.join(", ")}`);

  // Idempotent per path, so a repeat after a gateway failure returns the same ids.
  const { data, error } = await retryOnGateway(() =>
    ctx.supabaseAdmin.rpc("confirm_frames", { p_event_id: event.id, p_paths: request.paths }),
  );
  if (error) throw fromDatabaseError(error, "confirm_frames");
  return { frame_ids: parseRow(UuidList, data, "confirm_frames") };
}

Deno.serve(serveApi({ name: "frames", input: FramesRequest, output: FramesResponse, handle: frames }));
