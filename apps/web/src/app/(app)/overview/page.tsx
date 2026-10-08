import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { loadBouncedInvites, loadGroupCount } from "../../../features/overview/overview-data.ts";
import { overviewStats } from "../../../features/overview/overview-model.ts";
import { OverviewView } from "../../../features/overview/overview-view.tsx";
import { scopesFaculty } from "../../../features/shell/scope.ts";
import { loadOverviewScope } from "../../../features/shell/scope-data.ts";
import { StaffLookupFailed } from "../../../features/shell/staff-lookup-failed.tsx";
import { requireStaff } from "../../../lib/auth.ts";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard.overview");
  return { title: t("title") };
}

/**
 * 0.1 Overview (Figma 51:2046), rendered on the server as the staff member under RLS: the exam office
 * sees its workspace's exams, within the faculty chosen in the workspace menu (0.1c), a proctor only
 * the exams assigned to it.
 */
export default async function OverviewPage() {
  const staff = await requireStaff();
  if (!staff) return <StaffLookupFailed />;
  const [scope, groupCount] = await Promise.all([loadOverviewScope(), loadGroupCount()]);
  const next = overviewStats(scope.rows).upcoming.next;
  const bounced = next ? await loadBouncedInvites(next.id) : 0;
  const t = await getTranslations("dashboard.shell.workspace");
  const faculty = scope.faculties.find((item) => item.id === scope.facultyId);
  return (
    <OverviewView
      rows={scope.rows}
      groupCount={groupCount}
      readiness={next ? { ready: Math.max(0, next.roster_size - bounced), total: next.roster_size } : null}
      nowMs={Date.now()}
      scopeName={scopesFaculty(staff.role) ? (faculty?.name ?? t("allFaculties")) : undefined}
    />
  );
}
