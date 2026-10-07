import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

/** window.location.hash, re-rendering on every hashchange. */
export function useHash(): string {
  return useSyncExternalStore(subscribe, () => window.location.hash);
}
