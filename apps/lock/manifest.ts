// The Üki Lock manifest ("Manifest" in docs/phase-0-plan.md). WXT adds the entrypoints (background,
// popup, blocked.html) itself. Content scripts are not listed: they register at lock time with
// chrome.scripting.registerContentScripts for the allowed hosts only.

/** Chrome 127: action.openPopup for every extension; the WebSocket keepalive needs 116. */
export const MINIMUM_CHROME_VERSION = "127";

export const PERMISSIONS = ["storage", "tabs", "scripting", "declarativeNetRequestWithHostAccess"] as const;

export type LockManifestEnv = { LOCK_DEV_PUBLIC_KEY?: string | undefined };

export function lockManifest(env: LockManifestEnv) {
  const key = env.LOCK_DEV_PUBLIC_KEY?.trim();
  return {
    name: "Üki Lock",
    minimum_chrome_version: MINIMUM_CHROME_VERSION,
    permissions: [...PERMISSIONS],
    // The exam host is known only at run time.
    host_permissions: ["<all_urls>"],
    web_accessible_resources: [{ resources: ["blocked.html"], matches: ["<all_urls>"] }],
    // A fixed extension id, which the app's socket checks as the Origin. Set only when the key is known.
    ...(key ? { key } : {}),
  };
}
