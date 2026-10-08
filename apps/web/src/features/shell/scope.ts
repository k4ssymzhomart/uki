import type { StaffRole } from "@uki/contracts";
import { Uuid } from "@uki/contracts";
import { z } from "zod";

/**
 * 0.1c, the workspace menu: the exam office picks one faculty, or all of them, and the overview and the
 * sidebar's counts show only that faculty's exams. The choice is the `uki_faculty` cookie; without it,
 * every faculty shows, as in Phase 0. Proctors see only their assigned exams anyway and get no menu.
 */
export const FACULTY_COOKIE = "uki_faculty";
export const FACULTY_COOKIE_MAX_AGE_S = 365 * 24 * 60 * 60;

/** Who has the faculty switcher: the frame is "0.1c Admin · Overview · Faculty switcher". */
export function scopesFaculty(role: StaffRole): boolean {
  return role === "exam_office" || role === "admin";
}

export const Faculty = z.object({ id: Uuid, name: z.string().min(1) });
export type Faculty = z.infer<typeof Faculty>;

/**
 * The faculty a request is scoped to: the cookie's faculty when the role has the switcher and the
 * faculty is one of the workspace's, else null (all faculties). A stale or edited cookie shows all.
 */
export function scopedFacultyId(
  role: StaffRole,
  cookie: string | undefined,
  faculties: readonly Faculty[],
): string | null {
  if (!scopesFaculty(role) || cookie === undefined) return null;
  return faculties.some((faculty) => faculty.id === cookie) ? cookie : null;
}
