import { STAFF_ROLES } from "@uki/contracts";
import { redirect } from "next/navigation";
import { cache } from "react";
import { z } from "zod";
import type { SupabaseServerClient } from "./supabase/server.ts";
import { createSupabaseServerClient } from "./supabase/server.ts";

/** The JWT claims the dashboard relies on. Students sign in anonymously and never count as staff. */
export const StaffClaims = z.object({
  sub: z.uuid(),
  email: z.string().optional(),
  is_anonymous: z.boolean().optional(),
});

export type StaffUser = { id: string; email: string | null };

/** Maps verified claims to a staff user, or null for no session or an anonymous (student) session. */
export function staffUserFromClaims(claims: unknown): StaffUser | null {
  const parsed = StaffClaims.safeParse(claims);
  if (!parsed.success || parsed.data.is_anonymous === true) return null;
  return { id: parsed.data.sub, email: parsed.data.email ?? null };
}

/** The signed-in user's own `staff` row with its workspace and faculty, as PostgREST returns it. */
export const StaffRow = z.object({
  id: z.uuid(),
  full_name: z.string(),
  role: z.enum(STAFF_ROLES),
  workspace: z.object({ name: z.string() }),
  faculty: z.object({ name: z.string() }).nullable(),
});
export type StaffRow = z.infer<typeof StaffRow>;

export type StaffMember = StaffUser & {
  fullName: string;
  role: StaffRow["role"];
  workspaceName: string;
  facultyName: string | null;
};

export function staffMemberFromRow(user: StaffUser, row: unknown): StaffMember | null {
  const parsed = StaffRow.safeParse(row);
  if (!parsed.success || parsed.data.id !== user.id) return null;
  return {
    ...user,
    fullName: parsed.data.full_name,
    role: parsed.data.role,
    workspaceName: parsed.data.workspace.name,
    facultyName: parsed.data.faculty?.name ?? null,
  };
}

/** Reads the staff row of a verified user under RLS; null when the user is not staff. */
export async function loadStaffMember(
  supabase: SupabaseServerClient,
  user: StaffUser,
): Promise<StaffMember | null> {
  const { data, error } = await supabase
    .from("staff")
    .select("id, full_name, role, workspace:workspaces(name), faculty:faculties(name)")
    .eq("id", user.id)
    .maybeSingle();
  if (error || !data) return null;
  return staffMemberFromRow(user, data);
}

/**
 * The signed-in user for this request, or null. Uses `getClaims()`, which verifies the JWT, never the
 * unverified `getSession()`.
 */
export async function getStaffUser(): Promise<StaffUser | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) return null;
  return staffUserFromClaims(data.claims);
}

/**
 * The signed-in staff member (a verified, non-anonymous user with a `staff` row), or null. Cached per
 * request, so the layout and the page share one lookup.
 */
export const getStaffMember = cache(async (): Promise<StaffMember | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) return null;
  const user = staffUserFromClaims(data.claims);
  if (!user) return null;
  return loadStaffMember(supabase, user);
});

/**
 * Every page and server action of the dashboard calls this itself: the staff member, or a redirect to
 * sign-in. The proxy only refreshes cookies.
 */
export async function requireStaff(): Promise<StaffMember> {
  const staff = await getStaffMember();
  if (!staff) redirect("/sign-in");
  return staff;
}
