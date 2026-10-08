"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { staffHomePath } from "../../../features/shell/shell-model.ts";
import {
  parseSignInForm,
  type SignInState,
  signInErrorFromAuth,
} from "../../../features/sign-in/sign-in-form.ts";
import { loadStaffMember, retryOnce, type StaffLookup, staffUserFromClaims } from "../../../lib/auth.ts";
import {
  CLEAR_LIFETIME_COOKIE,
  LIFETIME_COOKIE,
  lifetimeCookie,
  lifetimeForSignIn,
} from "../../../lib/auth-lifetime.ts";
import { createSupabaseServerClient } from "../../../lib/supabase/server.ts";

/**
 * A.0 Sign in: signInWithPassword through @supabase/ssr, so the session lands in the auth cookies with
 * the lifetime the staff member chose. Only staff (a `staff` row readable under RLS) may stay signed in;
 * errors come back to show under the fields. When the staff row cannot be read (twice), the user is
 * signed out with "unavailable", not told the account cannot use the dashboard.
 */
export async function signIn(_previous: SignInState, form: FormData): Promise<SignInState> {
  const parsed = parseSignInForm(form);
  if (!parsed.ok) return parsed.state;
  const { email, password, keep } = parsed.data;
  const kept = { email, keep };

  const now = Date.now();
  const lifetime = lifetimeForSignIn(keep, now);
  const cookieStore = await cookies();
  const supabase = await createSupabaseServerClient({ lifetime });

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return { ...kept, errors: { password: signInErrorFromAuth(error ?? {}) } };
  }

  const user = staffUserFromClaims({
    sub: data.user.id,
    email: data.user.email,
    is_anonymous: data.user.is_anonymous,
  });
  const lookup: StaffLookup = user
    ? await retryOnce(() => loadStaffMember(supabase, user))
    : { status: "none" };
  if (lookup.status !== "staff") {
    await supabase.auth.signOut();
    cookieStore.set(LIFETIME_COOKIE, "", CLEAR_LIFETIME_COOKIE);
    return {
      ...kept,
      errors: lookup.status === "failed" ? { password: "unavailable" } : { email: "notStaff" },
    };
  }

  const marker = lifetimeCookie(lifetime, now);
  cookieStore.set(marker.name, marker.value, marker.options);
  redirect(staffHomePath(lookup.staff.role));
}
