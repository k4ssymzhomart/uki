"use client";

import { cn, Icon, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@uki/ui";
import { useFormatter } from "next-intl";
import type { Facet } from "./students-model.ts";

export type FilterMenuProps<T extends string | number> = {
  /** Accessible name of the button: "Group". */
  label: string;
  /** The "all" choice: "All groups". */
  allLabel: string;
  /** How a chosen value reads on the button and in the list: "Group 204". */
  valueLabel: (facet: Facet<T>) => string;
  facets: readonly Facet<T>[];
  value: T | null;
  onChange: (value: T | null) => void;
};

/**
 * One of A.2's three filters (plan: group, programme and year). The frame has no filter control, so it is
 * drawn as the header's Search field pill (45:2054) with a chevron, opening the kit's dropdown menu with
 * one row per value and its number of students, then the "all" row. A chosen filter fills the pill with
 * the brand wash the menus use for a chosen row.
 */
export function FilterMenu<T extends string | number>({
  label,
  allLabel,
  valueLabel,
  facets,
  value,
  onChange,
}: FilterMenuProps<T>) {
  const format = useFormatter();
  const chosen = facets.find((facet) => facet.value === value);
  return (
    <Menu>
      <MenuTrigger
        aria-label={label}
        className={cn(
          "flex max-w-50 shrink-0 cursor-pointer items-center gap-2 rounded-pill py-2.25 pr-3 pl-4 text-fg-primary outline-none type-body-s focus-visible:shadow-focus",
          chosen === undefined ? "bg-subtle" : "bg-brand-subtle",
        )}
      >
        <span className="min-w-0 truncate">{chosen === undefined ? allLabel : valueLabel(chosen)}</span>
        <Icon name="chevron-down" className="size-4.5" />
      </MenuTrigger>
      <MenuContent align="end" className="max-h-96 overflow-y-auto">
        {facets.map((facet) => (
          <MenuItem
            key={String(facet.value)}
            selected={facet.value === value}
            meta={format.number(facet.count)}
            onSelect={() => onChange(facet.value)}
          >
            {valueLabel(facet)}
          </MenuItem>
        ))}
        {facets.length > 0 ? <MenuSeparator /> : null}
        <MenuItem selected={value === null} onSelect={() => onChange(null)}>
          {allLabel}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
