import { STAFF_ROLES } from "@uki/contracts";
import { redirect, unstable_rethrow } from "next/navigation";
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

/**
 * What a staff lookup found. `none`: no staff session, so sign in (nobody signed in, a student's
 * anonymous session, a user without a staff row, or a session Auth rejected). `failed`: Auth or the
 * database did not answer, so nothing is known; a signed-in proctor must not be sent to sign-in for it.
 */
export type StaffLookup = { status: "staff"; staff: StaffMember } | { status: "none" } | { status: "failed" };

const NONE: StaffLookup = { status: "none" };
const FAILED: StaffLookup = { status: "failed" };

/** How long the single retry of a failed lookup waits. */
const LOOKUP_RETRY_DELAY_MS = 150;

/**
 * True when Auth's answer means the session is gone: a 4xx (an invalid or expired JWT, a refresh token
 * that no longer exists), except a timeout (408), a refresh raced by another request (409) and a rate
 * limit (429). A network error (status 0), a 5xx and an error without a status are a failed lookup.
 */
export function isSessionRejected(error: { status?: number | undefined }): boolean {
  const { status } = error;
  if (status === undefined || status < 400 || status >= 500) return false;
  return status !== 408 && status !== 409 && status !== 429;
}

/** One read of a verified user's staff row under RLS. A read that errors is `failed`, never `none`. */
export async function loadStaffMember(supabase: SupabaseServerClient, user: StaffUser): Promise<StaffLookup> {
  try {
    const { data, error } = await supabase
      .from("staff")
      .select("id, full_name, role, workspace:workspaces(name), faculty:faculties(name)")
      .eq("id", user.id)
      .maybeSingle();
    if (error) return FAILED;
    const staff = data ? staffMemberFromRow(user, data) : null;
    return staff ? { status: "staff", staff } : NONE;
  } catch (error) {
    unstable_rethrow(error);
    return FAILED;
  }
}

/**
 * One lookup of the signed-in staff member. Uses `getClaims()`, which verifies the JWT, never the
 * unverified `getSession()`; with no auth cookie it answers without a network call.
 */
async function lookupStaffOnce(supabase: SupabaseServerClient): Promise<StaffLookup> {
  try {
    const { data, error } = await supabase.auth.getClaims();
    if (error) return isSessionRejected(error) ? NONE : FAILED;
    const user = data ? staffUserFromClaims(data.claims) : null;
    if (!user) return NONE;
    return await loadStaffMember(supabase, user);
  } catch (error) {
    unstable_rethrow(error);
    return FAILED;
  }
}

/** Runs a lookup, and once more after `delayMs` when it failed. */
export async function retryOnce(
  lookup: () => Promise<StaffLookup>,
  delayMs = LOOKUP_RETRY_DELAY_MS,
): Promise<StaffLookup> {
  const first = await lookup();
  if (first.status !== "failed") return first;
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  return lookup();
}

/** The signed-in staff member behind `supabase`'s auth cookies, retrying a failed lookup once. */
export function lookupStaff(
  supabase: SupabaseServerClient,
  delayMs = LOOKUP_RETRY_DELAY_MS,
): Promise<StaffLookup> {
  return retryOnce(() => lookupStaffOnce(supabase), delayMs);
}

/**
 * The staff lookup for this request (a verified, non-anonymous user with a `staff` row). Cached per
 * request, so the layout and the page share one lookup.
 */
export const getStaffMember = cache(
  async (): Promise<StaffLookup> => lookupStaff(await createSupabaseServerClient()),
);

/**
 * Every page and server action of the dashboard calls this itself; the proxy only refreshes cookies.
 * Returns the staff member, or redirects to sign-in when there is no staff session. Returns null when
 * the lookup failed twice: the caller then shows StaffLookupFailed (a page) or an error (an action) and
 * loads nothing, rather than bouncing a signed-in proctor to sign-in.
 */
export async function requireStaff(): Promise<StaffMember | null> {
  const lookup = await getStaffMember();
  if (lookup.status === "none") redirect("/sign-in");
  return lookup.status === "staff" ? lookup.staff : null;
}
