// POST /functions/v1/shared-report: the committee's read-only report (3.5) behind /r/[token]
// ("Share link" in docs/phase-1-plan.md, Decisions; "API and realtime", Edge Functions).
//
// No credential: the Next.js server calls it for a visitor without a session, so the share token is the
// only key (`auth: "none"`, verify_jwt = false in config.toml). The function hashes the token and hands
// only the hash to `open_shared_report`, which refuses an unknown, revoked or expired share, refreshes the
// verify code and writes one audit row per view (`report.share_view`, actor_kind `share`). The stills are
// signed here for 5 minutes. Every refusal is the same 404, so a reply never tells an expired link from a
// made-up one.
import {
  FRAMES_BUCKET,
  SharedReportPayload,
  SharedReportRequest,
  SharedReportResponse,
  STILL_VIEW_URL_TTL_S,
} from "../_shared/contracts/index.ts";
import { ApiFailure, fromDatabaseError } from "../_shared/errors.ts";
import { type ServiceApiContext, serveApi } from "../_shared/http.ts";
import { publicOrigin, toPublicUrl } from "../_shared/public-url.ts";
import { retryOnGateway } from "../_shared/retry.ts";
import { FrameRow, parseRow } from "../_shared/rows.ts";
import { shareTokenHash } from "../_shared/share-token.ts";

const NOT_FOUND = "no such share";

/** The flags' stills as storage paths, in the report's order (flag by flag, oldest still first). */
async function stillRows(ctx: ServiceApiContext, frameIds: readonly string[]) {
  if (frameIds.length === 0) return [];
  const listed = await retryOnGateway(() =>
    ctx.supabaseAdmin
      .from("frames")
      .select("id, event_id, storage_path, captured_at")
      .in("id", [...frameIds]),
  );
  if (listed.error) throw fromDatabaseError(listed.error, "frames");
  return parseRow(FrameRow.extend({ event_id: FrameRow.shape.id }).array(), listed.data ?? [], "frames");
}

async function sharedReport(
  request: SharedReportRequest,
  ctx: ServiceApiContext,
): Promise<SharedReportResponse> {
  const hash = await shareTokenHash(request.token);
  // Not retried: a view writes its audit row, and a missing or doubled row must not be guessed at.
  const opened = await ctx.supabaseAdmin.rpc("open_shared_report", { p_token_hash: hash });
  if (opened.error) {
    const failure = fromDatabaseError(opened.error, "open_shared_report");
    throw failure.code === "not_found" ? new ApiFailure("not_found", NOT_FOUND) : failure;
  }
  const report = parseRow(SharedReportPayload, opened.data, "open_shared_report");

  const frameIds = report.flags.flatMap((flag) => flag.frames.map((frame) => frame.id));
  const frames = await stillRows(ctx, frameIds);
  if (frames.length === 0) return { ...report, stills: [] };

  const signed = await retryOnGateway(() =>
    ctx.supabaseAdmin.storage.from(FRAMES_BUCKET).createSignedUrls(
      frames.map((frame) => frame.storage_path),
      STILL_VIEW_URL_TTL_S,
    ),
  );
  if (signed.error) throw new ApiFailure("internal", `createSignedUrls: ${signed.error.message}`);
  const urlByPath = new Map<string, string>();
  for (const entry of signed.data ?? []) {
    if (entry.error === null && entry.path !== null && entry.signedUrl)
      urlByPath.set(entry.path, entry.signedUrl);
  }

  const origin = publicOrigin(ctx.supabaseUrl, ctx.request.headers);
  const byId = new Map(frames.map((frame) => [frame.id, frame]));
  const stills = frameIds.flatMap((id) => {
    const frame = byId.get(id);
    const url = frame === undefined ? undefined : urlByPath.get(frame.storage_path);
    if (frame === undefined || url === undefined) return [];
    return [
      {
        frame_id: frame.id,
        event_id: frame.event_id,
        url: toPublicUrl(url, ctx.supabaseUrl, origin),
        captured_at: frame.captured_at,
      },
    ];
  });
  return { ...report, stills };
}

Deno.serve(
  serveApi({
    name: "shared-report",
    auth: "none",
    input: SharedReportRequest,
    output: SharedReportResponse,
    handle: sharedReport,
  }),
);
