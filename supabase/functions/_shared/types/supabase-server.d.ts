// Type-check shim for Node's tsc (supabase/functions/tsconfig.json). The functions import
// "@supabase/server" through deno.json (npm:@supabase/server@1.9.1), which tsc cannot resolve from the
// pnpm workspace. These declarations are copied from that version's dist/index.d.mts and
// dist/types-*.d.mts, trimmed to what the functions use. Deno loads the real package; nothing here
// runs. Update it with the version pin in deno.json.
declare module "@supabase/server" {
  import type { SupabaseClient, SupabaseClientOptions } from "@supabase/supabase-js";

  // biome-ignore lint/suspicious/noExplicitAny: the package's own UntypedDatabase is `any`.
  type UntypedDatabase = any;

  export type AuthMode = "none" | "publishable" | "secret" | "user";
  export type AuthModeWithKey = AuthMode | `publishable:${string}` | `secret:${string}`;
  type CredentialedAuthMode = Exclude<AuthModeWithKey, "none">;
  export type AuthConfig =
    | "none"
    | CredentialedAuthMode
    | [CredentialedAuthMode, ...CredentialedAuthMode[]]
    | [CredentialedAuthMode, ...CredentialedAuthMode[], "none"];

  export interface JWTClaims {
    sub: string;
    iss?: string;
    aud?: string | string[];
    exp?: number;
    iat?: number;
    role?: string;
    email?: string;
    app_metadata?: Record<string, unknown>;
    user_metadata?: Record<string, unknown>;
    [key: string]: unknown;
  }

  export interface UserClaims {
    id: string;
    role?: string;
    email?: string;
    appMetadata?: Record<string, unknown>;
    userMetadata?: Record<string, unknown>;
  }

  export interface ErrorResponseConfig {
    detailed?: boolean;
  }

  export interface WithSupabaseConfig {
    auth?: AuthConfig;
    audience?: string | string[];
    issuer?: string | string[];
    cors?: "default" | "disabled" | { headers: Record<string, string> };
    supabaseOptions?: SupabaseClientOptions<string>;
    errors?: ErrorResponseConfig;
  }

  export interface SupabaseContext<Database = UntypedDatabase> {
    supabase: SupabaseClient<Database>;
    supabaseAdmin: SupabaseClient<Database>;
    userClaims: UserClaims | null;
    jwtClaims: JWTClaims | null;
    authMode: AuthMode;
    authKeyName?: string;
  }

  /** Response header carrying the error code of a response the wrapper produced itself. */
  export const ErrorCodeHeader: "x-supabase-server-error";

  export function withSupabase<Database = UntypedDatabase>(
    config: WithSupabaseConfig,
    handler: (req: Request, ctx: SupabaseContext<Database>) => Promise<Response>,
  ): (req: Request) => Promise<Response>;
}
