import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { loadWorkspaceSettings } from "../../../features/settings/settings-data.ts";
import { SettingsView } from "../../../features/settings/settings-view.tsx";
import { NAV } from "../../../features/shell/shell-model.ts";
import { StaffLookupFailed } from "../../../features/shell/staff-lookup-failed.tsx";
import { requireStaff } from "../../../lib/auth.ts";
import { createSupabaseServerClient } from "../../../lib/supabase/server.ts";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard.settings");
  return { title: t("title") };
}

/**
 * A.4 Settings (Figma 106:10905): the workspace's `settings` for its exam office and admins (plan, API:
 * settings for the exam office of the workspace only). A proctor gets a 404.
 */
export default async function SettingsPage() {
  const staff = await requireStaff();
  if (!staff) return <StaffLookupFailed />;
  if (!NAV.settings.roles.includes(staff.role)) notFound();
  const workspace = await loadWorkspaceSettings(await createSupabaseServerClient());
  return <SettingsView workspaceId={workspace.id} settings={workspace.settings} />;
}
