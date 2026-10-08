import { StaffLookupFailed } from "../../../../../../features/shell/staff-lookup-failed.tsx";
import { RosterView } from "../../../../../../features/wizard/roster-view.tsx";
import {
  loadAssignments,
  loadGroups,
  loadProctors,
  loadRoster,
} from "../../../../../../features/wizard/wizard-data.ts";
import { openWizardStep, wizardMetadata } from "../../../../../../features/wizard/wizard-page.ts";

export const generateMetadata = wizardMetadata;

/**
 * 0.3 Roster and proctors, 0.3a and 0.3b (Figma 51:2050, 160:12932, 160:13301) for the exam office:
 * the draft's roster, and a scheduled exam's, whose bounced addresses 0.3b fixes.
 */
export default async function WizardRosterPage({ params }: PageProps<"/exams/[examId]/edit/roster">) {
  const page = await openWizardStep(params, "roster");
  if (!page) return <StaffLookupFailed />;
  const [roster, assignments, proctors, groups] = await Promise.all([
    loadRoster(page.exam.id),
    loadAssignments(page.exam.id),
    loadProctors(),
    loadGroups(),
  ]);
  return (
    <RosterView
      exam={page.exam}
      roster={roster}
      assignments={assignments}
      proctors={proctors}
      groups={groups}
    />
  );
}
