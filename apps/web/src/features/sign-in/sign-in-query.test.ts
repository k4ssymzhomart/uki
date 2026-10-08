import { describe, expect, it } from "vitest";
import { prefillEmail, safeNextPath, signInQuery } from "./sign-in-query.ts";

describe("safeNextPath", () => {
  it.each([
    "/demo/live",
    "/overview",
    "/exams/0199b6a4-6c1e-7b3a-9f2d-3c4b5a690001/live?session=0199b6a4-6c1e-7b3a-9f2d-3c4b5a697887",
    "/review#queue",
    "/students?q=Dana%20Akhmetova",
  ])("follows the internal path %s", (path) => {
    expect(safeNextPath(path)).toBe(path);
  });

  it.each([
    ["another host, protocol-relative", "//evil.example"],
    ["another host, protocol-relative with a path", "//evil.example/demo/live"],
    ["a backslash a browser reads as a slash", "/\\evil.example"],
    ["a backslash later on", "/demo\\live"],
    ["a scheme", "https://evil.example"],
    ["a scheme without slashes", "javascript:alert(1)"],
    ["a data URL", "data:text/html,hi"],
    ["a relative path", "demo/live"],
    ["a tab the browser would drop", "/\t/evil.example"],
    ["a newline the browser would drop", "/\n/evil.example"],
    ["a space", "/demo live"],
    ["a dot segment that climbs to //", "/..//evil.example"],
    ["an encoded dot segment that climbs to //", "/%2e%2e//evil.example"],
    ["sign-in itself", "/sign-in"],
    ["sign-in with its own next", "/sign-in?next=/demo/live"],
    ["the empty string", ""],
    ["a lone slash pair", "//"],
  ])("refuses %s", (_name, path) => {
    expect(safeNextPath(path)).toBeNull();
  });

  it("refuses anything that is not one string, and a path that is too long", () => {
    expect(safeNextPath(undefined)).toBeNull();
    expect(safeNextPath(["/demo/live", "/overview"])).toBeNull();
    expect(safeNextPath(42)).toBeNull();
    expect(safeNextPath(`/${"a".repeat(512)}`)).toBeNull();
  });

  it("keeps the root and a sign-in look-alike that is another page", () => {
    expect(safeNextPath("/")).toBe("/");
    expect(safeNextPath("/sign-in-help")).toBe("/sign-in-help");
  });
});

describe("prefillEmail", () => {
  it("fills in an email address, trimmed", () => {
    expect(prefillEmail("judge@kru.test")).toBe("judge@kru.test");
    expect(prefillEmail(" judge@kru.test ")).toBe("judge@kru.test");
  });

  it("leaves the field empty for anything else", () => {
    expect(prefillEmail(undefined)).toBe("");
    expect(prefillEmail("judge")).toBe("");
    expect(prefillEmail("<script>@x")).toBe("");
    expect(prefillEmail(["judge@kru.test", "dana.akhmetova@kru.test"])).toBe("");
    expect(prefillEmail(`${"a".repeat(250)}@kru.test`)).toBe("");
  });
});

describe("signInQuery", () => {
  it("reads the Live demo button's address", () => {
    const params = Object.fromEntries(new URLSearchParams("email=judge%40kru.test&next=/demo/live"));
    expect(signInQuery(params)).toEqual({ email: "judge@kru.test", next: "/demo/live" });
  });

  it("drops a next that leaves the site and keeps the email", () => {
    expect(signInQuery({ email: "judge@kru.test", next: "https://evil.example" })).toEqual({
      email: "judge@kru.test",
      next: null,
    });
    expect(signInQuery({})).toEqual({ email: "", next: null });
  });
});
