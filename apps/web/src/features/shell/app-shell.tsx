"use client";

import {
  AppSidebar,
  initials,
  Logo,
  type SidebarNavItem,
  SidebarNote,
  SidebarWorkspace,
  ToastProvider,
} from "@uki/ui";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { useDashboardLocale } from "../../i18n/use-dashboard-locale.ts";
import { formatGroupCodes } from "../../lib/format.ts";
import { AccountMenu } from "./account-menu.tsx";
import { AppLink } from "./app-link.tsx";
import type { Faculty } from "./scope.ts";
import {
  activeNav,
  EXAMS_HREF,
  isDarkRoute,
  NAV,
  NAV_HREFS,
  type NavId,
  navSections,
  staffHomePath,
  workspaceInitial,
} from "./shell-model.ts";
import { StaffContext, type StaffIdentity } from "./staff-context.ts";
import { WorkspaceMenu } from "./workspace-menu.tsx";

export type AppShellProps = {
  staff: Omit<StaffIdentity, "initials">;
  /** Groups of the exams a proctor is assigned to, for "Proctor · Group 204". */
  groupCodes: readonly string[];
  nav: { examsCount: number; liveCount: number; liveHref: string };
  /**
   * 0.1c for the exam office: the workspace's faculties, the chosen one and exams this week per faculty.
   * Null for proctors, whose workspace card has no menu.
   */
  facultyMenu: {
    faculties: readonly Faculty[];
    facultyId: string | null;
    counts: Readonly<Record<string, number>>;
  } | null;
  children: ReactNode;
};

/**
 * The signed-in dashboard (Figma App/Sidebar 47:2070): the sidebar is 256 px at 1280 px and up and a
 * 72 px icon rail from 1024 to 1279 px; each page draws its own App/Top bar (PageHeader). The live wall
 * route is drawn dark, sidebar included. Holds the toast region, the sidebar items of the staff member's
 * role, the workspace menu (0.1c) and the account menu (3.4a).
 */
export function AppShell({ staff: member, groupCodes, nav, facultyMenu, children }: AppShellProps) {
  const t = useTranslations("dashboard");
  const locale = useDashboardLocale();
  const staff: StaffIdentity = { ...member, initials: initials(member.fullName, locale) };
  const pathname = usePathname();
  const active = activeNav(pathname);
  const dark = isDarkRoute(pathname);
  const [root, setRoot] = useState<HTMLDivElement | null>(null);

  const hrefOf = (id: NavId): string => {
    if (id === "overview") return staffHomePath(staff.role);
    if (id === "exams") return EXAMS_HREF;
    if (id === "live") return nav.liveHref;
    return NAV_HREFS[id];
  };
  const countOf = (id: NavId): number | undefined => {
    if (id === "exams") return nav.examsCount;
    if (id === "live") return nav.liveCount;
    return undefined;
  };
  const item = (id: NavId): SidebarNavItem => {
    const count = countOf(id);
    return {
      id,
      icon: NAV[id].icon,
      label: t(`shell.nav.${id}`),
      href: hrefOf(id),
      count: count ? String(count) : undefined,
      active: active === id,
    };
  };
  const sections = navSections(staff.role).map((section) => ({
    id: section.id,
    label: t(`shell.section.${section.id}`),
    items: section.items.map(item),
  }));
  const role = t(`shell.role.${staff.role}`);
  const codes = [...new Set(groupCodes)];
  const userDetail =
    staff.role === "proctor" && codes.length > 0
      ? t("common.withDetail", {
          main: role,
          detail: t("common.groups", { count: codes.length, codes: formatGroupCodes(codes) }),
        })
      : role;

  return (
    <StaffContext value={staff}>
      <div
        ref={setRoot}
        data-theme={dark ? "dark" : undefined}
        className="flex h-screen min-h-175 bg-canvas text-fg-primary"
      >
        <ToastProvider label={t("shell.toast.label")} closeLabel={t("shell.toast.close")}>
          <AppSidebar
            logo={<Logo variant={dark ? "wordmark-paper" : "wordmark-ink"} className="h-7.5 w-auto" />}
            logoCompact={<Logo variant="eyes" className="h-7.5 w-auto" />}
            roleLabel={role}
            workspace={
              facultyMenu ? (
                <WorkspaceMenu
                  workspaceName={staff.workspaceName}
                  faculties={facultyMenu.faculties}
                  facultyId={facultyMenu.facultyId}
                  counts={facultyMenu.counts}
                  container={root}
                />
              ) : (
                <SidebarWorkspace
                  initials={workspaceInitial(staff.workspaceName)}
                  name={staff.workspaceName}
                  detail={staff.facultyName ?? undefined}
                />
              )
            }
            sections={sections}
            navLabel={t("shell.navLabel")}
            note={<SidebarNote title={t("shell.note.title")} body={t("shell.note.body")} />}
            user={<AccountMenu staff={staff} userDetail={userDetail} container={root} />}
            linkAs={AppLink}
          />
          <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">{children}</div>
        </ToastProvider>
      </div>
    </StaffContext>
  );
}
