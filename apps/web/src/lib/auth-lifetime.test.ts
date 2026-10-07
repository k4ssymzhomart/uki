import { describe, expect, it } from "vitest";
import {
  applyLifetime,
  encodeLifetime,
  KEEP_SIGNED_IN_MS,
  LIFETIME_COOKIE,
  lifetimeCookie,
  lifetimeForSignIn,
  lifetimeFromCookies,
  parseLifetime,
} from "./auth-lifetime.ts";

const now = Date.UTC(2026, 9, 9, 4, 0, 0);
const supabaseDefaults = { path: "/", sameSite: "lax" as const, httpOnly: false, maxAge: 400 * 24 * 60 * 60 };

describe("sign-in cookie lifetime", () => {
  it("keeps the cookies 12 hours from sign-in when the box is checked", () => {
    const lifetime = lifetimeForSignIn(true, now);
    expect(lifetime).toEqual({ kind: "until", untilMs: now + KEEP_SIGNED_IN_MS });
    expect(applyLifetime(supabaseDefaults, lifetime, now)).toEqual({
      path: "/",
      sameSite: "lax",
      httpOnly: false,
      maxAge: 12 * 60 * 60,
    });
  });

  it("counts down to the same deadline when the session refreshes later", () => {
    const lifetime = lifetimeForSignIn(true, now);
    const threeHoursLater = now + 3 * 60 * 60 * 1000;
    expect(applyLifetime(supabaseDefaults, lifetime, threeHoursLater).maxAge).toBe(9 * 60 * 60);
    expect(applyLifetime(supabaseDefaults, lifetime, now + KEEP_SIGNED_IN_MS + 1000).maxAge).toBe(0);
  });

  it("makes session cookies when the box is unchecked: no max-age, no expires", () => {
    const lifetime = lifetimeForSignIn(false, now);
    const options = applyLifetime({ ...supabaseDefaults, expires: new Date(now + 1000) }, lifetime, now);
    expect(options).toEqual({ path: "/", sameSite: "lax", httpOnly: false });
    expect("maxAge" in options).toBe(false);
    expect("expires" in options).toBe(false);
  });

  it("passes deletions through unchanged, so sign-out still clears the cookies", () => {
    const removal = { ...supabaseDefaults, maxAge: 0 };
    expect(applyLifetime(removal, lifetimeForSignIn(false, now), now)).toBe(removal);
    expect(applyLifetime(removal, lifetimeForSignIn(true, now), now)).toBe(removal);
    const expired = { path: "/", expires: new Date(now - 1) };
    expect(applyLifetime(expired, lifetimeForSignIn(false, now), now)).toBe(expired);
  });

  it("round-trips the choice through its cookie and treats anything else as a session cookie", () => {
    for (const lifetime of [lifetimeForSignIn(true, now), lifetimeForSignIn(false, now)]) {
      expect(parseLifetime(encodeLifetime(lifetime))).toEqual(lifetime);
    }
    expect(parseLifetime(undefined)).toEqual({ kind: "session" });
    expect(parseLifetime("until:soon")).toEqual({ kind: "session" });
    expect(parseLifetime("forever")).toEqual({ kind: "session" });
    expect(
      lifetimeFromCookies([
        { name: "sb-127-auth-token", value: "x" },
        { name: LIFETIME_COOKIE, value: `until:${now}` },
      ]),
    ).toEqual({ kind: "until", untilMs: now });
  });

  it("writes the choice cookie with the lifetime it records", () => {
    expect(lifetimeCookie(lifetimeForSignIn(true, now), now)).toEqual({
      name: LIFETIME_COOKIE,
      value: `until:${now + KEEP_SIGNED_IN_MS}`,
      options: { path: "/", sameSite: "lax", httpOnly: false, maxAge: 12 * 60 * 60 },
    });
    expect(lifetimeCookie(lifetimeForSignIn(false, now), now).options).toEqual({
      path: "/",
      sameSite: "lax",
      httpOnly: false,
    });
  });
});
