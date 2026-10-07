// The app's own origin. Built renderer pages and everything in resources/ load through the privileged
// uki:// scheme, never file:// (MediaPipe, Human and Tesseract.js fetch their files, and fetch refuses file:).

export const APP_SCHEME = "uki";
export const APP_HOST = "app";
/** Origin of the built renderer in packaged and preview builds. */
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;
/** The renderer's entry page in packaged and preview builds. */
export const APP_ENTRY_URL = `${APP_ORIGIN}/index.html`;
/** URL path prefix under which the resources folder is served: uki://app/resources/models/... */
export const RESOURCES_PATH_PREFIX = "/resources/";

/** The absolute URL of a file in the resources folder, for example resourceUrl("models/manifest.json"). */
export function resourceUrl(relativePath: string): string {
  const clean = relativePath.replace(/^\/+/, "");
  if (clean === "" || clean.split("/").some((part) => part === ".." || part === ".")) {
    throw new Error(`resourceUrl: "${relativePath}" is not a plain path inside resources/`);
  }
  return `${APP_ORIGIN}${RESOURCES_PATH_PREFIX}${clean.split("/").map(encodeURIComponent).join("/")}`;
}

/** The origin of a URL, or null when it does not parse. uki://app/x gives "uki://app". */
export function originOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === `${APP_SCHEME}:` ? `${APP_SCHEME}://${parsed.host}` : parsed.origin;
  } catch {
    return null;
  }
}

/**
 * True when `url` belongs to the app: uki://app always, and in development also the electron-vite dev
 * server that serves the renderer pages (`devServerUrl`, from ELECTRON_RENDERER_URL).
 */
export function isAppUrl(url: string, devServerUrl?: string): boolean {
  const origin = originOf(url);
  if (origin === null) return false;
  if (origin === APP_ORIGIN) return true;
  return devServerUrl !== undefined && origin === originOf(devServerUrl);
}
