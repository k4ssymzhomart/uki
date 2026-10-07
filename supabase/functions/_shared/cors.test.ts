import { describe, expect, it } from "vitest";
import { corsHeaders, DEFAULT_ALLOWED_ORIGINS, isAllowedOrigin, parseAllowedOrigins } from "./cors.ts";

describe("parseAllowedOrigins", () => {
  it("always allows the desktop renderer and the local dev servers", () => {
    const rules = parseAllowedOrigins(undefined);
    for (const origin of DEFAULT_ALLOWED_ORIGINS) expect(isAllowedOrigin(origin, rules)).toBe(true);
    expect(isAllowedOrigin("https://evil.example", rules)).toBe(false);
  });

  it("adds exact origins from the environment, ignoring case, blanks and trailing slashes", () => {
    const rules = parseAllowedOrigins(" https://Uki-Web.vercel.app/ ,, https://lms.kru.test ");
    expect(isAllowedOrigin("https://uki-web.vercel.app", rules)).toBe(true);
    expect(isAllowedOrigin("https://LMS.kru.test", rules)).toBe(true);
    expect(isAllowedOrigin("https://uki-web.vercel.app.evil.example", rules)).toBe(false);
    expect(isAllowedOrigin("http://uki-web.vercel.app", rules)).toBe(false);
  });

  it("lets one * stand for a single host label only", () => {
    const rules = parseAllowedOrigins("https://uki-web-*.vercel.app");
    expect(isAllowedOrigin("https://uki-web-git-main-k4ssym.vercel.app", rules)).toBe(true);
    expect(isAllowedOrigin("https://uki-web-a.b.vercel.app", rules)).toBe(false);
    expect(isAllowedOrigin("https://uki-web-.vercel.app", rules)).toBe(false);
    expect(isAllowedOrigin("https://evil.example/https://uki-web-x.vercel.app", rules)).toBe(false);
  });

  it("treats regex characters in an entry literally", () => {
    const rules = parseAllowedOrigins("https://a.b");
    expect(isAllowedOrigin("https://aXb", rules)).toBe(false);
  });
});

describe("corsHeaders", () => {
  const rules = parseAllowedOrigins("https://uki-web.vercel.app");

  it("echoes an allowed origin, never *", () => {
    const headers = corsHeaders("https://uki-web.vercel.app", rules);
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://uki-web.vercel.app");
    expect(headers["Access-Control-Allow-Headers"]).toContain("authorization");
    expect(headers["Access-Control-Allow-Headers"]).toContain("apikey");
    expect(headers["Access-Control-Allow-Methods"]).toBe("POST, OPTIONS");
    expect(headers.Vary).toBe("Origin");
  });

  it("gives an unknown origin no allow headers", () => {
    expect(corsHeaders("https://evil.example", rules)).toEqual({ Vary: "Origin" });
  });

  it("adds nothing for a request without an Origin header", () => {
    expect(corsHeaders(null, rules)).toEqual({});
  });
});
