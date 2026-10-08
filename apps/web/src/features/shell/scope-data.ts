import { cookies } from "next/headers";
import { cache } from "react";
import { requireStaff } from "../../lib/auth.ts";
import { createSupabaseServerClient } from "../../lib/supabase/server.ts";
import { loadOverviewRows } from "../overview/overview-data.ts";
import { type OverviewRow, rowsInFaculty } from "../overview/overview-model.ts";
import { FACULTY_COOKIE, Faculty, scopedFacultyId, scopesFaculty } from "./scope.ts";

/** The workspace's faculties for the menu (faculties are readable by every staff member), by name. */
export const loadFaculties = cache(async (): Promise<Faculty[]> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("faculties").select("id, name").order("name");
  if (error) throw new Error(`faculties: ${error.message}`);
  return (data ?? []).flatMap((row) => {
    const parsed = Faculty.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
});

export type OverviewScope = {
  /** Every exam row the staff member may see, for the menu's per-faculty counts. */
  all: OverviewRow[];
  /** The rows of the chosen faculty, or all of them. */
  rows: OverviewRow[];
  /** The workspace's faculties when the staff member has the switcher, else empty. */
  faculties: Faculty[];
  facultyId: string | null;
};

/**
 * The overview's rows under the workspace menu's faculty (0.1c), for the layout and the overview page;
 * cached per request, so both share the reads. Call after requireStaff() has returned a staff member.
 */
export const loadOverviewScope = cache(async (): Promise<OverviewScope> => {
  const staff = await requireStaff();
  const all = await loadOverviewRows();
  if (!staff || !scopesFaculty(staff.role)) return { all, rows: all, faculties: [], facultyId: null };
  const faculties = await loadFaculties();
  const facultyId = scopedFacultyId(staff.role, (await cookies()).get(FACULTY_COOKIE)?.value, faculties);
  return { all, rows: rowsInFaculty(all, facultyId), faculties, facultyId };
});
