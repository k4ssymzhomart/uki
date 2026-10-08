import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AuditLogView } from "../../../../features/privacy/audit-log-view.tsx";
import { loadAuditLog } from "../../../../features/privacy/privacy-data.ts";
import { auditFiltersFromSearch } from "../../../../features/privacy/privacy-model.ts";
import { NAV } from "../../../../features/shell/shell-model.ts";
import { StaffLookupFailed } from "../../../../features/shell/staff-lookup-failed.tsx";
import { requireStaff } from "../../../../lib/auth.ts";
import { createSupabaseServerClient } from "../../../../lib/supabase/server.ts";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard.privacy.audit");
  return { title: t("title") };
}

/**
 * A.6 Audit log (Figma 108:11296) for the exam office of the workspace, rendered on the server under RLS:
 * the range and tab in the address (`?range=`, `?tab=`), newest first; the search (`?q=`) runs in the
 * browser. A proctor gets a 404. Each view writes one `audit.read` row before the read.
 */
export default async function AuditLogPage({ searchParams }: PageProps<"/privacy-centre/audit-log">) {
  const staff = await requireStaff();
  if (!staff) return <StaffLookupFailed />;
  if (!NAV.privacy.roles.includes(staff.role)) notFound();
  const [supabase, params] = await Promise.all([createSupabaseServerClient(), searchParams]);
  const filters = auditFiltersFromSearch(params);
  const nowMs = Date.now();
  const log = await loadAuditLog(supabase, filters, nowMs);
  return (
    <AuditLogView
      key={`${filters.tab}:${filters.range}`}
      entries={log.entries}
      truncated={log.truncated}
      filters={filters}
      me={staff.id}
      nowMs={nowMs}
    />
  );
}
