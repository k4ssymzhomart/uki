"use client";

import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  SidebarWorkspace,
  useToast,
} from "@uki/ui";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { setOverviewFaculty } from "./preferences.ts";
import type { Faculty } from "./scope.ts";
import { workspaceInitial } from "./shell-model.ts";

export type WorkspaceMenuProps = {
  workspaceName: string;
  faculties: readonly Faculty[];
  /** The chosen faculty, or null for all faculties. */
  facultyId: string | null;
  /** Exams this week per faculty id (Menu/Workspace: "The number is exams this week"). */
  counts: Readonly<Record<string, number>>;
  /** Portal target inside the shell. */
  container: HTMLElement | null;
};

/**
 * 0.1c, the faculty switcher (Figma Menu/Workspace 83:2391) on the sidebar's workspace card, for the
 * exam office: one row per faculty with its exams this week, then All faculties. The choice goes into
 * the `uki_faculty` cookie and filters the overview. Add faculty has no Phase 1 page and stays hidden.
 */
export function WorkspaceMenu({
  workspaceName,
  faculties,
  facultyId,
  counts,
  container,
}: WorkspaceMenuProps) {
  const t = useTranslations("dashboard.shell");
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const chosen = faculties.find((faculty) => faculty.id === facultyId);

  const choose = (id: string | null) =>
    startTransition(async () => {
      const result = await setOverviewFaculty(id);
      if (!result.ok) toast.show({ kind: "error", message: t("lookupFailed.title") });
    });

  return (
    <Menu>
      <MenuTrigger asChild>
        <SidebarWorkspace
          initials={workspaceInitial(workspaceName)}
          name={workspaceName}
          detail={chosen?.name ?? t("workspace.allFaculties")}
          aria-busy={pending || undefined}
        />
      </MenuTrigger>
      <MenuContent side="bottom" align="start" sideOffset={4} container={container} className="w-70">
        <MenuLabel>{workspaceName}</MenuLabel>
        {faculties.map((faculty) => (
          <MenuItem
            key={faculty.id}
            icon="building"
            meta={counts[faculty.id] ?? 0}
            selected={faculty.id === facultyId}
            disabled={pending}
            onSelect={() => choose(faculty.id)}
          >
            {faculty.name}
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuItem
          icon="layout-grid"
          selected={facultyId === null}
          disabled={pending}
          onSelect={() => choose(null)}
        >
          {t("workspace.allFaculties")}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
