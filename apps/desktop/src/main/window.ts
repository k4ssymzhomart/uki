// The one BrowserWindow and the security settings around it ("Window states" and "Hardening" in
// docs/phase-0-plan.md). Lockdown (kiosk, always on top, blocked close and quit) lives in lockdown.ts,
// the browser-exam tray in tray.ts; index.ts attaches both to this window.
import { colour } from "@uki/tokens";
import { BrowserWindow, type Session, type WebContents } from "electron";
import { APP_ENTRY_URL, isAppUrl } from "../shared/origin.ts";

export const WINDOW_SIZE = { width: 1280, height: 800, minWidth: 1024, minHeight: 700 } as const;

export type WindowOptions = {
  /** Absolute path of the built preload script (CommonJS, sandboxed). */
  preloadPath: string;
  /** Development: the electron-vite dev server that serves the renderer pages. */
  devServerUrl?: string | undefined;
  /**
   * Content protection stays on unless this is a development build run with UKI_ALLOW_CAPTURE=1, or the
   * smoke build.
   */
  allowCapture: boolean;
  /** DevTools only in development builds. */
  devTools: boolean;
  /** The smoke build only: a window title that names the build. Otherwise the app's name, Üki. */
  title?: string | undefined;
};

/**
 * Content protection is skipped only in an unpackaged (development) build with UKI_ALLOW_CAPTURE=1, and in
 * the smoke build (`electron-vite build --mode smoke`, never shipped), whose window must show over Remote
 * Desktop and in screenshots of the smoke box. `mode` is Vite's build mode, fixed at build time.
 */
export function shouldAllowCapture(isPackaged: boolean, env: NodeJS.ProcessEnv, mode: string): boolean {
  return mode === "smoke" || (!isPackaged && env.UKI_ALLOW_CAPTURE === "1");
}

export function createMainWindow(options: WindowOptions): BrowserWindow {
  const window = new BrowserWindow({
    ...WINDOW_SIZE,
    show: false,
    backgroundColor: colour("bg-canvas"),
    ...(options.title ? { title: options.title } : {}),
    // macOS: the native traffic lights sit inside App/Title bar (packages/ui AppTitleBar).
    ...(process.platform === "darwin" ? { titleBarStyle: "hiddenInset" as const } : {}),
    webPreferences: {
      preload: options.preloadPath,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      navigateOnDragDrop: false,
      spellcheck: false,
      // The camera and the detection worker keep full speed while the window is hidden (browser exams).
      backgroundThrottling: false,
      devTools: options.devTools,
    },
  });

  // Content protection is on from launch (1.1 onwards).
  window.setContentProtection(!options.allowCapture);
  window.once("ready-to-show", () => window.show());
  void window.loadURL(options.devServerUrl ?? APP_ENTRY_URL);
  return window;
}

/**
 * Applied to every webContents the app creates: no navigation away from the app, no new windows, no
 * webviews, and DevTools closed again in builds where they are off.
 */
export function hardenWebContents(
  contents: WebContents,
  devServerUrl: string | undefined,
  devTools: boolean,
): void {
  const deny = (event: { preventDefault(): void }, url: string) => {
    if (!isAppUrl(url, devServerUrl)) event.preventDefault();
  };
  contents.on("will-frame-navigate", (event) => deny(event, event.url));
  contents.on("will-redirect", (event) => deny(event, event.url));
  contents.on("will-attach-webview", (event) => event.preventDefault());
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  if (!devTools) contents.on("devtools-opened", () => contents.closeDevTools());
}

/** True for exactly one permission: video capture requested by the app's own pages. */
export function isAllowedPermission(
  permission: string,
  requestingUrl: string,
  mediaTypes: readonly string[] | undefined,
  devServerUrl: string | undefined,
): boolean {
  if (permission !== "media" || !isAppUrl(requestingUrl, devServerUrl)) return false;
  return mediaTypes !== undefined && mediaTypes.length > 0 && mediaTypes.every((type) => type === "video");
}

/**
 * Session-wide rules: the permission handlers allow only video capture for the app's own pages; screen
 * capture and device pickers are refused. In development the dev server's pages get the CSP as a header
 * too (uki:// responses carry it from protocol.ts).
 */
export function applySessionSecurity(
  session: Session,
  options: { devServerUrl?: string | undefined; devCsp?: string | undefined },
): void {
  const { devServerUrl, devCsp } = options;
  session.setPermissionRequestHandler((_contents, permission, callback, details) => {
    const mediaTypes = "mediaTypes" in details ? details.mediaTypes : undefined;
    callback(isAllowedPermission(permission, details.requestingUrl, mediaTypes, devServerUrl));
  });
  session.setPermissionCheckHandler((_contents, permission, requestingOrigin, details) => {
    const mediaTypes = details.mediaType === undefined ? undefined : [details.mediaType];
    return isAllowedPermission(permission, requestingOrigin, mediaTypes, devServerUrl);
  });
  session.setDevicePermissionHandler(() => false);
  session.setDisplayMediaRequestHandler((_request, callback) => callback({}));

  if (devServerUrl && devCsp) {
    const devOrigin = new URL(devServerUrl).origin;
    session.webRequest.onHeadersReceived({ urls: [`${devOrigin}/*`] }, (details, callback) => {
      callback({ responseHeaders: { ...details.responseHeaders, "Content-Security-Policy": [devCsp] } });
    });
  }
}
