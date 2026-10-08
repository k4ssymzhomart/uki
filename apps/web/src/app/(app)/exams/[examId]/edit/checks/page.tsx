import { StaffLookupFailed } from "../../../../../../features/shell/staff-lookup-failed.tsx";
import { ChecksView } from "../../../../../../features/wizard/checks-view.tsx";
import { previewLines } from "../../../../../../features/wizard/wizard-data.ts";
import { openWizardStep, wizardMetadata } from "../../../../../../features/wizard/wizard-page.ts";

export const generateMetadata = wizardMetadata;

/** 0.2 New exam: checks and 0.2a (Figma 51:2048, 85:6315) for the exam office, on the draft. */
export default async function WizardChecksPage({ params }: PageProps<"/exams/[examId]/edit/checks">) {
  const page = await openWizardStep(params, "checks");
  if (!page) return <StaffLookupFailed />;
  return <ChecksView exam={page.exam} preview={previewLines(page.exam.checks.gaze_s)} />;
}
