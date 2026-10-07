// The renderer's Content Security Policy ("Hardening" in docs/phase-0-plan.md). The main process sends it
// as a header on every uki:// response, and the build writes the same policy into index.html's meta tag.
import { APP_ORIGIN } from "./origin.ts";

export type CspOptions = {
  /** VITE_SUPABASE_URL. Its host is the only one the renderer may connect to. */
  supabaseUrl?: string | undefined;
  /**
   * electron-vite dev server only: React Refresh's inline preamble, Vite's injected styles and HMR
   * socket, and uki:// resources fetched from the dev server's origin. Never set in a build.
   */
  dev?: boolean;
};

/** "https://<host> wss://<host>" for the Supabase project; "http:" and "ws:" for the local stack. */
export function supabaseConnectSources(supabaseUrl: string): string[] {
  const url = new URL(supabaseUrl);
  if (url.protocol === "https:") return [`https://${url.host}`, `wss://${url.host}`];
  if (url.protocol === "http:") return [`http://${url.host}`, `ws://${url.host}`];
  throw new Error(`VITE_SUPABASE_URL must be http or https, got ${url.protocol}`);
}

/**
 * The plan's policy, exactly:
 * default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:;
 * connect-src 'self' https://<supabase-host> wss://<supabase-host>; img-src 'self' blob: data:;
 * media-src 'self' blob: mediastream:
 */
export function buildCsp({ supabaseUrl, dev = false }: CspOptions = {}): string {
  const supabase = supabaseUrl ? supabaseConnectSources(supabaseUrl) : [];
  const app = dev ? [APP_ORIGIN] : [];
  const directives: Array<[string, string[]]> = [
    ["default-src", ["'self'", ...app]],
    ["script-src", ["'self'", "'wasm-unsafe-eval'", ...(dev ? ["'unsafe-inline'", ...app] : [])]],
    ...(dev ? ([["style-src", ["'self'", "'unsafe-inline'"]]] as Array<[string, string[]]>) : []),
    ["worker-src", ["'self'", "blob:", ...app]],
    [
      "connect-src",
      ["'self'", ...supabase, ...app, ...(dev ? ["ws://localhost:*", "ws://127.0.0.1:*"] : [])],
    ],
    ["img-src", ["'self'", "blob:", "data:", ...app]],
    ["media-src", ["'self'", "blob:", "mediastream:", ...app]],
  ];
  return directives.map(([name, sources]) => `${name} ${sources.join(" ")}`).join("; ");
}
