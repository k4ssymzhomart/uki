import { createServerClient } from "@supabase/ssr";
import type { Database } from "@uki/db";
import { cookies } from "next/headers";
import { type AuthLifetime, applyLifetime, lifetimeFromCookies } from "../auth-lifetime.ts";
import { getPublicEnv } from "../env.ts";

/**
 * A Supabase client for Server Components, Route Handlers and Server Actions, acting as the signed-in
 * staff member through the auth cookies, under row-level security. Make a new one per request; never
 * share it.
 *
 * Every cookie it writes follows the staff member's sign-in lifetime (lib/auth-lifetime.ts); the
 * sign-in action passes the new lifetime, everything else reads it from its cookie.
 *
 * Server Components cannot write cookies, so a token refresh there is dropped; src/proxy.ts refreshes
 * the session before every request, which keeps the cookies current.
 */
export async function createSupabaseServerClient(options: { lifetime?: AuthLifetime } = {}) {
  const cookieStore = await cookies();
  const env = getPublicEnv();
  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          const lifetime = options.lifetime ?? lifetimeFromCookies(cookieStore.getAll());
          const now = Date.now();
          try {
            for (const { name, value, options: cookieOptions } of cookiesToSet) {
              cookieStore.set(name, value, applyLifetime(cookieOptions, lifetime, now));
            }
          } catch {
            // Called from a Server Component: the proxy has refreshed the session already.
          }
        },
      },
    },
  );
}

export type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
