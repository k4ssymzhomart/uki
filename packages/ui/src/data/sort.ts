/** Sort state of a table column, as drawn by Table/Header cell (Figma 149:2763). */
export type SortDirection = "none" | "asc" | "desc";

const NEXT: Record<SortDirection, SortDirection> = { none: "asc", asc: "desc", desc: "none" };

/** A header click cycles None, then Asc, then Desc, then back to None. */
export function nextSort(sort: SortDirection): SortDirection {
  return NEXT[sort];
}

/** The `aria-sort` value for a sort state. */
export function ariaSort(sort: SortDirection): "none" | "ascending" | "descending" {
  if (sort === "asc") return "ascending";
  if (sort === "desc") return "descending";
  return "none";
}
