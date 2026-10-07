import { useSyncExternalStore } from "react";
import type { RoutePath } from "./routes.ts";

const CHANGE = "uki-mock:navigate";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  window.addEventListener(CHANGE, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(CHANGE, onChange);
  };
}

/** The current pathname; re-renders on navigate() and on back and forward. */
export function usePathname(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname);
}

/**
 * Client-side navigation with the History API: a real URL change, so Üki Lock's tab listeners see the
 * exam tab reach the review path.
 */
export function navigate(path: RoutePath, options: { replace?: boolean } = {}): void {
  if (options.replace) window.history.replaceState(null, "", path);
  else window.history.pushState(null, "", path);
  window.dispatchEvent(new Event(CHANGE));
}
