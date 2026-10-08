"use server";

// Share link on 3.4: `create_share` as the signed-in staff member. The database checks that they are
// staff of the exam, stores only the token's SHA-256 with a 7-day expiry and writes the audit row
// (`report.share`). The token travels once, in this reply, and the page shows it once; nothing here
// logs or stores it.
import { CreateShareInput, matchErrorCode, ShareLink } from "@uki/contracts";
import { requireStaff } from "../../lib/auth.ts";
import { createSupabaseServerClient } from "../../lib/supabase/server.ts";

export type ShareErrorCode = "forbidden" | "not_found" | "bad_request" | "failed";

export type ShareActionResult =
  | { ok: true; path: ShareLink["path"]; expiresAt: string }
  | { ok: false; code: ShareErrorCode };

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
