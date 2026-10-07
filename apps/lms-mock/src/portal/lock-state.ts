import { useSyncExternalStore } from "react";

/** Üki Lock's content script sets this on <html> while the exam is locked. */
export const LOCK_ATTRIBUTE = "data-uki-lock";

export function isLocked(root: Pick<Element, "getAttribute">): boolean {
  return root.getAttribute(LOCK_ATTRIBUTE) === "locked";
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: [LOCK_ATTRIBUTE] });
  return () => observer.disconnect();
}

/** Whether Üki Lock has locked this page: Start attempt waits for it, as a real proctored LMS would. */
export function useUkiLocked(): boolean {
  return useSyncExternalStore(subscribe, () => isLocked(document.documentElement));
}
