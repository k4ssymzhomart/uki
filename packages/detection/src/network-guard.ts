// Keeps the detection worker's network to the place its models come from ("Nothing leaves the laptop
// except events and flagged stills"). MediaPipe tasks-vision 1.1 posts usage logs (the task, its
// running mode, the platform and latencies) with `fetch` to odml.pa.googleapis.com every 60 s and when
// a task closes. The desktop app's CSP already refuses that (connect-src); the /try demo in a browser
// has no such policy, so the worker refuses it itself. The worker's own requests are the model and
// wasm files, all under the models' origin; data: and blob: URLs never leave the device.

/** `protocol//host` of a URL, also for schemes whose `origin` is "null" (uki://app). */
export function originKey(url: string | URL, base?: string): string | null {
  try {
    const parsed = new URL(url, base);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

interface GuardScope {
  fetch?: (input: unknown, init?: unknown) => Promise<unknown>;
  XMLHttpRequest?: { prototype: { open: (method: string, url: string | URL, ...rest: unknown[]) => void } };
  location?: { href: string };
}

const LOCAL_SCHEMES = new Set(["data:", "blob:"]);

/**
 * From now on `fetch` and XMLHttpRequest in `scope` reach only the origins of `allowed` (and data: and
 * blob: URLs); anything else fails as a network error would, without a request. Returns the refused
 * URLs, for tests.
 */
export function restrictNetwork(
  allowed: readonly string[],
  scope: GuardScope = globalThis as unknown as GuardScope,
): string[] {
  const base = scope.location?.href;
  const origins = new Set(allowed.map((url) => originKey(url, base)).filter((key) => key !== null));
  const refused: string[] = [];
  const permitted = (target: unknown): boolean => {
    const url =
      typeof target === "string" || target instanceof URL
        ? String(target)
        : typeof (target as { url?: unknown } | null)?.url === "string"
          ? (target as { url: string }).url
          : null;
    if (url === null) return false;
    try {
      if (LOCAL_SCHEMES.has(new URL(url, base).protocol)) return true;
    } catch {
      return false;
    }
    const key = originKey(url, base);
    if (key !== null && origins.has(key)) return true;
    refused.push(url);
    return false;
  };

  const fetch = scope.fetch;
  if (typeof fetch === "function") {
    scope.fetch = (input, init) =>
      permitted(input)
        ? fetch.call(scope, input, init)
        : Promise.reject(new TypeError("Üki detection: request refused, it would leave this device"));
  }
  const xhr = scope.XMLHttpRequest?.prototype;
  if (xhr) {
    const open = xhr.open;
    xhr.open = function (this: unknown, method: string, url: string | URL, ...rest: unknown[]) {
      if (!permitted(url)) throw new TypeError("Üki detection: request refused, it would leave this device");
      open.call(this, method, url, ...rest);
    };
  }
  return refused;
}
