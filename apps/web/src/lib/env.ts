import { z } from "zod";

/**
 * The only configuration the dashboard carries: the project URL and the publishable key. The legacy
 * `anon` key (a JWT) and any secret key are refused.
 */
export const PublicEnv = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({ protocol: /^https?$/ }),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .regex(/^sb_publishable_\S+$/, "use the publishable key (sb_publishable_...), never the anon key"),
});
export type PublicEnv = z.infer<typeof PublicEnv>;

let cached: PublicEnv | undefined;

/**
 * Reads and checks the public environment once. Each variable is named in full so Next.js inlines it
 * into client bundles.
 */
export function getPublicEnv(): PublicEnv {
  cached ??= parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  return cached;
}

export function parsePublicEnv(source: Record<string, string | undefined>): PublicEnv {
  const result = PublicEnv.safeParse(source);
  if (!result.success) {
    throw new Error(
      `apps/web: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see .env.example).\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}
