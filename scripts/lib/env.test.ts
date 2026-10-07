import { describe, expect, it } from "vitest";
import { describeTarget, isLocalUrl, readScriptEnv } from "./env.ts";

const base = {
  SUPABASE_URL: "http://127.0.0.1:54721",
  SUPABASE_SECRET_KEY: "sb_secret_test",
};

describe("readScriptEnv", () => {
  it("accepts the local values and treats empty optional values as unset", () => {
    const env = readScriptEnv({
      ...base,
      SUPABASE_PUBLISHABLE_KEY: "",
      SEED_STAFF_PASSWORD: "",
      SEED_LMS_URL: "",
    });
    expect(env.SUPABASE_URL).toBe(base.SUPABASE_URL);
    expect(env.SUPABASE_PUBLISHABLE_KEY).toBeUndefined();
    expect(env.SEED_STAFF_PASSWORD).toBeUndefined();
  });

  it("refuses a legacy service_role JWT and never echoes the value", () => {
    const legacy = "eyJhbGciOiJIUzI1NiJ9.legacy.service_role";
    expect(() => readScriptEnv({ ...base, SUPABASE_SECRET_KEY: legacy })).toThrowError(/SUPABASE_SECRET_KEY/);
    try {
      readScriptEnv({ ...base, SUPABASE_SECRET_KEY: legacy });
    } catch (error) {
      expect(String(error)).not.toContain(legacy);
    }
  });

  it("refuses a publishable key that is not sb_publishable_ and a missing URL", () => {
    expect(() => readScriptEnv({ ...base, SUPABASE_PUBLISHABLE_KEY: "anon" })).toThrowError(/PUBLISHABLE/);
    expect(() => readScriptEnv({ SUPABASE_SECRET_KEY: "sb_secret_x" })).toThrowError(/SUPABASE_URL/);
  });
});

describe("isLocalUrl", () => {
  it.each([
    ["http://127.0.0.1:54721", true],
    ["http://localhost:54321", true],
    ["http://[::1]:54721", true],
    ["http://api.uki.localhost", true],
    ["https://abcdefgh.supabase.co", false],
    ["not a url", false],
  ])("%s is local: %s", (url, expected) => {
    expect(isLocalUrl(url)).toBe(expected);
  });

  it("describes the target by host only", () => {
    expect(describeTarget("http://127.0.0.1:54721")).toBe("local stack 127.0.0.1:54721");
    expect(describeTarget("https://abcd.supabase.co")).toBe("cloud project abcd.supabase.co");
  });
});
