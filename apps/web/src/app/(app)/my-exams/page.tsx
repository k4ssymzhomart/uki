import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { loadMyExams } from "../../../features/my-exams/my-exams-data.ts";
import { MyExamsView } from "../../../features/my-exams/my-exams-view.tsx";
import { staffHomePath } from "../../../features/shell/shell-model.ts";
import { StaffLookupFailed } from "../../../features/shell/staff-lookup-failed.tsx";
import { requireStaff } from "../../../lib/auth.ts";
import { confirmSeats } from "./actions.ts";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard.myExams");
  return { title: t("title") };
}

/**
 * 0.9 My exams (Figma 164:13518), the proctor's home: their assignments with the exams, rendered on the
 * server under RLS, and 0.9a (164:15836) to confirm seats or ask for a change. The exam office and
 * admins have no assignments to confirm and go to their own home, the overview.
 */
export default async function MyExamsPage() {
  const staff = await requireStaff();
  if (!staff) return <StaffLookupFailed />;
  if (staff.role !== "proctor") redirect(staffHomePath(staff.role));
  const exams = await loadMyExams(staff.id);
  return <MyExamsView exams={exams} nowMs={Date.now()} confirmAction={confirmSeats} />;
}
