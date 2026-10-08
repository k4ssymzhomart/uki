import { describe, expect, it } from "vitest";
import { API_AUTH_MODES, needsUserToken, withSupabaseAuth } from "./auth-mode.ts";

describe("auth modes", () => {
  it("keeps Phase 0's user mode and adds none and secret", () => {
    expect(API_AUTH_MODES).toEqual(["user", "none", "secret"]);
    expect(withSupabaseAuth("user")).toBe("user");
    expect(withSupabaseAuth("none")).toBe("none");
  });

  it("accepts any of the project's secret keys, so a rotated key still works", () => {
    expect(withSupabaseAuth("secret")).toBe("secret:*");
  });

  it("asks for a user's token only in user mode", () => {
    expect(API_AUTH_MODES.filter(needsUserToken)).toEqual(["user"]);
  });
});
