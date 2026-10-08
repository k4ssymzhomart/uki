import type { ReactNode } from "react";
import {
  examPhase,
  examsThisWeekByFaculty,
  liveStudentCount,
  liveTarget,
  overviewStats,
} from "../../features/overview/overview-model.ts";
import { AppShell } from "../../features/shell/app-shell.tsx";
import { scopesFaculty } from "../../features/shell/scope.ts";
import { loadOverviewScope } from "../../features/shell/scope-data.ts";
import { liveHref } from "../../features/shell/shell-model.ts";
import { StaffLookupFailed } from "../../features/shell/staff-lookup-failed.tsx";
import { requireStaff } from "../../lib/auth.ts";

/**
 * The signed-in dashboard shell: App/Sidebar 256 wide at 1280 and up, an icon rail 72 wide from 1024 to
 * 1279. Only staff get here; every page under it still checks the staff member itself. The nav counts
 * and the Live link come from exam_overview under RLS, within the faculty the exam office chose in the
 * workspace menu (0.1c). When the staff lookup failed twice there is no one to draw the shell for, so
 * the layout shows the full-screen error with Try again instead.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const staff = await requireStaff();
  if (!staff) return <StaffLookupFailed standalone />;
  const scope = await loadOverviewScope();
  const rows = scope.rows;
  const stats = overviewStats(rows);
  const now = Date.now();
  const current = rows.filter((row) => examPhase(row.status) === "upcoming" || row.status === "live");
  return (
    <AppShell
      staff={{
        fullName: staff.fullName,
        email: staff.email,
        role: staff.role,
        workspaceName: staff.workspaceName,
        facultyName: staff.facultyName,
      }}
      groupCodes={(current.length > 0 ? current : rows).flatMap((row) => row.groups)}
      nav={{
        examsCount: stats.upcoming.count,
        liveCount: liveStudentCount(rows, now),
        liveHref: liveHref(liveTarget(rows, now)),
      }}
      facultyMenu={
        scopesFaculty(staff.role)
          ? {
              faculties: scope.faculties,
              facultyId: scope.facultyId,
              counts: examsThisWeekByFaculty(scope.all, now),
            }
          : null
      }
    >
      {children}
    </AppShell>
  );
}
