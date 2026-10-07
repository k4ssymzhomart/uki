// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildCsp, supabaseConnectSources } from "./csp.ts";
import { APP_ORIGIN, isAppUrl, originOf, resourceUrl } from "./origin.ts";

describe("buildCsp", () => {
  it("is exactly the plan's policy for a cloud project", () => {
    expect(buildCsp({ supabaseUrl: "https://abcdefghij.supabase.co" })).toBe(
      "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; " +
        "connect-src 'self' https://abcdefghij.supabase.co wss://abcdefghij.supabase.co; " +
        "img-src 'self' blob: data:; media-src 'self' blob: mediastream:",
    );
  });

  it("uses http and ws for the local stack, and no host when none is set", () => {
    expect(supabaseConnectSources("http://127.0.0.1:54721")).toEqual([
      "http://127.0.0.1:54721",
      "ws://127.0.0.1:54721",
    ]);
    expect(buildCsp()).toContain("connect-src 'self';");
    expect(() => supabaseConnectSources("ftp://x")).toThrow();
  });

  it("relaxes only the dev server policy", () => {
    const dev = buildCsp({ supabaseUrl: "http://127.0.0.1:54721", dev: true });
    expect(dev).toContain("'unsafe-inline'");
    expect(dev).toContain(APP_ORIGIN);
    expect(buildCsp({ supabaseUrl: "http://127.0.0.1:54721" })).not.toContain("unsafe-inline");
  });
});

describe("origins", () => {
  it("recognises the app's own pages", () => {
    expect(originOf("uki://app/index.html")).toBe(APP_ORIGIN);
    expect(isAppUrl("uki://app/index.html")).toBe(true);
    expect(isAppUrl("uki://other/index.html")).toBe(false);
    expect(isAppUrl("https://example.com/")).toBe(false);
    expect(isAppUrl("http://localhost:5173/#/gallery")).toBe(false);
    expect(isAppUrl("http://localhost:5173/#/gallery", "http://localhost:5173/")).toBe(true);
    expect(isAppUrl("not a url")).toBe(false);
  });

  it("builds resource URLs and refuses traversal", () => {
    expect(resourceUrl("models/manifest.json")).toBe("uki://app/resources/models/manifest.json");
    expect(resourceUrl("/models/human/face model.json")).toBe(
      "uki://app/resources/models/human/face%20model.json",
    );
    expect(() => resourceUrl("../out/main/index.js")).toThrow();
    expect(() => resourceUrl("")).toThrow();
  });
});
