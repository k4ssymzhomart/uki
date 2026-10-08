import { StaffLookupFailed } from "../../../../../../features/shell/staff-lookup-failed.tsx";
import { ReviewView } from "../../../../../../features/wizard/review-view.tsx";
import {
  loadAssignments,
  loadGroups,
  loadRosterSize,
} from "../../../../../../features/wizard/wizard-data.ts";
import { openWizardStep, wizardMetadata } from "../../../../../../features/wizard/wizard-page.ts";

export const generateMetadata = wizardMetadata;

/** 0.5 New exam · Review (Figma 159:12771) for the exam office: Schedule exam and the test invite. */
export default async function WizardReviewPage({ params }: PageProps<"/exams/[examId]/edit/review">) {
  const page = await openWizardStep(params, "review");
  if (!page) return <StaffLookupFailed />;
  const [groups, rosterSize, assignments] = await Promise.all([
    loadGroups(),
    loadRosterSize(page.exam.id),
    loadAssignments(page.exam.id),
  ]);
  const codes = groups.filter((group) => page.exam.group_ids.includes(group.id)).map((group) => group.code);
  return (
    <ReviewView
      exam={page.exam}
      settings={page.settings}
      groupCodes={codes}
      rosterSize={rosterSize}
      assignments={assignments}
    />
  );
}
