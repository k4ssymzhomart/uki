import { z } from "zod";

/** Build-time configuration of the renderer: the project URL and the publishable key, nothing else. */
export const RendererEnv = z.object({
  VITE_SUPABASE_URL: z.url({ protocol: /^https?$/ }),
  VITE_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .regex(/^sb_publishable_\S+$/, "use the publishable key (sb_publishable_...), never the anon key"),
});
export type RendererEnv = z.infer<typeof RendererEnv>;

export function parseRendererEnv(source: Record<string, unknown>): RendererEnv {
  const result = RendererEnv.safeParse(source);
  if (!result.success) {
    throw new Error(
      `apps/desktop: set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}

let cached: RendererEnv | undefined;

/** Reads and checks import.meta.env once, when the Supabase client is first made. */
export function getRendererEnv(): RendererEnv {
  cached ??= parseRendererEnv(import.meta.env);
  return cached;
}
