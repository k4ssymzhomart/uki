"use client";

import { cn, Icon, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, useToast } from "@uki/ui";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useTransition } from "react";
import { setOverviewFaculty } from "../shell/preferences.ts";
import type { Faculty } from "../shell/scope.ts";
import type { TermKey, TermRow } from "./reports-model.ts";

/** A.1's filter pill (102:10641): surface, default stroke, UI/Label and a 16 px chevron. */
function PickerTrigger({ label, busy, children }: { label: string; busy?: boolean; children: ReactNode }) {
  return (
    <MenuTrigger
      aria-label={label}
      aria-busy={busy || undefined}
      className={cn(
        "flex max-w-75 shrink-0 cursor-pointer items-center gap-2 rounded-pill border border-line-default bg-surface py-2 pr-2.5 pl-3.5",
        "text-fg-primary outline-none type-ui-label hover:bg-hover focus-visible:shadow-focus",
      )}
    >
      <span className="min-w-0 truncate">{children}</span>
      <Icon name="chevron-down" className="size-4 shrink-0 opacity-50" />
    </MenuTrigger>
  );
}

/** The term picker: the terms that ran exams, newest first; the choice goes into the address (?term=). */
export function TermPicker({
  terms,
  term,
  labelOf,
}: {
  terms: readonly TermRow[];
  term: TermKey;
  labelOf: (term: TermKey) => string;
}) {
  const t = useTranslations("dashboard.reports");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const options = terms.some((option) => option.term === term) ? terms : [{ term, term_start: "" }, ...terms];
  return (
    <Menu>
      <PickerTrigger label={t("filter.term")} busy={pending}>
        {labelOf(term)}
      </PickerTrigger>
      <MenuContent align="start">
        {options.map((option) => (
          <MenuItem
            key={option.term}
            selected={option.term === term}
            onSelect={() => startTransition(() => router.push(`/reports?term=${option.term}` as Route))}
          >
            {labelOf(option.term)}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}

/**
 * The faculty picker is the workspace menu's choice (0.1c): picking a faculty here sets the same
 * `uki_faculty` cookie, so the overview, the sidebar and A.2 follow it, and the page renders again.
 */
export function FacultyPicker({
  faculties,
  facultyId,
}: {
  faculties: readonly Faculty[];
  facultyId: string | null;
}) {
  const t = useTranslations("dashboard");
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const chosen = faculties.find((faculty) => faculty.id === facultyId);
  const choose = (id: string | null) =>
    startTransition(async () => {
      const result = await setOverviewFaculty(id);
      if (!result.ok) toast.show({ kind: "error", message: t("shell.lookupFailed.title") });
    });
  return (
    <Menu>
      <PickerTrigger label={t("reports.filter.faculty")} busy={pending}>
        {chosen?.name ?? t("shell.workspace.allFaculties")}
      </PickerTrigger>
      <MenuContent align="start">
        {faculties.map((faculty) => (
          <MenuItem
            key={faculty.id}
            selected={faculty.id === facultyId}
            disabled={pending}
            onSelect={() => choose(faculty.id)}
          >
            {faculty.name}
          </MenuItem>
        ))}
        {faculties.length > 0 ? <MenuSeparator /> : null}
        <MenuItem selected={facultyId === null} disabled={pending} onSelect={() => choose(null)}>
          {t("shell.workspace.allFaculties")}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
