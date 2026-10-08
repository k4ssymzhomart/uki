import { notFound } from "next/navigation";
import { ReportsView } from "../../../../features/reports/reports-view.tsx";
import {
  FACULTIES,
  FRAME_DATA,
  FRAME_NAV,
  FRAME_STAFF,
  MATH,
} from "../../../../features/reports/test-fixtures.ts";
import { AppShell } from "../../../../features/shell/app-shell.tsx";

/**
 * Development only: A.1 inside the shell with the frame's numbers (test-fixtures.ts), with no session
 * and no database, for the comparison with Figma 102:10454 (docs/phase-1-exit.md, 1.10). It sits under
 * /reports so the sidebar marks Reports, as on the real page; production answers 404.
 */
export default function ReportsFramePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <AppShell
      staff={FRAME_STAFF}
      groupCodes={[]}
      nav={FRAME_NAV}
      facultyMenu={{ faculties: FACULTIES, facultyId: MATH, counts: {} }}
    >
      <ReportsView
        data={FRAME_DATA}
        faculties={FACULTIES}
        facultyId={MATH}
        workspaceName={FRAME_STAFF.workspaceName}
      />
    </AppShell>
  );
}
