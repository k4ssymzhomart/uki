import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PrivacyCentreView } from "../../../features/privacy/privacy-centre-view.tsx";
import { loadPrivacyCentre, loadRequestDetail } from "../../../features/privacy/privacy-data.ts";
import { drawerFromSearch } from "../../../features/privacy/privacy-model.ts";
import { NAV } from "../../../features/shell/shell-model.ts";
import { StaffLookupFailed } from "../../../features/shell/staff-lookup-failed.tsx";
import { requireStaff } from "../../../lib/auth.ts";
import { createSupabaseServerClient } from "../../../lib/supabase/server.ts";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard.privacy");
  return { title: t("title") };
}

/**
 * A.5 Privacy centre (Figma 107:11102) for the exam office of the workspace, rendered on the server under
 * RLS, with A.5a or A.5b open over it when the address names a request (`?request=`) or a new one from A.3
 * (`?new=delete|copy&student=`). A proctor gets a 404. The page writes `privacy_centre.read`, and an open
 * drawer `data_request.read` with the student's id, before anything is read (privacy-data.ts).
 */
export default async function PrivacyCentrePage({ searchParams }: PageProps<"/privacy-centre">) {
  const staff = await requireStaff();
  if (!staff) return <StaffLookupFailed />;
  if (!NAV.privacy.roles.includes(staff.role)) notFound();
  const [supabase, params] = await Promise.all([createSupabaseServerClient(), searchParams]);
  const nowMs = Date.now();
  const target = drawerFromSearch(params);
  const [data, detail] = await Promise.all([
    loadPrivacyCentre(supabase, nowMs),
    target === null ? Promise.resolve(null) : loadRequestDetail(supabase, target, nowMs),
  ]);
  return (
    <PrivacyCentreView
      data={data}
      detail={detail}
      missing={target !== null && detail === null}
      me={staff.id}
      nowMs={nowMs}
    />
  );
}
