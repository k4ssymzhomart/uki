import { describe, expect, it } from "vitest";
import { parsePublicEnv } from "./env.ts";

const url = "http://127.0.0.1:54721";

describe("parsePublicEnv", () => {
  it("accepts the project URL and a publishable key", () => {
    const env = parsePublicEnv({
      NEXT_PUBLIC_SUPABASE_URL: url,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abc123",
    });
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe(url);
  });

  it("refuses a legacy anon JWT, a secret key and a missing value", () => {
    for (const key of ["eyJhbGciOiJIUzI1NiJ9.e30.x", "sb_secret_abc123", undefined]) {
      expect(() =>
        parsePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key }),
      ).toThrow(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
    }
  });

  it("refuses a URL that is not http or https", () => {
    expect(() =>
      parsePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: "ftp://x",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_a",
      }),
    ).toThrow();
  });
});
