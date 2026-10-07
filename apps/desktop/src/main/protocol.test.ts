// @vitest-environment node
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ app: {}, net: {}, protocol: {} }));

const { contentTypeFor, resolveAppRequest, responseHeaders } = await import("./protocol.ts");

const roots = { renderer: resolve("/opt/uki/out/renderer"), resources: resolve("/opt/uki/resources") };

describe("resolveAppRequest", () => {
  it("serves the renderer and the resources folder", () => {
    expect(resolveAppRequest("uki://app/index.html", roots)).toEqual({
      kind: "file",
      path: join(roots.renderer, "index.html"),
      area: "renderer",
    });
    expect(resolveAppRequest("uki://app/", roots)).toMatchObject({
      path: join(roots.renderer, "index.html"),
    });
    expect(resolveAppRequest("uki://app/resources/models/face_landmarker.task", roots)).toEqual({
      kind: "file",
      path: join(roots.resources, "models", "face_landmarker.task"),
      area: "resources",
    });
  });

  it("refuses other hosts, schemes and escapes from the roots", () => {
    expect(resolveAppRequest("uki://evil/index.html", roots).kind).toBe("forbidden");
    expect(resolveAppRequest("file:///etc/passwd", roots).kind).toBe("forbidden");
    // %2e%2e is a dot segment: the URL parser removes it, so this stays inside the renderer root.
    expect(resolveAppRequest("uki://app/resources/%2e%2e/main/index.js", roots)).toMatchObject({
      path: join(roots.renderer, "main", "index.js"),
    });
    expect(resolveAppRequest("uki://app/resources/..%2f..%2fsecret", roots).kind).toBe("forbidden");
    expect(resolveAppRequest("uki://app/resources/a%5c..%5c..%5csecret", roots).kind).toBe("forbidden");
    expect(resolveAppRequest("uki://app/resources/%00", roots).kind).toBe("forbidden");
    expect(resolveAppRequest("uki://app/%E0%A4%A", roots).kind).toBe("forbidden");
    expect(resolveAppRequest("uki://app/resources/", roots).kind).toBe("not-found");
  });

  it("serves no renderer pages in development", () => {
    const dev = { ...roots, renderer: null };
    expect(resolveAppRequest("uki://app/index.html", dev).kind).toBe("not-found");
    expect(resolveAppRequest("uki://app/resources/models/x.wasm", dev).kind).toBe("file");
  });
});

describe("headers", () => {
  it("names wasm and models, and carries the CSP", () => {
    expect(contentTypeFor("/r/vision_wasm_internal.wasm")).toBe("application/wasm");
    expect(contentTypeFor("/r/face_landmarker.task")).toBe("application/octet-stream");
    expect(contentTypeFor("/r/index.HTML")).toBe("text/html; charset=utf-8");
    const headers = responseHeaders("/r/a.js", { csp: "default-src 'self'" });
    expect(headers["Content-Security-Policy"]).toBe("default-src 'self'");
    expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
    expect(
      responseHeaders("/r/a.js", { csp: "x", devServerOrigin: "http://localhost:5173" })[
        "Access-Control-Allow-Origin"
      ],
    ).toBe("http://localhost:5173");
  });
});
