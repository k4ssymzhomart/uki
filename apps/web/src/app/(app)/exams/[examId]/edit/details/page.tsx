import { StaffLookupFailed } from "../../../../../../features/shell/staff-lookup-failed.tsx";
import { DetailsView } from "../../../../../../features/wizard/details-view.tsx";
import { loadDetailsContext, loadGroups } from "../../../../../../features/wizard/wizard-data.ts";
import { openWizardStep, wizardMetadata } from "../../../../../../features/wizard/wizard-page.ts";

export const generateMetadata = wizardMetadata;

/** 0.4 New exam · Details (Figma 158:12473) for the exam office, on the draft. */
export default async function WizardDetailsPage({ params }: PageProps<"/exams/[examId]/edit/details">) {
  const page = await openWizardStep(params, "details");
  if (!page) return <StaffLookupFailed />;
  const [groups, context] = await Promise.all([loadGroups(), loadDetailsContext(page.exam.id)]);
  return (
    <DetailsView
      exam={page.exam}
      settings={page.settings}
      groups={groups}
      courses={context.courses}
      examDays={context.examDays}
      nowMs={Date.now()}
    />
  );
}
