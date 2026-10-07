// Allowed hosts during a locked exam ("What it enforces in Phase 0" in docs/phase-0-plan.md): the host of
// exams.lms_url plus exams.allowed_sites. Matching follows declarativeNetRequest's excludedRequestDomains,
// so the redirect rule, the new-tab check and the content scripts agree: a host matches itself and its
// subdomains, and the port is ignored (the rule's regexFilter captures the host name without it).
import { Host } from "@uki/contracts";

const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/** "localhost:5180" -> "localhost", "Exam.KRU.test" -> "exam.kru.test", "[::1]:80" -> "[::1]". */
export function stripPort(host: string): string {
  const lower = host.trim().toLowerCase().replace(/\.$/, "");
  if (lower.startsWith("[")) return lower.slice(0, lower.indexOf("]") + 1);
  return lower.replace(/:\d+$/, "");
}

/** The domains the rule leaves alone: allowed hosts without ports, lower-cased, unique. */
export function allowedDomains(allowedHosts: readonly string[]): string[] {
  const domains = allowedHosts.map(stripPort).filter((domain) => domain !== "");
  return [...new Set(domains)];
}

/** The lower-cased host name of an http(s) URL without its port, or null for any other URL. */
export function hostnameOf(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

/** The host for an event's data (`tab.blocked`, `site.closed`): a valid Host, or null. */
export function eventHost(hostname: string | null): Host | null {
  if (hostname === null) return null;
  const parsed = Host.safeParse(hostname);
  return parsed.success ? parsed.data : null;
}

/** Whether a host name is one of the allowed domains or a subdomain of one. */
export function isAllowedHostname(hostname: string | null, allowedHosts: readonly string[]): boolean {
  if (hostname === null) return false;
  const name = stripPort(hostname);
  return allowedDomains(allowedHosts).some((domain) => name === domain || name.endsWith(`.${domain}`));
}

/** Whether an http(s) URL is on an allowed host. */
export function isAllowedUrl(url: string | undefined | null, allowedHosts: readonly string[]): boolean {
  return isAllowedHostname(hostnameOf(url), allowedHosts);
}

/**
 * Match patterns for chrome.scripting.registerContentScripts. A pattern without a port matches every port;
 * names also get their subdomains. IP addresses match only themselves.
 */
export function matchPatterns(allowedHosts: readonly string[]): string[] {
  return allowedDomains(allowedHosts).flatMap((domain) =>
    IPV4.test(domain) || domain.startsWith("[") || !domain.includes(".")
      ? [`*://${domain}/*`]
      : [`*://${domain}/*`, `*://*.${domain}/*`],
  );
}
