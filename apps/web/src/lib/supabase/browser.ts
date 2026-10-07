import { createBrowserClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import type { Database } from "@uki/db";
import { applyLifetime, lifetimeFromCookies } from "../auth-lifetime.ts";
import { getPublicEnv } from "../env.ts";

function readCookies(): { name: string; value: string }[] {
  return parseCookieHeader(document.cookie);
}

/**
 * The Supabase client for Client Components: auth from the same cookies the server reads, Realtime for
 * the lobby and the live wall (call `supabase.realtime.setAuth()` before joining a private channel). The
 * browser keeps one instance per page. A token refresh in the browser writes the cookies with the
 * lifetime chosen at sign-in (lib/auth-lifetime.ts), like the server does.
 */
export function createSupabaseBrowserClient() {
  const env = getPublicEnv();
  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => readCookies(),
        setAll: (cookiesToSet) => {
          const lifetime = lifetimeFromCookies(readCookies());
          const now = Date.now();
          for (const { name, value, options } of cookiesToSet) {
            // biome-ignore lint/suspicious/noDocumentCookie: @supabase/ssr's own browser storage writes document.cookie the same way; the Cookie Store API is not in every supported browser.
            document.cookie = serializeCookieHeader(name, value, applyLifetime(options, lifetime, now));
          }
        },
      },
    },
  );
}

export type SupabaseBrowserClient = ReturnType<typeof createSupabaseBrowserClient>;
