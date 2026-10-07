import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn.ts";
import { Icon } from "../icon.tsx";
import type { IconName } from "../icons.ts";
import { ariaSort, nextSort, type SortDirection } from "./sort.ts";

export type TableHeaderCellProps = Omit<ComponentProps<"th">, "children"> & {
  /** Column name; the Mono/Tag style upper-cases it: "Student". */
  label: ReactNode;
  sort?: SortDirection;
  /** Makes the header a button. A click asks for the next state: None, Asc, Desc, None. */
  onSortChange?: (next: SortDirection) => void;
};

const SORT_ICON: Record<SortDirection, IconName> = { none: "sort", asc: "arrow-up", desc: "arrow-down" };

/**
 * Sortable column header on a bg-subtle header row (Figma Table/Header cell 149:2763): a <th scope="col">
 * with aria-sort when sortable. Give it the row's column class from columns.ts so it lines up.
 */
export function TableHeaderCell({
  label,
  sort = "none",
  onSortChange,
  className,
  scope,
  ...props
}: TableHeaderCellProps) {
  const sortable = onSortChange !== undefined;
  const content = (
    <>
      <span className={cn("whitespace-nowrap type-mono-tag", sort === "none" && "opacity-70")}>{label}</span>
      {sortable ? (
        <Icon name={SORT_ICON[sort]} className={cn("size-3.5", sort === "none" && "opacity-35")} />
      ) : null}
    </>
  );
  return (
    <th
      scope={scope ?? "col"}
      aria-sort={sortable ? ariaSort(sort) : undefined}
      data-sort={sort}
      className={cn("py-3 pr-3 pl-5 text-left align-middle font-normal text-fg-primary", className)}
      {...props}
    >
      {sortable ? (
        <button
          type="button"
          onClick={() => onSortChange(nextSort(sort))}
          className="-m-1 inline-flex cursor-pointer items-center gap-1.5 rounded-sm p-1 outline-none focus-visible:shadow-focus"
        >
          {content}
        </button>
      ) : (
        <span className="inline-flex items-center gap-1.5">{content}</span>
      )}
    </th>
  );
}
