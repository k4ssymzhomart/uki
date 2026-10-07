"use client";

import {
  AppSidebar,
  initials,
  Logo,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  type SidebarNavItem,
  SidebarNote,
  SidebarUser,
  SidebarWorkspace,
  ToastProvider,
} from "@uki/ui";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useState, useTransition } from "react";
import { DASHBOARD_LOCALE } from "../../i18n/locale.ts";
import { formatGroupCodes } from "../../lib/format.ts";
import { AppLink } from "./app-link.tsx";
import { activeNav, EXAMS_HREF, isDarkRoute, type NavId, workspaceInitial } from "./shell-model.ts";
import { signOut } from "./sign-out.ts";
import { StaffContext, type StaffIdentity } from "./staff-context.ts";

const NAV_ICONS = { overview: "layout-grid", exams: "exam", live: "eyes" } as const;

export type AppShellProps = {
  staff: Omit<StaffIdentity, "initials">;
  /** Groups of the exams a proctor is assigned to, for "Proctor · Group 204". */
  groupCodes: readonly string[];
  nav: { examsCount: number; liveCount: number; liveHref: string };
  children: ReactNode;
};

/**
 * The signed-in dashboard (Figma App/Sidebar 47:2070): the sidebar is 256 px at 1280 px and up and a
 * 72 px icon rail from 1024 to 1279 px; each page draws its own App/Top bar (PageHeader). The live wall
 * route is drawn dark, sidebar included. Holds the toast region and the user menu with Sign out.
 */
export function AppShell({ staff: member, groupCodes, nav, children }: AppShellProps) {
  const t = useTranslations("dashboard");
  const staff: StaffIdentity = { ...member, initials: initials(member.fullName, DASHBOARD_LOCALE) };
  const pathname = usePathname();
  const active = activeNav(pathname);
  const dark = isDarkRoute(pathname);
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const [signingOut, startSignOut] = useTransition();

  const item = (id: NavId, href: string, count?: number): SidebarNavItem => ({
    id,
    icon: NAV_ICONS[id],
    label: t(`shell.nav.${id}`),
    href,
    count: count ? String(count) : undefined,
    active: active === id,
  });
  const sections = [
    {
      id: "workspace",
      label: t("shell.section.workspace"),
      items: [
        item("overview", "/overview"),
        item("exams", EXAMS_HREF, nav.examsCount),
        item("live", nav.liveHref, nav.liveCount),
      ],
    },
  ];
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
              <SidebarWorkspace
                initials={workspaceInitial(staff.workspaceName)}
                name={staff.workspaceName}
                detail={staff.facultyName ?? undefined}
              />
            }
            sections={sections}
            navLabel={t("shell.navLabel")}
            note={<SidebarNote title={t("shell.note.title")} body={t("shell.note.body")} />}
            user={
              <Menu>
                <MenuTrigger asChild>
                  <SidebarUser initials={staff.initials} name={staff.fullName} detail={userDetail} />
                </MenuTrigger>
                <MenuContent side="top" align="start" container={root}>
                  <MenuItem
                    icon="log-out"
                    disabled={signingOut}
                    onSelect={() => startSignOut(() => signOut())}
                  >
                    {t("shell.signOut")}
                  </MenuItem>
                </MenuContent>
              </Menu>
            }
            linkAs={AppLink}
          />
          <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">{children}</div>
        </ToastProvider>
      </div>
    </StaffContext>
  );
}
