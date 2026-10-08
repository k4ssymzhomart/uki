// @vitest-environment node
// public/sw.js in a fake service worker scope: it caches only the offline page and that page's own
// assets, answers only failed navigations and failed build-asset requests from that cache, and leaves
// every other request (server actions, Supabase, signed URLs, the /try models) alone.
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { OFFLINE_PATH, PWA_ICONS, shouldRegisterServiceWorker } from "./pwa-model.ts";

const SOURCE = readFileSync(new URL("../../../public/sw.js", import.meta.url), "utf8");
const ORIGIN = "https://uki.test";

const OFFLINE_HTML = `<html><head>
<link rel="stylesheet" href="/_next/static/chunks/app.css">
<link rel="preload" href="/_next/static/media/geist.woff2" as="font">
</head><body><img src="/_next/static/media/uki-face-oops.svg"><img src="/_next/static/media/uki-face-oops.svg">
<script src="/_next/static/chunks/main.js"></script></body></html>`;

interface FakeEvent {
  request: { method: string; mode: string; url: string };
  preloadResponse?: Promise<unknown>;
  respondWith: ReturnType<typeof vi.fn>;
  waitUntil: ReturnType<typeof vi.fn>;
}

class FakeRequest {
  constructor(
    readonly url: string,
    readonly init: { credentials?: string } = {},
  ) {}
}

function worker(network: (input: unknown, init?: unknown) => Promise<unknown>) {
  const listeners = new Map<string, (event: FakeEvent) => void>();
  const store = new Map<string, unknown>();
  const cache = {
    put: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
    addAll: vi.fn(async (requests: FakeRequest[]) => {
      for (const request of requests) store.set(request.url, `asset ${request.url}`);
    }),
  };
  const caches = {
    open: vi.fn(async () => cache),
    keys: vi.fn(async () => ["uki-offline-v0", "uki-offline-v1"]),
    delete: vi.fn(async () => true),
    match: vi.fn(async (key: string) => store.get(key.replace(ORIGIN, ""))),
  };
  const fetch = vi.fn(network);
  const self = {
    location: new URL(`${ORIGIN}/sw.js`),
    addEventListener: (type: string, listener: (event: FakeEvent) => void) => listeners.set(type, listener),
    skipWaiting: vi.fn(async () => undefined),
    clients: { claim: vi.fn(async () => undefined) },
    registration: { navigationPreload: { enable: vi.fn(async () => undefined) } },
  };
  runInNewContext(SOURCE, {
    self,
    caches,
    fetch,
    Request: FakeRequest,
    Response: { error: () => "network error" },
    URL,
    Set,
    Error,
  });
  async function dispatch(type: string, request?: FakeEvent["request"]) {
    let answer: Promise<unknown> | undefined;
    let waited: Promise<unknown> | undefined;
    const event: FakeEvent = {
      request: request ?? { method: "GET", mode: "no-cors", url: `${ORIGIN}/` },
      preloadResponse: Promise.resolve(undefined),
      respondWith: vi.fn((value: Promise<unknown>) => {
        answer = value;
      }),
      waitUntil: vi.fn((value: Promise<unknown>) => {
        waited = value;
      }),
    };
    listeners.get(type)?.(event);
    await waited;
    return { event, answer: answer === undefined ? undefined : await answer };
  }
  return { dispatch, fetch, cache, caches, self, store };
}

const offline = async (input: unknown) => {
  if (input === OFFLINE_PATH)
    return { ok: true, status: 200, clone: () => ({ text: async () => OFFLINE_HTML }) };
  throw new TypeError("Failed to fetch");
};

describe("the service worker", () => {
  it("caches the offline page without cookies, and only its CSS, fonts and art", async () => {
    const sw = worker(offline);
    await sw.dispatch("install");
    expect(sw.fetch).toHaveBeenCalledWith(OFFLINE_PATH, { cache: "reload", credentials: "omit" });
    expect(sw.cache.put).toHaveBeenCalledWith(OFFLINE_PATH, expect.anything());
    const assets = sw.cache.addAll.mock.calls[0]?.[0] as FakeRequest[];
    expect(assets.map((request) => request.url)).toEqual([
      "/_next/static/chunks/app.css",
      "/_next/static/media/geist.woff2",
      "/_next/static/media/uki-face-oops.svg",
    ]);
    expect(assets.every((request) => request.init.credentials === "omit")).toBe(true);
    expect([...sw.store.keys()]).toHaveLength(4);
    expect(sw.self.skipWaiting).toHaveBeenCalled();
  });

  it("drops older caches and turns navigation preload on", async () => {
    const sw = worker(offline);
    await sw.dispatch("activate");
    expect(sw.caches.delete).toHaveBeenCalledWith("uki-offline-v0");
    expect(sw.caches.delete).not.toHaveBeenCalledWith("uki-offline-v1");
    expect(sw.self.registration.navigationPreload.enable).toHaveBeenCalled();
    expect(sw.self.clients.claim).toHaveBeenCalled();
  });

  it("passes navigations to the network and shows the offline page only when it fails", async () => {
    const page = { ok: true, status: 200 };
    let online = true;
    const sw = worker(async (input) => {
      if (input === OFFLINE_PATH) return offline(input);
      if (!online) throw new TypeError("Failed to fetch");
      return page;
    });
    await sw.dispatch("install");
    const navigation = { method: "GET", mode: "navigate", url: `${ORIGIN}/overview` };
    expect((await sw.dispatch("fetch", navigation)).answer).toBe(page);
    expect(sw.cache.put).toHaveBeenCalledTimes(1);
    online = false;
    const { answer } = await sw.dispatch("fetch", navigation);
    expect(answer).toBe(sw.store.get(OFFLINE_PATH));
  });

  it("serves a build asset from the cache only when the network fails", async () => {
    let online = true;
    const sw = worker(async (input) => {
      if (input === OFFLINE_PATH) return offline(input);
      if (!online) throw new TypeError("Failed to fetch");
      return "fresh";
    });
    await sw.dispatch("install");
    const css = { method: "GET", mode: "no-cors", url: `${ORIGIN}/_next/static/chunks/app.css` };
    expect((await sw.dispatch("fetch", css)).answer).toBe("fresh");
    online = false;
    expect((await sw.dispatch("fetch", css)).answer).toBe("asset /_next/static/chunks/app.css");
    const other = { method: "GET", mode: "no-cors", url: `${ORIGIN}/_next/static/chunks/other.js` };
    expect((await sw.dispatch("fetch", other)).answer).toBe("network error");
  });

  it("leaves server actions, Supabase, signed URLs, the models and the API alone", async () => {
    const sw = worker(offline);
    for (const request of [
      { method: "POST", mode: "cors", url: `${ORIGIN}/review` },
      { method: "POST", mode: "navigate", url: `${ORIGIN}/sign-in` },
      { method: "GET", mode: "cors", url: "https://project.supabase.co/rest/v1/exams" },
      { method: "GET", mode: "cors", url: "https://project.supabase.co/storage/v1/object/sign/frames/x.jpg" },
      { method: "GET", mode: "cors", url: `${ORIGIN}/models/face_landmarker.task` },
      { method: "GET", mode: "cors", url: `${ORIGIN}/r/token` },
    ]) {
      const { event } = await sw.dispatch("fetch", request);
      expect(event.respondWith, request.url).not.toHaveBeenCalled();
    }
  });
});

describe("the PWA model", () => {
  it("lists the brand kit's icons at 192 and 512, plain and maskable", () => {
    expect(PWA_ICONS.map((icon) => `${icon.sizes} ${icon.purpose}`)).toEqual([
      "192x192 any",
      "512x512 any",
      "192x192 maskable",
      "512x512 maskable",
    ]);
  });

  it("registers the worker only in production browsers that have service workers", () => {
    expect(shouldRegisterServiceWorker("production", { navigator: { serviceWorker: {} } })).toBe(true);
    expect(shouldRegisterServiceWorker("development", { navigator: { serviceWorker: {} } })).toBe(false);
    expect(shouldRegisterServiceWorker("production", { navigator: {} })).toBe(false);
    expect(shouldRegisterServiceWorker("production", {})).toBe(false);
  });
});
