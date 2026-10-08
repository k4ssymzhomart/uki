import type { WizardStep } from "@uki/contracts";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireStaff } from "../../lib/auth.ts";
import { loadWizardExam, type WizardExam } from "./wizard-data.ts";
import { allowedStep, stepHref } from "./wizard-model.ts";

/** Every wizard page's title: "New exam". */
export async function wizardMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard.wizard");
  return { title: t("title") };
}

/**
 * What every wizard page does first: the staff member must be the exam office (a proctor gets a
 * 404), the exam must be one they may see, and the step one it may open (allowedStep); otherwise the
 * page redirects to the step that applies or to the lobby. Null when the staff lookup failed twice, so
 * the page shows StaffLookupFailed.
 */
export async function openWizardStep(
  params: Promise<{ examId: string }>,
  step: WizardStep,
): Promise<WizardExam | null> {
  const staff = await requireStaff();
  if (!staff) return null;
  if (staff.role !== "exam_office" && staff.role !== "admin") notFound();
  const { examId } = await params;
  const loaded = await loadWizardExam(examId);
  if (!loaded) notFound();
  const allowed = allowedStep(loaded.exam, step);
  if (!allowed.ok) {
    redirect(allowed.redirect === "lobby" ? `/exams/${examId}/lobby` : stepHref(examId, allowed.redirect));
  }
  return loaded;
}
