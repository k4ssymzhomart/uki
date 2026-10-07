// The declarativeNetRequest session rule ("Manifest" in docs/phase-0-plan.md): main-frame loads outside
// the allowed hosts go to the block page, E.7, which names the host. It is always written with
// updateSessionRules({ removeRuleIds, addRules }), so a worker restart never duplicates it.
import { allowedDomains } from "./hosts.ts";

/** The one rule the Lock owns. */
export const REDIRECT_RULE_ID = 1;

/**
 * Captures the host name of an http(s) URL, without port, path, query or fragment. The plan prints
 * "^https?://([^/:?#]+)"; the trailing ".*" makes the match cover the whole URL, because Chrome replaces
 * only the matched part and would otherwise append the rest (":5181/physics-1/quiz-3") to ?host=.
 */
export const REDIRECT_REGEX_FILTER = "^https?://([^/:?#]+).*$";

/** The block page inside the extension. */
export const BLOCKED_PAGE = "blocked.html";

export interface RedirectRule {
  id: number;
  priority: number;
  action: { type: "redirect"; redirect: { regexSubstitution: string } };
  condition: {
    regexFilter: string;
    resourceTypes: ["main_frame"];
    excludedRequestDomains?: string[];
  };
}

export interface SessionRulesUpdate {
  removeRuleIds: number[];
  addRules?: RedirectRule[];
}

/**
 * The redirect rule. With no allowed host (exams in the app) every http(s) page in the browser goes to the
 * block page; Chrome refuses an empty excludedRequestDomains list, so the key is left out then.
 */
export function buildRedirectRule(allowedHosts: readonly string[], extensionId: string): RedirectRule {
  const excluded = allowedDomains(allowedHosts);
  return {
    id: REDIRECT_RULE_ID,
    priority: 1,
    action: {
      type: "redirect",
      redirect: { regexSubstitution: `chrome-extension://${extensionId}/${BLOCKED_PAGE}?host=\\1` },
    },
    condition: {
      regexFilter: REDIRECT_REGEX_FILTER,
      resourceTypes: ["main_frame"],
      ...(excluded.length > 0 ? { excludedRequestDomains: excluded } : {}),
    },
  };
}

/** Replaces the rule (lock, and again after a restart). */
export function lockRulesUpdate(allowedHosts: readonly string[], extensionId: string): SessionRulesUpdate {
  return { removeRuleIds: [REDIRECT_RULE_ID], addRules: [buildRedirectRule(allowedHosts, extensionId)] };
}

/** Removes the rule (release). */
export function releaseRulesUpdate(): SessionRulesUpdate {
  return { removeRuleIds: [REDIRECT_RULE_ID] };
}

/** The host in the block page's query string. A rule without the trailing ".*" leaves the port and path. */
export function hostParam(search: string): string | null {
  const host = new URLSearchParams(search).get("host")?.split(/[/:?#]/)[0];
  return host ? host.toLowerCase() : null;
}

/** The host the block page was opened for, from its own URL; null when it has none (exams in the app). */
export function blockedHostFromUrl(url: string | undefined | null, extensionId: string): string | null {
  if (!url) return null;
  const prefix = `chrome-extension://${extensionId}/${BLOCKED_PAGE}`;
  if (!url.startsWith(prefix)) return null;
  try {
    return hostParam(new URL(url).search);
  } catch {
    return null;
  }
}

/** Whether a URL is the extension's block page. */
export function isBlockedPageUrl(url: string | undefined | null, extensionId: string): boolean {
  return typeof url === "string" && url.startsWith(`chrome-extension://${extensionId}/${BLOCKED_PAGE}`);
}
