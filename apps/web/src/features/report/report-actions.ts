"use server";

// Share link on 3.4: `create_share` as the signed-in staff member. The database checks that they are
// staff of the exam, stores only the token's SHA-256 with a 30-day expiry and writes the audit row
// (`report.share`). The token travels once, in this reply, and the page shows it once; nothing here
// logs or stores it.
// Revoke beside it: `revoke_share` for each of the report's links that still open, as the same staff
// member; each revoke writes its own audit row (`report.share_revoke`), and the shared-report function
// answers a revoked link with the not-found page.
import { CreateShareInput, matchErrorCode, RevokeShareOutput, ShareLink } from "@uki/contracts";
import { requireStaff } from "../../lib/auth.ts";
import { createSupabaseServerClient } from "../../lib/supabase/server.ts";
import { activeShares } from "./report-data.ts";

export type ShareErrorCode = "forbidden" | "not_found" | "bad_request" | "failed";

export type ShareActionResult =
  | { ok: true; path: ShareLink["path"]; expiresAt: string }
  | { ok: false; code: ShareErrorCode };

export type RevokeActionResult = { ok: true; revoked: number } | { ok: false; code: ShareErrorCode };

const DATABASE_CODES = ["forbidden", "not_found", "bad_request"] as const;

export async function createShareLink(input: unknown): Promise<ShareActionResult> {
  if (!(await requireStaff())) return { ok: false, code: "failed" };
  const parsed = CreateShareInput.safeParse(input);
  if (!parsed.success) return { ok: false, code: "bad_request" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_share", { report_id: parsed.data.report_id });
  if (error) return { ok: false, code: matchErrorCode(error, DATABASE_CODES) ?? "failed" };
  const link = ShareLink.safeParse(data);
  if (!link.success) return { ok: false, code: "failed" };
  return { ok: true, path: link.data.path, expiresAt: link.data.expires_at };
}

/**
 * Revokes every link of the report that still opens (its input is the report, as for Share link) and
 * says how many. A link cannot be told apart from another once made, since its token is shown only
 * once, so Revoke withdraws them all; a new one is a click on Share link away.
 */
export async function revokeShareLinks(input: unknown): Promise<RevokeActionResult> {
  if (!(await requireStaff())) return { ok: false, code: "failed" };
  const parsed = CreateShareInput.safeParse(input);
  if (!parsed.success) return { ok: false, code: "bad_request" };
  const supabase = await createSupabaseServerClient();
  let shares: Awaited<ReturnType<typeof activeShares>>;
  try {
    shares = await activeShares(supabase, parsed.data.report_id);
  } catch {
    return { ok: false, code: "failed" };
  }
  let revoked = 0;
  for (const share of shares) {
    const { data, error } = await supabase.rpc("revoke_share", { share_id: share.id });
    if (error) return { ok: false, code: matchErrorCode(error, DATABASE_CODES) ?? "failed" };
    if (!RevokeShareOutput.safeParse(data).success) return { ok: false, code: "failed" };
    revoked += 1;
  }
  return { ok: true, revoked };
}
