"use client";

import {
  Avatar,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  SidebarUser,
  useToast,
} from "@uki/ui";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { otherDashboardLocale } from "../../i18n/locale.ts";
import { useDashboardLocale } from "../../i18n/use-dashboard-locale.ts";
import { setDashboardLocale } from "./preferences.ts";
import { workspaceShortName } from "./shell-model.ts";
import { signOut } from "./sign-out.ts";
import type { StaffIdentity } from "./staff-context.ts";

export type AccountMenuProps = {
  staff: StaffIdentity;
  /** The sidebar user's second line: "Exam office", "Proctor · Group 204". */
  userDetail: string;
  /** Portal target inside the shell, so the menu keeps the live wall's dark theme. */
  container: HTMLElement | null;
};

/**
 * 3.4a, the account menu (Figma Menu/User 75:2309) on the sidebar's user block, on every page: who is
 * signed in, the dashboard language and Log out. Language shows the current language (ENG or РУС) and
 * switches to the other one; the `uki_locale` cookie keeps the choice. Profile and Notifications
 * (A.7, Phase 3) have no Phase 1 page, so they stay hidden.
 */
export function AccountMenu({ staff, userDetail, container }: AccountMenuProps) {
  const t = useTranslations("dashboard");
  const languages = useTranslations("language");
  const toast = useToast();
  const locale = useDashboardLocale();
  const [switching, startSwitch] = useTransition();
  const [signingOut, startSignOut] = useTransition();
  const role = t(`shell.role.${staff.role}`);

  return (
    <Menu>
      <MenuTrigger asChild>
        <SidebarUser initials={staff.initials} name={staff.fullName} detail={userDetail} />
      </MenuTrigger>
      <MenuContent side="top" align="start" container={container} className="w-65">
        <div className="flex items-center gap-2.5 overflow-clip p-2.5">
          <Avatar tone="lime" initials={staff.initials} />
          <div className="flex min-w-0 flex-col items-start overflow-clip whitespace-nowrap">
            <span className="type-label-m">{staff.fullName}</span>
            <span className="opacity-58 type-ui-caption">
              {t("common.withDetail", { main: role, detail: workspaceShortName(staff.workspaceName) })}
            </span>
          </div>
        </div>
        <MenuSeparator />
        <MenuItem
          icon="globe"
          meta={languages(locale)}
          disabled={switching}
          data-testid="account-language"
          onSelect={() =>
            startSwitch(async () => {
              const result = await setDashboardLocale(otherDashboardLocale(locale));
              if (!result.ok) toast.show({ kind: "error", message: t("shell.lookupFailed.title") });
            })
          }
        >
          {t("shell.account.language")}
        </MenuItem>
        <MenuSeparator />
        <MenuItem icon="log-out" disabled={signingOut} onSelect={() => startSignOut(() => signOut())}>
          {t("shell.signOut")}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
