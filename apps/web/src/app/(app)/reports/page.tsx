import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { loadReports } from "../../../features/reports/reports-data.ts";
import { ReportsView } from "../../../features/reports/reports-view.tsx";
import { loadOverviewScope } from "../../../features/shell/scope-data.ts";
import { NAV } from "../../../features/shell/shell-model.ts";
import { StaffLookupFailed } from "../../../features/shell/staff-lookup-failed.tsx";
import { requireStaff } from "../../../lib/auth.ts";
import { createSupabaseServerClient } from "../../../lib/supabase/server.ts";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard.reports");
  return { title: t("title") };
}

/**
 * A.1 Reports (Figma 102:10454) for the exam office (plan, Screens), rendered on the server from the
 * term_* views under RLS: the term in the address (?term=2026-autumn), within the faculty chosen in the
 * workspace menu (0.1c). A proctor gets a 404. Each view writes one `reports.read` audit row.
 */
export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const staff = await requireStaff();
  if (!staff) return <StaffLookupFailed />;
  if (!NAV.reports.roles.includes(staff.role)) notFound();
  const [scope, supabase, params] = await Promise.all([
    loadOverviewScope(),
    createSupabaseServerClient(),
    searchParams,
  ]);
  const data = await loadReports(supabase, params.term, scope.facultyId, Date.now());
  return (
    <ReportsView
      data={data}
      faculties={scope.faculties}
      facultyId={scope.facultyId}
      workspaceName={staff.workspaceName}
    />
  );
}
