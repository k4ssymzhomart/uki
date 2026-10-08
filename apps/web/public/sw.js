// The dashboard's service worker (judge mode, PWA): an offline page and nothing else.
//
// - Install caches /offline, fetched without cookies (the page is the same for everyone), and the CSS,
//   fonts and art its HTML names under /_next/static/. Nothing else is ever put in the cache.
// - A navigation goes to the network as before (with navigation preload); only when the network fails
//   does the worker answer with the cached offline page.
// - A GET under /_next/static/ (build assets, public and content-hashed) also goes to the network first
//   and falls back to the cache, which holds only the offline page's own assets.
// - Every other request (server actions, API calls, Supabase, signed still URLs, /models) is not touched.
// No page, API response or signed URL is cached. Registered by ServiceWorkerRegistration in production.
const CACHE = "uki-offline-v1";
const OFFLINE_PATH = "/offline";
const ASSET = /\/_next\/static\/[^"'\s)]+?\.(?:css|woff2?|svg|png|webp)/g;

/** The offline page's own assets, from its HTML. */
function assetsOf(html) {
  return [...new Set(html.match(ASSET) ?? [])];
}

async function install() {
  const cache = await caches.open(CACHE);
  const response = await fetch(OFFLINE_PATH, { cache: "reload", credentials: "omit" });
  if (!response.ok) throw new Error(`offline page: HTTP ${response.status}`);
  const html = await response.clone().text();
  await cache.put(OFFLINE_PATH, response);
  await cache.addAll(assetsOf(html).map((path) => new Request(path, { credentials: "omit" })));
}

async function activate() {
  for (const key of await caches.keys()) {
    if (key !== CACHE) await caches.delete(key);
  }
  if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
  await self.clients.claim();
}

async function navigate(event) {
  try {
    const preloaded = await event.preloadResponse;
    if (preloaded) return preloaded;
    return await fetch(event.request);
  } catch {
    const offline = await caches.match(OFFLINE_PATH);
    return offline ?? Response.error();
  }
}

async function staticAsset(request) {
  try {
    return await fetch(request);
  } catch {
    const cached = await caches.match(request.url);
    return cached ?? Response.error();
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(install().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(activate());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  if (request.mode === "navigate") {
    event.respondWith(navigate(event));
    return;
  }
  const url = new URL(request.url);
  if (url.origin === self.location.origin && url.pathname.startsWith("/_next/static/")) {
    event.respondWith(staticAsset(request));
  }
});
