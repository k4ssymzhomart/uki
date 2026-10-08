// Server-side reads for the integrity report (3.4), the shared report (3.5) and /verify/[code].
//
// 3.4 runs as the signed-in staff member: `get_report` checks that they are staff of the exam, makes or
// refreshes the report's verify code and writes the audit row (`report.view`) before it returns any
// student data; the session's events for Export CSV come under RLS with it.
// 3.5 and /verify need no session. A shared report comes only from the `shared-report` Edge Function,
// which checks the token's hash and expiry and audits the view (CLAUDE.md, Rules); verify_report is
// open to anonymous callers and answers 10 lookups a minute per client, told apart by the SHA-256 of
// the visitor's IP. Both use the publishable key only.
import { createHash } from "node:crypto";
import {
  ActiveShare,
  ApiError,
  CompactEvent,
  ReportPayload,
  SharedReportResponse,
  ShareToken,
  VerifyReportInput,
  VerifyReportOutput,
} from "@uki/contracts";
import { createUkiClient } from "@uki/db";
import { getPublicEnv } from "../../lib/env.ts";
import type { SupabaseServerClient } from "../../lib/supabase/server.ts";
import { readPages } from "../wall/queries.ts";
import { EVENT_COLUMNS } from "../wall/rows.ts";

export interface ReportData {
  report: ReportPayload;
  /** Every event of the session, for Export CSV. */
  events: CompactEvent[];
  /** The report's links that still open, for Revoke beside Share link (never their tokens). */
  shares: ActiveShare[];
}

function parseEvents(rows: readonly unknown[]): CompactEvent[] {
  return rows.flatMap((row) => {
    const parsed = CompactEvent.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}

/**
 * 3.4: the report through get_report (which audits the read) and the session's events. Null when the
 * session does not exist or the staff member is not staff of its exam; throws on any other failure, so
 * the page never shows a report it could not audit.
 */
export async function loadReport(
  supabase: SupabaseServerClient,
  sessionId: string,
): Promise<ReportData | null> {
  const { data, error } = await supabase.rpc("get_report", { session_id: sessionId });
  if (error) {
    if (error.message === "not_found" || error.message === "forbidden") return null;
    throw new Error(`get_report: ${error.message}`);
  }
  const report = ReportPayload.parse(data);
  const rows = await readPages((from, to) =>
    supabase
      .from("events")
      .select(EVENT_COLUMNS)
      .eq("session_id", sessionId)
      .order("at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
  const shares = report.report === null ? [] : await activeShares(supabase, report.report.id);
  return { report, events: parseEvents(rows), shares };
}

/**
 * The report's links that are neither revoked nor expired, oldest first, read under RLS (staff of the
 * exam). The rows hold no token, only its hash, which is not read either.
 */
export async function activeShares(supabase: SupabaseServerClient, reportId: string): Promise<ActiveShare[]> {
  const { data, error } = await supabase
    .from("report_shares")
    .select("id, created_at, expires_at")
    .eq("report_id", reportId)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: true });
  if (error) throw new Error(`report_shares: ${error.message}`);
  return ActiveShare.array().parse(data);
}

/** What /r/[token] gets: the report, or nothing for every kind of refusal. */
export type SharedReportResult = { ok: true; report: SharedReportResponse } | { ok: false };

/**
 * 3.5: the shared-report Edge Function, called from the Next.js server with the publishable key and no
 * session. A malformed token never leaves the server; the function's own `not_found` (unknown, revoked
 * or expired) and `bad_request` are both "not found". Any other failure throws, a gateway's 404 included,
 * so the visitor sees the error page rather than a page that pretends the link does not exist.
 */
export async function loadSharedReport(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SharedReportResult> {
  if (!ShareToken.safeParse(token).success) return { ok: false };
  const env = getPublicEnv();
  const response = await fetchImpl(
    `${env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "")}/functions/v1/shared-report`,
    {
      method: "POST",
      headers: { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, "content-type": "application/json" },
      body: JSON.stringify({ token }),
      cache: "no-store",
    },
  );
  const body: unknown = await response.json().catch(() => null);
  if (response.ok) return { ok: true, report: SharedReportResponse.parse(body) };
  // Only the function's own refusal is "not found". A 404 from the gateway (the function not deployed
  // or not served) has another body and is an outage, which must not pass for an expired link.
  const refusal = ApiError.safeParse(body);
  if (refusal.success && (refusal.data.error === "not_found" || refusal.data.error === "bad_request")) {
    return { ok: false };
  }
  throw new Error(`shared-report answered ${response.status}`);
}

/**
 * The visitor's address as the Next.js server receives it: the first entry of `x-forwarded-for` (Vercel
 * sets it to the client's IP and overwrites whatever the client sent), else `x-real-ip`. Without either,
 * every such visitor shares the client "unknown".
 */
export function clientIp(headers: Pick<Headers, "get">): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  return headers.get("x-real-ip")?.trim() || "unknown";
}

/** verify_report's client_hash: the SHA-256 of the address, in lower-case hex. The address is not kept. */
export function clientHash(ip: string): string {
  return createHash("sha256").update(ip, "utf8").digest("hex");
}

/** What /verify/[code] shows: verify_report's answer, or "rate_limited" after 10 lookups in a minute. */
export type VerifyResult = VerifyReportOutput | "rate_limited";

/** /verify/[code]: verify_report as an anonymous caller; it reads nothing beyond the code's report. */
export async function verifyReport(code: string, client: string): Promise<VerifyResult> {
  const input = VerifyReportInput.safeParse({ code, client_hash: client });
  if (!input.success) return { found: false };
  const env = getPublicEnv();
  const supabase = createUkiClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await supabase.rpc("verify_report", input.data);
  if (error) {
    if (error.message === "rate_limited") return "rate_limited";
    throw new Error(`verify_report: ${error.message}`);
  }
  return VerifyReportOutput.parse(data);
}
