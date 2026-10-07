// The privileged uki:// scheme ("Hardening" in docs/phase-0-plan.md). uki://app/... serves the built
// renderer from out/renderer; uki://app/resources/... serves the resources folder (models, wasm, language
// data). In development the renderer pages come from the electron-vite dev server instead, and only
// resources go through uki://.
import { stat } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { app, net, protocol } from "electron";
import { APP_HOST, APP_SCHEME, RESOURCES_PATH_PREFIX } from "../shared/origin.ts";

/** Must run before `app` is ready. */
export function registerPrivilegedSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
    },
  ]);
}

export type ProtocolRoots = {
  /** out/renderer; null in development, where the dev server serves the pages. */
  renderer: string | null;
  /** apps/desktop/resources in development; <resources>/resources in a packaged app (extraResources). */
  resources: string;
};

export function protocolRoots(isDevServer: boolean): ProtocolRoots {
  const appPath = app.getAppPath();
  return {
    renderer: isDevServer ? null : join(appPath, "out", "renderer"),
    resources: app.isPackaged ? join(process.resourcesPath, "resources") : join(appPath, "resources"),
  };
}

export type ResolvedRequest =
  | { kind: "file"; path: string; area: "renderer" | "resources" }
  | { kind: "not-found" }
  | { kind: "forbidden" };

function inside(root: string, relativePath: string, area: "renderer" | "resources"): ResolvedRequest {
  const base = resolve(root);
  const full = resolve(base, relativePath);
  if (full === base) return { kind: "not-found" };
  if (!full.startsWith(base + sep)) return { kind: "forbidden" };
  return { kind: "file", path: full, area };
}

/** Maps a uki:// URL to a file under one of the roots. Pure: no file system access. */
export function resolveAppRequest(url: string, roots: ProtocolRoots): ResolvedRequest {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { kind: "forbidden" };
  }
  if (parsed.protocol !== `${APP_SCHEME}:` || parsed.host !== APP_HOST) return { kind: "forbidden" };

  let pathname: string;
  try {
    pathname = decodeURIComponent(parsed.pathname);
  } catch {
    return { kind: "forbidden" };
  }
  if (pathname.includes("\0") || pathname.includes("\\")) return { kind: "forbidden" };

  if (pathname.startsWith(RESOURCES_PATH_PREFIX)) {
    return inside(roots.resources, pathname.slice(RESOURCES_PATH_PREFIX.length), "resources");
  }
  if (roots.renderer === null) return { kind: "not-found" };
  return inside(roots.renderer, pathname === "/" ? "index.html" : pathname.slice(1), "renderer");
}

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".gz": "application/gzip",
};

export function contentTypeFor(path: string): string {
  return CONTENT_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream";
}

export type ProtocolOptions = {
  /** Sent as the Content-Security-Policy header on every response, so workers get it too. */
  csp: string;
  /** Development: the dev server origin, allowed to fetch resources cross-origin. */
  devServerOrigin?: string | undefined;
};

export function responseHeaders(path: string, options: ProtocolOptions): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": contentTypeFor(path),
    "Content-Security-Policy": options.csp,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-cache",
  };
  if (options.devServerOrigin) headers["Access-Control-Allow-Origin"] = options.devServerOrigin;
  return headers;
}

/** Serves uki:// from the roots. Call once, after `app` is ready. */
export function registerAppProtocol(roots: ProtocolRoots, options: ProtocolOptions): void {
  protocol.handle(APP_SCHEME, async (request) => {
    if (request.method !== "GET" && request.method !== "HEAD") return new Response(null, { status: 405 });
    const resolved = resolveAppRequest(request.url, roots);
    if (resolved.kind === "forbidden") return new Response(null, { status: 403 });
    if (resolved.kind === "not-found") return new Response(null, { status: 404 });

    const info = await stat(resolved.path).catch(() => null);
    if (!info?.isFile()) return new Response(null, { status: 404 });
    const file = await net.fetch(pathToFileURL(resolved.path).toString()).catch(() => null);
    if (!file?.ok) return new Response(null, { status: 404 });
    return new Response(request.method === "HEAD" ? null : file.body, {
      status: 200,
      headers: { ...responseHeaders(resolved.path, options), "Content-Length": String(info.size) },
    });
  });
}
