// Storage signs URLs on the URL the admin client was made with, which is the platform's SUPABASE_URL.
// On Supabase Cloud that is the public https URL. Under the local CLI it is the Docker-internal gateway
// (http://kong:8000), which no laptop or browser can reach, so the reply would carry a dead link. This
// module rebuilds the public origin from the gateway's X-Forwarded-* headers in that case only.
// Pure: Vitest runs it under Node.

/** The public origin of the API gateway that received `headers`, or null when it cannot be told. */
export function forwardedOrigin(headers: Headers): string | null {
  const host = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (!host) return null;
  const proto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "http";
  if (proto !== "http" && proto !== "https") return null;
  const port = headers.get("x-forwarded-port")?.split(",")[0]?.trim();
  const hasPort = host.startsWith("[") ? /\]:\d+$/.test(host) : /:\d+$/.test(host);
  const defaultPort = (proto === "http" && port === "80") || (proto === "https" && port === "443");
  const suffix = port && /^\d{1,5}$/.test(port) && !hasPort && !defaultPort ? `:${port}` : "";
  return `${proto}://${host}${suffix}`;
}

/**
 * The origin clients should use for URLs signed through `supabaseUrl`. An https project URL is already
 * public and is kept, so a forged header can never move a Cloud URL. A plain-http one (the local CLI)
 * gives way to the forwarded origin when there is one.
 */
export function publicOrigin(supabaseUrl: string, headers: Headers): string {
  const internal = new URL(supabaseUrl);
  if (internal.protocol === "https:") return internal.origin;
  return forwardedOrigin(headers) ?? internal.origin;
}

/** `signedUrl` with its origin replaced by `origin` when it was signed on `supabaseUrl`'s origin. */
export function toPublicUrl(signedUrl: string, supabaseUrl: string, origin: string): string {
  const url = new URL(signedUrl);
  if (url.origin !== new URL(supabaseUrl).origin || url.origin === origin) return signedUrl;
  const target = new URL(origin);
  url.protocol = target.protocol;
  url.host = target.host;
  return url.toString();
}
