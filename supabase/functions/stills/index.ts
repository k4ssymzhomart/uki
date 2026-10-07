// POST /functions/v1/stills: 5-minute URLs for one flag event's stills, for the timeline drawer (2.5)
// ("Endpoints" and "Row-level security" in docs/phase-0-plan.md).
//
// The caller must see the event under RLS, which only the exam's proctors and its exam office do. The
// URLs are signed with the secret key, and every still gets one audit_log row (`still.viewed`) before
// any URL leaves the function.
import {
  FRAMES_BUCKET,
  STILL_VIEW_URL_TTL_S,
  StillsRequest,
  StillsResponse,
} from "../_shared/contracts/index.ts";
import { ApiFailure, fromDatabaseError } from "../_shared/errors.ts";
import { type ApiContext, serveApi } from "../_shared/http.ts";
import { publicOrigin, toPublicUrl } from "../_shared/public-url.ts";
import { retryOnGateway } from "../_shared/retry.ts";
import { EventRow, ExamWorkspaceRow, FrameRow, parseRow } from "../_shared/rows.ts";

/** The event under the caller's RLS: 404 when it does not exist, 403 when it exists but is not theirs. */
async function visibleEvent(ctx: ApiContext, eventId: string): Promise<EventRow> {
  const columns = "id, session_id, exam_id, review, frame_count";
  const visible = await retryOnGateway(() =>
    ctx.supabase.from("events").select(columns).eq("id", eventId).maybeSingle(),
  );
  if (visible.error) throw fromDatabaseError(visible.error, "events");
  if (visible.data !== null) return parseRow(EventRow, visible.data, "events");

  const exists = await retryOnGateway(() =>
    ctx.supabaseAdmin.from("events").select("id").eq("id", eventId).maybeSingle(),
  );
  if (exists.error) throw fromDatabaseError(exists.error, "events");
  throw exists.data === null
    ? new ApiFailure("not_found", "no such event")
    : new ApiFailure("forbidden", "only the exam's proctors and exam office open its stills");
}

async function stills(request: StillsRequest, ctx: ApiContext): Promise<StillsResponse> {
  if (ctx.isAnonymous) throw new ApiFailure("forbidden", "students cannot open stills");
  const event = await visibleEvent(ctx, request.event_id);

  const listed = await retryOnGateway(() =>
    ctx.supabase
      .from("frames")
      .select("id, storage_path, captured_at")
      .eq("event_id", event.id)
      .order("captured_at", { ascending: true })
      .order("storage_path", { ascending: true }),
  );
  if (listed.error) throw fromDatabaseError(listed.error, "frames");
  const frames = parseRow(FrameRow.array(), listed.data ?? [], "frames");
  if (frames.length === 0) return { urls: [] };

  const paths = frames.map((frame) => frame.storage_path);
  const signed = await retryOnGateway(() =>
    ctx.supabaseAdmin.storage.from(FRAMES_BUCKET).createSignedUrls(paths, STILL_VIEW_URL_TTL_S),
  );
  if (signed.error) throw new ApiFailure("internal", `createSignedUrls: ${signed.error.message}`);
  const urlByPath = new Map<string, string>();
  for (const entry of signed.data ?? []) {
    if (entry.error === null && entry.path !== null && entry.signedUrl)
      urlByPath.set(entry.path, entry.signedUrl);
  }

  const exam = await retryOnGateway(() =>
    ctx.supabaseAdmin.from("exams").select("workspace_id").eq("id", event.exam_id).single(),
  );
  if (exam.error) throw fromDatabaseError(exam.error, "exams");
  const { workspace_id } = parseRow(ExamWorkspaceRow, exam.data, "exams");

  const origin = publicOrigin(ctx.supabaseUrl, ctx.request.headers);
  const urls = frames.map((frame) => {
    const url = urlByPath.get(frame.storage_path);
    if (url === undefined) throw new ApiFailure("internal", `no signed URL for ${frame.storage_path}`);
    return {
      frame_id: frame.id,
      url: toPublicUrl(url, ctx.supabaseUrl, origin),
      captured_at: frame.captured_at,
    };
  });

  // One audit row per still, written before any URL is returned. Not retried: an insert is not
  // idempotent, and a missing audit row must fail the call rather than be guessed at.
  const audit = await ctx.supabaseAdmin.from("audit_log").insert(
    frames.map((frame) => ({
      workspace_id,
      actor_id: ctx.userId,
      actor_kind: "staff",
      action: "still.viewed",
      object_type: "frame",
      object_id: frame.id,
      meta: {
        event_id: event.id,
        session_id: event.session_id,
        exam_id: event.exam_id,
        storage_path: frame.storage_path,
        ttl_s: STILL_VIEW_URL_TTL_S,
      },
    })),
  );
  if (audit.error) throw fromDatabaseError(audit.error, "audit_log");

  return { urls };
}

Deno.serve(serveApi({ name: "stills", input: StillsRequest, output: StillsResponse, handle: stills }));
