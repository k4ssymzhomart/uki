// Server-side reads for the integrity report (3.4), the shared report (3.5) and /verify/[code].
//
// 3.4 runs as the signed-in staff member: `get_report` checks that they are staff of the exam, makes or
// refreshes the report's verify code and writes the audit row (`report.view`) before it returns any
// student data; the session's events for Export CSV come under RLS with it.
// 3.5 and /verify need no session. A shared report comes only from the `shared-report` Edge Function,
// which checks the token's hash and expiry and audits the view (CLAUDE.md, Rules); verify_report is
// open to anonymous callers. Both use the publishable key only.
import {
  CompactEvent,
  ReportPayload,
  SharedReportResponse,
  ShareToken,
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
  return { report, events: parseEvents(rows) };
}

/** What /r/[token] gets: the report, or nothing for every kind of refusal. */
export type SharedReportResult = { ok: true; report: SharedReportResponse } | { ok: false };

/**
 * 3.5: the shared-report Edge Function, called from the Next.js server with the publishable key and no
 * session. A malformed token never leaves the server; a 404 (unknown, revoked or expired) and a 400 are
 * both "not found". Any other failure throws, so the visitor sees the error page rather than a page
 * that pretends the link does not exist.
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
  if (response.status === 404 || response.status === 400) {
    await response.body?.cancel();
    return { ok: false };
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`shared-report answered ${response.status}`);
  }
  return { ok: true, report: SharedReportResponse.parse(await response.json()) };
}

/** /verify/[code]: verify_report as an anonymous caller; it reads nothing beyond the code's report. */
export async function verifyReport(code: string): Promise<VerifyReportOutput> {
  if (code.length === 0 || code.length > 64) return { found: false };
  const env = getPublicEnv();
  const client = createUkiClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.rpc("verify_report", { code });
  if (error) throw new Error(`verify_report: ${error.message}`);
  return VerifyReportOutput.parse(data);
}
