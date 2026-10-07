// The typed Supabase client for the apps. Apps carry only the publishable key (sb_publishable_...);
// scripts that need the secret key use ./admin.ts. Types come from database.types.ts, generated with
// `pnpm db:types` from the local database.
import { createClient, type SupabaseClient, type SupabaseClientOptions } from "@supabase/supabase-js";
import type { Database } from "./database.types.ts";

export type {
  CompositeTypes,
  Database,
  Enums,
  Json,
  Tables,
  TablesInsert,
  TablesUpdate,
} from "./database.types.ts";
export { Constants } from "./database.types.ts";

export type UkiClient = SupabaseClient<Database>;
export type UkiClientOptions = SupabaseClientOptions<"public">;

type PublicSchema = Database["public"];
/** Arguments and result of a database function, for example `RpcArgs<"join_exam">`. */
export type RpcName = keyof PublicSchema["Functions"];
export type RpcArgs<F extends RpcName> = PublicSchema["Functions"][F]["Args"];
export type RpcReturns<F extends RpcName> = PublicSchema["Functions"][F]["Returns"];
/** A row of the `exam_overview` view (0.1). */
export type ExamOverviewRow = PublicSchema["Views"]["exam_overview"]["Row"];

const PUBLISHABLE_PREFIX = "sb_publishable_";

export class SupabaseKeyError extends Error {
  override readonly name = "SupabaseKeyError";
}

/** Apps may hold only a publishable key: never a secret key or a legacy anon/service_role JWT. */
export function assertPublishableKey(key: string): void {
  if (!key.startsWith(PUBLISHABLE_PREFIX)) {
    throw new SupabaseKeyError(`expected a publishable key (${PUBLISHABLE_PREFIX}...)`);
  }
}

/** A Supabase client typed with the Üki schema, for the desktop app, the dashboard and the Lock. */
export function createUkiClient(url: string, publishableKey: string, options?: UkiClientOptions): UkiClient {
  assertPublishableKey(publishableKey);
  return createClient<Database>(url, publishableKey, options);
}
