"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CLEAR_LIFETIME_COOKIE, LIFETIME_COOKIE } from "../../lib/auth-lifetime.ts";
import { createSupabaseServerClient } from "../../lib/supabase/server.ts";

/** The user menu's Sign out: ends the Supabase session, clears its cookies and returns to A.0. */
export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  (await cookies()).set(LIFETIME_COOKIE, "", CLEAR_LIFETIME_COOKIE);
  redirect("/sign-in");
}
