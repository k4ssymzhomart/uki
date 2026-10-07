// POST /functions/v1/ingest: the student app's events and status ("Endpoints" in docs/phase-0-plan.md).
//
// The session owner sends 0 to 50 envelopes and an optional status. The function sets each event's
// review from the contracts REVIEW map (never the client's), stores the batch once through
// `ingest_batch` (insert ... on conflict (id) do nothing, last_seen_at, status, state steps), and
// answers every flag event of the batch, new or resent, whose stills are not all confirmed with fresh
// signed upload URLs (2 hours). At most 10 calls a second per session, per isolate (rate-limit.ts).

import { mapLimit } from "../_shared/async.ts";
import {
  FRAMES_BUCKET,
  IngestRequest,
  IngestResponse,
  type SignedStillUpload,
  stillPath,
} from "../_shared/contracts/index.ts";
import { ApiFailure, fromDatabaseError } from "../_shared/errors.ts";
import { type ApiContext, serveApi } from "../_shared/http.ts";
import { requireSessionOwner } from "../_shared/owner.ts";
import { publicOrigin, toPublicUrl } from "../_shared/public-url.ts";
import { RateLimiter } from "../_shared/rate-limit.ts";
import { retryOnGateway } from "../_shared/retry.ts";
import { IngestBatchResult, parseRow } from "../_shared/rows.ts";
import { assignReviews } from "./reviews.ts";

/** "10 calls a second per session at most". */
const limiter = new RateLimiter({ limit: 10, windowMs: 1000 });
/** Storage calls in flight while signing upload URLs. */
const SIGN_CONCURRENCY = 8;

type Upload = IngestBatchResult["uploads"][number];

/** The session's stored fullscreen exits and which of this batch's exits are resends. */
async function storedFullscreenState(ctx: ApiContext, request: IngestRequest) {
  const exitIds = request.events.filter((e) => e.type === "lock.fullscreen_exit").map((e) => e.id);
  if (exitIds.length === 0) return { fullscreenExits: 0, storedIds: new Set<string>() };

  const [counted, resent] = await Promise.all([
    retryOnGateway(() =>
      ctx.supabaseAdmin
        .from("events")
        .select("id", { count: "exact", head: true })
        .eq("session_id", request.session_id)
        .eq("type", "lock.fullscreen_exit"),
    ),
    retryOnGateway(() => ctx.supabaseAdmin.from("events").select("id").in("id", exitIds)),
  ]);
  if (counted.error) throw fromDatabaseError(counted.error, "events count");
  if (resent.error) throw fromDatabaseError(resent.error, "events");
  const storedIds = new Set((resent.data ?? []).map((row: { id: string }) => row.id));
  return { fullscreenExits: counted.count ?? 0, storedIds };
}

async function signUploads(ctx: ApiContext, uploads: readonly Upload[]) {
  const origin = publicOrigin(ctx.supabaseUrl, ctx.request.headers);
  const jobs = uploads.flatMap((upload) =>
    upload.missing.map((index) => ({
      eventId: upload.event_id,
      index,
      path: stillPath(upload.exam_id, upload.session_id, upload.event_id, index),
    })),
  );
  const signed = await mapLimit(jobs, SIGN_CONCURRENCY, async (job): Promise<SignedStillUpload> => {
    // upsert: a still whose upload went through but whose confirm did not can be sent again.
    const { data, error } = await retryOnGateway(() =>
      ctx.supabaseAdmin.storage.from(FRAMES_BUCKET).createSignedUploadUrl(job.path, { upsert: true }),
    );
    if (error || !data)
      throw new ApiFailure("internal", `createSignedUploadUrl: ${error?.message ?? "no data"}`);
    return {
      index: job.index,
      path: job.path,
      token: data.token,
      signed_url: toPublicUrl(data.signedUrl, ctx.supabaseUrl, origin),
    };
  });

  const byEvent = new Map<string, SignedStillUpload[]>();
  jobs.forEach((job, i) => {
    const still = signed[i];
    if (still === undefined) return;
    byEvent.set(job.eventId, [...(byEvent.get(job.eventId) ?? []), still]);
  });
  return [...byEvent].map(([event_id, stills]) => ({ event_id, stills }));
}

async function ingest(request: IngestRequest, ctx: ApiContext): Promise<IngestResponse> {
  await requireSessionOwner(ctx, request.session_id);
  if (!limiter.hit(request.session_id)) {
    throw new ApiFailure("rate_limited", `more than ${limiter.limit} calls a second for this session`);
  }

  const reviews = assignReviews(request.events, await storedFullscreenState(ctx, request));
  const events = request.events.map((event, i) => ({
    id: event.id,
    type: event.type,
    source: event.source,
    review: reviews[i],
    seq: event.seq,
    at: event.at,
    data: event.data,
    frame_count: event.frame_count,
    app_version: event.app_version,
  }));

  // Safe to repeat: a batch that did reach the database comes back as duplicates, which the app
  // treats as stored too.
  const { data, error } = await retryOnGateway(() =>
    ctx.supabaseAdmin.rpc("ingest_batch", {
      p_session_id: request.session_id,
      p_events: events,
      p_status: request.status ?? null,
    }),
  );
  if (error) throw fromDatabaseError(error, "ingest_batch");
  const result = parseRow(IngestBatchResult, data, "ingest_batch");

  return {
    accepted: result.accepted,
    duplicates: result.duplicates,
    uploads: await signUploads(
      ctx,
      result.uploads.filter((upload) => upload.missing.length > 0),
    ),
    session: result.session,
    server_time: result.server_time,
  };
}

Deno.serve(serveApi({ name: "ingest", input: IngestRequest, output: IngestResponse, handle: ingest }));
