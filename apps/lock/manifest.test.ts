import { describe, expect, it } from "vitest";
import { lockManifest } from "./manifest.ts";

describe("lockManifest", () => {
  it("matches the plan's manifest block", () => {
    expect(lockManifest({})).toEqual({
      name: "Üki Lock",
      minimum_chrome_version: "127",
      permissions: ["storage", "tabs", "scripting", "declarativeNetRequestWithHostAccess"],
      host_permissions: ["<all_urls>"],
      web_accessible_resources: [{ resources: ["blocked.html"], matches: ["<all_urls>"] }],
    });
  });

  it("adds the fixed key only when LOCK_DEV_PUBLIC_KEY is set", () => {
    expect(lockManifest({ LOCK_DEV_PUBLIC_KEY: "MIIBIjANBgkq" }).key).toBe("MIIBIjANBgkq");
    expect("key" in lockManifest({ LOCK_DEV_PUBLIC_KEY: "  " })).toBe(false);
  });
});
