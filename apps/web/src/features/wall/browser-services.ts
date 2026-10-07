"use client";

// Browser-side services shared by the wall, its dialogs and the lobby: one Supabase client (the
// @supabase/ssr browser client is a singleton) and one Edge Function client using its access token.
import { getPublicEnv } from "../../lib/env.ts";
import { createSupabaseBrowserClient, type SupabaseBrowserClient } from "../../lib/supabase/browser.ts";
import { createFunctionsClient, type FunctionsClient } from "./functions-client.ts";

let functions: FunctionsClient | null = null;

export function browserSupabase(): SupabaseBrowserClient {
  return createSupabaseBrowserClient();
}

/** The `command` and `stills` client for the signed-in staff member. */
export function browserFunctions(): FunctionsClient {
  if (functions !== null) return functions;
  const env = getPublicEnv();
  const supabase = browserSupabase();
  functions = createFunctionsClient({
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    getAccessToken: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token ?? null;
    },
  });
  return functions;
}
