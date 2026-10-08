import { StaffLookupFailed } from "../../../../../../features/shell/staff-lookup-failed.tsx";
import { BrowserView } from "../../../../../../features/wizard/browser-view.tsx";
import { openWizardStep, wizardMetadata } from "../../../../../../features/wizard/wizard-page.ts";

export const generateMetadata = wizardMetadata;

/** E.1 Browser rules (Figma 99:10209), only for an exam that runs in the LMS with Üki Lock. */
export default async function WizardBrowserPage({ params }: PageProps<"/exams/[examId]/edit/browser">) {
  const page = await openWizardStep(params, "browser");
  if (!page) return <StaffLookupFailed />;
  return <BrowserView exam={page.exam} />;
}
