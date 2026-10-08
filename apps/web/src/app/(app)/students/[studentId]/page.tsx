import { Uuid } from "@uki/contracts";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { NAV } from "../../../../features/shell/shell-model.ts";
import { StaffLookupFailed } from "../../../../features/shell/staff-lookup-failed.tsx";
import { StudentProfileView } from "../../../../features/students/student-profile-view.tsx";
import { loadStudentProfile } from "../../../../features/students/students-data.ts";
import { requireStaff } from "../../../../lib/auth.ts";
import { createSupabaseServerClient } from "../../../../lib/supabase/server.ts";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard.students");
  return { title: t("profile.title") };
}

/**
 * A.3 Student profile (Figma 105:10746) for the exam office, rendered on the server under RLS. A proctor,
 * an id that is not a uuid and a student of another workspace get a 404. Each view writes one
 * `student.read` audit row.
 */
export default async function StudentProfilePage({ params }: PageProps<"/students/[studentId]">) {
  const staff = await requireStaff();
  if (!staff) return <StaffLookupFailed />;
  if (!NAV.students.roles.includes(staff.role)) notFound();
  const { studentId } = await params;
  if (!Uuid.safeParse(studentId).success) notFound();
  const profile = await loadStudentProfile(await createSupabaseServerClient(), studentId);
  if (!profile) notFound();
  return <StudentProfileView {...profile} />;
}
