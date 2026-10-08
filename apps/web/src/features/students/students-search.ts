import { Uuid } from "@uki/contracts";
import { z } from "zod";
import { NO_FILTERS, STUDENT_TABS, type StudentFilters } from "./students-model.ts";

/**
 * A.2's search and filters in the address: ?q= (name or number), ?group= (a group id), ?programme=,
 * ?year= and ?tab=flagged. Values that do not parse are dropped, so a stale or edited link still opens
 * the list.
 */
const SearchParams = z.object({
  q: z.string().max(100).catch(""),
  group: Uuid.nullable().catch(null),
  programme: z.string().min(1).max(120).nullable().catch(null),
  year: z.coerce.number().int().min(1).max(10).nullable().catch(null),
  tab: z.enum(STUDENT_TABS).catch("all"),
});

type RawParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function filtersFromSearch(params: RawParams): StudentFilters {
  const parsed = SearchParams.parse({
    q: first(params.q) ?? "",
    group: first(params.group) ?? null,
    programme: first(params.programme) ?? null,
    year: first(params.year) ?? null,
    tab: first(params.tab) ?? "all",
  });
  return {
    query: parsed.q,
    group: parsed.group,
    programme: parsed.programme,
    year: parsed.year,
    tab: parsed.tab,
  };
}

/** "?q=madina&group=…", or "" with no filter set. */
export function filtersToSearch(filters: StudentFilters): string {
  const params = new URLSearchParams();
  if (filters.query.trim() !== "") params.set("q", filters.query.trim());
  if (filters.group !== null) params.set("group", filters.group);
  if (filters.programme !== null) params.set("programme", filters.programme);
  if (filters.year !== null) params.set("year", String(filters.year));
  if (filters.tab !== NO_FILTERS.tab) params.set("tab", filters.tab);
  const text = params.toString();
  return text === "" ? "" : `?${text}`;
}
