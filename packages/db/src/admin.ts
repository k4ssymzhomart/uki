// A service-role client for local scripts only (seed-staff, demo-reset, demo-simulate). It bypasses
// row-level security, so it never ships in an app: apps use createUkiClient with the publishable key.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types.ts";
import { SupabaseKeyError, type UkiClient } from "./index.ts";

const SECRET_PREFIX = "sb_secret_";

/** Scripts use the new secret key (sb_secret_...), never the legacy service_role JWT. */
export function assertSecretKey(key: string): void {
  if (!key.startsWith(SECRET_PREFIX)) {
    throw new SupabaseKeyError(`expected a secret key (${SECRET_PREFIX}...)`);
  }
}

export function createUkiAdminClient(url: string, secretKey: string): UkiClient {
  assertSecretKey(secretKey);
  return createClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
