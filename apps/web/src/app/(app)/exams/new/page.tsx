import { redirect } from "next/navigation";
import { StaffLookupFailed } from "../../../../features/shell/staff-lookup-failed.tsx";
import { createExamDraft } from "../../../../features/wizard/wizard-actions.ts";
import { wizardMetadata } from "../../../../features/wizard/wizard-page.ts";
import { requireStaff } from "../../../../lib/auth.ts";

export const generateMetadata = wizardMetadata;

/**
 * /exams/new (0.4): save_exam_draft makes the draft row from the workspace's defaults, then the page
 * redirects to its first step, /exams/[examId]/edit/details. Only the exam office makes exams.
 */
export default async function NewExamPage() {
  const staff = await requireStaff();
  if (!staff) return <StaffLookupFailed />;
  if (staff.role !== "exam_office" && staff.role !== "admin") redirect("/overview");
  const result = await createExamDraft();
  // createExamDraft redirects on success; it returns only when the draft could not be made.
  return result.error === "forbidden" ? redirect("/overview") : <StaffLookupFailed />;
}
