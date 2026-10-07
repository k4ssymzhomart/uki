// @vitest-environment node
import { EventEmitter } from "node:events";
import type { BrowserWindowConstructorOptions, Session, WebContents } from "electron";
import { describe, expect, it, vi } from "vitest";

const created: Array<{ options: BrowserWindowConstructorOptions; window: FakeWindow }> = [];

class FakeWindow extends EventEmitter {
  contentProtection: boolean | null = null;
  loaded: string | null = null;
  constructor(options: BrowserWindowConstructorOptions) {
    super();
    created.push({ options, window: this });
  }
  setContentProtection(on: boolean) {
    this.contentProtection = on;
  }
  loadURL(url: string) {
    this.loaded = url;
    return Promise.resolve();
  }
  show() {}
}

vi.mock("electron", () => ({ BrowserWindow: FakeWindow }));

const { applySessionSecurity, createMainWindow, hardenWebContents, isAllowedPermission, shouldAllowCapture } =
  await import("./window.ts");

const DEV = "http://localhost:5173/";

describe("createMainWindow", () => {
  it("opens the sandboxed, isolated window with content protection on", () => {
    createMainWindow({ preloadPath: "/app/out/preload/index.cjs", allowCapture: false, devTools: false });
    const { options, window } = created.at(-1) ?? { options: {}, window: null };
    expect(options.webPreferences).toMatchObject({
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      webviewTag: false,
      backgroundThrottling: false,
      devTools: false,
      preload: "/app/out/preload/index.cjs",
    });
    expect(options).toMatchObject({ width: 1280, height: 800, minWidth: 1024, minHeight: 700 });
    expect(window?.contentProtection).toBe(true);
    expect(window?.loaded).toBe("uki://app/index.html");
  });

  it("skips content protection only when capture is allowed, and loads the dev server in development", () => {
    createMainWindow({ preloadPath: "/p.cjs", allowCapture: true, devTools: true, devServerUrl: DEV });
    const { options, window } = created.at(-1) ?? { options: {}, window: null };
    expect(window?.contentProtection).toBe(false);
    expect(window?.loaded).toBe(DEV);
    expect(options.webPreferences?.devTools).toBe(true);
  });
});

describe("shouldAllowCapture", () => {
  it("allows capture only in development builds with UKI_ALLOW_CAPTURE=1", () => {
    expect(shouldAllowCapture(false, { UKI_ALLOW_CAPTURE: "1" })).toBe(true);
    expect(shouldAllowCapture(true, { UKI_ALLOW_CAPTURE: "1" })).toBe(false);
    expect(shouldAllowCapture(false, {})).toBe(false);
    expect(shouldAllowCapture(false, { UKI_ALLOW_CAPTURE: "true" })).toBe(false);
  });
});

describe("isAllowedPermission", () => {
  it("allows video capture for the app's own pages only", () => {
    expect(isAllowedPermission("media", "uki://app/index.html", ["video"], undefined)).toBe(true);
    expect(isAllowedPermission("media", `${DEV}index.html`, ["video"], DEV)).toBe(true);
    expect(isAllowedPermission("media", `${DEV}index.html`, ["video"], undefined)).toBe(false);
    expect(isAllowedPermission("media", "https://evil.example/", ["video"], undefined)).toBe(false);
    expect(isAllowedPermission("media", "uki://app/index.html", ["audio"], undefined)).toBe(false);
    expect(isAllowedPermission("media", "uki://app/index.html", ["video", "audio"], undefined)).toBe(false);
    expect(isAllowedPermission("media", "uki://app/index.html", [], undefined)).toBe(false);
    expect(isAllowedPermission("media", "uki://app/index.html", undefined, undefined)).toBe(false);
    expect(isAllowedPermission("geolocation", "uki://app/index.html", undefined, undefined)).toBe(false);
    expect(isAllowedPermission("notifications", "uki://app/index.html", undefined, undefined)).toBe(false);
  });
});

function fakeContents() {
  const contents = new EventEmitter() as EventEmitter & {
    openHandler?: () => { action: string };
    closed: number;
  };
  Object.assign(contents, {
    closed: 0,
    setWindowOpenHandler(handler: () => { action: string }) {
      contents.openHandler = handler;
    },
    closeDevTools() {
      contents.closed += 1;
    },
  });
  const cancelled = (event: string, url: string) => {
    const e = { url, preventDefault: vi.fn() };
    contents.emit(event, e);
    return e.preventDefault.mock.calls.length > 0;
  };
  return { contents, cancelled };
}

describe("hardenWebContents", () => {
  it("keeps every frame inside the app and opens no windows or webviews", () => {
    const { contents, cancelled } = fakeContents();
    hardenWebContents(contents as unknown as WebContents, undefined, false);
    expect(cancelled("will-frame-navigate", "uki://app/index.html#/exam")).toBe(false);
    expect(cancelled("will-frame-navigate", "https://chat.openai.com/")).toBe(true);
    expect(cancelled("will-frame-navigate", "file:///etc/hosts")).toBe(true);
    expect(cancelled("will-redirect", "https://example.com/")).toBe(true);
    expect(cancelled("will-attach-webview", "uki://app/")).toBe(true);
    expect(contents.openHandler?.()).toEqual({ action: "deny" });
  });

  it("closes DevTools again in builds where they are off", () => {
    const off = fakeContents();
    hardenWebContents(off.contents as unknown as WebContents, undefined, false);
    off.contents.emit("devtools-opened");
    expect(off.contents.closed).toBe(1);

    const on = fakeContents();
    hardenWebContents(on.contents as unknown as WebContents, DEV, true);
    on.contents.emit("devtools-opened");
    expect(on.contents.closed).toBe(0);
    expect(on.cancelled("will-frame-navigate", `${DEV}index.html`)).toBe(false);
  });
});

describe("applySessionSecurity", () => {
  it("routes permission requests and checks through the video-only rule and refuses screen capture", () => {
    const handlers: Record<string, (...args: never[]) => unknown> = {};
    const session = {
      setPermissionRequestHandler: (h: (...args: never[]) => unknown) => {
        handlers.request = h;
      },
      setPermissionCheckHandler: (h: (...args: never[]) => unknown) => {
        handlers.check = h;
      },
      setDevicePermissionHandler: (h: (...args: never[]) => unknown) => {
        handlers.device = h;
      },
      setDisplayMediaRequestHandler: (h: (...args: never[]) => unknown) => {
        handlers.display = h;
      },
      webRequest: { onHeadersReceived: vi.fn() },
    };
    applySessionSecurity(session as unknown as Session, {});

    const answer = vi.fn();
    const request = handlers.request as unknown as (
      c: unknown,
      p: string,
      cb: (ok: boolean) => void,
      d: { requestingUrl: string; mediaTypes?: string[] },
    ) => void;
    request(null, "media", answer, { requestingUrl: "uki://app/index.html", mediaTypes: ["video"] });
    request(null, "media", answer, { requestingUrl: "https://evil.example/", mediaTypes: ["video"] });
    request(null, "media", answer, { requestingUrl: "uki://app/index.html", mediaTypes: ["audio"] });
    expect(answer.mock.calls).toEqual([[true], [false], [false]]);

    const check = handlers.check as unknown as (
      c: unknown,
      p: string,
      o: string,
      d: { mediaType?: string },
    ) => boolean;
    expect(check(null, "media", "uki://app", { mediaType: "video" })).toBe(true);
    expect(check(null, "media", "uki://app", { mediaType: "audio" })).toBe(false);
    expect((handlers.device as unknown as () => boolean)()).toBe(false);

    const display = vi.fn();
    (handlers.display as unknown as (r: unknown, cb: (s: unknown) => void) => void)({}, display);
    expect(display).toHaveBeenCalledWith({});
    expect(session.webRequest.onHeadersReceived).not.toHaveBeenCalled();
  });
});
