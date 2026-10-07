import type { ReactNode } from "react";
import { loadOverviewRows } from "../../features/overview/overview-data.ts";
import {
  examPhase,
  liveStudentCount,
  liveTarget,
  overviewStats,
} from "../../features/overview/overview-model.ts";
import { AppShell } from "../../features/shell/app-shell.tsx";
import { liveHref } from "../../features/shell/shell-model.ts";
import { requireStaff } from "../../lib/auth.ts";

/**
 * The signed-in dashboard shell: App/Sidebar 256 wide at 1280 and up, an icon rail 72 wide from 1024 to
 * 1279. Only staff get here; every page under it still checks the staff member itself. The nav counts
 * and the Live link come from exam_overview under RLS.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const staff = await requireStaff();
  const rows = await loadOverviewRows();
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
    >
      {children}
    </AppShell>
  );
}
