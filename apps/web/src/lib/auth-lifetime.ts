import type { CookieOptions } from "@supabase/ssr";
import { z } from "zod";

/**
 * How long the staff auth cookies live (A.0, "Keep me signed in for 12 hours"). Checked: the cookies
 * expire 12 hours after sign-in, however often the session refreshes. Unchecked: they are session
 * cookies and end with the browser. @supabase/ssr always writes a 400-day max-age, so every client
 * (server, proxy, browser) passes its cookies through `applyLifetime` before writing them.
 *
 * The choice itself is kept in a small, non-secret cookie with the same lifetime, readable by the
 * browser client too.
 */
export const KEEP_SIGNED_IN_MS = 12 * 60 * 60 * 1000;
export const LIFETIME_COOKIE = "uki-auth-lifetime";

export type AuthLifetime = { kind: "session" } | { kind: "until"; untilMs: number };

const SESSION: AuthLifetime = { kind: "session" };

/** The lifetime chosen at sign-in. */
export function lifetimeForSignIn(keepSignedIn: boolean, nowMs: number): AuthLifetime {
  return keepSignedIn ? { kind: "until", untilMs: nowMs + KEEP_SIGNED_IN_MS } : SESSION;
}

const Encoded = z.union([
  z.literal("session").transform((): AuthLifetime => SESSION),
  z
    .string()
    .regex(/^until:\d{1,16}$/)
    .transform((value): AuthLifetime => ({ kind: "until", untilMs: Number(value.slice(6)) })),
]);

export function encodeLifetime(lifetime: AuthLifetime): string {
  return lifetime.kind === "session" ? "session" : `until:${lifetime.untilMs}`;
}

/** Reads the lifetime cookie; a missing or unreadable one counts as a session cookie, the safer choice. */
export function parseLifetime(value: string | undefined | null): AuthLifetime {
  const parsed = Encoded.safeParse(value);
  return parsed.success ? parsed.data : SESSION;
}

/** Finds and reads the lifetime cookie in a list of cookies. */
export function lifetimeFromCookies(cookies: readonly { name: string; value: string }[]): AuthLifetime {
  return parseLifetime(cookies.find((cookie) => cookie.name === LIFETIME_COOKIE)?.value);
}

/** True when the options delete the cookie rather than write it. */
function isRemoval(options: CookieOptions, nowMs: number): boolean {
  if (options.maxAge !== undefined && options.maxAge <= 0) return true;
  return options.expires !== undefined && options.expires.getTime() <= nowMs;
}

/**
 * The cookie options to write with, given the staff member's lifetime. Deletions pass through
 * unchanged. A session lifetime drops max-age and expires; a 12-hour lifetime counts down to the
 * deadline set at sign-in, and deletes the cookie once it has passed.
 */
export function applyLifetime(options: CookieOptions, lifetime: AuthLifetime, nowMs: number): CookieOptions {
  if (isRemoval(options, nowMs)) return options;
  const { maxAge: _maxAge, expires: _expires, ...rest } = options;
  if (lifetime.kind === "session") return rest;
  return { ...rest, maxAge: Math.max(0, Math.floor((lifetime.untilMs - nowMs) / 1000)) };
}

/** The lifetime cookie itself, written at sign-in with the lifetime it records. */
export function lifetimeCookie(
  lifetime: AuthLifetime,
  nowMs: number,
): { name: string; value: string; options: CookieOptions } {
  const base: CookieOptions = { path: "/", sameSite: "lax", httpOnly: false };
  return {
    name: LIFETIME_COOKIE,
    value: encodeLifetime(lifetime),
    options:
      lifetime.kind === "session"
        ? base
        : { ...base, maxAge: Math.max(0, Math.floor((lifetime.untilMs - nowMs) / 1000)) },
  };
}

/** Options that delete the lifetime cookie at sign-out. */
export const CLEAR_LIFETIME_COOKIE: CookieOptions = { path: "/", sameSite: "lax", maxAge: 0 };
