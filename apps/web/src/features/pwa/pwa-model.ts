// The dashboard PWA (judge mode): the manifest's icons and where the service worker lives. The worker
// (public/sw.js) only answers a navigation that fails for lack of network with the offline page, and the
// offline page's own CSS, fonts and art from its cache; it never caches a page, an API response or a
// signed URL.

/** The brand kit's app icon set, copied into public/icons (the 192 is the 512 scaled down). */
export const PWA_ICONS = [
  { src: "/icons/uki-app-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "/icons/uki-app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  { src: "/icons/uki-app-icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
  { src: "/icons/uki-app-icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
] as const;

export const SERVICE_WORKER_URL = "/sw.js";
export const OFFLINE_PATH = "/offline";

/** Production builds only: in development the worker would keep stale pages around HMR. */
export function shouldRegisterServiceWorker(env: string | undefined, scope: { navigator?: object }): boolean {
  return env === "production" && scope.navigator !== undefined && "serviceWorker" in scope.navigator;
}
