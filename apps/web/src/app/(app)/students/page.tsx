import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { loadOverviewScope } from "../../../features/shell/scope-data.ts";
import { NAV } from "../../../features/shell/shell-model.ts";
import { StaffLookupFailed } from "../../../features/shell/staff-lookup-failed.tsx";
import { loadStudents } from "../../../features/students/students-data.ts";
import { filtersFromSearch } from "../../../features/students/students-search.ts";
import { StudentsView } from "../../../features/students/students-view.tsx";
import { requireStaff } from "../../../lib/auth.ts";
import { createSupabaseServerClient } from "../../../lib/supabase/server.ts";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard.students");
  return { title: t("title") };
}

/**
 * A.2 Students (Figma 104:10579) for the exam office (plan, Screens), rendered on the server under RLS:
 * the workspace's students, within the faculty chosen in the workspace menu (0.1c). A proctor gets a
 * 404. Each view writes one `students.list` audit row.
 */
export default async function StudentsPage({ searchParams }: PageProps<"/students">) {
  const staff = await requireStaff();
  if (!staff) return <StaffLookupFailed />;
  if (!NAV.students.roles.includes(staff.role)) notFound();
  const [scope, supabase, params] = await Promise.all([
    loadOverviewScope(),
    createSupabaseServerClient(),
    searchParams,
  ]);
  const data = await loadStudents(supabase, scope.facultyId, Date.now());
  const t = await getTranslations("dashboard.shell.workspace");
  const faculty = scope.faculties.find((item) => item.id === scope.facultyId);
  return (
    <StudentsView
      rows={data.rows}
      flaggedThisTerm={data.flaggedThisTerm}
      scopeName={faculty?.name ?? t("allFaculties")}
      initialFilters={filtersFromSearch(params)}
    />
  );
}
