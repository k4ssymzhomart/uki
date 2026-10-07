// CORS for the dashboard and the desktop renderer. Pure: the allow list comes in as a string, so Vitest
// runs it under Node; http.ts reads it from UKI_ALLOWED_ORIGINS.
//
// Every call is authorised by its bearer token, never by a cookie, so CORS is not the security
// boundary here; the allow list only keeps unknown web pages from reading replies.

/** Origins allowed everywhere: the desktop renderer, and the dashboard and renderer dev servers. */
export const DEFAULT_ALLOWED_ORIGINS = [
  "uki://app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
] as const;

export const ALLOWED_HEADERS = "authorization, x-client-info, apikey, content-type";
export const ALLOWED_METHODS = "POST, OPTIONS";
const MAX_AGE_S = "600";

/** An exact origin, or a pattern with one `*` standing for a single host label. */
export type OriginRule = { kind: "exact"; origin: string } | { kind: "pattern"; regex: RegExp };

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Parses `UKI_ALLOWED_ORIGINS` (comma or whitespace separated) on top of the defaults. An entry like
 * `https://uki-web-*.vercel.app` allows one label in place of `*` (letters, digits and dashes only).
 * Trailing slashes are dropped; empty entries are ignored.
 */
export function parseAllowedOrigins(raw: string | undefined | null): OriginRule[] {
  const entries = [...DEFAULT_ALLOWED_ORIGINS, ...(raw ?? "").split(/[\s,]+/)]
    .map((entry) => entry.trim().replace(/\/+$/, "").toLowerCase())
    .filter((entry) => entry !== "");
  const rules: OriginRule[] = [];
  for (const entry of new Set(entries)) {
    if (!entry.includes("*")) {
      rules.push({ kind: "exact", origin: entry });
      continue;
    }
    const source = entry.split("*").map(escapeRegex).join("[a-z0-9-]+");
    rules.push({ kind: "pattern", regex: new RegExp(`^${source}$`) });
  }
  return rules;
}

export function isAllowedOrigin(origin: string, rules: readonly OriginRule[]): boolean {
  const normalized = origin.trim().toLowerCase();
  return rules.some((rule) =>
    rule.kind === "exact" ? rule.origin === normalized : rule.regex.test(normalized),
  );
}

/**
 * Headers for a reply to `origin`. `Vary: Origin` always; the allow headers only for an allowed origin,
 * echoing it back (never `*`). A request without an Origin header (Node, Electron's main process) needs
 * none of them.
 */
export function corsHeaders(origin: string | null, rules: readonly OriginRule[]): Record<string, string> {
  if (origin === null) return {};
  if (!isAllowedOrigin(origin, rules)) return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
    "Access-Control-Max-Age": MAX_AGE_S,
    Vary: "Origin",
  };
}
