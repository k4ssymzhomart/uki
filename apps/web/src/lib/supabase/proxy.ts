import { createServerClient } from "@supabase/ssr";
import type { Database } from "@uki/db";
import { type NextRequest, NextResponse } from "next/server";
import { applyLifetime, lifetimeFromCookies } from "../auth-lifetime.ts";
import { getPublicEnv } from "../env.ts";

/** Supabase auth cookies are named `sb-<project ref>-auth-token`, split into `.0`, `.1` when long. */
export function hasSupabaseAuthCookie(names: readonly string[]): boolean {
  return names.some((name) => /^sb-.+-auth-token(?:\.\d+)?$/.test(name));
}

/**
 * Refreshes the staff session cookie before the request renders (Next.js 16 proxy). Requests without an
 * auth cookie have no session to refresh and pass straight through. A refreshed cookie keeps the
 * lifetime chosen at sign-in (lib/auth-lifetime.ts). This only keeps cookies fresh: every page and
 * server action still checks the user itself.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  if (!hasSupabaseAuthCookie(request.cookies.getAll().map((cookie) => cookie.name))) return response;

  const env = getPublicEnv();
  const lifetime = lifetimeFromCookies(request.cookies.getAll());
  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet, headers) => {
          const now = Date.now();
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, applyLifetime(options, lifetime, now));
          }
          for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
        },
      },
    },
  );

  // Validates the JWT and refreshes an expired session; must run before the response is returned.
  await supabase.auth.getClaims();
  return response;
}
