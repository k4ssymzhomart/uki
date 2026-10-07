import { describe, expect, it } from "vitest";
import { parseRendererEnv } from "./env.ts";

describe("parseRendererEnv", () => {
  it("accepts the project URL and the publishable key", () => {
    const env = parseRendererEnv({
      VITE_SUPABASE_URL: "https://abcdefghij.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abc",
    });
    expect(env.VITE_SUPABASE_URL).toBe("https://abcdefghij.supabase.co");
  });

  it("refuses the legacy anon key and the secret key", () => {
    for (const key of ["eyJhbGciOiJIUzI1NiJ9.e30.x", "sb_secret_abc"]) {
      expect(() =>
        parseRendererEnv({ VITE_SUPABASE_URL: "http://127.0.0.1:54721", VITE_SUPABASE_PUBLISHABLE_KEY: key }),
      ).toThrow(/VITE_SUPABASE_PUBLISHABLE_KEY/);
    }
  });
});
